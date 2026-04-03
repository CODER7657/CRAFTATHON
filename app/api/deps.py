from collections.abc import Generator

from fastapi import Depends, Header

from app.core.errors import AppError
from app.services.authority_auth import AuthorityAuthService, AuthorityContext
from app.services.supabase_service import SupabaseService


def get_supabase_service() -> Generator[SupabaseService, None, None]:
    yield SupabaseService()


def get_authority_context(
    x_authority_api_key: str | None = Header(default=None, alias="X-Authority-Api-Key"),
    supabase_service: SupabaseService = Depends(get_supabase_service),
) -> AuthorityContext:
    if not x_authority_api_key:
        raise AppError(code="missing_authority_key", message="X-Authority-Api-Key header is required", status_code=401)
    service = supabase_service if isinstance(supabase_service, SupabaseService) else SupabaseService()
    return AuthorityAuthService(service).authenticate(x_authority_api_key)
