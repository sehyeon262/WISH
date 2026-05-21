from fastapi import APIRouter, HTTPException

from app.api.v1.gymnastics_shared import logger, normalizer, to_normalized_pose_response
from app.schemas.gymnastics import NormalizedPoseResponse, PoseFrameRequest

router = APIRouter()


@router.post("/normalize", response_model=NormalizedPoseResponse)
def normalize_pose(frame: PoseFrameRequest) -> NormalizedPoseResponse:
    try:
        normalized = normalizer.normalize(frame)
    except (KeyError, ValueError) as exc:
        logger.warning("Invalid gymnastics normalize request: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid gymnastics normalize request") from exc
    except Exception:
        logger.exception("Unexpected error while normalizing gymnastics pose")
        raise HTTPException(status_code=500, detail="Failed to normalize gymnastics pose")

    return to_normalized_pose_response(normalized)
