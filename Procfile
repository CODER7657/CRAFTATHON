web: gunicorn app.main:app --workers 2 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:${PORT:-8000}
worker: celery -A app.celery_app:celery worker --loglevel=INFO --concurrency=2
beat: celery -A app.celery_app:celery beat --loglevel=INFO
