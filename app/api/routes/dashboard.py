from fastapi import APIRouter, Depends

from app.api.deps import get_authority_context, get_supabase_service
from app.schemas.common import SuccessResponse
from app.schemas.dashboard import DashboardCase, DashboardCasesResponse
from app.services.authority_auth import AuthorityContext
from app.services.supabase_service import SupabaseService


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/cases", response_model=SuccessResponse[DashboardCasesResponse])
async def list_cases(
    authority: AuthorityContext = Depends(get_authority_context),
    supabase_service: SupabaseService = Depends(get_supabase_service),
) -> SuccessResponse[DashboardCasesResponse]:
    rows = supabase_service.list_dashboard_cases(jurisdiction_code=authority.jurisdiction_code)
    cases = [
        DashboardCase(
            tracking_id=str(row.get("tracking_id") or ""),
            jurisdiction_code=str(row.get("jurisdiction_code") or authority.jurisdiction_code),
            status=row.get("status") or "submitted",
            risk_score=row.get("risk_score"),
            ai_label=row.get("combined_label") or row.get("ai_label"),
            authority_action=row.get("authority_action"),
            onchain_tx_hash=row.get("onchain_tx_hash"),
            created_at=row.get("created_at"),
        )
        for row in rows
    ]
    return SuccessResponse(
        data=DashboardCasesResponse(
            jurisdiction_code=authority.jurisdiction_code,
            total=len(cases),
            cases=cases,
        )
    )
