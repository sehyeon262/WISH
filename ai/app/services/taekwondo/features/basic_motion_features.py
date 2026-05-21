from dataclasses import dataclass
from math import acos, degrees, sqrt

from app.services.taekwondo.constants import (
    FEATURE_DOMINANT_ACTION_MARGIN,
    FEATURE_DOMINANT_ACTION_MIN_SCORE,
    FEATURE_WRIST_NEAR_HIP_DISTANCE_MAX,
    LEFT_ELBOW,
    LEFT_HIP,
    LEFT_SHOULDER,
    LEFT_WRIST,
    MIN_SCALE_REFERENCE,
    RIGHT_ELBOW,
    RIGHT_HIP,
    RIGHT_SHOULDER,
    RIGHT_WRIST,
)
from app.services.taekwondo.types import NormalizedLandmark, NormalizedPoseFrame


@dataclass(slots=True)
class BasicMotionFeatureSet:
    left_wrist_y: float = 0.0
    right_wrist_y: float = 0.0
    left_wrist_far_from_center: float = 0.0
    right_wrist_far_from_center: float = 0.0
    left_wrist_to_hip_distance: float = 0.0
    right_wrist_to_hip_distance: float = 0.0
    left_elbow_angle: float | None = None
    right_elbow_angle: float | None = None
    left_wrist_near_hip: bool = False
    right_wrist_near_hip: bool = False
    dominant_action_side: str | None = None


def extract_basic_motion_features(frame: NormalizedPoseFrame) -> BasicMotionFeatureSet:
    left_wrist = frame.landmarks.get(LEFT_WRIST)
    right_wrist = frame.landmarks.get(RIGHT_WRIST)
    left_hip = frame.landmarks.get(LEFT_HIP)
    right_hip = frame.landmarks.get(RIGHT_HIP)

    left_wrist_y = left_wrist.y if left_wrist is not None else 0.0
    right_wrist_y = right_wrist.y if right_wrist is not None else 0.0
    left_wrist_far_from_center = abs(left_wrist.x) if left_wrist is not None else 0.0
    right_wrist_far_from_center = abs(right_wrist.x) if right_wrist is not None else 0.0

    left_wrist_to_hip_distance = _distance_2d(left_wrist, left_hip)
    right_wrist_to_hip_distance = _distance_2d(right_wrist, right_hip)

    left_elbow_angle = _joint_angle(frame, LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST)
    right_elbow_angle = _joint_angle(frame, RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST)

    left_wrist_near_hip = left_wrist_to_hip_distance <= FEATURE_WRIST_NEAR_HIP_DISTANCE_MAX
    right_wrist_near_hip = right_wrist_to_hip_distance <= FEATURE_WRIST_NEAR_HIP_DISTANCE_MAX

    dominant_action_side = _resolve_dominant_action_side(
        left_far_from_center=left_wrist_far_from_center,
        right_far_from_center=right_wrist_far_from_center,
        left_wrist_to_hip_distance=left_wrist_to_hip_distance,
        right_wrist_to_hip_distance=right_wrist_to_hip_distance,
    )

    return BasicMotionFeatureSet(
        left_wrist_y=left_wrist_y,
        right_wrist_y=right_wrist_y,
        left_wrist_far_from_center=left_wrist_far_from_center,
        right_wrist_far_from_center=right_wrist_far_from_center,
        left_wrist_to_hip_distance=left_wrist_to_hip_distance,
        right_wrist_to_hip_distance=right_wrist_to_hip_distance,
        left_elbow_angle=left_elbow_angle,
        right_elbow_angle=right_elbow_angle,
        left_wrist_near_hip=left_wrist_near_hip,
        right_wrist_near_hip=right_wrist_near_hip,
        dominant_action_side=dominant_action_side,
    )


def _resolve_dominant_action_side(
    *,
    left_far_from_center: float,
    right_far_from_center: float,
    left_wrist_to_hip_distance: float,
    right_wrist_to_hip_distance: float,
) -> str | None:
    left_score = left_far_from_center + left_wrist_to_hip_distance
    right_score = right_far_from_center + right_wrist_to_hip_distance

    if max(left_score, right_score) < FEATURE_DOMINANT_ACTION_MIN_SCORE:
        return None
    if abs(left_score - right_score) < FEATURE_DOMINANT_ACTION_MARGIN:
        return None
    return "left" if left_score > right_score else "right"


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
