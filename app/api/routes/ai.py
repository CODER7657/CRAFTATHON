from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_db_service
from app.core.errors import AppError
from app.schemas.ai import AIClassifyRequest, AIClassifyResponse
from app.schemas.common import SuccessResponse
from app.services.db_service import DBService
from app.tasks.classification import classify_report_async


router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/classify", response_model=SuccessResponse[AIClassifyResponse], status_code=status.HTTP_200_OK)
async def classify(
    payload: AIClassifyRequest,
    db_service: DBService = Depends(get_db_service),
    sync: bool = Query(default=False),
) -> SuccessResponse[AIClassifyResponse]:
    report = db_service.get_report_by_tracking_id(payload.tracking_id)
    if not report:
        raise AppError(code="report_not_found", message="Tracking ID not found", status_code=404)

    if sync:
        classify_report_async.run(
            tracking_id=payload.tracking_id,
            image_base64=payload.image_base64,
            image_content_type=payload.image_content_type,
        )
        return SuccessResponse(
            data=AIClassifyResponse(
                tracking_id=payload.tracking_id,
                status="completed",
                task_id=None,
            )
        )

    task = classify_report_async.delay(
        tracking_id=payload.tracking_id,
        image_base64=payload.image_base64,
        image_content_type=payload.image_content_type,
    )

    return SuccessResponse(
        data=AIClassifyResponse(
            tracking_id=payload.tracking_id,
            status="queued",
            task_id=getattr(task, "id", None),
        )
    )
