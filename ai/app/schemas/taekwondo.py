from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.gymnastics import HipCenterResponse, NormalizedPoseResponse, PoseFrameRequest
from app.services.taekwondo.constants import (
    DEFAULT_CALIBRATION_TARGET_FRAMES,
    MAX_CALIBRATION_TARGET_FRAMES,
)


class TaekwondoPoseFrameRequest(PoseFrameRequest):
    """Request model for taekwondo pose normalization."""


class TrackingQualityResponse(BaseModel):
    quality_score: float = Field(..., description="Composite tracking quality score (0.0–1.0)")
    missing_landmarks: list[str] = Field(..., description="Required landmarks absent after filtering")
    landmark_completeness: float = Field(..., description="Ratio of required landmarks present (0.0–1.0)")
    mean_confidence: float = Field(..., description="Mean confidence of detected landmarks")


class TaekwondoNormalizedPoseResponse(NormalizedPoseResponse):
    """Response model for taekwondo pose normalization."""

    tracking_quality: TrackingQualityResponse


class TaekwondoCalibrationRequest(BaseModel):
    frame: TaekwondoPoseFrameRequest
    stable_frame_count: int = Field(
        default=0,
        ge=0,
        description="Number of consecutive stable frames already collected",
    )
    target_stable_frames: int = Field(
        default=DEFAULT_CALIBRATION_TARGET_FRAMES,
        ge=1,
        le=MAX_CALIBRATION_TARGET_FRAMES,
        description="How many stable frames are required before calibration succeeds",
    )


class TaekwondoCalibrationResponse(BaseModel):
    tracking: str = Field(..., description="Tracking quality status for the current frame")
    tracking_quality: TrackingQualityResponse
    stable_frame_count: int = Field(..., ge=0, description="Updated stable frame count")
    target_stable_frames: int = Field(..., ge=1)
    frames_remaining: int = Field(..., ge=0, description="Stable frames still needed to finish calibration")
    calibration_status: str = Field(..., description="collecting, calibrated, or reposition_required")
    is_calibrated: bool
    failure_reason: str | None = Field(
        default=None,
        description="Reason calibration could not proceed, usually tracking_low or tracking_lost",
    )
    reference_hip_center: HipCenterResponse | None = None
    reference_scale: float | None = None


class TaekwondoBasicMotionFeaturesResponse(BaseModel):
    left_wrist_y: float
    right_wrist_y: float
    left_wrist_far_from_center: float
    right_wrist_far_from_center: float
    left_wrist_to_hip_distance: float
    right_wrist_to_hip_distance: float
    left_elbow_angle: float | None = None
    right_elbow_angle: float | None = None
    left_wrist_near_hip: bool
    right_wrist_near_hip: bool
    dominant_action_side: str | None = None


class TaekwondoBasicMotionClassificationRequest(BaseModel):
    frame: TaekwondoPoseFrameRequest


class TaekwondoBasicMotionClassificationResponse(BaseModel):
    tracking: str = Field(..., description="Tracking quality status for the current frame")
    tracking_quality: TrackingQualityResponse
    action_label: str = Field(..., description="Current basic taekwondo action label")
    confidence: float = Field(..., ge=0.0, le=1.0)
    dominant_side: str | None = None
    scores: dict[str, float]
    features: TaekwondoBasicMotionFeaturesResponse


class TaekwondoStanceFeaturesResponse(BaseModel):
    hip_width: float
    foot_distance: float
    stance_width_ratio: float
    left_knee_angle: float | None = None
    right_knee_angle: float | None = None
    knee_angle_difference: float
    bend_side: str | None = None


class TaekwondoStanceClassificationRequest(BaseModel):
    frame: TaekwondoPoseFrameRequest


class TaekwondoStanceClassificationResponse(BaseModel):
    tracking: str = Field(..., description="Tracking quality status for the current frame")
    tracking_quality: TrackingQualityResponse
    stance_label: str = Field(..., description="Current taekwondo stance label")
    confidence: float = Field(..., ge=0.0, le=1.0)
    bend_side: str | None = None
    scores: dict[str, float]
    features: TaekwondoStanceFeaturesResponse


