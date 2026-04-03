from fastapi import APIRouter, status

from app.schemas.common import SuccessResponse
from app.schemas.upload import FileUploadRequest, FileUploadResponse
from app.services.ipfs import Web3StorageClient


router = APIRouter(prefix="/files", tags=["files"])


@router.post("/upload", response_model=SuccessResponse[FileUploadResponse], status_code=status.HTTP_201_CREATED)
async def upload_file(payload: FileUploadRequest) -> SuccessResponse[FileUploadResponse]:
    cid = await Web3StorageClient().upload_encrypted_blob(
        encrypted_blob_base64=payload.encrypted_blob_base64,
        nonce_base64=payload.nonce_base64,
        filename=payload.filename,
        content_type=payload.content_type,
        key_hint=payload.key_hint,
    )
    return SuccessResponse(data=FileUploadResponse(cid=cid, filename=payload.filename))
