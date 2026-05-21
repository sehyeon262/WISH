from dataclasses import dataclass
from math import acos, degrees, sqrt

from app.services.gymnastics.constants import (
    LEFT_ANKLE,
    LEFT_ELBOW,
    LEFT_HIP,
    LEFT_SHOULDER,
    LEFT_WRIST,
    MIN_SCALE_REFERENCE,
    NUMERIC_EPSILON,
    RIGHT_ANKLE,
    RIGHT_ELBOW,
    RIGHT_HIP,
    RIGHT_SHOULDER,
    RIGHT_WRIST,
)
from app.services.gymnastics.types import NormalizedLandmark, NormalizedPoseFrame


@dataclass(slots=True)
class DiagonalBodyPunchFeatureSet:
    left_wrist_forward: float
    right_wrist_forward: float
    raw_left_wrist_forward: float
    raw_right_wrist_forward: float
    left_arm_extension: float
    right_arm_extension: float
    left_elbow_angle: float | None
    right_elbow_angle: float | None
    stance_span: float
    raw_stance_span: float
    torso_tilt: float
    pelvis_shift_x: float
    pelvis_shift_y: float
    pelvis_depth_shift: float


def extract_diagonal_body_punch_features(
    frame: NormalizedPoseFrame,
    reference_hip_x: float | None = None,
    reference_hip_y: float | None = None,
    reference_scale: float | None = None,
    baseline_left_wrist_forward: float | None = None,
    baseline_right_wrist_forward: float | None = None,
    baseline_stance_span: float | None = None,
) -> DiagonalBodyPunchFeatureSet:
    left_shoulder = frame.landmarks.get(LEFT_SHOULDER)
    right_shoulder = frame.landmarks.get(RIGHT_SHOULDER)
    left_wrist = frame.landmarks.get(LEFT_WRIST)
    right_wrist = frame.landmarks.get(RIGHT_WRIST)
    left_ankle = frame.landmarks.get(LEFT_ANKLE)
    right_ankle = frame.landmarks.get(RIGHT_ANKLE)

    raw_left_wrist_forward = 0.0
    if left_shoulder is not None and left_wrist is not None:
        raw_left_wrist_forward = max(left_shoulder.x - left_wrist.x, 0.0)

    raw_right_wrist_forward = 0.0
    if right_shoulder is not None and right_wrist is not None:
        raw_right_wrist_forward = max(right_wrist.x - right_shoulder.x, 0.0)

    effective_left_baseline = (
        raw_left_wrist_forward
        if baseline_left_wrist_forward is None
        else baseline_left_wrist_forward
    )
    effective_right_baseline = (
        raw_right_wrist_forward
        if baseline_right_wrist_forward is None
        else baseline_right_wrist_forward
    )
    left_wrist_forward = max(raw_left_wrist_forward - effective_left_baseline, 0.0)
    right_wrist_forward = max(raw_right_wrist_forward - effective_right_baseline, 0.0)

    left_arm_extension = _distance(left_shoulder, left_wrist)
    right_arm_extension = _distance(right_shoulder, right_wrist)

    left_elbow_angle = _compute_joint_angle(frame, LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST)
    right_elbow_angle = _compute_joint_angle(frame, RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST)

    raw_stance_span = 0.0
    if left_ankle is not None and right_ankle is not None:
        raw_stance_span = abs(right_ankle.x - left_ankle.x)

    effective_stance_baseline = raw_stance_span if baseline_stance_span is None else baseline_stance_span
    stance_span = max(raw_stance_span - effective_stance_baseline, 0.0)

    torso_tilt = _compute_torso_tilt(frame)
    pelvis_shift_x, pelvis_shift_y, pelvis_depth_shift = _compute_pelvis_shift(
        frame=frame,
        reference_hip_x=reference_hip_x,
        reference_hip_y=reference_hip_y,
        reference_scale=reference_scale,
    )

    return DiagonalBodyPunchFeatureSet(
        left_wrist_forward=left_wrist_forward,
        right_wrist_forward=right_wrist_forward,
        raw_left_wrist_forward=raw_left_wrist_forward,
        raw_right_wrist_forward=raw_right_wrist_forward,
        left_arm_extension=left_arm_extension,
        right_arm_extension=right_arm_extension,
        left_elbow_angle=left_elbow_angle,
        right_elbow_angle=right_elbow_angle,
        stance_span=stance_span,
        raw_stance_span=raw_stance_span,
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


def _distance(first: NormalizedLandmark | None, second: NormalizedLandmark | None) -> float:
    if first is None or second is None:
        return 0.0

    dx = second.x - first.x
    dy = second.y - first.y
    return sqrt(dx * dx + dy * dy)


def _midpoint(first: NormalizedLandmark, second: NormalizedLandmark) -> tuple[float, float]:
    return ((first.x + second.x) / 2.0, (first.y + second.y) / 2.0)


def _vector_magnitude(vector: tuple[float, float]) -> float:
    return sqrt(vector[0] ** 2 + vector[1] ** 2)
