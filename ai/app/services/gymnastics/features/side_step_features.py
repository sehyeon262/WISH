from dataclasses import dataclass
from math import acos, degrees, sqrt

from app.services.gymnastics.constants import (
    LEFT_ANKLE,
    LEFT_HIP,
    LEFT_SHOULDER,
    MIN_SCALE_REFERENCE,
    NUMERIC_EPSILON,
    RIGHT_ANKLE,
    RIGHT_HIP,
    RIGHT_SHOULDER,
)
from app.services.gymnastics.types import NormalizedLandmark, NormalizedPoseFrame


@dataclass(slots=True)
class SideStepFeatureSet:
    left_step_extent: float
    right_step_extent: float
    ankle_span: float
    raw_left_step_extent: float
    raw_right_step_extent: float
    raw_ankle_span: float
    torso_tilt: float
    pelvis_shift_x: float
    pelvis_shift_y: float
    pelvis_depth_shift: float


def extract_side_step_features(
    frame: NormalizedPoseFrame,
    reference_hip_x: float | None = None,
    reference_hip_y: float | None = None,
    reference_scale: float | None = None,
    baseline_left_step_extent: float | None = None,
    baseline_right_step_extent: float | None = None,
    baseline_ankle_span: float | None = None,
) -> SideStepFeatureSet:
    left_hip = frame.landmarks.get(LEFT_HIP)
    right_hip = frame.landmarks.get(RIGHT_HIP)
    left_ankle = frame.landmarks.get(LEFT_ANKLE)
    right_ankle = frame.landmarks.get(RIGHT_ANKLE)

    raw_left_step_extent = 0.0
    if left_hip is not None and left_ankle is not None:
        raw_left_step_extent = abs(left_ankle.x - left_hip.x)

    raw_right_step_extent = 0.0
    if right_hip is not None and right_ankle is not None:
        raw_right_step_extent = abs(right_ankle.x - right_hip.x)

    raw_ankle_span = 0.0
    if left_ankle is not None and right_ankle is not None:
        raw_ankle_span = abs(right_ankle.x - left_ankle.x)

    effective_left_baseline = (
        raw_left_step_extent if baseline_left_step_extent is None else baseline_left_step_extent
    )
    effective_right_baseline = (
        raw_right_step_extent if baseline_right_step_extent is None else baseline_right_step_extent
    )
    effective_span_baseline = raw_ankle_span if baseline_ankle_span is None else baseline_ankle_span

    left_step_extent = max(raw_left_step_extent - effective_left_baseline, 0.0)
    right_step_extent = max(raw_right_step_extent - effective_right_baseline, 0.0)
    ankle_span = max(raw_ankle_span - effective_span_baseline, 0.0)

    torso_tilt = _compute_torso_tilt(frame)
    pelvis_shift_x, pelvis_shift_y, pelvis_depth_shift = _compute_pelvis_shift(
        frame=frame,
        reference_hip_x=reference_hip_x,
        reference_hip_y=reference_hip_y,
        reference_scale=reference_scale,
    )

    return SideStepFeatureSet(
        left_step_extent=left_step_extent,
        right_step_extent=right_step_extent,
        ankle_span=ankle_span,
        raw_left_step_extent=raw_left_step_extent,
        raw_right_step_extent=raw_right_step_extent,
        raw_ankle_span=raw_ankle_span,
        torso_tilt=torso_tilt,
        pelvis_shift_x=pelvis_shift_x,
        pelvis_shift_y=pelvis_shift_y,
        pelvis_depth_shift=pelvis_depth_shift,
    )


def _compute_pelvis_shift(
    frame: NormalizedPoseFrame,
    reference_hip_x: float | None,
    reference_hip_y: float | None,
    reference_scale: float | None,
) -> tuple[float, float, float]:
    if reference_hip_x is None or reference_hip_y is None or reference_scale is None:
        return 0.0, 0.0, 0.0

    scale_ref = max(reference_scale, MIN_SCALE_REFERENCE)
    shift_x = (frame.hip_center.x - reference_hip_x) / scale_ref
    shift_y = (frame.hip_center.y - reference_hip_y) / scale_ref
    depth_shift = (frame.scale_reference - reference_scale) / scale_ref
    return shift_x, shift_y, depth_shift


def _compute_torso_tilt(frame: NormalizedPoseFrame) -> float:
    left_shoulder = frame.landmarks.get(LEFT_SHOULDER)
    right_shoulder = frame.landmarks.get(RIGHT_SHOULDER)
    left_hip = frame.landmarks.get(LEFT_HIP)
    right_hip = frame.landmarks.get(RIGHT_HIP)
    if left_shoulder is None or right_shoulder is None or left_hip is None or right_hip is None:
        return 0.0

    shoulder_center = _midpoint(left_shoulder, right_shoulder)
    hip_center = _midpoint(left_hip, right_hip)

    dx = shoulder_center[0] - hip_center[0]
    dy = shoulder_center[1] - hip_center[1]
    magnitude = sqrt(dx * dx + dy * dy)
    if magnitude < NUMERIC_EPSILON:
        return 0.0

    cosine_value = max(min((-dy) / magnitude, 1.0), -1.0)
    return degrees(acos(cosine_value))


def _midpoint(first: NormalizedLandmark, second: NormalizedLandmark) -> tuple[float, float]:
    return ((first.x + second.x) / 2.0, (first.y + second.y) / 2.0)
