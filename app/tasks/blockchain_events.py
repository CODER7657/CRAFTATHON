from __future__ import annotations

import base64
from io import BytesIO
from typing import Any

from PIL import Image

from app.celery_app import celery
from app.core.config import get_settings
from app.core.errors import AppError
from app.services.ai_pipeline import classify_report, classify_report_fallback
from app.services.blockchain import BlockchainService
from app.services.ipfs import Web3StorageClient
from app.services.db_service import DBService
from app.tasks.classification import apply_classification_result


def _event_identity(event: dict[str, Any]) -> str:
    transaction_hash = event.get("transaction_hash") or ""
    log_index = event.get("log_index")
    return f"{transaction_hash}:{log_index}"


def _extract_cid(event: dict[str, Any]) -> str | None:
    args = event.get("args") or {}
    for key in ("cid", "ipfsCid", "ipfs_cid", "contentCid", "content_cid"):
        value = args.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def _extract_tracking_id(event: dict[str, Any]) -> str | None:
    args = event.get("args") or {}
    for key in ("trackingId", "tracking_id", "reportId", "report_id"):
        value = args.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def _image_base64_from_bytes(image_bytes: bytes) -> str | None:
    try:
        with Image.open(BytesIO(image_bytes)) as image:
            image.verify()
        return base64.b64encode(image_bytes).decode("utf-8")
    except Exception:
        return None


@celery.task(name="app.tasks.poll_report_submitted_events")
def poll_report_submitted_events(from_block: int | None = None) -> dict[str, object]:
    settings = get_settings()
    sb = DBService()
    blockchain = BlockchainService()
    ipfs = Web3StorageClient()

    start_block = from_block if from_block is not None else (sb.get_latest_blockchain_event_block() or settings.blockchain_event_start_block)
    events = blockchain.get_report_submitted_events(from_block=start_block)

    processed = 0
    skipped = 0
    errors: list[dict[str, object]] = []

    for event in events:
        event_id = _event_identity(event)
        if sb.has_blockchain_event_marker(event_id):
            skipped += 1
            continue

        cid = _extract_cid(event)
        if not cid:
            sb.insert_audit_log(
                {
                    "tracking_id": None,
                    "actor_type": "system",
                    "action": "blockchain_report_submitted_skipped",
                    "metadata": {
                        "event_id": event_id,
                        "transaction_hash": event.get("transaction_hash"),
                        "log_index": event.get("log_index"),
                        "block_number": event.get("block_number"),
                        "reason": "missing_cid",
                    },
                }
            )
            errors.append({"event_id": event_id, "error": "missing_cid"})
            continue

        report = sb.get_report_by_ipfs_cid(cid)
        if report is None:
            tracking_id = _extract_tracking_id(event)
            report = sb.get_report_by_tracking_id(tracking_id) if tracking_id else None
        if report is None:
            sb.insert_audit_log(
                {
                    "tracking_id": None,
                    "actor_type": "system",
                    "action": "blockchain_report_submitted_skipped",
                    "metadata": {
                        "event_id": event_id,
                        "transaction_hash": event.get("transaction_hash"),
                        "log_index": event.get("log_index"),
                        "block_number": event.get("block_number"),
                        "reason": "report_not_found",
                        "cid": cid,
                    },
                }
            )
            errors.append({"event_id": event_id, "error": "report_not_found", "cid": cid})
            continue

        image_base64: str | None = None
        image_content_type = "image/*"
        try:
            attachment_bytes, envelope = ipfs.fetch_and_decrypt_attachment(cid)
            image_content_type = str(envelope.get("content_type") or "image/*")
            image_base64 = _image_base64_from_bytes(attachment_bytes)
            if image_base64 is None:
                raise AppError(code="unsupported_attachment", message="Decrypted IPFS content is not a supported image", status_code=400)

            result = classify_report(
                report.get("incident_text"),
                report.get("source_url"),
                image_cid=cid,
                image_base64=image_base64,
                image_content_type=image_content_type,
            )
            apply_classification_result(
                sb=sb,
                tracking_id=report["tracking_id"],
                result=result,
                source_url=report.get("source_url"),
            )

            verdict_tx_hash = None
            try:
                verdict_tx_hash = blockchain.log_authority_action(report["tracking_id"], f"ai_verdict:{result['combined_label']}")
            except AppError:
                verdict_tx_hash = None

            sb.insert_audit_log(
                {
                    "tracking_id": report["tracking_id"],
                    "actor_type": "system",
                    "action": "blockchain_report_submitted_processed",
                    "metadata": {
                        "event_id": event_id,
                        "transaction_hash": event.get("transaction_hash"),
                        "log_index": event.get("log_index"),
                        "block_number": event.get("block_number"),
                        "cid": cid,
                        "verdict_tx_hash": verdict_tx_hash,
                    },
                }
            )
            processed += 1
        except Exception as exc:
            try:
                result = classify_report_fallback(
                    report.get("incident_text") or "",
                    report.get("source_url"),
                    image_base64=image_base64,
                    image_content_type=image_content_type,
                    image_cid=cid,
                )
                explanation = result["confidence_explanation"]
                if isinstance(explanation, dict):
                    explanation = {
                        **explanation,
                        "recovery": {
                            "from": "blockchain_classify_failed",
                            "error_type": exc.__class__.__name__,
                        },
                    }
                    result = {**result, "confidence_explanation": explanation}

                apply_classification_result(
                    sb=sb,
                    tracking_id=report["tracking_id"],
                    result=result,
                    source_url=report.get("source_url"),
                )
                sb.insert_audit_log(
                    {
                        "tracking_id": report["tracking_id"],
                        "actor_type": "system",
                        "action": "blockchain_report_submitted_processed",
                        "metadata": {
                            "event_id": event_id,
                            "transaction_hash": event.get("transaction_hash"),
                            "log_index": event.get("log_index"),
                            "block_number": event.get("block_number"),
                            "cid": cid,
                            "recovered_heuristic": True,
                            "original_error_type": exc.__class__.__name__,
                        },
                    }
                )
                processed += 1
            except Exception:
                errors.append({"event_id": event_id, "cid": cid, "error": exc.__class__.__name__})

    return {"start_block": start_block, "processed": processed, "skipped": skipped, "errors": errors}
