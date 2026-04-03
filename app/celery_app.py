from celery import Celery
from kombu import Queue

from app.core.config import get_settings


settings = get_settings()
mock_mode = settings.mock_external_services

celery = Celery(
    "pocso_shield",
    broker="memory://" if mock_mode else (settings.celery_broker_url or settings.redis_url),
    backend="cache+memory://" if mock_mode else (settings.celery_result_backend or settings.redis_url),
)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    broker_connection_retry_on_startup=True,
    task_always_eager=mock_mode,
    task_eager_propagates=True,
    timezone="UTC",
    enable_utc=True,
    task_default_queue=settings.celery_task_default_queue,
    task_queues=(Queue(settings.celery_task_default_queue),),
    task_routes={
        "app.tasks.classify_report_async": {"queue": settings.celery_task_default_queue},
        "app.tasks.queue_high_priority_alert": {"queue": settings.celery_task_default_queue},
        "app.tasks.poll_report_submitted_events": {"queue": settings.celery_task_default_queue},
    },
    imports=(
        "app.tasks.classification",
        "app.tasks.alerts",
        "app.tasks.blockchain_events",
    ),
    beat_schedule={
        "poll-blockchain-report-submitted-events": {
            "task": "app.tasks.poll_report_submitted_events",
            "schedule": 120.0,
        }
    },
)
