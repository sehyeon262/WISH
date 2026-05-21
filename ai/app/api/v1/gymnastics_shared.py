import logging
from typing import TypeVar

from app.schemas.gymnastics import (
    FeedbackTtsResponse,
    HipCenterResponse,
    NormalizedLandmarkResponse,
    NormalizedPoseResponse,
    ReplayMetadataResponse,
)
from app.services.gymnastics.feedback.common import TRACKING_LOW
from app.services.gymnastics.constants import MOTION_REPLAY_LANDMARK_NAMES
from app.services.gymnastics.evaluators.daniel_forward_bend import DanielForwardBendEvaluator
from app.services.gymnastics.evaluators.daniel_forward_press import DanielForwardPressEvaluator
from app.services.gymnastics.evaluators.daniel_left_side_bend import DanielLeftSideBendEvaluator
from app.services.gymnastics.evaluators.daniel_right_side_bend import DanielRightSideBendEvaluator
from app.services.gymnastics.evaluators.daniel_upward_press import DanielUpwardPressEvaluator
from app.services.gymnastics.evaluators.diagonal_body_punch import DiagonalBodyPunchEvaluator
from app.services.gymnastics.evaluators.diagonal_face_punch import DiagonalFacePunchEvaluator
from app.services.gymnastics.evaluators.march import MarchEvaluator
from app.services.gymnastics.evaluators.side_step import SideStepEvaluator
from app.services.gymnastics.evaluators.squat import SquatEvaluator
from app.services.gymnastics.normalization.pose_normalizer import PoseNormalizer
from app.services.gymnastics.types import NormalizedPoseFrame

logger = logging.getLogger(__name__)
T = TypeVar("T")

normalizer = PoseNormalizer(min_confidence=0.25)
march_evaluator = MarchEvaluator()
daniel_forward_bend_evaluator = DanielForwardBendEvaluator()
daniel_forward_press_evaluator = DanielForwardPressEvaluator()
daniel_upward_press_evaluator = DanielUpwardPressEvaluator()
daniel_left_side_bend_evaluator = DanielLeftSideBendEvaluator()
daniel_right_side_bend_evaluator = DanielRightSideBendEvaluator()
side_step_evaluator = SideStepEvaluator()
diagonal_body_punch_evaluator = DiagonalBodyPunchEvaluator()
diagonal_face_punch_evaluator = DiagonalFacePunchEvaluator()
squat_evaluator = SquatEvaluator()


def to_normalized_pose_response(frame: NormalizedPoseFrame) -> NormalizedPoseResponse:
    landmarks = [
        NormalizedLandmarkResponse(
            name=landmark.name,
            x=landmark.x,
            y=landmark.y,
            z=landmark.z,
            confidence=landmark.confidence,
        )
        for landmark in sorted(frame.landmarks.values(), key=lambda item: item.name)
    ]

    return NormalizedPoseResponse(
        tracking=frame.tracking,
        timestamp_ms=frame.timestamp_ms,
        scale_reference=frame.scale_reference,
        hip_center=HipCenterResponse(x=frame.hip_center.x, y=frame.hip_center.y),
        landmarks=landmarks,
    )


def to_motion_replay_pose_response(frame: NormalizedPoseFrame) -> NormalizedPoseResponse:
    landmarks = []
    for landmark_name in MOTION_REPLAY_LANDMARK_NAMES:
        landmark = frame.landmarks.get(landmark_name)
        if landmark is None:
            # Motion replay consumes a fixed 12-joint layout.
            landmarks.append(
                NormalizedLandmarkResponse(
                    name=landmark_name,
                    x=None,
                    y=None,
                    z=None,
                    confidence=0.0,
                )
            )
            continue

        landmarks.append(
            NormalizedLandmarkResponse(
                name=landmark.name,
                x=landmark.x,
                y=landmark.y,
                z=landmark.z,
                confidence=landmark.confidence,
            )
        )

    return NormalizedPoseResponse(
        tracking=frame.tracking,
        timestamp_ms=frame.timestamp_ms,
        scale_reference=frame.scale_reference,
        hip_center=HipCenterResponse(x=frame.hip_center.x, y=frame.hip_center.y),
        landmarks=landmarks,
    )


def _require_replay_metadata_field(value: T | None, field_name: str) -> T:
    if value is None:
        raise ValueError(f"Missing replay metadata field: {field_name}")
    return value


def build_replay_metadata_response(
    *,
    motion_id: str | None,
    timestamp_ms: int | None,
    tracking: str | None,
    frame_label: str | None,
    state: str | None,
    progress_count: int | None = None,
    hold_duration_ms: int | None = None,
    hold_completed: bool | None = None,
    guidance_code: str | None = None,
    guidance_text: str | None = None,
    baseline_status: str | None = None,
) -> ReplayMetadataResponse:
    return ReplayMetadataResponse(
        motion_id=_require_replay_metadata_field(motion_id, "motion_id"),
        timestamp_ms=_require_replay_metadata_field(timestamp_ms, "timestamp_ms"),
        tracking=_require_replay_metadata_field(tracking, "tracking"),
        frame_label=frame_label,
        state=state,
        progress_count=progress_count,
        hold_duration_ms=hold_duration_ms,
        hold_completed=hold_completed,
        guidance_code=guidance_code,
        guidance_text=guidance_text,
        baseline_status=baseline_status,
    )


def build_feedback_tts_response(
    *,
    previous_displayed_code: str | None,
    previous_displayed_text: str | None,
    displayed_code: str | None,
    displayed_text: str | None,
) -> FeedbackTtsResponse:
    has_changed = (
        displayed_code != previous_displayed_code
        or displayed_text != previous_displayed_text
    )
    # TTS is only emitted when the visible feedback actually changes and the
    # current feedback has both a stable code and readable text.
    if not has_changed or displayed_code is None or displayed_text is None:
        return FeedbackTtsResponse()

    priority = "tracking" if displayed_code == TRACKING_LOW.code else "posture"
    return FeedbackTtsResponse(
        should_play=True,
        key=displayed_code,
        text=displayed_text,
        priority=priority,
    )
