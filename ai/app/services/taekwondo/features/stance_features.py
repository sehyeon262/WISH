from dataclasses import dataclass
from math import acos, degrees, sqrt

from app.services.taekwondo.constants import (
    LEFT_ANKLE,
    LEFT_HIP,
    LEFT_KNEE,
    MIN_SCALE_REFERENCE,
    RIGHT_ANKLE,
    RIGHT_HIP,
    RIGHT_KNEE,
    STANCE_BEND_SIDE_MARGIN,
    STANCE_HIP_WIDTH_MIN,
)
from app.services.taekwondo.types import NormalizedLandmark, NormalizedPoseFrame


@dataclass(slots=True)
class StanceFeatureSet:
    hip_width: float = 0.0
    foot_distance: float = 0.0
    stance_width_ratio: float = 0.0
    left_knee_angle: float | None = None
    right_knee_angle: float | None = None
    knee_angle_difference: float = 0.0
    bend_side: str | None = None


def extract_stance_features(frame: NormalizedPoseFrame) -> StanceFeatureSet:
    left_hip = frame.landmarks.get(LEFT_HIP)
    right_hip = frame.landmarks.get(RIGHT_HIP)
    left_ankle = frame.landmarks.get(LEFT_ANKLE)
    right_ankle = frame.landmarks.get(RIGHT_ANKLE)

    hip_width = _distance_2d(left_hip, right_hip)
    foot_distance = _distance_2d(left_ankle, right_ankle)
    safe_hip_width_threshold = STANCE_HIP_WIDTH_MIN + MIN_SCALE_REFERENCE
    stance_width_ratio = foot_distance / hip_width if hip_width > safe_hip_width_threshold else 0.0

    left_knee_angle = _joint_angle(frame, LEFT_HIP, LEFT_KNEE, LEFT_ANKLE)
    right_knee_angle = _joint_angle(frame, RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE)

    knee_angle_difference = (
        abs(left_knee_angle - right_knee_angle)
        if left_knee_angle is not None and right_knee_angle is not None
        else 0.0
    )

    return StanceFeatureSet(
        hip_width=hip_width,
        foot_distance=foot_distance,
        stance_width_ratio=stance_width_ratio,
        left_knee_angle=left_knee_angle,
        right_knee_angle=right_knee_angle,
        knee_angle_difference=knee_angle_difference,
        bend_side=_resolve_bend_side(left_knee_angle, right_knee_angle),
    )


def _resolve_bend_side(left_knee_angle: float | None, right_knee_angle: float | None) -> str | None:
    if left_knee_angle is None or right_knee_angle is None:
        return None
    if abs(left_knee_angle - right_knee_angle) < STANCE_BEND_SIDE_MARGIN:
        return None
    return "left" if left_knee_angle < right_knee_angle else "right"


def _distance_2d(first: NormalizedLandmark | None, second: NormalizedLandmark | None) -> float:
    if first is None or second is None:
        return 0.0
    return sqrt((first.x - second.x) ** 2 + (first.y - second.y) ** 2)


def _joint_angle(
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
    magnitude_a = sqrt(vector_a[0] ** 2 + vector_a[1] ** 2)
    magnitude_b = sqrt(vector_b[0] ** 2 + vector_b[1] ** 2)
    if magnitude_a < MIN_SCALE_REFERENCE or magnitude_b < MIN_SCALE_REFERENCE:
        return None

    denominator = magnitude_a * magnitude_b
    if denominator <= MIN_SCALE_REFERENCE:
        return None

    cosine = (vector_a[0] * vector_b[0] + vector_a[1] * vector_b[1]) / denominator
    cosine = max(min(cosine, 1.0), -1.0)
    return degrees(acos(cosine))
