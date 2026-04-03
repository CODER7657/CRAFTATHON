from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.common import APIModel


AuthorityAction = Literal["investigating", "reviewed", "escalated", "resolved", "dismissed"]


class AuthorityActionRequest(APIModel):
    tracking_id: str
    action: AuthorityAction
    notes: str | None = Field(default=None, max_length=2000)


class AuthorityActionResponse(APIModel):
    tracking_id: str
    action: AuthorityAction
    updated_status: str
    jurisdiction_code: str
    onchain_tx_hash: str | None = None
    updated_at: datetime | None = None
