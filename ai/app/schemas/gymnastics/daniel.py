from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.gymnastics.common import (
    DanielFrameLabel,
    FeedbackTtsResponse,
    NormalizedPoseResponse,
    PoseFrameRequest,
    ReplayMetadataResponse,
)
from app.services.gymnastics.constants import DEFAULT_STRETCH_HOLD_TARGET_MS


DanielStretchMotionId = Literal[
    "daniel_forward_press",
    "daniel_upward_press",
    "daniel_side_bend_left",
    "daniel_side_bend_right",
    "daniel_forward_bend",
]


class StretchHoldEvaluationRequestBase(BaseModel):
    frame: PoseFrameRequest
    previous_state: str = Field(default="idle", description="Previous hold evaluator state")
    target_hold_ms: int = Field(
        default=DEFAULT_STRETCH_HOLD_TARGET_MS,
        ge=1,
        description="Target hold duration in milliseconds",
    )
    hold_duration_ms: int = Field(
        default=0,
        ge=0,
        description=(
            "Legacy FE compatibility field. Daniel uses this as accumulated "
            "session elapsed time and expects FE to reset it to 0 when a new "
            "session starts."
        ),
    )
    hold_last_timestamp_ms: int | None = Field(
        default=None,
        ge=0,
        description=(
            "Legacy FE compatibility field. Timestamp of the last Daniel "
            "session progress frame; FE should reset it to null for a new session."
        ),
    )
    reference_hip_x: float | None = Field(default=None)
    reference_hip_y: float | None = Field(default=None)
    reference_scale: float | None = Field(default=None)
    displayed_feedback_code: str | None = Field(default=None)
    displayed_feedback_text: str | None = Field(default=None)
    displayed_feedback_frames: int = Field(default=0, ge=0)
    candidate_feedback_code: str | None = Field(default=None)
    candidate_feedback_text: str | None = Field(default=None)
    candidate_feedback_streak: int = Field(default=0, ge=0)
    representative_feedback_totals: dict[str, int] = Field(default_factory=dict)
    representative_feedback_code: str | None = Field(default=None)
    representative_feedback_text: str | None = Field(default=None)
    representative_feedback_frames: int = Field(default=0, ge=0)


class StretchHoldEvaluationResponseBase(BaseModel):
    motion_id: str
    state: str = Field(
        ...,
        description=(
            "Legacy FE compatibility state. For Daniel, consumers should prefer "
            "`frame_label` for per-frame interpretation."
        ),
    )
    accuracy: float
    feedback: str | None = None
    tracking: str
    frame_label: DanielFrameLabel | None = Field(
        default=None,
        description="Primary Daniel per-frame classification label.",
    )
    guidance_code: str | None = Field(
        default=None,
        description="Displayed guidance code for the current frame, when any.",
    )
    guidance_text: str | None = Field(
        default=None,
        description="Displayed guidance text for the current frame, when any.",
    )
    hold_duration_ms: int = 0
    hold_completed: bool = False
    hold_last_timestamp_ms: int | None = None
    reference_hip_x: float | None = None
    reference_hip_y: float | None = None
    reference_scale: float | None = None
    displayed_feedback_code: str | None = None
    displayed_feedback_text: str | None = None
    displayed_feedback_frames: int = 0
    candidate_feedback_code: str | None = None
    candidate_feedback_text: str | None = None
    candidate_feedback_streak: int = 0
    representative_feedback_totals: dict[str, int] = Field(default_factory=dict)
    representative_feedback_code: str | None = None
    representative_feedback_text: str | None = None
    representative_feedback_frames: int = 0
    tts: FeedbackTtsResponse = Field(default_factory=FeedbackTtsResponse)
    normalized_pose: NormalizedPoseResponse | None = None
    replay_metadata: ReplayMetadataResponse | None = None


class DanielForwardPressEvaluationRequest(StretchHoldEvaluationRequestBase):
    baseline_left_wrist_forward: float | None = Field(default=None)
    baseline_right_wrist_forward: float | None = Field(default=None)


class DanielForwardPressFeaturesResponse(BaseModel):
    wrist_forward: float | None = None
    wrist_extension: float | None = None
    left_wrist_forward: float | None = None
    right_wrist_forward: float | None = None
    wrist_gap: float | None = None
    wrist_height_error: float | None = None
    wrist_shoulder_offset: float | None = None
    left_elbow_angle: float | None = None
    right_elbow_angle: float | None = None
    torso_tilt: float
    pelvis_shift_x: float
    pelvis_shift_y: float
    pelvis_depth_shift: float


class DanielForwardPressEvaluationResponse(StretchHoldEvaluationResponseBase):
    baseline_left_wrist_forward: float | None = None
    baseline_right_wrist_forward: float | None = None
    features: DanielForwardPressFeaturesResponse


class DanielUpwardPressEvaluationRequest(StretchHoldEvaluationRequestBase):
    pass


class DanielUpwardPressFeaturesResponse(BaseModel):
    wrist_height: float | None = None
    wrist_height_balance: float | None = None
    left_elbow_angle: float | None = None
    right_elbow_angle: float | None = None
    torso_tilt: float
    pelvis_shift_x: float
    pelvis_shift_y: float
    pelvis_depth_shift: float


class DanielUpwardPressEvaluationResponse(StretchHoldEvaluationResponseBase):
    features: DanielUpwardPressFeaturesResponse


class DanielLeftSideBendEvaluationRequest(StretchHoldEvaluationRequestBase):
    pass


class DanielLeftSideBendFeaturesResponse(BaseModel):
    torso_tilt: float
    wrist_height: float | None = None
    left_elbow_angle: float | None = None
    right_elbow_angle: float | None = None
    pelvis_shift_x: float
    pelvis_shift_y: float
    pelvis_depth_shift: float


class DanielLeftSideBendEvaluationResponse(StretchHoldEvaluationResponseBase):
    features: DanielLeftSideBendFeaturesResponse


class DanielRightSideBendEvaluationRequest(StretchHoldEvaluationRequestBase):
    pass


class DanielRightSideBendFeaturesResponse(BaseModel):
    torso_tilt: float
    wrist_height: float | None = None
    left_elbow_angle: float | None = None
    right_elbow_angle: float | None = None
    pelvis_shift_x: float
    pelvis_shift_y: float
    pelvis_depth_shift: float


class DanielRightSideBendEvaluationResponse(StretchHoldEvaluationResponseBase):
    features: DanielRightSideBendFeaturesResponse


class DanielForwardBendEvaluationRequest(StretchHoldEvaluationRequestBase):
    pass


class DanielForwardBendFeaturesResponse(BaseModel):
    forward_bend_angle: float
    wrist_drop: float | None = None
    left_knee_angle: float | None = None
    right_knee_angle: float | None = None
    pelvis_shift_x: float
    pelvis_shift_y: float
    pelvis_depth_shift: float


class DanielForwardBendEvaluationResponse(StretchHoldEvaluationResponseBase):
    features: DanielForwardBendFeaturesResponse


class DanielStretchEvaluationRequest(StretchHoldEvaluationRequestBase):
    motion_id: DanielStretchMotionId = Field(..., description="Daniel stretch motion identifier")
    baseline_left_wrist_forward: float | None = Field(default=None)
    baseline_right_wrist_forward: float | None = Field(default=None)


class DanielStretchEvaluationResponse(StretchHoldEvaluationResponseBase):
    motion_name: str
    baseline_left_wrist_forward: float | None = None
    baseline_right_wrist_forward: float | None = None
    features: dict[str, float | int | None]
