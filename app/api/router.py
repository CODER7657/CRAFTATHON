from fastapi import APIRouter

from app.api.routes import ai, authority, dashboard, report, upload


api_router = APIRouter()
api_router.include_router(report.router)
api_router.include_router(ai.router)
api_router.include_router(authority.router)
api_router.include_router(dashboard.router)
api_router.include_router(upload.router)
