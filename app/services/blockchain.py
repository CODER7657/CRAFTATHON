import json
import hashlib
import time
from pathlib import Path
from typing import Any

from web3 import Web3
from web3.contract import Contract

from app.core.config import get_settings
from app.core.errors import AppError


class BlockchainService:
    """Interacts with the POCSO Shield smart contract on Sepolia.

    Designed to degrade gracefully: if blockchain secrets are not configured,
    the service initialises with ``_ready = False`` and methods return ``None``
    instead of crashing the application.
    """

    def __init__(self) -> None:
        self._ready = False
        self._web3: Web3 | None = None
        self._account = None
        self._contract: Contract | None = None
        self._chain_id: int = 11155111
        self._mock_mode = False

        settings = get_settings()
        self._mock_mode = settings.mock_external_services
        if self._mock_mode:
            return

        rpc_url = settings.ethereum_rpc_url or (
            f"https://sepolia.infura.io/v3/{settings.infura_api_key}" if settings.infura_api_key else ""
        )
        if not rpc_url or not settings.sepolia_contract_address:
            return  # Not configured — stay in degraded mode

        try:
            self._web3 = Web3(Web3.HTTPProvider(rpc_url))
            if not self._web3.is_connected():
                return

            contract_abi = self._load_contract_abi(settings.sepolia_contract_abi_json)
            if not contract_abi:
                return
            self._chain_id = settings.blockchain_chain_id
            self._contract = self._web3.eth.contract(
                address=Web3.to_checksum_address(settings.sepolia_contract_address),
                abi=contract_abi,
            )
            if settings.authority_wallet_private_key:
                self._account = self._web3.eth.account.from_key(settings.authority_wallet_private_key)
            self._ready = True
        except Exception:
            self._ready = False

    @staticmethod
    def _load_contract_abi(raw_abi: str) -> list[dict[str, Any]]:
        # Accept plain JSON, escaped JSON from .env, and local file fallback.
        if raw_abi:
            try:
                parsed = json.loads(raw_abi)
                if isinstance(parsed, list):
                    return parsed
            except Exception:
                pass

            try:
                parsed = json.loads(raw_abi.replace('\\"', '"'))
                if isinstance(parsed, list):
                    return parsed
            except Exception:
                pass

        try:
            abi_path = Path(__file__).resolve().parents[2] / "POCSORegistry.abi.json"
            if abi_path.exists():
                parsed = json.loads(abi_path.read_text(encoding="utf-8"))
                if isinstance(parsed, list):
                    return parsed
        except Exception:
            pass

        return []

    @staticmethod
    def _mock_tx_hash(*parts: str) -> str:
        digest = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
        return f"0x{digest}"

    @staticmethod
    def _to_bytes32(value: str) -> bytes:
        normalized = (value or "").strip().lower()
        if normalized.startswith("0x"):
            normalized = normalized[2:]
        if len(normalized) == 64:
            try:
                return bytes.fromhex(normalized)
            except ValueError:
                pass
        return Web3.keccak(text=value)

    # ------------------------------------------------------------------
    def _send_transaction(self, function_name: str, *args: Any) -> str:
        if self._mock_mode:
            return self._mock_tx_hash(function_name, *(str(arg) for arg in args))
        if not self._ready or self._web3 is None or self._contract is None:
            raise AppError(code="blockchain_not_configured", message="Blockchain service is not available", status_code=503)
        if self._account is None:
            raise AppError(code="missing_wallet", message="Authority wallet key is not configured", status_code=500)

        try:
            function = getattr(self._contract.functions, function_name)(*args)
            # Use pending nonce to avoid collisions when multiple txs are sent in quick succession.
            nonce = self._web3.eth.get_transaction_count(self._account.address, "pending")
            tx = function.build_transaction(
                {
                    "from": self._account.address,
                    "nonce": nonce,
                    "chainId": self._chain_id,
                    "gasPrice": self._web3.eth.gas_price,
                }
            )
            if "gas" not in tx:
                tx["gas"] = self._web3.eth.estimate_gas(tx)
            signed = self._web3.eth.account.sign_transaction(tx, private_key=self._account.key)
            raw_tx = getattr(signed, "raw_transaction", None) or getattr(signed, "rawTransaction", None)
            if raw_tx is None:
                raise AppError(
                    code="blockchain_transaction_failed",
                    message="Unable to submit blockchain transaction",
                    status_code=502,
                    details={"function": function_name, "reason": "missing_signed_raw_tx"},
                )
            tx_hash = self._web3.eth.send_raw_transaction(raw_tx)
            return self._web3.to_hex(tx_hash)
        except AppError:
            raise
        except Exception as exc:
            raise AppError(
                code="blockchain_transaction_failed",
                message="Unable to submit blockchain transaction",
                status_code=502,
                details={"function": function_name},
            ) from exc

    # ------------------------------------------------------------------
    def log_report_hash(self, report_hash: str, tracking_id: str, zk_proof_hash: str, ipfs_cid: str) -> str | None:
        report_id = Web3.keccak(text=tracking_id)
        zk_hash_bytes32 = self._to_bytes32(zk_proof_hash)
        anonymous_id = Web3.keccak(text=f"{report_hash}:{tracking_id}")
        if self._mock_mode:
            return self._send_transaction("submitReport", report_id, ipfs_cid, zk_hash_bytes32, anonymous_id)
        if not self._ready:
            return None
        return self._send_transaction("submitReport", report_id, ipfs_cid, zk_hash_bytes32, anonymous_id)

    def log_authority_action(self, tracking_id: str, action: str) -> str | None:
        report_id = Web3.keccak(text=tracking_id)
        if self._mock_mode:
            return self._send_transaction("logAuthorityAction", report_id, action)
        if not self._ready:
            return None

        # The report submission tx may still be pending on Sepolia when an authority
        # action is attempted immediately afterward. Retry briefly before failing.
        last_error: AppError | None = None
        for delay_seconds in (0, 5, 15):
            if delay_seconds:
                time.sleep(delay_seconds)
            try:
                return self._send_transaction("logAuthorityAction", report_id, action)
            except AppError as exc:
                last_error = exc
                continue

        if last_error is not None:
            raise last_error
        raise AppError(
            code="blockchain_transaction_failed",
            message="Unable to submit blockchain transaction",
            status_code=502,
            details={"function": "logAuthorityAction"},
        )

    def get_report_submitted_events(self, from_block: int, to_block: int | None = None) -> list[dict[str, Any]]:
        if self._mock_mode or not self._ready or self._web3 is None or self._contract is None:
            return []

        try:
            event_factory = getattr(self._contract.events, "ReportSubmitted")
        except AttributeError as exc:
            raise AppError(
                code="event_not_available",
                message="ReportSubmitted event is not available on the contract",
                status_code=500,
            ) from exc

        event = event_factory()
        logs = event.get_logs(from_block=from_block, to_block=to_block or "latest")
        normalized_logs: list[dict[str, Any]] = []
        for log in logs:
            event_args = dict(getattr(log, "args", {}) or {})
            transaction_hash = getattr(log, "transactionHash", None)
            log_index = getattr(log, "logIndex", None)
            block_number = getattr(log, "blockNumber", None)
            normalized_logs.append(
                {
                    "args": event_args,
                    "transaction_hash": self._web3.to_hex(transaction_hash) if transaction_hash is not None else None,
                    "log_index": int(log_index) if log_index is not None else None,
                    "block_number": int(block_number) if block_number is not None else None,
                }
            )
        return normalized_logs
