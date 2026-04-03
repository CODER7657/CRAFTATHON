# 🛡️ POCSO Shield — Smart Contract Layer

Anonymous child safety reporting system built on Ethereum Sepolia.

---

## Stack

| Layer | Tool |
|-------|------|
| Language | Solidity 0.8.20 |
| Framework | Hardhat + TypeScript |
| Libraries | OpenZeppelin v5 (ReentrancyGuard, Ownable) |
| Testnet | Ethereum Sepolia (via Infura) |
| Verification | Etherscan |
| Frontend util | ethers.js v6 (`lib/contract.ts`) |

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your .env
cp .env.example .env
# Fill in: INFURA_API_KEY, PRIVATE_KEY, ETHERSCAN_API_KEY

# 3. Compile contracts + generate TypeChain types
npm run compile
```

---

## Run Tests (MUST pass before deploying)

```bash
npm run test
```

All 18 tests should pass against the local Hardhat network.

---

## Deploy to Sepolia

```bash
npm run deploy:sepolia
```

The script will:
1. Deploy `POCSORegistry` to Sepolia
2. Print the **contract address** and save `POCSORegistry.abi.json`
3. Wait 6 block confirmations then **auto-verify on Etherscan**

---

## Manual Etherscan Verification (if auto-verify fails)

```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

No constructor arguments needed.

---

## What to share with the PM / Frontend team

| Item | Where |
|------|-------|
| `CONTRACT_ADDRESS` | Printed after deploy |
| `POCSORegistry.abi.json` | Root folder after deploy |
| `INFURA_API_KEY` | Your `.env` — safe to share |
| `ETHERSCAN_API_KEY` | Your `.env` — safe to share |

⛔ **NEVER share `PRIVATE_KEY`** — it controls the owner wallet.

---

## Frontend Integration

Copy `lib/contract.ts` into the Next.js repo as `src/lib/contract.ts`.

Set these in the frontend `.env.local`:
```
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...   # from deploy output
NEXT_PUBLIC_INFURA_API_KEY=...       # same as your INFURA_API_KEY
```

### Usage examples

```ts
import {
  getProvider, getSigner, getContract,
  ensureSepoliaNetwork, submitReport, fetchReport,
  generateReportId, generateAnonymousId,
} from "@/lib/contract";

// ── Read-only (no MetaMask) ───────────────────────────────────────
const report = await fetchReport(reportId);
const log    = await fetchActionLog(reportId);

// ── Write (MetaMask required) ─────────────────────────────────────
const anonId   = generateAnonymousId("secret-phrase", "random-salt") as `0x${string}`;
const reportId = generateReportId(anonId, Date.now());

const receipt = await submitReport({
  reportId,
  ipfsCid:     "QmXoypiz...",
  zkProofHash: "0xabc123..." as `0x${string}`,
  anonymousId: anonId,
});

console.log("Submitted in tx:", receipt.hash);
```

---

## Contract Architecture

```
POCSORegistry
├── Ownable            (OpenZeppelin v5)
├── ReentrancyGuard    (OpenZeppelin v5)
│
├── Structs
│   └── Report { ipfsCid, zkProofHash, timestamp, anonymousId }
│
├── Mappings
│   ├── reports:   bytes32 → Report
│   └── actionLog: bytes32 → string[]
│
├── Roles
│   ├── owner      → assignAuthority / revokeAuthority
│   └── authority  → logAuthorityAction
│
├── Write (nonReentrant)
│   ├── submitReport(reportId, ipfsCid, zkProofHash, anonymousId)
│   └── logAuthorityAction(reportId, actionType)  [onlyAuthority]
│
└── Read (view)
    ├── getReport(reportId)
    └── getActionLog(reportId)
```

---

## Security Notes

- `ReentrancyGuard` on all state-changing functions
- `anonymousId` is a salted keccak256 hash — the raw reporter identity is **never stored on-chain**
- ZK proof hash validates report integrity without revealing reporter details
- Authority list is owner-managed; owner key should be a hardware wallet post-hackathon
- Report IDs are client-generated keccak256 hashes — collision-resistant and unlinkable
