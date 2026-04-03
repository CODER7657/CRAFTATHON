from app.celery_app import celery


@celery.task(name="app.tasks.queue_high_priority_alert")
def queue_high_priority_alert(tracking_id: str, risk_score: int, ai_label: str) -> dict[str, object]:
    # Hook for Slack/email/pager integration after hackathon.
    return {
        "tracking_id": tracking_id,
        "risk_score": risk_score,
        "ai_label": ai_label,
        "status": "queued",
    }
