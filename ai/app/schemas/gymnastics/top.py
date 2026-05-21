from pydantic import BaseModel, Field

from app.schemas.gymnastics.common import (
    FeedbackTtsResponse,
    GymnasticsBaselineStatus,
    GymnasticsFrameLabel,
    NormalizedPoseResponse,
    PoseFrameRequest,
    ReplayMetadataResponse,
)
from app.services.gymnastics.constants import DEFAULT_GYMNASTICS_BASELINE_TARGET_FRAMES


class MarchEvaluationRequest(BaseModel):
    frame: PoseFrameRequest
    previous_state: str = Field(default="idle", description="Previous evaluator state")
    step_count: int = Field(default=0, ge=0, description="Current accumulated march step count")
    target_steps: int = Field(default=8, ge=1, description="Target march step count")
    last_counted_side: str | None = Field(
        default=None,
        description="Last counted side to prevent duplicate counting",
    )
    last_seen_side: str | None = Field(
        default=None,
        description="Last side that was detected as dominant",
    )
    left_armed: bool = Field(
        default=True,
        description="Whether the left side can count a new peak",
    )
    right_armed: bool = Field(
        default=True,
        description="Whether the right side can count a new peak",
    )
    reference_hip_x: float | None = Field(
        default=None,
        description="Raw hip center X captured at session start",
    )
    reference_hip_y: float | None = Field(
        default=None,
        description="Raw hip center Y captured at session start",
    )
    reference_scale: float | None = Field(
        default=None,
        description="Shoulder-width scale captured at session start",
    )
    baseline_status: GymnasticsBaselineStatus = Field(
        default="ready",
        description="Set to collecting during pre-motion baseline capture; ready evaluates normally.",
    )
    baseline_frames: int = Field(default=0, ge=0)
    baseline_target_frames: int = Field(default=DEFAULT_GYMNASTICS_BASELINE_TARGET_FRAMES, ge=1)
    baseline_left_knee_lift: float | None = Field(default=None)
    baseline_right_knee_lift: float | None = Field(default=None)
    baseline_left_thigh_angle: float | None = Field(default=None)
    baseline_right_thigh_angle: float | None = Field(default=None)
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


class MarchFeaturesResponse(BaseModel):
    left_knee_lift: float
    right_knee_lift: float
    left_thigh_angle: float = 0.0
    right_thigh_angle: float = 0.0
    left_knee_angle: float | None = None
    right_knee_angle: float | None = None
    torso_tilt: float
    pelvis_shift_x: float = 0.0
    pelvis_shift_y: float = 0.0
    pelvis_depth_shift: float = 0.0


class MarchEvaluationResponse(BaseModel):
    motion_id: str
    state: str
    step_count: int
    accuracy: float
    feedback: str | None = None
    tracking: str
    frame_label: GymnasticsFrameLabel | None = Field(
        default=None,
        description="Primary per-frame classification label.",
    )
    guidance_code: str | None = Field(
        default=None,
        description="Displayed coaching feedback code for the current frame, when any.",
    )
    guidance_text: str | None = Field(
        default=None,
        description="Displayed coaching feedback text for the current frame, when any.",
    )
    last_counted_side: str | None = None
    last_seen_side: str | None = None
    left_armed: bool = True
    right_armed: bool = True
    reference_hip_x: float | None = None
    reference_hip_y: float | None = None
    reference_scale: float | None = None
    baseline_status: GymnasticsBaselineStatus = "ready"
    baseline_frames: int = 0
    baseline_target_frames: int = DEFAULT_GYMNASTICS_BASELINE_TARGET_FRAMES
    baseline_left_knee_lift: float | None = None
    baseline_right_knee_lift: float | None = None
    baseline_left_thigh_angle: float | None = None
    baseline_right_thigh_angle: float | None = None
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
    features: MarchFeaturesResponse


class SideStepEvaluationRequest(BaseModel):
    frame: PoseFrameRequest
    previous_state: str = Field(default="idle", description="Previous evaluator state")
    step_count: int = Field(default=0, ge=0, description="Current accumulated side-step count")
    target_steps: int = Field(default=8, ge=1, description="Target side-step count")
    last_counted_side: str | None = Field(default=None)
    last_seen_side: str | None = Field(default=None)
    left_armed: bool = Field(default=True)
    right_armed: bool = Field(default=True)
    reference_hip_x: float | None = Field(default=None)
    reference_hip_y: float | None = Field(default=None)
    reference_scale: float | None = Field(default=None)
    baseline_status: GymnasticsBaselineStatus = Field(default="ready")
    baseline_frames: int = Field(default=0, ge=0)
    baseline_target_frames: int = Field(default=DEFAULT_GYMNASTICS_BASELINE_TARGET_FRAMES, ge=1)
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
    baseline_left_step_extent: float | None = Field(default=None)
    baseline_right_step_extent: float | None = Field(default=None)
    baseline_ankle_span: float | None = Field(default=None)


