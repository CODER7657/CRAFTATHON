# POCSO Shield

Anonymous child safety reporting platform with:

- Reporter flow for incident submission and tracking
- Jurisdiction-scoped authority dashboard and action workflow
- AI classification pipeline for text and image inputs
- Blockchain audit trail for report and authority actions
- PostgreSQL persistence, Celery async tasks, and live dashboard polling

This repository contains three major layers in one workspace:

- FastAPI backend (API, AI orchestration, Celery tasks)
- Next.js frontend (reporter + authority portal)
- Hardhat smart-contract project (POCSORegistry + scripts/tests)

## 1. System Overview

### Core flow

1. Reporter submits an incident (`/api/report/submit`) with jurisdiction and ZK proof hash.
2. Backend stores report in PostgreSQL and logs blockchain report hash transaction.
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
| Database | PostgreSQL (self-hosted or managed) |
| AI | Transformers, Torch, optional TensorFlow image path |
| Frontend | Next.js 14, React 18, TypeScript, Tailwind |
| Blockchain | Solidity 0.8.x, Hardhat, OpenZeppelin |
| Network | Ethereum Sepolia (Infura RPC) |

## 3. Repository Layout

```text
app/                            # FastAPI app, services, schemas, tasks
frontend/                       # Next.js app router project
contracts/                      # Solidity contracts
scripts/                        # Hardhat scripts (deploy, authority assignment)
tests/                          # Backend smoke tests
supabase_sql/schema_postgres.sql # Postgres schema for local/docker DB init
docker-compose.yml              # Local full-stack orchestration
Procfile                        # process definitions (web, worker, beat)
railway.json                    # Railway web service config
```

## 4. Prerequisites

- Python 3.11+ (recommended)
- Node.js 18+ and npm
- Git
- Redis/Upstash credentials
- PostgreSQL database (local Docker Postgres or managed Postgres)
- Sepolia RPC key and deployed contract details

## 5. Environment Setup

## 5.1 Backend env

1. Copy:

```bash
cp .env.example .env
```

2. Fill required values in `.env`:

- `POSTGRES_URL`
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

If running with Docker Compose, `POSTGRES_URL`, Redis URLs, and service wiring are already provided in `docker-compose.yml`; your `.env` is mainly for secrets and optional overrides.

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

### 6.0 Quick start (recommended)

```powershell
cd D:\CRAFTATHON2\CRAFTATHON
docker compose up -d --build
```

App URLs:

- Frontend: `http://10.0.0.2:3000`
- Backend docs: `http://10.0.0.2:8010/docs`

Use this to inspect service status:

```powershell
docker compose ps
```

### 6.1 Run components manually (without Docker)

Run services in separate terminals.

## 6.1 Backend API

```powershell
cd D:\CRAFTATHON2\CRAFTATHON
.\.venv\Scripts\Activate.ps1
$env:PYTHONPATH="D:\CRAFTATHON2\CRAFTATHON"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload
```

## 6.2 Celery worker

```powershell
cd D:\CRAFTATHON2\CRAFTATHON
.\.venv\Scripts\Activate.ps1
$env:PYTHONPATH="D:\CRAFTATHON2\CRAFTATHON"
python -m celery -A app.celery_app:celery worker --loglevel=info --pool=solo -n worker@%h
```

For a Render-web plus local-worker setup, use the helper script instead of manually exporting env vars:

```powershell
cd D:\CRAFTATHON2\CRAFTATHON
powershell -ExecutionPolicy Bypass -File .\scripts\start-local-worker.ps1
```

Optional custom node name (avoid duplicate node warnings):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local-worker.ps1 -NodeName "worker-local@my-pc"
```

## 6.3 Celery beat (optional but recommended)

```powershell
cd D:\CRAFTATHON2\CRAFTATHON
.\.venv\Scripts\Activate.ps1
$env:PYTHONPATH="D:\CRAFTATHON2\CRAFTATHON"
python -m celery -A app.celery_app:celery beat --loglevel=info
```

## 6.4 Frontend

```powershell
cd D:\CRAFTATHON2\CRAFTATHON\frontend
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

## 9. Database Setup (PostgreSQL)

For Docker local setup, schema and seed run automatically on first DB container start:

