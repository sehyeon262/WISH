from dataclasses import dataclass
from math import acos, degrees, sqrt

from app.services.gymnastics.constants import (
    LEFT_ANKLE,
    LEFT_HIP,
    LEFT_KNEE,
    LEFT_SHOULDER,
    MIN_SCALE_REFERENCE,
    NUMERIC_EPSILON,
    RIGHT_ANKLE,
    RIGHT_HIP,
    RIGHT_KNEE,
    RIGHT_SHOULDER,
)
from app.services.gymnastics.types import NormalizedPoseFrame


@dataclass(slots=True)
class SquatFeatureSet:
    hip_drop: float
    left_knee_angle: float | None
    right_knee_angle: float | None
    avg_knee_angle: float | None
    torso_tilt: float
    pelvis_shift_x: float
    pelvis_depth_shift: float


def extract_squat_features(
    frame: NormalizedPoseFrame,
    reference_hip_x: float | None = None,
    reference_hip_y: float | None = None,
    reference_scale: float | None = None,
) -> SquatFeatureSet:
    scale_ref = max(reference_scale or MIN_SCALE_REFERENCE, MIN_SCALE_REFERENCE)

    hip_drop = 0.0
    pelvis_shift_x = 0.0
    pelvis_depth_shift = 0.0
    if reference_hip_x is not None and reference_hip_y is not None and reference_scale is not None:
        hip_drop = max((frame.hip_center.y - reference_hip_y) / scale_ref, 0.0)
        pelvis_shift_x = (frame.hip_center.x - reference_hip_x) / scale_ref
        pelvis_depth_shift = (frame.scale_reference - reference_scale) / scale_ref

    left_knee_angle = _compute_joint_angle(frame, LEFT_HIP, LEFT_KNEE, LEFT_ANKLE)
    right_knee_angle = _compute_joint_angle(frame, RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE)

    if left_knee_angle is not None and right_knee_angle is not None:
        avg_knee_angle: float | None = (left_knee_angle + right_knee_angle) / 2.0
    elif left_knee_angle is not None:
        avg_knee_angle = left_knee_angle
    elif right_knee_angle is not None:
        avg_knee_angle = right_knee_angle
    else:
        avg_knee_angle = None

    torso_tilt = _compute_torso_tilt(frame)

    return SquatFeatureSet(
        hip_drop=hip_drop,
        left_knee_angle=left_knee_angle,
        right_knee_angle=right_knee_angle,
        avg_knee_angle=avg_knee_angle,
        torso_tilt=torso_tilt,
        pelvis_shift_x=pelvis_shift_x,
        pelvis_depth_shift=pelvis_depth_shift,
    )


def _compute_torso_tilt(frame: NormalizedPoseFrame) -> float:
    left_shoulder = frame.landmarks.get(LEFT_SHOULDER)
    right_shoulder = frame.landmarks.get(RIGHT_SHOULDER)
    left_hip = frame.landmarks.get(LEFT_HIP)
    right_hip = frame.landmarks.get(RIGHT_HIP)
    if left_shoulder is None or right_shoulder is None or left_hip is None or right_hip is None:
        return 0.0

    shoulder_cx = (left_shoulder.x + right_shoulder.x) / 2.0
    shoulder_cy = (left_shoulder.y + right_shoulder.y) / 2.0
    hip_cx = (left_hip.x + right_hip.x) / 2.0
    hip_cy = (left_hip.y + right_hip.y) / 2.0

    dx = shoulder_cx - hip_cx
    dy = shoulder_cy - hip_cy
    magnitude = sqrt(dx * dx + dy * dy)
    if magnitude < NUMERIC_EPSILON:
        return 0.0

    cosine_value = max(min((-dy) / magnitude, 1.0), -1.0)
    return degrees(acos(cosine_value))


def _compute_joint_angle(
    frame: NormalizedPoseFrame,
    start_name: str,
    vertex_name: str,
    end_name: str,
) -> float | None:
    start = frame.landmarks.get(start_name)
    vertex = frame.landmarks.get(vertex_name)
    end = frame.landmarks.get(end_name)
    if start is None or vertex is None or end is None:
        return None

    ax = start.x - vertex.x
    ay = start.y - vertex.y
    bx = end.x - vertex.x
    by = end.y - vertex.y
    mag_a = sqrt(ax * ax + ay * ay)
    mag_b = sqrt(bx * bx + by * by)
    if mag_a < NUMERIC_EPSILON or mag_b < NUMERIC_EPSILON:
        return None

    dot = ax * bx + ay * by
    cosine_value = max(min(dot / (mag_a * mag_b), 1.0), -1.0)
    return degrees(acos(cosine_value))
