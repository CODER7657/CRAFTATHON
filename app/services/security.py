import base64
import hashlib

from nacl import encoding, secret

from app.core.config import get_settings
from app.core.errors import AppError


def verify_zk_proof_hash(*, report_hash: str, zk_proof_hash: str) -> bool:
    settings = get_settings()
    expected = hashlib.sha256(f"{report_hash}:{settings.zk_verifier_salt}".encode("utf-8")).hexdigest()
    return expected == zk_proof_hash


def _get_secret_box() -> secret.SecretBox:
    settings = get_settings()
    if not settings.sodium_secret_key:
        raise AppError(code="missing_secret", message="Encryption secret is not configured", status_code=500)
    try:
        key = encoding.Base64Encoder.decode(settings.sodium_secret_key)
    except Exception as exc:
        raise AppError(code="invalid_secret", message="Encryption secret is invalid", status_code=500) from exc
    return secret.SecretBox(key)


def decrypt_bytes(encrypted_blob_base64: str, nonce_base64: str) -> bytes:
    box = _get_secret_box()
    try:
        encrypted_blob = base64.b64decode(encrypted_blob_base64)
        nonce = base64.b64decode(nonce_base64)
        return box.decrypt(encrypted_blob, nonce)
    except Exception as exc:
        raise AppError(code="decryption_failed", message="Unable to decrypt the provided blob", status_code=400) from exc
