from fastapi import APIRouter, HTTPException

from app.api.v1.gymnastics_shared import logger
from app.schemas.gymnastics import (
    DanielStretchSummaryRequest,
    MarchSummaryRequest,
    MarchSummaryResponse,
    StretchMotionSummaryRequest,
    StretchMotionSummaryResponse,
)
from app.services.gymnastics.constants import (
    DANIEL_FORWARD_BEND_MOTION_NAME,
    DANIEL_FORWARD_PRESS_MOTION_NAME,
    DANIEL_LEFT_SIDE_BEND_MOTION_NAME,
    DANIEL_RIGHT_SIDE_BEND_MOTION_NAME,
    DANIEL_UPWARD_PRESS_MOTION_NAME,
)
from app.services.gymnastics.summary import (
    build_march_motion_summary,
    build_stretch_motion_summary,
)

router = APIRouter()


@router.post("/march/summary", response_model=MarchSummaryResponse)
def summarize_march(payload: MarchSummaryRequest) -> MarchSummaryResponse:
    try:
        summary = build_march_motion_summary(
            started_at=payload.started_at,
            ended_at=payload.ended_at,
            step_count=payload.step_count,
            accuracy=payload.accuracy,
            representative_feedback=payload.representative_feedback,
            tracking=payload.tracking,
            state=payload.state,
        )
    except ValueError as exc:
        logger.warning(
            "Invalid march summary request: started_at=%s ended_at=%s detail=%s",
            payload.started_at,
            payload.ended_at,
            exc,
        )
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        logger.exception("Unexpected error while building march summary")
        raise

    return MarchSummaryResponse(
        motionId=summary.motion_id,
        motionName=summary.motion_name,
        durationSec=summary.duration_sec,
        stepCount=summary.step_count,
        accuracy=summary.accuracy,
        representativeFeedback=summary.representative_feedback,
        tracking=summary.tracking,
        state=summary.state,
    )


def _summarize_stretch_motion(
    *,
    payload: StretchMotionSummaryRequest,
    motion_id: str,
    motion_name: str,
) -> StretchMotionSummaryResponse:
    try:
        summary = build_stretch_motion_summary(
            motion_id=motion_id,
            motion_name=motion_name,
            started_at=payload.started_at,
            ended_at=payload.ended_at,
            accuracy=payload.accuracy,
            hold_completed=payload.hold_completed,
            representative_feedback=payload.representative_feedback,
            tracking=payload.tracking,
            state=payload.state,
        )
    except ValueError as exc:
        logger.warning(
            "Invalid stretch summary request: motion_id=%s started_at=%s ended_at=%s detail=%s",
            motion_id,
            payload.started_at,
            payload.ended_at,
            exc,
        )
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        logger.exception("Unexpected error while building stretch summary: motion_id=%s", motion_id)
        raise

    return StretchMotionSummaryResponse(
        motionId=summary.motion_id,
        motionName=summary.motion_name,
        durationSec=summary.duration_sec,
        accuracy=summary.accuracy,
        holdCompleted=summary.hold_completed,
        representativeFeedback=summary.representative_feedback,
        tracking=summary.tracking,
        state=summary.state,
    )


def _build_stretch_summary_endpoint(*, motion_id: str, motion_name: str):
    def summarize_stretch_motion(payload: StretchMotionSummaryRequest) -> StretchMotionSummaryResponse:
        return _summarize_stretch_motion(
            payload=payload,
            motion_id=motion_id,
            motion_name=motion_name,
        )

    return summarize_stretch_motion


_DANIEL_STRETCH_SUMMARY_SPECS = (
    ("daniel-forward-press", "daniel_forward_press", DANIEL_FORWARD_PRESS_MOTION_NAME),
    ("daniel-upward-press", "daniel_upward_press", DANIEL_UPWARD_PRESS_MOTION_NAME),
    ("daniel-left-side-bend", "daniel_side_bend_left", DANIEL_LEFT_SIDE_BEND_MOTION_NAME),
    ("daniel-right-side-bend", "daniel_side_bend_right", DANIEL_RIGHT_SIDE_BEND_MOTION_NAME),
    ("daniel-forward-bend", "daniel_forward_bend", DANIEL_FORWARD_BEND_MOTION_NAME),
)

_DANIEL_STRETCH_MOTION_NAMES = {
    motion_id: motion_name for _, motion_id, motion_name in _DANIEL_STRETCH_SUMMARY_SPECS
}

for route_segment, motion_id, motion_name in _DANIEL_STRETCH_SUMMARY_SPECS:
    endpoint = _build_stretch_summary_endpoint(motion_id=motion_id, motion_name=motion_name)
    endpoint.__name__ = f"summarize_{route_segment.replace('-', '_')}"
    router.add_api_route(
        f"/{route_segment}/summary",
        endpoint,
        methods=["POST"],
        response_model=StretchMotionSummaryResponse,
    )


@router.post("/daniel/summary", response_model=StretchMotionSummaryResponse)
def summarize_daniel_stretch(payload: DanielStretchSummaryRequest) -> StretchMotionSummaryResponse:
    motion_name = _DANIEL_STRETCH_MOTION_NAMES.get(payload.motion_id)
    if motion_name is None:
        logger.warning("Invalid daniel stretch summary motion_id: %s", payload.motion_id)
        raise HTTPException(status_code=400, detail="Invalid daniel stretch motion_id")

    return _summarize_stretch_motion(
        payload=payload,
        motion_id=payload.motion_id,
        motion_name=motion_name,
    )
