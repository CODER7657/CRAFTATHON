/**
 * lib/contract.ts
 * ──────────────────────────────────────────────────────────────
 * POCSO Shield — Frontend blockchain utilities (ethers.js v6)
 *
 * Usage:
 *   import { getProvider, getSigner, getContract, ensureSepoliaNetwork } from "@/lib/contract";
 *
 * What the PM / frontend team needs from the blockchain dev:
 *   • CONTRACT_ADDRESS  (from deploy script output)
 *   • INFURA_API_KEY    (from .env — safe to share)
 *   • POCSORegistry.abi.json  (from artifacts/ after compile)
 * ──────────────────────────────────────────────────────────────
 */

import { ethers, BrowserProvider, JsonRpcProvider, Contract, Signer, Provider } from "ethers";

// ── Config ────────────────────────────────────────────────────────────────────

/** ⚠️  Replace with deployed contract address after running: npm run deploy:sepolia */
export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "0x0000000000000000000000000000000000000000";

const INFURA_API_KEY = process.env.NEXT_PUBLIC_INFURA_API_KEY ?? "";
const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_RPC_URL = `https://sepolia.infura.io/v3/${INFURA_API_KEY}`;

// ── ABI ───────────────────────────────────────────────────────────────────────
// Copy POCSORegistry.abi.json into src/lib/ and import it,
// OR paste the ABI array directly here after the team shares it.

export const CONTRACT_ABI = [
  // Events
  "event ReportSubmitted(bytes32 indexed reportId, string ipfsCid, bytes32 zkProofHash, bytes32 anonymousId, uint256 timestamp)",
  "event ActionLogged(bytes32 indexed reportId, address indexed authority, string actionType, uint256 timestamp)",
  "event AuthorityAssigned(address indexed auth)",
  "event AuthorityRevoked(address indexed auth)",

  // Write functions
  "function submitReport(bytes32 reportId, string memory ipfsCid, bytes32 zkProofHash, bytes32 anonymousId) external",
  "function logAuthorityAction(bytes32 reportId, string memory actionType) external",
  "function assignAuthority(address auth) external",
  "function revokeAuthority(address auth) external",

  // Read functions
  "function getReport(bytes32 reportId) external view returns (string memory ipfsCid, bytes32 zkProofHash, uint256 timestamp, bytes32 anonymousId)",
  "function getActionLog(bytes32 reportId) external view returns (string[] memory)",
  "function isAuthority(address) external view returns (bool)",
  "function owner() external view returns (address)",
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReportData {
  ipfsCid:     string;
  zkProofHash: string;
  timestamp:   bigint;
  anonymousId: string;
}

// ── Provider (read-only, no MetaMask needed) ──────────────────────────────────

/**
 * Returns a read-only Infura JsonRpcProvider for Sepolia.
 * Use this for getReport(), getActionLog() etc. — no wallet required.
 */
export function getProvider(): JsonRpcProvider {
  if (!INFURA_API_KEY) {
    throw new Error("[POCSO Shield] NEXT_PUBLIC_INFURA_API_KEY is not set.");
  }
  return new JsonRpcProvider(SEPOLIA_RPC_URL, {
    chainId: SEPOLIA_CHAIN_ID,
    name: "sepolia",
  });
}

// ── Network check & switch ────────────────────────────────────────────────────

/**
 * Ensures MetaMask is connected to Sepolia (chainId 11155111).
 * - If on the wrong network → prompts user to switch.
 * - If Sepolia is not added → adds it automatically using Infura RPC.
 * Call this before any write transaction.
 */
export async function ensureSepoliaNetwork(): Promise<void> {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("[POCSO Shield] MetaMask not detected. Please install MetaMask.");
  }

  const ethereum = window.ethereum as {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  };

  const chainIdHex = `0x${SEPOLIA_CHAIN_ID.toString(16)}`; // "0xaa36a7"

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (switchError: unknown) {
    // Error 4902 = chain not added to MetaMask
    const err = switchError as { code?: number };
    if (err.code === 4902) {
      try {
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: chainIdHex,
              chainName: "Sepolia Testnet",
              nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
              rpcUrls: [SEPOLIA_RPC_URL],
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            },
          ],
        });
      } catch (addError) {
        throw new Error(
          `[POCSO Shield] Failed to add Sepolia network to MetaMask: ${(addError as Error).message}`
        );
      }
    } else {
      throw new Error(
        `[POCSO Shield] Failed to switch to Sepolia: ${(switchError as Error).message}`
      );
    }
  }
}

// ── Signer (MetaMask) ─────────────────────────────────────────────────────────

/**
 * Requests MetaMask connection, switches to Sepolia if needed, and returns a Signer.
 * Call before any write transaction (submitReport, logAuthorityAction, etc.)
 */
export async function getSigner(): Promise<Signer> {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("[POCSO Shield] MetaMask not detected. Please install MetaMask.");
  }

  // Ensure correct network first
  await ensureSepoliaNetwork();

  const provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []); // prompts MetaMask connect dialog
  return provider.getSigner();
}

// ── Contract Instance ─────────────────────────────────────────────────────────

/**
 * Returns a typed Contract instance bound to the given signer or provider.
 *
 * @example
 * // Read-only
 * const contract = getContract(getProvider());
 * const report = await contract.getReport(reportId);
 *
 * // Write
 * const signer = await getSigner();
 * const contract = getContract(signer);
 * await contract.submitReport(reportId, cid, zkHash, anonId);
 */
export function getContract(signerOrProvider: Signer | Provider): Contract {
  return new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signerOrProvider);
}

// ── Convenience helpers ───────────────────────────────────────────────────────

/**
 * Generate a deterministic reportId from anonymousId + a client-side nonce.
 * This mirrors the pattern used in tests.
 */
export function generateReportId(anonymousId: `0x${string}`, nonce: number | bigint): string {
  return ethers.keccak256(
    ethers.solidityPacked(["bytes32", "uint256"], [anonymousId, nonce])
  );
}

/**
 * Generate a bytes32 anonymousId from a secret passphrase.
 * The raw passphrase never leaves the browser.
 */
export function generateAnonymousId(passphrase: string, salt: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(`${salt}:${passphrase}`));
}

/**
 * Full submit-report flow:
 *   1. Ensure Sepolia network
 *   2. Get MetaMask signer
 *   3. Submit report transaction
 *   4. Wait for 1 confirmation
 *   5. Return tx receipt
 */
export async function submitReport(params: {
  reportId:    string;
  ipfsCid:     string;
  zkProofHash: `0x${string}`;
  anonymousId: `0x${string}`;
}) {
  const signer   = await getSigner();
  const contract = getContract(signer);

  const tx = await contract.submitReport(
    params.reportId,
    params.ipfsCid,
    params.zkProofHash,
    params.anonymousId
  );

  return tx.wait(1); // wait for 1 confirmation
}

/**
 * Fetch a report (read-only, no MetaMask needed)
 */
export async function fetchReport(reportId: string): Promise<ReportData> {
  const contract = getContract(getProvider());
  const [ipfsCid, zkProofHash, timestamp, anonymousId] =
    await contract.getReport(reportId);

  return { ipfsCid, zkProofHash, timestamp, anonymousId };
}

/**
 * Fetch all authority actions for a report (read-only)
 */
export async function fetchActionLog(reportId: string): Promise<string[]> {
  const contract = getContract(getProvider());
  return contract.getActionLog(reportId);
}
