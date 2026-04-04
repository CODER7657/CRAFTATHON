from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, status

from app.api.deps import get_supabase_service
from app.core.errors import AppError
from app.schemas.common import SuccessResponse
from app.schemas.report import ReportStatusResponse, ReportSubmitRequest, ReportSubmitResponse
from app.services.blockchain import BlockchainService
from app.services.ipfs import Web3StorageClient
from app.services.security import verify_zk_proof_hash
from app.services.supabase_service import SupabaseService
from app.tasks.classification import classify_report_async


router = APIRouter(prefix="/report", tags=["report"])


@router.post("/submit", response_model=SuccessResponse[ReportSubmitResponse], status_code=status.HTTP_201_CREATED)
async def submit_report(
    payload: ReportSubmitRequest,
    supabase_service: SupabaseService = Depends(get_supabase_service),
) -> SuccessResponse[ReportSubmitResponse]:
    if not verify_zk_proof_hash(report_hash=payload.report_hash, zk_proof_hash=payload.zk_proof_hash):
        raise AppError(code="invalid_zk_proof", message="ZK proof hash verification failed", status_code=400)

    ipfs_cid = None
    if payload.attachment is not None:
        ipfs_cid = await Web3StorageClient().upload_encrypted_blob(
            encrypted_blob_base64=payload.attachment.encrypted_blob_base64,
            nonce_base64=payload.attachment.nonce_base64,
            filename=payload.attachment.filename,
            content_type=payload.attachment.content_type,
            key_hint=payload.attachment.key_hint,
        )

    tracking_id = str(uuid4())
    created = supabase_service.insert_report(
        {
            "tracking_id": tracking_id,
            "report_hash": payload.report_hash,
            "jurisdiction_code": payload.jurisdiction_code,
            "status": "submitted",
            "incident_text": payload.incident_text,
            "source_url": str(payload.source_url) if payload.source_url else None,
            "image_cid": payload.image_cid,
            "ipfs_cid": ipfs_cid,
            "zk_proof_hash": payload.zk_proof_hash,
            "risk_score": 0,
            "ai_label": "review",
            "combined_label": "review",
            "metadata": payload.metadata,
            "created_at": datetime.now(UTC).isoformat(),
        }
    )

    tx_hash = None
    try:
        tx_hash = BlockchainService().log_report_hash(
            payload.report_hash,
            tracking_id,
            payload.zk_proof_hash,
            ipfs_cid or payload.image_cid or f"offchain://{tracking_id}",
        )
    except AppError:
        tx_hash = None

    supabase_service.insert_audit_log(
        {
            "tracking_id": tracking_id,
            "actor_type": "reporter",
            "action": "report_submitted",
            "metadata": {"blockchain_tx_hash": tx_hash, "report_id": created.get("id")},
        }
    )

    # Always enqueue a baseline text classification from backend so reports never
    # remain indefinitely in "submitted" if client-side classify trigger fails.
    try:
        task = classify_report_async.delay(tracking_id=tracking_id)
        supabase_service.insert_audit_log(
            {
                "tracking_id": tracking_id,
                "actor_type": "system",
                "action": "classification_enqueued",
                "metadata": {
                    "task_id": getattr(task, "id", None),
                    "mode": "text_only_auto",
                    "has_client_attachment": bool(payload.attachment or payload.image_cid),
                },
            }
        )
    except Exception as exc:
        # Submission success should not depend on queue availability.
        supabase_service.insert_audit_log(
            {
                "tracking_id": tracking_id,
                "actor_type": "system",
                "action": "classification_enqueue_failed",
                "metadata": {"error_type": exc.__class__.__name__, "mode": "text_only_auto"},
            }
        )

    return SuccessResponse(
        data=ReportSubmitResponse(
            tracking_id=tracking_id,
            status="submitted",
            message="Report accepted for asynchronous review",
            ipfs_cid=ipfs_cid,
        )
    )


@router.get("/status/{tracking_id}", response_model=SuccessResponse[ReportStatusResponse])
async def get_report_status(
    tracking_id: str,
    supabase_service: SupabaseService = Depends(get_supabase_service),
) -> SuccessResponse[ReportStatusResponse]:
    report = supabase_service.get_report_by_tracking_id(tracking_id)
    if not report:
        raise AppError(code="report_not_found", message="Tracking ID not found", status_code=404)
    onchain_tx_hash = supabase_service.get_onchain_tx_hash(tracking_id)
    return SuccessResponse(
        data=ReportStatusResponse(
            tracking_id=tracking_id,
            status=report["status"],
            risk_score=report.get("risk_score"),
            ai_label=report.get("combined_label"),
            authority_action=report.get("authority_action"),
            created_at=report.get("created_at"),
            last_updated_at=report.get("updated_at") or report.get("created_at"),
            onchain_tx_hash=onchain_tx_hash,
            confidence_explanation=report.get("ai_explanation") or report.get("metadata", {}).get("confidence_explanation"),
        )
    )
