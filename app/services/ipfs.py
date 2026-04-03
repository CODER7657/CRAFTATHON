import base64
import hashlib
import json
from pathlib import PurePosixPath

import httpx

from app.core.config import get_settings
from app.core.errors import AppError
from app.services.security import decrypt_bytes


class Web3StorageClient:
    """Uploads encrypted blobs to web3.storage / IPFS.

    If ``WEB3_STORAGE_TOKEN`` is not set, the client is constructable but
    will raise only when ``upload_encrypted_blob`` is actually called.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self._token = settings.web3_storage_token
        self._upload_url = settings.web3_storage_upload_url
        self._mock_mode = settings.mock_external_services
        self._max_upload_bytes = settings.ipfs_max_upload_bytes

    @staticmethod
    def _normalize_filename(filename: str) -> str:
        safe_name = PurePosixPath(filename.replace("\\", "/")).name.strip()
        if not safe_name:
            raise AppError(code="invalid_filename", message="Filename is required", status_code=400)
        return safe_name

    @staticmethod
    def _decode_base64_blob(encrypted_blob_base64: str) -> bytes:
        try:
            blob = encrypted_blob_base64.split(",", 1)[1] if encrypted_blob_base64.startswith("data:") else encrypted_blob_base64
            return base64.b64decode(blob, validate=True)
        except Exception as exc:
            raise AppError(code="invalid_base64", message="Invalid encrypted_blob_base64", status_code=400) from exc

    @staticmethod
    def _extract_cid(payload: object) -> str:
        if isinstance(payload, dict):
            cid = payload.get("cid")
            if isinstance(cid, str) and cid:
                return cid
            ipfs_hash = payload.get("IpfsHash")
            if isinstance(ipfs_hash, str) and ipfs_hash:
                return ipfs_hash
            value = payload.get("value")
            if isinstance(value, dict):
                nested = value.get("cid")
                if isinstance(nested, str) and nested:
                    return nested
        raise AppError(code="ipfs_bad_response", message="Unexpected IPFS response", status_code=502)

    @staticmethod
    def _build_upload_payload(
        *,
        encrypted_blob_base64: str,
        nonce_base64: str | None,
        filename: str,
        content_type: str,
        key_hint: str | None,
    ) -> bytes:
        if nonce_base64:
            envelope = {
                "encrypted_blob_base64": encrypted_blob_base64,
                "nonce_base64": nonce_base64,
                "filename": filename,
                "content_type": content_type,
                "key_hint": key_hint,
            }
            return json.dumps(envelope, separators=(",", ":")).encode("utf-8")
        return Web3StorageClient._decode_base64_blob(encrypted_blob_base64)

    async def upload_encrypted_blob(
        self,
        *,
        encrypted_blob_base64: str,
        filename: str,
        content_type: str,
        nonce_base64: str | None = None,
        key_hint: str | None = None,
    ) -> str:
        normalized_filename = self._normalize_filename(filename)
        if nonce_base64 is None and not self._mock_mode:
            raise AppError(code="missing_nonce", message="nonce_base64 is required for encrypted IPFS uploads", status_code=400)

        data = self._build_upload_payload(
            encrypted_blob_base64=encrypted_blob_base64,
            nonce_base64=nonce_base64,
            filename=normalized_filename,
            content_type=content_type or "application/octet-stream",
            key_hint=key_hint,
        )

        if len(data) > self._max_upload_bytes:
            raise AppError(
                code="payload_too_large",
                message="Encrypted blob exceeds the configured upload limit",
                status_code=413,
                details={"max_bytes": self._max_upload_bytes, "size_bytes": len(data)},
            )

        if self._mock_mode:
            digest = hashlib.sha256(data + normalized_filename.encode("utf-8")).hexdigest()
            return f"bafy{digest[:52]}"

        if not self._token:
            raise AppError(code="web3_storage_not_configured", message="WEB3_STORAGE_TOKEN is not set", status_code=500)

        headers = {
            "Authorization": f"Bearer {self._token}",
            "X-NAME": normalized_filename,
            "Content-Type": content_type or "application/octet-stream",
        }

        async with httpx.AsyncClient(timeout=60) as client:
            if "pinata.cloud" in self._upload_url:
                upload_headers = {"Authorization": f"Bearer {self._token}"}
                files = {
                    "file": (normalized_filename, data, content_type or "application/octet-stream"),
                }
                resp = await client.post(self._upload_url, headers=upload_headers, files=files)
            else:
                resp = await client.post(self._upload_url, headers=headers, content=data)
        if resp.status_code >= 300:
            raise AppError(
                code="ipfs_upload_failed",
                message="Unable to upload to IPFS",
                status_code=502,
                details={"status_code": resp.status_code, "body": resp.text[:500]},
            )
        try:
            return self._extract_cid(resp.json())
        except AppError:
            raise
        except Exception as exc:
            raise AppError(code="ipfs_bad_response", message="Unexpected IPFS response", status_code=502) from exc

    def fetch_ipfs_json(self, cid: str) -> dict[str, object]:
        if self._mock_mode:
            raise AppError(code="ipfs_not_available", message="Mock mode does not fetch IPFS content", status_code=503)

        gateway_url = f"https://{cid}.ipfs.w3s.link"
        with httpx.Client(timeout=60) as client:
            response = client.get(gateway_url)
        if response.status_code >= 300:
            raise AppError(
                code="ipfs_fetch_failed",
                message="Unable to fetch content from IPFS",
                status_code=502,
                details={"status_code": response.status_code, "body": response.text[:500]},
            )
        try:
            payload = response.json()
        except Exception as exc:
            raise AppError(code="ipfs_bad_response", message="Unexpected IPFS response", status_code=502) from exc
        if not isinstance(payload, dict):
            raise AppError(code="ipfs_bad_response", message="Unexpected IPFS response", status_code=502)
        return payload

    def fetch_and_decrypt_attachment(self, cid: str) -> tuple[bytes, dict[str, object]]:
        payload = self.fetch_ipfs_json(cid)
        encrypted_blob_base64 = payload.get("encrypted_blob_base64")
        nonce_base64 = payload.get("nonce_base64")
        if not isinstance(encrypted_blob_base64, str) or not encrypted_blob_base64:
            raise AppError(code="ipfs_bad_response", message="IPFS envelope is missing encrypted_blob_base64", status_code=502)
        if not isinstance(nonce_base64, str) or not nonce_base64:
            raise AppError(code="ipfs_bad_response", message="IPFS envelope is missing nonce_base64", status_code=502)
        plaintext = decrypt_bytes(encrypted_blob_base64, nonce_base64)
        return plaintext, payload
