from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.schemas.common import SuccessResponse


settings = get_settings()

app = FastAPI(title=settings.app_name, version=settings.app_version, docs_url="/docs", redoc_url="/redoc")

allowed_origins = [origin.strip() for origin in settings.allowed_origins.split(",") if origin.strip()]

# Always allow local frontend origins used during development.
local_dev_origins = {
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
}

allow_all_origins = "*" in allowed_origins

if not allow_all_origins:
    allowed_origins = sorted(set(allowed_origins) | local_dev_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if allow_all_origins else (allowed_origins or sorted(local_dev_origins)),
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    # Browsers reject credentialed CORS requests with wildcard origins.
    allow_credentials=not allow_all_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)
app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/", response_model=SuccessResponse[dict[str, str]])
async def root() -> SuccessResponse[dict[str, str]]:
    return SuccessResponse(data={"service": settings.app_name, "status": "ok", "docs": "/docs"})


@app.get("/health", response_model=SuccessResponse[dict[str, str]])
async def healthcheck() -> SuccessResponse[dict[str, str]]:
    return SuccessResponse(data={"status": "healthy", "environment": settings.environment})
