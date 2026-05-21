from typing import Literal

from pydantic import BaseModel, Field


class PoseLandmarkRequest(BaseModel):
    name: str = Field(..., description="Pose landmark name")
    x: float = Field(..., description="Normalized x coordinate")
    y: float = Field(..., description="Normalized y coordinate")
    z: float | None = Field(default=None, description="Optional z coordinate")
    visibility: float | None = Field(default=None, description="Landmark confidence")


class PoseFrameRequest(BaseModel):
    timestamp_ms: int = Field(..., ge=0, description="Frame timestamp in milliseconds")
    landmarks: list[PoseLandmarkRequest] = Field(
        ...,
        min_length=1,
        description="Pose landmarks for one frame",
    )
    mirrored: bool = Field(
        default=True,
        description="Whether the source frame is mirrored like a front camera preview",
    )


class NormalizedLandmarkResponse(BaseModel):
    name: str
    x: float | None = None
    y: float | None = None
    z: float | None = None
    confidence: float | None = None


class HipCenterResponse(BaseModel):
    x: float
    y: float


class NormalizedPoseResponse(BaseModel):
    tracking: str = Field(..., description="Tracking quality status")
    timestamp_ms: int
    scale_reference: float = Field(..., description="Reference body scale used for normalization")
    hip_center: HipCenterResponse
    landmarks: list[NormalizedLandmarkResponse]


class FeedbackTtsResponse(BaseModel):
    should_play: bool = False
    key: str | None = None
    text: str | None = None
    priority: Literal["tracking", "posture"] | None = None


GymnasticsFrameLabel = Literal[
    "tracking_low",
    "guidance_needed",
    "attempting",
    "motion_present",
]
DanielFrameLabel = GymnasticsFrameLabel
GymnasticsBaselineStatus = Literal["collecting", "ready"]
ReplayBaselineStatus = Literal["not_applicable", "collecting", "ready"]


class ReplayMetadataResponse(BaseModel):
    motion_id: str = Field(..., description="Motion identifier for this replay frame")
    timestamp_ms: int = Field(..., ge=0, description="Source frame timestamp in milliseconds")
    tracking: str = Field(..., description="Tracking quality status for this frame")
    frame_label: GymnasticsFrameLabel | None = Field(
        default=None,
        description="Primary rule-based frame classification for replay consumers.",
    )
    state: str | None = Field(default=None, description="Evaluator state for this frame")
    progress_count: int | None = Field(
        default=None,
        ge=0,
        description="Session progress count for count-based TOP motions.",
    )
    hold_duration_ms: int | None = Field(
        default=None,
        ge=0,
        description="Session elapsed duration for Daniel time-based motions.",
    )
    hold_completed: bool | None = Field(
        default=None,
        description="Whether the Daniel time-based session reached the target duration.",
    )
    guidance_code: str | None = Field(
        default=None,
        description="Displayed coaching feedback code for this frame.",
    )
    guidance_text: str | None = Field(
        default=None,
        description="Displayed coaching feedback text for this frame.",
    )
    baseline_status: ReplayBaselineStatus | None = Field(
        default=None,
        description="Baseline-relative replay context status for this frame.",
    )
