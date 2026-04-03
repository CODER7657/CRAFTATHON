from datetime import datetime

from app.schemas.common import APIModel
from app.schemas.report import CaseStatus, RiskLabel


class DashboardCase(APIModel):
    tracking_id: str
    jurisdiction_code: str
    status: CaseStatus
    risk_score: int | None = None
    ai_label: RiskLabel | None = None
    authority_action: str | None = None
    onchain_tx_hash: str | None = None
    created_at: datetime | None = None


class DashboardCasesResponse(APIModel):
    jurisdiction_code: str
    total: int
    cases: list[DashboardCase]