class SideStepFeaturesResponse(BaseModel):
    left_step_extent: float
    right_step_extent: float
    ankle_span: float
    torso_tilt: float
    pelvis_shift_x: float
    pelvis_shift_y: float
    pelvis_depth_shift: float


class SideStepEvaluationResponse(BaseModel):
    motion_id: str
    state: str
    step_count: int
    accuracy: float
    feedback: str | None = None
    tracking: str
    frame_label: GymnasticsFrameLabel | None = Field(
        default=None,
        description="Primary per-frame classification label.",
    )
    guidance_code: str | None = Field(
        default=None,
        description="Displayed coaching feedback code for the current frame, when any.",
    )
    guidance_text: str | None = Field(
        default=None,
        description="Displayed coaching feedback text for the current frame, when any.",
    )
    last_counted_side: str | None = None
    last_seen_side: str | None = None
    left_armed: bool = True
    right_armed: bool = True
    reference_hip_x: float | None = None
    reference_hip_y: float | None = None
    reference_scale: float | None = None
    baseline_status: GymnasticsBaselineStatus = "ready"
    baseline_frames: int = 0
    baseline_target_frames: int = DEFAULT_GYMNASTICS_BASELINE_TARGET_FRAMES
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
    baseline_left_step_extent: float | None = None
    baseline_right_step_extent: float | None = None
    baseline_ankle_span: float | None = None
    tts: FeedbackTtsResponse = Field(default_factory=FeedbackTtsResponse)
    normalized_pose: NormalizedPoseResponse | None = None
    replay_metadata: ReplayMetadataResponse | None = None
    features: SideStepFeaturesResponse


class DiagonalBodyPunchEvaluationRequest(BaseModel):
    frame: PoseFrameRequest
    previous_state: str = Field(default="idle")
    step_count: int = Field(default=0, ge=0)
    target_steps: int = Field(default=8, ge=1)
    last_counted_side: str | None = Field(default=None)
    last_seen_side: str | None = Field(default=None)
    left_armed: bool = Field(default=True)
    right_armed: bool = Field(default=True)
    reference_hip_x: float | None = Field(default=None)
    reference_hip_y: float | None = Field(default=None)
    reference_scale: float | None = Field(default=None)
    baseline_status: GymnasticsBaselineStatus = Field(default="ready")
    baseline_frames: int = Field(default=0, ge=0)
    baseline_target_frames: int = Field(default=DEFAULT_GYMNASTICS_BASELINE_TARGET_FRAMES, ge=1)
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
    baseline_left_wrist_forward: float | None = Field(default=None)
    baseline_right_wrist_forward: float | None = Field(default=None)
    baseline_stance_span: float | None = Field(default=None)


class DiagonalBodyPunchFeaturesResponse(BaseModel):
    left_wrist_forward: float
    right_wrist_forward: float
    left_arm_extension: float
    right_arm_extension: float
    left_elbow_angle: float | None = None
    right_elbow_angle: float | None = None
    stance_span: float
    torso_tilt: float
    pelvis_shift_x: float
    pelvis_shift_y: float
    pelvis_depth_shift: float


class DiagonalBodyPunchEvaluationResponse(BaseModel):
    motion_id: str
    state: str
    step_count: int
    accuracy: float
    feedback: str | None = None
    tracking: str
    frame_label: GymnasticsFrameLabel | None = Field(
        default=None,
        description="Primary per-frame classification label.",
    )
    guidance_code: str | None = Field(
        default=None,
        description="Displayed coaching feedback code for the current frame, when any.",
    )
    guidance_text: str | None = Field(
        default=None,
        description="Displayed coaching feedback text for the current frame, when any.",
    )
    last_counted_side: str | None = None
    last_seen_side: str | None = None
    left_armed: bool = True
    right_armed: bool = True
    reference_hip_x: float | None = None
    reference_hip_y: float | None = None
    reference_scale: float | None = None
    baseline_status: GymnasticsBaselineStatus = "ready"
    baseline_frames: int = 0
    baseline_target_frames: int = DEFAULT_GYMNASTICS_BASELINE_TARGET_FRAMES
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
    baseline_left_wrist_forward: float | None = None
    baseline_right_wrist_forward: float | None = None
    baseline_stance_span: float | None = None
    tts: FeedbackTtsResponse = Field(default_factory=FeedbackTtsResponse)
    normalized_pose: NormalizedPoseResponse | None = None
    replay_metadata: ReplayMetadataResponse | None = None
    features: DiagonalBodyPunchFeaturesResponse


