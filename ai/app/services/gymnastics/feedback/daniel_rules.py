from app.services.gymnastics.feedback.common import (
    BEND_FORWARD_MORE,
    DO_NOT_BEND_KNEES,
    FeedbackCandidate,
    KEEP_HANDS_OVERHEAD,
    LEAN_LEFT_MORE,
    LEAN_RIGHT_MORE,
    LIFT_HANDS_HIGHER,
    LOWER_HANDS_MORE,
    MATCH_HAND_HEIGHTS,
    PRESS_HANDS_FORWARD,
    STRAIGHTEN_ARMS,
    STRAIGHTEN_BACK,
    TRACKING_LOW,
    average_elbow_angle,
    lowest_knee_angle,
)


def select_daniel_forward_press_feedback_candidate(
    *,
    state: str,
    tracking: str,
    wrist_forward: float | None,
    wrist_extension: float | None,
    left_elbow_angle: float | None,
    right_elbow_angle: float | None,
    torso_tilt: float,
    forward_threshold: float,
    wrist_extension_threshold: float,
    arm_straight_threshold: float,
    torso_tilt_max: float,
) -> FeedbackCandidate | None:
    mean_elbow_angle = average_elbow_angle(left_elbow_angle, right_elbow_angle)

    if state == "complete":
        return None

    if tracking != "tracking_ok":
        return TRACKING_LOW

    if state == "holding":
        return None

    if torso_tilt > torso_tilt_max:
        return STRAIGHTEN_BACK

    if wrist_forward is None or wrist_extension is None:
        return None

    if wrist_forward < forward_threshold or wrist_extension < wrist_extension_threshold:
        return PRESS_HANDS_FORWARD

    if mean_elbow_angle is not None and mean_elbow_angle < arm_straight_threshold:
        return STRAIGHTEN_ARMS

    return None


def select_daniel_upward_press_feedback_candidate(
    *,
    state: str,
    tracking: str,
    wrist_height: float,
    wrist_height_balance: float,
    left_elbow_angle: float | None,
    right_elbow_angle: float | None,
    torso_tilt: float,
    height_threshold: float,
    height_balance_threshold: float,
    arm_straight_threshold: float,
    torso_tilt_max: float,
) -> FeedbackCandidate | None:
    mean_elbow_angle = average_elbow_angle(left_elbow_angle, right_elbow_angle)

    if state == "complete":
        return None

    if tracking != "tracking_ok":
        return TRACKING_LOW

    if state == "holding":
        return None

    if torso_tilt > torso_tilt_max:
        return STRAIGHTEN_BACK

    if wrist_height < height_threshold:
        return LIFT_HANDS_HIGHER

    if mean_elbow_angle is not None and mean_elbow_angle < arm_straight_threshold:
        return STRAIGHTEN_ARMS

    if wrist_height_balance > height_balance_threshold:
        return MATCH_HAND_HEIGHTS

    return None


def select_daniel_side_bend_feedback_candidate(
    *,
    state: str,
    tracking: str,
    direction: str,
    torso_tilt: float,
    wrist_height: float,
    left_elbow_angle: float | None,
    right_elbow_angle: float | None,
    target_tilt_threshold: float,
    wrist_height_threshold: float,
    arm_straight_threshold: float,
) -> FeedbackCandidate | None:
    mean_elbow_angle = average_elbow_angle(left_elbow_angle, right_elbow_angle)

    if state == "complete":
        return None

    if tracking != "tracking_ok":
        return TRACKING_LOW

    if state == "holding":
        return None

    if torso_tilt < target_tilt_threshold:
        return LEAN_LEFT_MORE if direction == "left" else LEAN_RIGHT_MORE

    if wrist_height < wrist_height_threshold:
        return KEEP_HANDS_OVERHEAD

    if mean_elbow_angle is not None and mean_elbow_angle < arm_straight_threshold:
        return STRAIGHTEN_ARMS

    return None


def select_daniel_forward_bend_feedback_candidate(
    *,
    state: str,
    tracking: str,
    forward_bend_angle: float,
    wrist_drop: float,
    left_knee_angle: float | None,
    right_knee_angle: float | None,
    forward_bend_threshold: float,
    wrist_drop_threshold: float,
    knee_bend_min_angle: float,
) -> FeedbackCandidate | None:
    if state == "complete":
        return None

    if tracking != "tracking_ok":
        return TRACKING_LOW

    if state == "holding":
        return None

    if forward_bend_angle < forward_bend_threshold:
        return BEND_FORWARD_MORE

    if wrist_drop < wrist_drop_threshold:
        return LOWER_HANDS_MORE

    knee_angle = lowest_knee_angle(left_knee_angle, right_knee_angle)
    if knee_angle is not None and knee_angle < knee_bend_min_angle:
        return DO_NOT_BEND_KNEES

    return None