class TaekwondoDirectionFeaturesResponse(BaseModel):
    left_shoulder_x: float
    right_shoulder_x: float
    left_hip_x: float
    right_hip_x: float
    left_ankle_x: float
    right_ankle_x: float
    left_side_extent: float
    right_side_extent: float
    side_extent_difference: float
    shoulder_balance: float
    ankle_balance: float


class TaekwondoDirectionClassificationRequest(BaseModel):
    frame: TaekwondoPoseFrameRequest
    previous_direction: Literal["front", "left", "right"] | None = Field(
        default=None,
        description="Previous direction label to infer turn_left / turn_right",
    )


class TaekwondoDirectionClassificationResponse(BaseModel):
    tracking: str = Field(..., description="Tracking quality status for the current frame")
    tracking_quality: TrackingQualityResponse
    direction_label: str = Field(..., description="Current body direction label")
    turn_label: str = Field(..., description="Direction change label")
    confidence: float = Field(..., ge=0.0, le=1.0)
    scores: dict[str, float]
    features: TaekwondoDirectionFeaturesResponse


# ---------- 태극 1장 채점 (S14P31E103-341) ----------

class TaekwondoScoringRequest(BaseModel):
    """태극 1장 동작 채점 요청.

    8개 관절 순서: 왼팔꿈치, 오른팔꿈치, 왼어깨, 오른어깨,
    왼무릎, 오른무릎, 왼엉덩이, 오른엉덩이 (각도, 도 단위 0~180).
    """

    action_name: str = Field(
        ...,
        description="채점할 동작 이름 (예: '기본준비', '앞굽이하고 아래막기')",
        min_length=1,
    )
    keypoints: list[list[float]] = Field(
        ...,
        description=(
            "(T, 8) 형태의 관절 각도 시퀀스. T 는 가변 길이 (서버에서 60프레임으로 보간)."
        ),
        min_length=1,
    )


class TaekwondoLstmScoreDetail(BaseModel):
    score: float = Field(..., ge=0.0, le=100.0, description="LSTM 단독 점수 (0~100)")
    recon_error: float = Field(..., ge=0.0, description="재구성 평균 MSE (0~1 정규화)")
    joint_errors: dict[str, float] = Field(
        ...,
        description="마지막 프레임 기준 관절별 각도 오차 (도 단위)",
    )
    worst_joint: str = Field(..., description="가장 큰 오차의 관절명 (피드백용)")


class TaekwondoDtwScoreDetail(BaseModel):
    score: float = Field(..., ge=0.0, le=100.0, description="DTW 단독 점수 (0~100)")
    distance: float = Field(..., ge=0.0, description="사용자 시퀀스 ↔ 기준 템플릿 DTW 거리")


class TaekwondoScoringResponse(BaseModel):
    """LSTM + DTW 앙상블 채점 결과.

    프론트엔드는 ``final_score`` 만으로 화면 표시 가능하며, 보호자 리포트 등은
    ``lstm`` / ``dtw`` 의 상세 정보를 활용한다.
    """

    action_name: str = Field(..., description="채점된 동작 이름")
    final_score: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        description="최종 점수 (LSTM × 0.6 + DTW × 0.4 가중평균, 0~100)",
    )
    lstm: TaekwondoLstmScoreDetail
    dtw: TaekwondoDtwScoreDetail


class Taegeuk1AnalyzeRequest(BaseModel):
    session_id: str | None = Field(default=None, description="Client session identifier")
    movement_name: str = Field(..., min_length=1, description="Target Taegeuk 1 movement name")
    sequence: list = Field(
        ...,
        description="Pose sequence. Supported shapes: (3, 60, 29), (3, T, 29), (T, 29, 3), or (T, 29, 2).",
    )
    input_normalized: bool = Field(default=True, description="Whether the sequence is already normalized")
    pass_threshold: float = Field(default=80.0, ge=0.0, le=100.0, description="Success threshold")


class Taegeuk1AnalyzeResponse(BaseModel):
    session_id: str | None = None
    target_movement_index: int
    target_movement_name: str
    score: float = Field(..., ge=0.0, le=100.0)
    pass_threshold: float = Field(..., ge=0.0, le=100.0)
    passed: bool
    scoring_method: str
    worst_joint: str
    weakest_body_part: str
    feedback_summary: str
