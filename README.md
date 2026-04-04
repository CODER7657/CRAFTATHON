# POCSO Shield

Anonymous child safety reporting platform with:

- Reporter flow for incident submission and tracking
- Jurisdiction-scoped authority dashboard and action workflow
- AI classification pipeline for text and image inputs
- Blockchain audit trail for report and authority actions
- Supabase persistence, Celery async tasks, and live dashboard polling

This repository contains three major layers in one workspace:

- FastAPI backend (API, AI orchestration, Celery tasks)
- Next.js frontend (reporter + authority portal)
- Hardhat smart-contract project (POCSORegistry + scripts/tests)

## 1. System Overview

### Core flow

1. Reporter submits an incident (`/api/report/submit`) with jurisdiction and ZK proof hash.
2. Backend stores report in Supabase and logs blockchain report hash transaction.
3. AI classification runs:
   - Text-only reports are auto-queued from submit endpoint.
   - Image reports are classified via `/api/ai/classify` when image bytes are provided.
4. Authority dashboard lists only cases for that authority jurisdiction.
5. Authority actions are written to DB and mirrored on-chain.

### Jurisdiction model

- Access is intentionally filtered by `jurisdiction_code`.
- A case appears only to authorities whose API key maps to the same jurisdiction.
- This is enforced in API logic, not only in UI.

## 2. Tech Stack

| Layer | Tech |
|---|---|
| Backend API | FastAPI, Pydantic, Uvicorn, Gunicorn |
| Async tasks | Celery + Redis (broker/result backend) |
| Database | Supabase (Postgres) |
| AI | Transformers, Torch, optional TensorFlow image path |
| Frontend | Next.js 14, React 18, TypeScript, Tailwind |
| Blockchain | Solidity 0.8.x, Hardhat, OpenZeppelin |
| Network | Ethereum Sepolia (Infura RPC) |

## 3. Repository Layout

```text
backend-ai/
  app/                    # FastAPI app, services, schemas, tasks
  frontend/               # Next.js app router project
  contracts/              # Solidity contracts
  scripts/                # Hardhat scripts (deploy, authority assignment)
  tests/                  # Backend smoke tests
  supabase_sql/schema.sql # DB schema and policies
  Procfile                # process definitions (web, worker, beat)
  railway.json            # Railway web service config
```

## 4. Prerequisites

- Python 3.11+ (recommended)
- Node.js 18+ and npm
- Git
- Redis/Upstash credentials
- Supabase project (URL + service role key)
- Sepolia RPC key and deployed contract details

## 5. Environment Setup

## 5.1 Backend env

1. Copy:

```bash
cp .env.example .env
```

2. Fill required values in `.env`:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `CELERY_BROKER_URL`
- `CELERY_RESULT_BACKEND`
- `ZK_VERIFIER_SALT`
- `SODIUM_SECRET_KEY`
- `ETHEREUM_RPC_URL`
- `SEPOLIA_CONTRACT_ADDRESS`
- `SEPOLIA_CONTRACT_ABI_JSON`
- `AUTHORITY_WALLET_PRIVATE_KEY`
- `WEB3_STORAGE_TOKEN`

Recommended for local:

- `MOCK_EXTERNAL_SERVICES=false`
- `MOCK_AI_MODELS=false` (or `true` for lightweight local tests)

## 5.2 Frontend env

Create `frontend/.env.local` with:

- `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8010`
- `NEXT_PUBLIC_ZK_VERIFIER_SALT=<same value as backend ZK_VERIFIER_SALT>`
- `AUTH_SESSION_SECRET=<random strong secret>`
- `AUTH_USER_1_*` and `AUTH_USER_2_*` fields (email/hash/name/jurisdiction/api key)

Password hashes must use `salt:hexDigest` where `hexDigest = scrypt(password, salt, 64)`.

Generate a password hash:

```bash
node -e "const {randomBytes,scryptSync}=require('crypto'); const salt=randomBytes(16).toString('hex'); const pass='ChangeMe@123'; console.log(`${salt}:${scryptSync(pass,salt,64).toString('hex')}`)"
```

## 6. Local Development

Run services in separate terminals.

## 6.1 Backend API

```powershell
cd D:\craftathon\backend-ai
.\.venv\Scripts\Activate.ps1
$env:PYTHONPATH="D:\craftathon\backend-ai"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload
```

## 6.2 Celery worker

```powershell
cd D:\craftathon\backend-ai
.\.venv\Scripts\Activate.ps1
$env:PYTHONPATH="D:\craftathon\backend-ai"
python -m celery -A app.celery_app:celery worker --loglevel=info --pool=solo -n worker@%h
```

