from dataclasses import dataclass

from app.services.gymnastics.constants import (
    LEFT_ELBOW,
    LEFT_HIP,
    LEFT_SHOULDER,
    LEFT_WRIST,
    MIN_SCALE_REFERENCE,
    NUMERIC_EPSILON,
    RIGHT_ELBOW,
    RIGHT_HIP,
    RIGHT_SHOULDER,
    RIGHT_WRIST,
)
from app.services.gymnastics.types import NormalizedLandmark, NormalizedPoseFrame


@dataclass(slots=True)
class DanielRightSideBendFeatureSet:
    torso_tilt: float
    wrist_height: float | None
    left_elbow_angle: float | None
    right_elbow_angle: float | None
    pelvis_shift_x: float
    pelvis_shift_y: float
    pelvis_depth_shift: float


def extract_daniel_right_side_bend_features(
    frame: NormalizedPoseFrame,
    reference_hip_x: float | None = None,
    reference_hip_y: float | None = None,
    reference_scale: float | None = None,
) -> DanielRightSideBendFeatureSet:
    left_shoulder = frame.landmarks.get(LEFT_SHOULDER)
    right_shoulder = frame.landmarks.get(RIGHT_SHOULDER)
    left_wrist = frame.landmarks.get(LEFT_WRIST)
    right_wrist = frame.landmarks.get(RIGHT_WRIST)

    wrist_height = _compute_wrist_height(
        left_shoulder=left_shoulder,
        right_shoulder=right_shoulder,
        left_wrist=left_wrist,
        right_wrist=right_wrist,
    )
    left_elbow_angle = _compute_joint_angle(frame, LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST)
    right_elbow_angle = _compute_joint_angle(frame, RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST)
    torso_tilt = _compute_right_side_tilt(frame)
    pelvis_shift_x, pelvis_shift_y, pelvis_depth_shift = _compute_pelvis_shift(
        frame=frame,
        reference_hip_x=reference_hip_x,
        reference_hip_y=reference_hip_y,
        reference_scale=reference_scale,
    )

    return DanielRightSideBendFeatureSet(
        torso_tilt=torso_tilt,
        wrist_height=wrist_height,
        left_elbow_angle=left_elbow_angle,
        right_elbow_angle=right_elbow_angle,
        pelvis_shift_x=pelvis_shift_x,
        pelvis_shift_y=pelvis_shift_y,
        pelvis_depth_shift=pelvis_depth_shift,
    )


def _compute_wrist_height(
    *,
    left_shoulder: NormalizedLandmark | None,
    right_shoulder: NormalizedLandmark | None,
    left_wrist: NormalizedLandmark | None,
    right_wrist: NormalizedLandmark | None,
) -> float | None:
    if (
        left_shoulder is None
        or right_shoulder is None
        or left_wrist is None
        or right_wrist is None
    ):
        return None

    shoulder_y = (left_shoulder.y + right_shoulder.y) / 2.0
    wrist_y = (left_wrist.y + right_wrist.y) / 2.0
    return shoulder_y - wrist_y


def _compute_right_side_tilt(frame: NormalizedPoseFrame) -> float:
    left_shoulder = frame.landmarks.get(LEFT_SHOULDER)
    right_shoulder = frame.landmarks.get(RIGHT_SHOULDER)
    left_hip = frame.landmarks.get(LEFT_HIP)
    right_hip = frame.landmarks.get(RIGHT_HIP)
    if left_shoulder is None or right_shoulder is None or left_hip is None or right_hip is None:
        return 0.0

    shoulder_center = _midpoint(left_shoulder, right_shoulder)
    hip_center = _midpoint(left_hip, right_hip)
    return max(shoulder_center[0] - hip_center[0], 0.0)


def _compute_pelvis_shift(
    *,
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
    from math import acos, degrees

    return degrees(acos(cosine_value))


def _midpoint(first: NormalizedLandmark, second: NormalizedLandmark) -> tuple[float, float]:
    return ((first.x + second.x) / 2.0, (first.y + second.y) / 2.0)


def _vector_magnitude(vector: tuple[float, float]) -> float:
    from math import sqrt

    return sqrt(vector[0] ** 2 + vector[1] ** 2)
