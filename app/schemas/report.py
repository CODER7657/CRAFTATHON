from datetime import datetime
from typing import Any, Literal

from pydantic import Field, HttpUrl

from app.schemas.common import APIModel


RiskLabel = Literal["safe", "review", "harmful"]
CaseStatus = Literal["submitted", "processing", "review", "flagged", "assigned", "resolved"]


class AttachmentPayload(APIModel):
    filename: str
    content_type: str
    encrypted_blob_base64: str
    nonce_base64: str | None = None
    key_hint: str | None = None


class ReportSubmitRequest(APIModel):
    reporter_alias: str | None = None
    jurisdiction_code: str
    incident_text: str = Field(min_length=5, max_length=5000)
    source_url: HttpUrl | None = None
    image_cid: str | None = None
    attachment: AttachmentPayload | None = None
    zk_proof_hash: str
    report_hash: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class ReportSubmitResponse(APIModel):
    tracking_id: str
    status: CaseStatus
    message: str
    ipfs_cid: str | None = None


class ReportStatusResponse(APIModel):
    tracking_id: str
    status: CaseStatus
    risk_score: int | None = None
    ai_label: RiskLabel | None = None
    authority_action: str | None = None
    created_at: datetime | None = None
    last_updated_at: datetime | None = None
    onchain_tx_hash: str | None = None
    confidence_explanation: dict[str, Any] | None = None
