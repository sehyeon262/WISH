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
from app.services.gymnastics.types import NormalizedLandmark, NormalizedPoseFrame


@dataclass(slots=True)
class MarchFeatureSet:
    # hip → knee vector Y component negated: positive = knee above hip
    # (hip is at normalized origin 0,0 so this equals -knee.y)
    left_knee_lift: float
    right_knee_lift: float
    raw_left_knee_lift: float
    raw_right_knee_lift: float

    # Angle of hip→knee vector from vertical downward direction (degrees)
    # 0° = straight down (standing), 90° = horizontal, >90° = above hip
    left_thigh_angle: float
    right_thigh_angle: float
    raw_left_thigh_angle: float
    raw_right_thigh_angle: float

    # Knee joint flexion angle: hip–knee–ankle (degrees); None if landmarks missing
    left_knee_angle: float | None
    right_knee_angle: float | None

    torso_tilt: float

    # Pelvis displacement from reference position, normalized by reference_scale
    pelvis_shift_x: float   # lateral (left/right) drift
    pelvis_shift_y: float   # vertical drift
    pelvis_depth_shift: float   # scale change = forward/backward movement


def extract_march_features(
    frame: NormalizedPoseFrame,
    reference_hip_x: float | None = None,
    reference_hip_y: float | None = None,
    reference_scale: float | None = None,
    baseline_left_knee_lift: float | None = None,
    baseline_right_knee_lift: float | None = None,
    baseline_left_thigh_angle: float | None = None,
    baseline_right_thigh_angle: float | None = None,
) -> MarchFeatureSet:
    left_knee = frame.landmarks.get(LEFT_KNEE)
    right_knee = frame.landmarks.get(RIGHT_KNEE)

    raw_left_knee_lift = (-left_knee.y) if left_knee is not None else 0.0
    raw_right_knee_lift = (-right_knee.y) if right_knee is not None else 0.0
    left_knee_lift = max(raw_left_knee_lift - (baseline_left_knee_lift or 0.0), 0.0)
    right_knee_lift = max(raw_right_knee_lift - (baseline_right_knee_lift or 0.0), 0.0)

    raw_left_thigh_angle = _compute_thigh_angle(left_knee)
    raw_right_thigh_angle = _compute_thigh_angle(right_knee)
    left_thigh_angle = max(raw_left_thigh_angle - (baseline_left_thigh_angle or 0.0), 0.0)
    right_thigh_angle = max(raw_right_thigh_angle - (baseline_right_thigh_angle or 0.0), 0.0)

    left_knee_angle = _compute_joint_angle(frame, LEFT_HIP, LEFT_KNEE, LEFT_ANKLE)
    right_knee_angle = _compute_joint_angle(frame, RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE)

    torso_tilt = _compute_torso_tilt(frame)

    pelvis_shift_x, pelvis_shift_y, pelvis_depth_shift = _compute_pelvis_shift(
        frame=frame,
        reference_hip_x=reference_hip_x,
        reference_hip_y=reference_hip_y,
        reference_scale=reference_scale,
    )

    return MarchFeatureSet(
        left_knee_lift=left_knee_lift,
        right_knee_lift=right_knee_lift,
        raw_left_knee_lift=raw_left_knee_lift,
        raw_right_knee_lift=raw_right_knee_lift,
        left_thigh_angle=left_thigh_angle,
        right_thigh_angle=right_thigh_angle,
        raw_left_thigh_angle=raw_left_thigh_angle,
        raw_right_thigh_angle=raw_right_thigh_angle,
        left_knee_angle=left_knee_angle,
        right_knee_angle=right_knee_angle,
        torso_tilt=torso_tilt,
        pelvis_shift_x=pelvis_shift_x,
        pelvis_shift_y=pelvis_shift_y,
        pelvis_depth_shift=pelvis_depth_shift,
    )


def _compute_thigh_angle(knee: NormalizedLandmark | None) -> float:
    """
    Angle between the hip→knee vector and the vertical downward direction.
    Hip is at the normalized origin (0, 0), so the vector is just (knee.x, knee.y).
    Vertical down = (0, 1) in image coordinates (y increases downward).
    Returns 0° when the knee hangs straight below the hip, 90° when horizontal.
    """
    if knee is None:
        return 0.0
    dx = knee.x
    dy = knee.y
    magnitude = sqrt(dx * dx + dy * dy)
    if magnitude < NUMERIC_EPSILON:
        return 0.0
    cosine = max(min(dy / magnitude, 1.0), -1.0)
    return degrees(acos(cosine))


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

    vector_a = (start.x - vertex.x, start.y - vertex.y)
    vector_b = (end.x - vertex.x, end.y - vertex.y)

    magnitude_a = _vector_magnitude(vector_a)
    magnitude_b = _vector_magnitude(vector_b)
    if magnitude_a < NUMERIC_EPSILON or magnitude_b < NUMERIC_EPSILON:
        return None

    dot_product = vector_a[0] * vector_b[0] + vector_a[1] * vector_b[1]
    cosine_value = max(min(dot_product / (magnitude_a * magnitude_b), 1.0), -1.0)
    return degrees(acos(cosine_value))


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
    if magnitude == 0.0:
        return 0.0

    cosine_value = max(min((-dy) / magnitude, 1.0), -1.0)
    return degrees(acos(cosine_value))


def _midpoint(first: NormalizedLandmark, second: NormalizedLandmark) -> tuple[float, float]:
    return ((first.x + second.x) / 2.0, (first.y + second.y) / 2.0)


def _vector_magnitude(vector: tuple[float, float]) -> float:
    return sqrt(vector[0] ** 2 + vector[1] ** 2)