For a Render-web plus local-worker setup, use the helper script instead of manually exporting env vars:

```powershell
cd D:\craftathon\backend-ai
powershell -ExecutionPolicy Bypass -File .\scripts\start-local-worker.ps1
```

Optional custom node name (avoid duplicate node warnings):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local-worker.ps1 -NodeName "worker-local@my-pc"
```

## 6.3 Celery beat (optional but recommended)

```powershell
cd D:\craftathon\backend-ai
.\.venv\Scripts\Activate.ps1
$env:PYTHONPATH="D:\craftathon\backend-ai"
python -m celery -A app.celery_app:celery beat --loglevel=info
```

## 6.4 Frontend

```powershell
cd D:\craftathon\backend-ai\frontend
npm install
npm run dev
```

App URLs:

- Frontend: `http://127.0.0.1:3000`
- Backend docs: `http://127.0.0.1:8010/docs`

## 7. API Reference (Current)

All routes are under `/api`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/report/submit` | No | Create report, store hash, enqueue text-only AI |
| GET | `/api/report/status/{tracking_id}` | No | Check report status and AI summary |
| POST | `/api/ai/classify` | No | Queue or run classification for report |
| POST | `/api/authority/action` | `X-Authority-Api-Key` | Record authority action |
| GET | `/api/dashboard/cases` | `X-Authority-Api-Key` | List jurisdiction-scoped dashboard cases |
| POST | `/api/files/upload` | No | Upload encrypted file payload to IPFS provider |

## 8. Smart Contract Workflow

Install and test:

```bash
npm install
npm run compile
npm run test
```

Deploy:

```bash
npm run deploy:sepolia
```

Assign authority wallet on-chain:

```bash
npx hardhat run scripts/assignAuthority.ts --network sepolia
```

## 9. Database Setup (Supabase)

Run SQL from `supabase_sql/schema.sql` in Supabase SQL editor.

Tables created:

- `authorities`
- `reports`
- `audit_logs`
- `flagged_domains`

Includes:

- indexes
- update trigger
- RLS policies
- service-role full access policies for backend integration

## 10. Testing

## 10.1 Backend smoke tests

```bash
pytest -q
```

## 10.2 Contract tests

```bash
npm run test
```

## 10.3 Frontend production build check

```bash
cd frontend
npm run build
```

## 11. Deployment (Recommended)

## 11.1 Services

- Frontend: Vercel
- Backend API: Railway service `web`
- Celery worker: Railway service `worker`
- Celery beat: Railway service `beat`
- DB: Supabase
- Redis broker/backend: Upstash Redis

## 11.2 Railway start commands

- Web:

```bash
gunicorn app.main:app --workers 2 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT
```

- Worker:

```bash
celery -A app.celery_app:celery worker --loglevel=INFO --concurrency=2 -n worker@%h
```

- Beat:

```bash
celery -A app.celery_app:celery beat --loglevel=INFO
```

## 11.3 Post-deploy checks

1. `/health` returns success.
2. Reporter can submit text-only incident and status transitions from `submitted`.
3. Reporter image incident triggers classification path.
4. Authority dashboard shows only same-jurisdiction cases.
5. Authority action writes DB + on-chain tx hash.

## 12. Troubleshooting

## Case not visible in dashboard

- Check case `jurisdiction_code` vs logged-in authority jurisdiction.
- Check authority API key mapping in `authorities` table.

## CORS error from frontend

- Ensure `ALLOWED_ORIGINS` includes frontend origin.
- Restart backend after changing env.

## Text-only report stuck at submitted

- Ensure worker is running.
- Check worker logs for task receipt.
- Check `audit_logs` for `classification_enqueued` or enqueue failure.

## Celery DuplicateNodenameWarning

- Start workers with explicit names (`-n worker@%h`).

## Hydration warning for time text

- Fixed by client-only timestamp rendering in live cases panel.

## 13. Security Notes

- Never commit `.env` or `.env.local`.
- Rotate any exposed keys immediately.
- Keep service-role and wallet keys in backend-only secret stores.
- Use HTTPS and strict CORS in production.
- Enforce jurisdiction scoping at API layer (already implemented).

## 14. Current Status

Implemented and production-tracked:

- jurisdiction-aware reporting and dashboards
- live dashboard polling updates
- text and image AI classification flow
- text-only auto-queue classification path
- authority action workflow with blockchain logging
- deploy-ready process definitions (`Procfile`, `railway.json`)

---

If you want, the next step is a dedicated `DEPLOYMENT.md` with click-by-click Railway and Vercel screens plus exact env key matrices per service.
