from datetime import UTC, datetime

from fastapi import APIRouter, Depends, status

from app.api.deps import get_authority_context, get_supabase_service
from app.core.errors import AppError
from app.schemas.authority import AuthorityActionRequest, AuthorityActionResponse
from app.schemas.common import SuccessResponse
from app.services.authority_auth import AuthorityContext
from app.services.blockchain import BlockchainService
from app.services.supabase_service import SupabaseService


router = APIRouter(prefix="/authority", tags=["authority"])


@router.post("/action", response_model=SuccessResponse[AuthorityActionResponse], status_code=status.HTTP_200_OK)
async def record_authority_action(
    payload: AuthorityActionRequest,
    authority: AuthorityContext = Depends(get_authority_context),
    supabase_service: SupabaseService = Depends(get_supabase_service),
) -> SuccessResponse[AuthorityActionResponse]:
    report = supabase_service.get_report_by_tracking_id(payload.tracking_id)
    if not report:
        raise AppError(code="report_not_found", message="Tracking ID not found", status_code=404)

    if report.get("jurisdiction_code") != authority.jurisdiction_code:
        raise AppError(code="jurisdiction_mismatch", message="Authority cannot act outside assigned jurisdiction", status_code=403)

    new_status = "resolved" if payload.action == "resolved" else "assigned"
    updated = supabase_service.update_report(
        payload.tracking_id,
        {
            "status": new_status,
            "authority_action": payload.action,
            "updated_at": datetime.now(UTC).isoformat(),
        },
    )

    tx_hash = None
    try:
        tx_hash = BlockchainService().log_authority_action(payload.tracking_id, payload.action)
    except AppError:
        tx_hash = None

    supabase_service.insert_audit_log(
        {
            "tracking_id": payload.tracking_id,
            "actor_type": "authority",
            "action": f"authority_{payload.action}",
            "metadata": {
                "authority_id": authority.authority_id,
                "notes": payload.notes,
                "onchain_tx_hash": tx_hash,
            },
        }
    )

    return SuccessResponse(
        data=AuthorityActionResponse(
            tracking_id=payload.tracking_id,
            action=payload.action,
            updated_status=str(updated.get("status") or new_status),
            jurisdiction_code=authority.jurisdiction_code,
            onchain_tx_hash=tx_hash,
            updated_at=updated.get("updated_at"),
        )
    )
