from datetime import datetime
from typing import Any

from pydantic import Field

from app.schemas.common import APIModel
from app.schemas.report import RiskLabel


class AIClassifyRequest(APIModel):
    tracking_id: str
    image_base64: str | None = None
    image_content_type: str | None = None


class AIClassifyResponse(APIModel):
    tracking_id: str
    status: str
    task_id: str | None = None


class AIResult(APIModel):
    text_label: RiskLabel
    image_label: RiskLabel
    combined_label: RiskLabel
    risk_score: int = Field(ge=0, le=100)
    confidence_explanation: dict[str, Any]
    processed_at: datetime
