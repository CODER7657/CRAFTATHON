from app.schemas.common import APIModel


class FileUploadRequest(APIModel):
    filename: str
    content_type: str
    encrypted_blob_base64: str
    nonce_base64: str | None = None
    key_hint: str | None = None


class FileUploadResponse(APIModel):
    cid: str
    filename: str
