import logging

from fastapi import APIRouter

from app.schemas.report_summary import (
    ReportSummaryRequest,
    ReportSummaryResponse,
)
from app.services.report.summary_service import summarize_weekly_report

router = APIRouter(prefix="/report", tags=["Guardian Report"])
logger = logging.getLogger(__name__)


@router.post("/summarize", response_model=ReportSummaryResponse)
async def summarize(request: ReportSummaryRequest) -> ReportSummaryResponse:
    return await summarize_weekly_report(request)
