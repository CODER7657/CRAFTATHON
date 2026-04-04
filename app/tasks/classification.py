from __future__ import annotations

from datetime import UTC, datetime

import httpx

from app.celery_app import celery
from app.core.config import get_settings
from app.core.errors import AppError
from app.services.ai_pipeline import classify_report, classify_report_fallback
from app.services.blockchain import BlockchainService
from app.services.db_service import DBService
from app.tasks.alerts import queue_high_priority_alert


def _record_blockchain_after_classification(sb: DBService, tracking_id: str, combined_label: str) -> None:
    """Persist tx hashes to audit_logs for the dashboard when API-time submit skipped or failed."""
    bc = BlockchainService()
    if not sb.get_onchain_tx_hash(tracking_id):
        try:
            row = sb.get_report_by_tracking_id(tracking_id)
            if row:
                anchor_tx = bc.log_report_hash(
                    str(row.get("report_hash") or ""),
                    str(row.get("tracking_id") or tracking_id),
                    str(row.get("zk_proof_hash") or ""),
                    row.get("ipfs_cid") or row.get("image_cid") or f"offchain://{tracking_id}",
                )
                if anchor_tx:
                    sb.insert_audit_log(
                        {
                            "tracking_id": tracking_id,
                            "actor_type": "system",
                            "action": "report_onchain_anchored",
                            "metadata": {"blockchain_tx_hash": anchor_tx, "source": "classification_worker"},
                        }
                    )
        except AppError:
            pass
        except Exception:
            pass

    try:
        verdict_tx = bc.log_authority_action(tracking_id, f"ai_verdict:{combined_label}")
        if verdict_tx:
            sb.insert_audit_log(
                {
                    "tracking_id": tracking_id,
                    "actor_type": "ai",
                    "action": "ai_verdict_onchain",
                    "metadata": {
                        "blockchain_tx_hash": verdict_tx,
                        "verdict_tx_hash": verdict_tx,
                        "combined_label": combined_label,
                    },
                }
            )
    except AppError:
        pass
    except Exception:
        pass


def apply_classification_result(
    *,
    sb: DBService,
    tracking_id: str,
    result: dict,
    source_url: str | None,
) -> None:
    risk_score = int(result["risk_score"])
    combined_label = str(result["combined_label"])

    sb.update_report(
        tracking_id,
        {
            "status": "flagged"
            if (risk_score >= get_settings().high_priority_threshold or combined_label == "harmful")
            else "review",
            "risk_score": risk_score,
            "combined_label": combined_label,
            "ai_label": combined_label,
            "ai_explanation": result["confidence_explanation"],
            "updated_at": datetime.now(UTC).isoformat(),
        },
    )

    if source_url and combined_label == "harmful":
        domain = source_url.split("//", 1)[-1].split("/", 1)[0].lower()
        if domain:
            try:
                sb.insert_flagged_domain(
                    {
                        "domain": domain,
                        "label": "harmful",
                        "severity": "high" if risk_score >= get_settings().high_priority_threshold else "medium",
                        "risk_score": risk_score,
                        "reason": "ai_classification",
                        "report_tracking_id": tracking_id,
                        "created_at": datetime.now(UTC).isoformat(),
                    }
                )
            except AppError:
                # Do not fail the full classification flow if domain side-write fails.
                pass

    if risk_score >= get_settings().high_priority_threshold:
        queue_high_priority_alert.delay(tracking_id=tracking_id, risk_score=risk_score, ai_label=combined_label)


@celery.task(name="app.tasks.classify_report_async", bind=True, max_retries=5)
def classify_report_async(
    self,
    tracking_id: str,
    image_base64: str | None = None,
    image_content_type: str | None = None,
) -> dict:
    sb = DBService()
    try:
        report = sb.get_report_by_tracking_id(tracking_id)
    except httpx.HTTPError as exc:
        countdown = min(120, 10 * (2**self.request.retries))
        raise self.retry(exc=exc, countdown=countdown) from exc

    if report is None:
        # Do not raise custom/retied errors for not-found records; this runs in a worker
        # context where API-style errors create noisy reject loops.
        return {
            "tracking_id": tracking_id,
            "status": "skipped",
            "reason": "report_not_found",
            "risk_score": 0,
        }

    sb.update_report(tracking_id, {"status": "processing", "updated_at": datetime.now(UTC).isoformat()})

    try:
        result = classify_report(
            report.get("incident_text") or "",
            report.get("source_url"),
            image_base64=image_base64,
            image_content_type=image_content_type,
            image_cid=report.get("image_cid") or report.get("ipfs_cid"),
        )

        apply_classification_result(sb=sb, tracking_id=tracking_id, result=result, source_url=report.get("source_url"))

        sb.insert_audit_log(
            {
                "tracking_id": tracking_id,
                "actor_type": "ai",
                "action": "classification_completed",
                "metadata": {
                    "risk_score": result["risk_score"],
                    "combined_label": result["combined_label"],
                },
            }
        )
        _record_blockchain_after_classification(sb, tracking_id, str(result["combined_label"]))

        return {"tracking_id": tracking_id, "status": "completed", "risk_score": result["risk_score"]}
    except Exception as exc:
        try:
            result = classify_report_fallback(
                report.get("incident_text") or "",
                report.get("source_url"),
                image_base64=image_base64,
                image_content_type=image_content_type,
                image_cid=report.get("image_cid") or report.get("ipfs_cid"),
            )
            explanation = result["confidence_explanation"]
            if isinstance(explanation, dict):
                explanation = {
                    **explanation,
                    "recovery": {
                        "from": "full_classification_failed",
                        "error_type": exc.__class__.__name__,
                    },
                }
                result = {**result, "confidence_explanation": explanation}

            apply_classification_result(sb=sb, tracking_id=tracking_id, result=result, source_url=report.get("source_url"))

            sb.insert_audit_log(
                {
                    "tracking_id": tracking_id,
                    "actor_type": "ai",
                    "action": "classification_completed",
                    "metadata": {
                        "risk_score": result["risk_score"],
                        "combined_label": result["combined_label"],
                        "recovered_heuristic": True,
                        "original_error_type": exc.__class__.__name__,
                    },
                }
            )
            _record_blockchain_after_classification(sb, tracking_id, str(result["combined_label"]))
            return {"tracking_id": tracking_id, "status": "completed", "risk_score": result["risk_score"]}
        except Exception:
            sb.update_report(
                tracking_id,
                {
                    "status": "review",
                    "combined_label": "review",
                    "ai_label": "review",
                    "ai_explanation": {
                        "error": "classification_failed",
                        "reason": exc.__class__.__name__,
                    },
                    "updated_at": datetime.now(UTC).isoformat(),
                },
            )
            sb.insert_audit_log(
                {
                    "tracking_id": tracking_id,
                    "actor_type": "ai",
                    "action": "classification_failed",
                    "metadata": {"error_type": exc.__class__.__name__},
                }
            )
            return {"tracking_id": tracking_id, "status": "failed", "risk_score": 0}
