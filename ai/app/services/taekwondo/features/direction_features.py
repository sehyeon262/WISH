from dataclasses import dataclass

from app.services.taekwondo.constants import (
    LEFT_ANKLE,
    LEFT_HIP,
    LEFT_SHOULDER,
    RIGHT_ANKLE,
    RIGHT_HIP,
    RIGHT_SHOULDER,
)
from app.services.taekwondo.types import NormalizedPoseFrame


@dataclass(slots=True)
class DirectionFeatureSet:
    left_shoulder_x: float = 0.0
    right_shoulder_x: float = 0.0
    left_hip_x: float = 0.0
    right_hip_x: float = 0.0
    left_ankle_x: float = 0.0
    right_ankle_x: float = 0.0
    left_side_extent: float = 0.0
    right_side_extent: float = 0.0
    side_extent_difference: float = 0.0
    shoulder_balance: float = 0.0
    ankle_balance: float = 0.0


def extract_direction_features(frame: NormalizedPoseFrame) -> DirectionFeatureSet:
    left_shoulder = frame.landmarks.get(LEFT_SHOULDER)
    right_shoulder = frame.landmarks.get(RIGHT_SHOULDER)
    left_hip = frame.landmarks.get(LEFT_HIP)
    right_hip = frame.landmarks.get(RIGHT_HIP)
    left_ankle = frame.landmarks.get(LEFT_ANKLE)
    right_ankle = frame.landmarks.get(RIGHT_ANKLE)

    left_shoulder_x = left_shoulder.x if left_shoulder is not None else 0.0
    right_shoulder_x = right_shoulder.x if right_shoulder is not None else 0.0
    left_hip_x = left_hip.x if left_hip is not None else 0.0
    right_hip_x = right_hip.x if right_hip is not None else 0.0
    left_ankle_x = left_ankle.x if left_ankle is not None else 0.0
    right_ankle_x = right_ankle.x if right_ankle is not None else 0.0

    left_side_extent = abs(left_shoulder_x) + abs(left_hip_x) + abs(left_ankle_x)
    right_side_extent = abs(right_shoulder_x) + abs(right_hip_x) + abs(right_ankle_x)

    return DirectionFeatureSet(
        left_shoulder_x=left_shoulder_x,
        right_shoulder_x=right_shoulder_x,
        left_hip_x=left_hip_x,
        right_hip_x=right_hip_x,
        left_ankle_x=left_ankle_x,
        right_ankle_x=right_ankle_x,
        left_side_extent=left_side_extent,
        right_side_extent=right_side_extent,
        side_extent_difference=left_side_extent - right_side_extent,
        shoulder_balance=abs(abs(left_shoulder_x) - abs(right_shoulder_x)),
        ankle_balance=abs(abs(left_ankle_x) - abs(right_ankle_x)),
    )
