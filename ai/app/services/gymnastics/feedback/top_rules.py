from app.services.gymnastics.features.diagonal_body_punch_features import DiagonalBodyPunchFeatureSet
from app.services.gymnastics.features.diagonal_face_punch_features import DiagonalFacePunchFeatureSet
from app.services.gymnastics.features.march_features import MarchFeatureSet
from app.services.gymnastics.features.side_step_features import SideStepFeatureSet
from app.services.gymnastics.features.squat_features import SquatFeatureSet
from app.services.gymnastics.feedback.common import (
    ALTERNATE_STEPS,
    BEND_BACK_ARM,
    FeedbackCandidate,
    LIFT_KNEE_HIGHER,
    LIFT_LEG_BIGGER,
    MOVE_SIDE_ONLY,
    PUNCH_FURTHER,
    RAISE_PUNCH_HIGHER,
    SQUAT_DEEPER,
    STAY_IN_PLACE,
    STRAIGHTEN_BACK,
    STRAIGHTEN_PUNCH_ARM,
    TRACKING_LOW,
    WIDEN_PUNCH_STANCE,
    WIDEN_SIDE_STEP,
)


def select_march_feedback_candidate(
    features: MarchFeatureSet,
    state: str,
    tracking: str,
    pelvis_shift_max: float,
    depth_shift_max: float,
    thigh_angle_threshold: float,
    torso_tilt_max: float,
) -> FeedbackCandidate | None:
    if state == "complete":
        return None

    if tracking != "tracking_ok":
        return TRACKING_LOW

    lateral_drift = max(abs(features.pelvis_shift_x), abs(features.pelvis_shift_y))
    if lateral_drift > pelvis_shift_max or abs(features.pelvis_depth_shift) > depth_shift_max:
        return STAY_IN_PLACE

    if features.torso_tilt > torso_tilt_max:
        return STRAIGHTEN_BACK

    dominant_angle = max(features.left_thigh_angle, features.right_thigh_angle)
    if dominant_angle < thigh_angle_threshold * 0.5:
        return LIFT_LEG_BIGGER
    if dominant_angle < thigh_angle_threshold:
        return LIFT_KNEE_HIGHER

    if state == "idle":
        return ALTERNATE_STEPS

    return None


def select_side_step_feedback_candidate(
    features: SideStepFeatureSet,
    state: str,
    tracking: str,
    ankle_span_threshold: float,
    extent_threshold: float,
    depth_shift_max: float,
    torso_tilt_max: float,
) -> FeedbackCandidate | None:
    if state == "complete":
        return None

    if tracking != "tracking_ok":
        return TRACKING_LOW

    if abs(features.pelvis_depth_shift) > depth_shift_max:
        return MOVE_SIDE_ONLY

    if features.torso_tilt > torso_tilt_max:
        return STRAIGHTEN_BACK

    dominant_extent = max(features.left_step_extent, features.right_step_extent)
    if features.ankle_span < ankle_span_threshold or dominant_extent < extent_threshold:
        return WIDEN_SIDE_STEP

    if state == "idle":
        return ALTERNATE_STEPS

    return None


def select_diagonal_body_punch_feedback_candidate(
    features: DiagonalBodyPunchFeatureSet,
    state: str,
    tracking: str,
    forward_threshold: float,
    arm_straight_threshold: float,
    guard_bend_threshold: float,
    stance_span_threshold: float,
    depth_shift_max: float,
    torso_tilt_max: float,
) -> FeedbackCandidate | None:
    if state == "complete":
        return None

    if tracking != "tracking_ok":
        return TRACKING_LOW

    if state == "idle":
        if abs(features.pelvis_depth_shift) > depth_shift_max:
            return STAY_IN_PLACE
        return None

    if features.torso_tilt > torso_tilt_max:
        return STRAIGHTEN_BACK

    dominant_forward = max(features.left_wrist_forward, features.right_wrist_forward)
    if dominant_forward < forward_threshold:
        return PUNCH_FURTHER

    dominant_elbow = max(features.left_elbow_angle or 0.0, features.right_elbow_angle or 0.0)
    if dominant_elbow < arm_straight_threshold:
        return STRAIGHTEN_PUNCH_ARM

    if features.stance_span < stance_span_threshold:
        return WIDEN_PUNCH_STANCE

    if (
        features.left_wrist_forward > features.right_wrist_forward
        and features.right_elbow_angle is not None
        and features.right_elbow_angle > guard_bend_threshold
    ) or (
        features.right_wrist_forward > features.left_wrist_forward
        and features.left_elbow_angle is not None
        and features.left_elbow_angle > guard_bend_threshold
    ):
        return BEND_BACK_ARM

    return None


def select_diagonal_face_punch_feedback_candidate(
    features: DiagonalFacePunchFeatureSet,
    state: str,
    tracking: str,
    forward_threshold: float,
    height_threshold: float,
    arm_straight_threshold: float,
    guard_bend_threshold: float,
    stance_span_threshold: float,
    depth_shift_max: float,
    torso_tilt_max: float,
) -> FeedbackCandidate | None:
    if state == "complete":
        return None

    if tracking != "tracking_ok":
        return TRACKING_LOW

    if state == "idle":
        if abs(features.pelvis_depth_shift) > depth_shift_max:
            return STAY_IN_PLACE
        return None

    if features.torso_tilt > torso_tilt_max:
        return STRAIGHTEN_BACK

    dominant_height = max(features.left_wrist_height, features.right_wrist_height)
    if dominant_height < height_threshold:
        return RAISE_PUNCH_HIGHER

    dominant_forward = max(features.left_wrist_forward, features.right_wrist_forward)
    if dominant_forward < forward_threshold:
        return PUNCH_FURTHER

    dominant_elbow = max(features.left_elbow_angle or 0.0, features.right_elbow_angle or 0.0)
    if dominant_elbow < arm_straight_threshold:
        return STRAIGHTEN_PUNCH_ARM

    if features.stance_span < stance_span_threshold:
        return WIDEN_PUNCH_STANCE

    return None


def select_squat_feedback_candidate(
    features: SquatFeatureSet,
    state: str,
    tracking: str,
    bottom_threshold: float,
    torso_tilt_max: float,
) -> FeedbackCandidate | None:
    if state == "complete":
        return None

    if tracking != "tracking_ok":
        return TRACKING_LOW

    if state == "idle":
        return None

    if features.torso_tilt > torso_tilt_max:
        return STRAIGHTEN_BACK

    if state == "descending" and features.hip_drop < bottom_threshold * 0.5:
        return SQUAT_DEEPER

    return None
