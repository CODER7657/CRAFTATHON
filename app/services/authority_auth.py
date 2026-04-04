from dataclasses import dataclass

from app.core.config import get_settings
from app.core.errors import AppError
from app.services.db_service import DBService


@dataclass
class AuthorityContext:
    authority_id: str
    jurisdiction_code: str


class AuthorityAuthService:
    def __init__(self, db_service: DBService) -> None:
        self._db = db_service
        self._settings = get_settings()

    def authenticate(self, api_key: str) -> AuthorityContext:
        if self._settings.mock_external_services and api_key == self._settings.mock_authority_api_key:
            return AuthorityContext(
                authority_id=self._settings.mock_authority_id,
                jurisdiction_code=self._settings.mock_authority_jurisdiction_code,
            )

        authority = self._db.get_authority_by_api_key(api_key)
        if authority is None:
            raise AppError(code="invalid_authority_key", message="Authority API key is invalid", status_code=401)
        if not authority.get("is_active", True):
            raise AppError(code="authority_inactive", message="Authority account is inactive", status_code=403)

        authority_id = str(authority.get("id") or authority.get("authority_id") or "")
        jurisdiction_code = str(authority.get("jurisdiction_code") or "")
        if not authority_id or not jurisdiction_code:
            raise AppError(code="authority_misconfigured", message="Authority profile is incomplete", status_code=500)

        return AuthorityContext(authority_id=authority_id, jurisdiction_code=jurisdiction_code)
