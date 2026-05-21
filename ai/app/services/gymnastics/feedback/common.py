from dataclasses import dataclass


@dataclass(slots=True)
class FeedbackCandidate:
    code: str
    text: str


TRACKING_LOW = FeedbackCandidate(
    code="TRACKING_LOW",
    text="\uc804\uc2e0\uc774 \ud654\uba74\uc5d0 \ubcf4\uc774\uac8c \uc11c\uc694",
)
STAY_IN_PLACE = FeedbackCandidate(
    code="STAY_IN_PLACE",
    text="\uc81c\uc790\ub9ac\uc5d0\uc11c \uac78\uc5b4\uc694",
)
STRAIGHTEN_BACK = FeedbackCandidate(
    code="STRAIGHTEN_BACK",
    text="\ud5c8\ub9ac\ub97c \uacf3\uac8c \uc138\uc6cc\uc694",
)
ALTERNATE_STEPS = FeedbackCandidate(
    code="ALTERNATE_STEPS",
    text="\uc67c\ubc1c \uc624\ub978\ubc1c \ubc88\uac08\uc544 \ud574\uc694",
)
LIFT_LEG_BIGGER = FeedbackCandidate(
    code="LIFT_LEG_BIGGER",
    text="\ub2e4\ub9ac\ub97c \ub354 \ub192\uac8c \ub4e4\uc5b4\uc694",
)
LIFT_KNEE_HIGHER = FeedbackCandidate(
    code="LIFT_KNEE_HIGHER",
    text="\ubb34\ub98e\uc744 \uc870\uae08 \ub354 \ub192\uc774 \ub4e4\uc5b4\uc694",
)
WIDEN_SIDE_STEP = FeedbackCandidate(
    code="WIDEN_SIDE_STEP",
    text="\uc606\uc73c\ub85c \ub354 \ud06c\uac8c \ubc8c\ub824\uc694",
)
MOVE_SIDE_ONLY = FeedbackCandidate(
    code="MOVE_SIDE_ONLY",
    text="\uc606\uc73c\ub85c\ub9cc \uc6c0\uc9c1\uc5ec\uc694",
)
PUNCH_FURTHER = FeedbackCandidate(
    code="PUNCH_FURTHER",
    text="\ud314\uc744 \ub354 \uc55e\uc73c\ub85c \ubed7\uc5b4\uc694",
)
STRAIGHTEN_PUNCH_ARM = FeedbackCandidate(
    code="STRAIGHTEN_PUNCH_ARM",
    text="\uc9c0\ub974\ub294 \ud314\uc744 \ub354 \uace7\uac8c \ud3b4\uc694",
)
WIDEN_PUNCH_STANCE = FeedbackCandidate(
    code="WIDEN_PUNCH_STANCE",
    text="\uc55e\ub4a4\ub85c \ub354 \ubc8c\ub824\uc11c \uc11c\uc694",
)
BEND_BACK_ARM = FeedbackCandidate(
    code="BEND_BACK_ARM",
    text="\ubc18\ub300 \ud314\uc740 \uc811\uc5b4\uc8fc\uc138\uc694",
)
RAISE_PUNCH_HIGHER = FeedbackCandidate(
    code="RAISE_PUNCH_HIGHER",
    text="\uc8fc\uba39\uc744 \ub354 \ub192\uac8c \uc62c\ub824\uc694",
)
SQUAT_DEEPER = FeedbackCandidate(
    code="SQUAT_DEEPER",
    text="\ub354 \uae4a\uc774 \uc549\uc544\uc694",
)
KEEP_HOLDING = FeedbackCandidate(
    code="KEEP_HOLDING",
    text="\uc790\uc138\ub97c \uc870\uae08\ub9cc \ub354 \uc720\uc9c0\ud574\uc694",
)
PRESS_HANDS_FORWARD = FeedbackCandidate(
    code="PRESS_HANDS_FORWARD",
    text="\uc190\uc744 \ub354 \uc55e\uc73c\ub85c \ubc00\uc5b4\uc694",
)
LIFT_HANDS_HIGHER = FeedbackCandidate(
    code="LIFT_HANDS_HIGHER",
    text="\uc190\uc744 \ub354 \ub192\uc774 \uc62c\ub824\uc694",
)
MATCH_HAND_HEIGHTS = FeedbackCandidate(
    code="MATCH_HAND_HEIGHTS",
    text="\uc591\uc190 \ub192\uc774\ub97c \ub9de\ucdb0\uc694",
)
KEEP_HANDS_OVERHEAD = FeedbackCandidate(
    code="KEEP_HANDS_OVERHEAD",
    text="\uc190\uc744 \uba38\ub9ac \uc704\ub85c \uc720\uc9c0\ud574\uc694",
)
LEAN_LEFT_MORE = FeedbackCandidate(
    code="LEAN_LEFT_MORE",
    text="\ud5c8\ub9ac\ub97c \uc67c\ucabd\uc73c\ub85c \ub354 \uae30\uc6b8\uc5ec\uc694",
)
LEAN_RIGHT_MORE = FeedbackCandidate(
    code="LEAN_RIGHT_MORE",
    text="\ud5c8\ub9ac\ub97c \uc624\ub978\ucabd\uc73c\ub85c \ub354 \uae30\uc6b8\uc5ec\uc694",
)
BEND_FORWARD_MORE = FeedbackCandidate(
    code="BEND_FORWARD_MORE",
    text="\uc0c1\uccb4\ub97c \ub354 \uc219\uc5ec\uc694",
)
LOWER_HANDS_MORE = FeedbackCandidate(
    code="LOWER_HANDS_MORE",
    text="\uc190\uc744 \ub354 \uc544\ub798\ub85c \ub0b4\ub824\uc694",
)
DO_NOT_BEND_KNEES = FeedbackCandidate(
    code="DO_NOT_BEND_KNEES",
    text="\ubb34\ub98e\uc744 \ub108\ubb34 \ub9ce\uc774 \uad7d\ud788\uc9c0 \uc54a\uc544\uc694",
)
STRAIGHTEN_ARMS = FeedbackCandidate(
    code="STRAIGHTEN_ARMS",
    text="\ud314\uc744 \ub354 \uace7\uac8c \ud3b4\uc694",
)


def average_elbow_angle(left_elbow_angle: float | None, right_elbow_angle: float | None) -> float | None:
    valid_angles = [angle for angle in (left_elbow_angle, right_elbow_angle) if angle is not None]
    return sum(valid_angles) / len(valid_angles) if valid_angles else None


def lowest_knee_angle(left_knee_angle: float | None, right_knee_angle: float | None) -> float | None:
    valid_angles = [angle for angle in (left_knee_angle, right_knee_angle) if angle is not None]
    return min(valid_angles) if valid_angles else None
