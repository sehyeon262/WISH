from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.gymnastics.daniel import DanielStretchMotionId


class MarchSummaryRequest(BaseModel):
    started_at: datetime = Field(..., description="Motion start time in ISO 8601 format")
    ended_at: datetime = Field(..., description="Motion end time in ISO 8601 format")
    step_count: int = Field(..., ge=0, description="Final accumulated march step count")
    accuracy: float = Field(..., ge=0.0, le=1.0, description="Final accuracy score")
    representative_feedback: str | None = Field(
        default=None,
        description="Representative corrective feedback for this motion",
    )
    tracking: str = Field(..., description="Final tracking quality status")
    state: str = Field(..., description="Final evaluator state")


class MarchSummaryResponse(BaseModel):
    motionId: str
    motionName: str
    durationSec: float
    stepCount: int
    accuracy: float
    representativeFeedback: str | None = None
    tracking: str
    state: str


class StretchMotionSummaryRequest(BaseModel):
    started_at: datetime = Field(..., description="Motion start time in ISO 8601 format")
    ended_at: datetime = Field(..., description="Motion end time in ISO 8601 format")
    accuracy: float = Field(..., ge=0.0, le=1.0, description="Final accuracy score")
    hold_completed: bool = Field(..., description="Whether the user reached the target hold time")
    representative_feedback: str | None = Field(
        default=None,
        description="Representative corrective feedback for this motion",
    )
    tracking: str = Field(..., description="Final tracking quality status")
    state: str = Field(..., description="Final evaluator state")


class StretchMotionSummaryResponse(BaseModel):
    motionId: str
    motionName: str
    durationSec: float
    accuracy: float
    holdCompleted: bool
    representativeFeedback: str | None = None
    tracking: str
    state: str


class DanielStretchSummaryRequest(StretchMotionSummaryRequest):
    motion_id: DanielStretchMotionId = Field(..., description="Daniel stretch motion identifier")
