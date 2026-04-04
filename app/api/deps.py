from collections.abc import Generator

from fastapi import Depends, Header

from app.core.errors import AppError
from app.services.authority_auth import AuthorityAuthService, AuthorityContext
from app.services.db_service import DBService


def get_db_service() -> Generator[DBService, None, None]:
    yield DBService()


def get_authority_context(
    x_authority_api_key: str | None = Header(default=None, alias="X-Authority-Api-Key"),
    db_service: DBService = Depends(get_db_service),
) -> AuthorityContext:
    if not x_authority_api_key:
        raise AppError(code="missing_authority_key", message="X-Authority-Api-Key header is required", status_code=401)
    service = db_service if isinstance(db_service, DBService) else DBService()
    return AuthorityAuthService(service).authenticate(x_authority_api_key)