- `supabase_sql/schema_postgres.sql`
- `supabase_sql/seed_authorities_dev.sql`

If using an existing DB volume and you need to apply/update seed manually:

- Bash: `docker compose exec -T db psql -U postgres -d pocso < supabase_sql/seed_authorities_dev.sql`
- PowerShell: `Get-Content -Raw supabase_sql/seed_authorities_dev.sql | docker compose exec -T db psql -U postgres -d pocso`

Tables created:

- `authorities`
- `reports`
- `audit_logs`
- `flagged_domains`

Includes:

- indexes
- update trigger
- indexes and triggers used by backend services

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
- DB: PostgreSQL (Supabase Postgres or Railway Postgres)
- Redis broker/backend: Upstash Redis

## 11.0 Frontend Deployment (Vercel)

If deploying frontend separately on Vercel:

1. Import the repository into Vercel.
2. Set project Root Directory to `frontend`.
3. Build command: `npm run build`.
4. Output and framework can stay auto-detected for Next.js.
5. Add environment variables from `frontend/.env.production.example`.
6. Set `NEXT_PUBLIC_API_BASE_URL` to your Render web backend URL.
7. Deploy.

Notes:

- Do not commit real `.env.local` or production secrets.
- `AUTH_SESSION_SECRET` is mandatory for authority login routes.
- `NEXT_PUBLIC_ZK_VERIFIER_SALT` must match backend `ZK_VERIFIER_SALT`.

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

- The API lists cases with `WHERE jurisdiction_code = <authority jurisdiction>`. Reporter flow sends `IN-STATE-CITY` from the form unless overridden.
- If the portal user is `MOCK-JURISDICTION` (demo seed) but reports were stored as e.g. `IN-MH-MUMBAI`, the dashboard stays empty. Fix: set `NEXT_PUBLIC_REPORT_JURISDICTION_OVERRIDE=MOCK-JURISDICTION` on the **frontend** (see `docker-compose.yml`), rebuild Next.js, then submit again—or `UPDATE public.reports SET jurisdiction_code = 'MOCK-JURISDICTION' WHERE tracking_id = '…'` for a one-off test row.
- Check authority API key mapping in `authorities` table.

## Dashboard: Blockchain column “Unavailable”

The link is built from `audit_logs.metadata` (`blockchain_tx_hash`, `verdict_tx_hash`, or `transaction_hash`). Ensure:

- **Worker is running** — after classification, the worker may anchor `submitReport` (if the API had no hash) and log `logAuthorityAction` for `ai_verdict:*`, which writes those fields.
- **Chain config in API `.env`** — `ETHEREUM_RPC_URL` or `INFURA_API_KEY`, `SEPOLIA_CONTRACT_ADDRESS`, `SEPOLIA_CONTRACT_ABI_JSON`, and `AUTHORITY_WALLET_PRIVATE_KEY` (funded on Sepolia). If the service is not ready, txs are skipped and the column stays empty.
- **Existing cases** classified before this behavior shipped will not gain hashes until you submit a new report or re-run classification for that `tracking_id`.

## Authority portal: `invalid_authority_key` (401)

The browser session sends `AUTH_USER_1_AUTHORITY_API_KEY` as `X-Authority-Api-Key`. With `MOCK_EXTERNAL_SERVICES=false`, Postgres must contain a row in `public.authorities` whose `api_key_hash` is `SHA256(plain_key)` (hex).

- **New Docker DB:** `docker-compose` runs `supabase_sql/seed_authorities_dev.sql` after the schema (default key `mock-authority-key`, jurisdiction `MOCK-JURISDICTION`).
- **Existing volume (no re-seed):** apply the seed once from the repo root:
  - Bash: `docker compose exec -T db psql -U postgres -d pocso < supabase_sql/seed_authorities_dev.sql`
  - PowerShell: `Get-Content -Raw supabase_sql/seed_authorities_dev.sql | docker compose exec -T db psql -U postgres -d pocso`
- **`MOCK_EXTERNAL_SERVICES=true`** makes the API use an in-memory mock for **all** persistence (not only authority keys). Use it only for smoke tests without Postgres; for a real DB, keep `false` and seed `authorities` as above.

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
- Keep DB credentials and wallet keys in backend-only secret stores.
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
