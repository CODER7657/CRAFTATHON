import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, status

from app.api.deps import get_db_service
from app.core.errors import AppError
from app.schemas.common import SuccessResponse
from app.schemas.report import ReportStatusResponse, ReportSubmitRequest, ReportSubmitResponse
from app.services.blockchain import BlockchainService
from app.services.ipfs import Web3StorageClient
from app.services.security import verify_zk_proof_hash
from app.services.db_service import DBService
from app.tasks.classification import classify_report_async


router = APIRouter(prefix="/report", tags=["report"])


def _classify_in_process_if_no_worker(tracking_id: str) -> None:
    """Runs classification in the API process when Celery enqueue is unavailable (no broker/worker)."""
    try:
        classify_report_async.run(tracking_id=tracking_id)
    except Exception:
        pass


def _json_if_stored_as_string(value: Any) -> Any:
    """Postgres/psycopg may return JSONB as dict or, in some setups, as a JSON string."""
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        if stripped[0] in "{[":
            try:
                return json.loads(stripped)
            except json.JSONDecodeError:
                return value
    return value


@router.post("/submit", response_model=SuccessResponse[ReportSubmitResponse], status_code=status.HTTP_201_CREATED)
async def submit_report(
    payload: ReportSubmitRequest,
    background_tasks: BackgroundTasks,
    db_service: DBService = Depends(get_db_service),
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
    created = db_service.insert_report(
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

    db_service.insert_audit_log(
        {
            "tracking_id": tracking_id,
            "actor_type": "reporter",
            "action": "report_submitted",
            "metadata": {"blockchain_tx_hash": tx_hash, "report_id": created.get("id")},
        }
    )

    # Prefer Celery for scale; if the broker is down, fall back to in-process classification after respond.
    try:
        task = classify_report_async.delay(tracking_id=tracking_id)
        db_service.insert_audit_log(
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
        db_service.insert_audit_log(
            {
                "tracking_id": tracking_id,
                "actor_type": "system",
                "action": "classification_enqueue_failed",
                "metadata": {"error_type": exc.__class__.__name__, "mode": "text_only_auto"},
            }
        )
        background_tasks.add_task(_classify_in_process_if_no_worker, tracking_id)

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
    db_service: DBService = Depends(get_db_service),
) -> SuccessResponse[ReportStatusResponse]:
    report = db_service.get_report_by_tracking_id(tracking_id)
    if not report:
        raise AppError(code="report_not_found", message="Tracking ID not found", status_code=404)
    onchain_tx_hash = db_service.get_onchain_tx_hash(tracking_id)
    ai_expl = _json_if_stored_as_string(report.get("ai_explanation"))
    meta = _json_if_stored_as_string(report.get("metadata"))
    meta_conf = meta.get("confidence_explanation") if isinstance(meta, dict) else None
    confidence_explanation = ai_expl or _json_if_stored_as_string(meta_conf)

    risk_raw = report.get("risk_score")
    risk_score: int | None
    if risk_raw is None:
        risk_score = None
    else:
        try:
            risk_score = int(risk_raw)
        except (TypeError, ValueError):
            risk_score = None

    return SuccessResponse(
        data=ReportStatusResponse(
            tracking_id=tracking_id,
            status=report["status"],
            risk_score=risk_score,
            ai_label=report.get("combined_label"),
            authority_action=report.get("authority_action"),
            created_at=report.get("created_at"),
            last_updated_at=report.get("updated_at") or report.get("created_at"),
            onchain_tx_hash=onchain_tx_hash,
            confidence_explanation=confidence_explanation,
        )
    )