class DiagonalFacePunchEvaluationRequest(BaseModel):
    frame: PoseFrameRequest
    previous_state: str = Field(default="idle")
    step_count: int = Field(default=0, ge=0)
    target_steps: int = Field(default=8, ge=1)
    last_counted_side: str | None = Field(default=None)
    last_seen_side: str | None = Field(default=None)
    left_armed: bool = Field(default=True)
    right_armed: bool = Field(default=True)
    reference_hip_x: float | None = Field(default=None)
    reference_hip_y: float | None = Field(default=None)
    reference_scale: float | None = Field(default=None)
    baseline_status: GymnasticsBaselineStatus = Field(default="ready")
    baseline_frames: int = Field(default=0, ge=0)
    baseline_target_frames: int = Field(default=DEFAULT_GYMNASTICS_BASELINE_TARGET_FRAMES, ge=1)
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
    baseline_left_wrist_forward: float | None = Field(default=None)
    baseline_right_wrist_forward: float | None = Field(default=None)
    baseline_left_wrist_height: float | None = Field(default=None)
    baseline_right_wrist_height: float | None = Field(default=None)
    baseline_stance_span: float | None = Field(default=None)


class DiagonalFacePunchFeaturesResponse(BaseModel):
    left_wrist_forward: float
    right_wrist_forward: float
    left_wrist_height: float
    right_wrist_height: float
    left_arm_extension: float
    right_arm_extension: float
    left_elbow_angle: float | None = None
    right_elbow_angle: float | None = None
    stance_span: float
    torso_tilt: float
    pelvis_shift_x: float
    pelvis_shift_y: float
    pelvis_depth_shift: float


class DiagonalFacePunchEvaluationResponse(BaseModel):
    motion_id: str
    state: str
    step_count: int
    accuracy: float
    feedback: str | None = None
    tracking: str
    frame_label: GymnasticsFrameLabel | None = Field(
        default=None,
        description="Primary per-frame classification label.",
    )
    guidance_code: str | None = Field(
        default=None,
        description="Displayed coaching feedback code for the current frame, when any.",
    )
    guidance_text: str | None = Field(
        default=None,
        description="Displayed coaching feedback text for the current frame, when any.",
    )
    last_counted_side: str | None = None
    last_seen_side: str | None = None
    left_armed: bool = True
    right_armed: bool = True
    reference_hip_x: float | None = None
    reference_hip_y: float | None = None
    reference_scale: float | None = None
    baseline_status: GymnasticsBaselineStatus = "ready"
    baseline_frames: int = 0
    baseline_target_frames: int = DEFAULT_GYMNASTICS_BASELINE_TARGET_FRAMES
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
    baseline_left_wrist_forward: float | None = None
    baseline_right_wrist_forward: float | None = None
    baseline_left_wrist_height: float | None = None
    baseline_right_wrist_height: float | None = None
    baseline_stance_span: float | None = None
    tts: FeedbackTtsResponse = Field(default_factory=FeedbackTtsResponse)
    normalized_pose: NormalizedPoseResponse | None = None
    replay_metadata: ReplayMetadataResponse | None = None
    features: DiagonalFacePunchFeaturesResponse


class SquatEvaluationRequest(BaseModel):
    frame: PoseFrameRequest
    previous_state: str = Field(default="idle")
    step_count: int = Field(default=0, ge=0)
    target_steps: int = Field(default=8, ge=1)
    reference_hip_x: float | None = Field(default=None)
    reference_hip_y: float | None = Field(default=None)
    reference_scale: float | None = Field(default=None)
    baseline_status: GymnasticsBaselineStatus = Field(default="ready")
    baseline_frames: int = Field(default=0, ge=0)
    baseline_target_frames: int = Field(default=DEFAULT_GYMNASTICS_BASELINE_TARGET_FRAMES, ge=1)
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


class SquatFeaturesResponse(BaseModel):
    hip_drop: float
    left_knee_angle: float | None = None
    right_knee_angle: float | None = None
    avg_knee_angle: float | None = None
    torso_tilt: float
    pelvis_shift_x: float
    pelvis_depth_shift: float


class SquatEvaluationResponse(BaseModel):
    motion_id: str
    state: str
    step_count: int
    accuracy: float
    feedback: str | None = None
    tracking: str
    frame_label: GymnasticsFrameLabel | None = Field(
        default=None,
        description="Primary per-frame classification label.",
    )
    guidance_code: str | None = Field(
        default=None,
        description="Displayed coaching feedback code for the current frame, when any.",
    )
    guidance_text: str | None = Field(
        default=None,
        description="Displayed coaching feedback text for the current frame, when any.",
    )
    reference_hip_x: float | None = None
    reference_hip_y: float | None = None
    reference_scale: float | None = None
    baseline_status: GymnasticsBaselineStatus = "ready"
    baseline_frames: int = 0
    baseline_target_frames: int = DEFAULT_GYMNASTICS_BASELINE_TARGET_FRAMES
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
    features: SquatFeaturesResponse
