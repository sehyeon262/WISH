from app.services.gymnastics.feedback.rules import (
    DO_NOT_BEND_KNEES,
    KEEP_HANDS_OVERHEAD,
    LEAN_LEFT_MORE,
    LIFT_HANDS_HIGHER,
    MATCH_HAND_HEIGHTS,
    PRESS_HANDS_FORWARD,
    STRAIGHTEN_ARMS,
    STRAIGHTEN_BACK,
    TRACKING_LOW,
    select_daniel_forward_bend_feedback_candidate,
    select_daniel_forward_press_feedback_candidate,
    select_daniel_side_bend_feedback_candidate,
    select_daniel_upward_press_feedback_candidate,
)


def test_forward_press_prefers_forward_correction_in_idle() -> None:
    candidate = select_daniel_forward_press_feedback_candidate(
        state="idle",
        tracking="tracking_ok",
        wrist_forward=0.2,
        wrist_extension=0.02,
        left_elbow_angle=170.0,
        right_elbow_angle=168.0,
        torso_tilt=2.0,
        forward_threshold=0.5,
        wrist_extension_threshold=0.05,
        arm_straight_threshold=150.0,
        torso_tilt_max=10.0,
    )

    assert candidate == PRESS_HANDS_FORWARD


def test_forward_press_uses_generic_arm_feedback_in_idle() -> None:
    candidate = select_daniel_forward_press_feedback_candidate(
        state="idle",
        tracking="tracking_ok",
        wrist_forward=0.7,
        wrist_extension=0.08,
        left_elbow_angle=120.0,
        right_elbow_angle=125.0,
        torso_tilt=2.0,
        forward_threshold=0.5,
        wrist_extension_threshold=0.05,
        arm_straight_threshold=150.0,
        torso_tilt_max=10.0,
    )

    assert candidate == STRAIGHTEN_ARMS


def test_forward_press_requests_more_push_when_only_wrist_extension_is_short() -> None:
    candidate = select_daniel_forward_press_feedback_candidate(
        state="idle",
        tracking="tracking_ok",
        wrist_forward=0.7,
        wrist_extension=0.04,
        left_elbow_angle=170.0,
        right_elbow_angle=168.0,
        torso_tilt=2.0,
        forward_threshold=0.5,
        wrist_extension_threshold=0.05,
        arm_straight_threshold=150.0,
        torso_tilt_max=10.0,
    )

    assert candidate == PRESS_HANDS_FORWARD


def test_forward_press_does_not_treat_missing_elbows_as_zero_angle() -> None:
    candidate = select_daniel_forward_press_feedback_candidate(
        state="idle",
        tracking="tracking_ok",
        wrist_forward=0.7,
        wrist_extension=0.08,
        left_elbow_angle=None,
        right_elbow_angle=None,
        torso_tilt=2.0,
        forward_threshold=0.5,
        wrist_extension_threshold=0.05,
        arm_straight_threshold=150.0,
        torso_tilt_max=10.0,
    )

    assert candidate is None


def test_upward_press_checks_height_before_balance() -> None:
    candidate = select_daniel_upward_press_feedback_candidate(
        state="idle",
        tracking="tracking_ok",
        wrist_height=0.3,
        wrist_height_balance=0.4,
        left_elbow_angle=170.0,
        right_elbow_angle=170.0,
        torso_tilt=1.0,
        height_threshold=0.5,
        height_balance_threshold=0.2,
        arm_straight_threshold=150.0,
        torso_tilt_max=10.0,
    )

    assert candidate == LIFT_HANDS_HIGHER


def test_upward_press_can_request_matching_heights() -> None:
    candidate = select_daniel_upward_press_feedback_candidate(
        state="idle",
        tracking="tracking_ok",
        wrist_height=0.7,
        wrist_height_balance=0.3,
        left_elbow_angle=170.0,
        right_elbow_angle=170.0,
        torso_tilt=1.0,
        height_threshold=0.5,
        height_balance_threshold=0.2,
        arm_straight_threshold=150.0,
        torso_tilt_max=10.0,
    )

    assert candidate == MATCH_HAND_HEIGHTS


def test_upward_press_prefers_straight_back_when_multiple_conditions_fail() -> None:
    candidate = select_daniel_upward_press_feedback_candidate(
        state="idle",
        tracking="tracking_ok",
        wrist_height=0.3,
        wrist_height_balance=0.4,
        left_elbow_angle=120.0,
        right_elbow_angle=122.0,
        torso_tilt=15.0,
        height_threshold=0.5,
        height_balance_threshold=0.2,
        arm_straight_threshold=150.0,
        torso_tilt_max=10.0,
    )

    assert candidate == STRAIGHTEN_BACK


def test_side_bend_uses_direction_specific_feedback() -> None:
    candidate = select_daniel_side_bend_feedback_candidate(
        state="idle",
        tracking="tracking_ok",
        direction="left",
        torso_tilt=10.0,
        wrist_height=0.8,
        left_elbow_angle=170.0,
        right_elbow_angle=170.0,
        target_tilt_threshold=20.0,
        wrist_height_threshold=0.5,
        arm_straight_threshold=150.0,
    )

    assert candidate == LEAN_LEFT_MORE


def test_side_bend_requests_hands_overhead_without_pelvis_feedback() -> None:
    candidate = select_daniel_side_bend_feedback_candidate(
        state="idle",
        tracking="tracking_ok",
        direction="right",
        torso_tilt=25.0,
        wrist_height=0.2,
        left_elbow_angle=170.0,
        right_elbow_angle=170.0,
        target_tilt_threshold=20.0,
        wrist_height_threshold=0.5,
        arm_straight_threshold=150.0,
    )

    assert candidate == KEEP_HANDS_OVERHEAD


def test_forward_bend_checks_knees_last() -> None:
    candidate = select_daniel_forward_bend_feedback_candidate(
        state="idle",
        tracking="tracking_ok",
        forward_bend_angle=50.0,
        wrist_drop=0.8,
        left_knee_angle=80.0,
        right_knee_angle=82.0,
        forward_bend_threshold=40.0,
        wrist_drop_threshold=0.5,
        knee_bend_min_angle=90.0,
    )

    assert candidate == DO_NOT_BEND_KNEES


def test_tracking_low_has_highest_priority() -> None:
    candidate = select_daniel_forward_press_feedback_candidate(
        state="idle",
        tracking="tracking_low",
        wrist_forward=1.0,
        wrist_extension=0.2,
        left_elbow_angle=180.0,
        right_elbow_angle=180.0,
        torso_tilt=0.0,
        forward_threshold=0.5,
        wrist_extension_threshold=0.05,
        arm_straight_threshold=150.0,
        torso_tilt_max=10.0,
    )

    assert candidate == TRACKING_LOW


def test_holding_state_returns_no_feedback_when_pose_is_good() -> None:
    candidate = select_daniel_forward_press_feedback_candidate(
        state="holding",
        tracking="tracking_ok",
        wrist_forward=0.7,
        wrist_extension=0.08,
        left_elbow_angle=170.0,
        right_elbow_angle=172.0,
        torso_tilt=2.0,
        forward_threshold=0.5,
        wrist_extension_threshold=0.05,
        arm_straight_threshold=150.0,
        torso_tilt_max=10.0,
    )

    assert candidate is None


def test_complete_state_returns_no_feedback() -> None:
    candidate = select_daniel_forward_bend_feedback_candidate(
        state="complete",
        tracking="tracking_ok",
        forward_bend_angle=10.0,
        wrist_drop=0.1,
        left_knee_angle=60.0,
        right_knee_angle=60.0,
        forward_bend_threshold=40.0,
        wrist_drop_threshold=0.5,
        knee_bend_min_angle=90.0,
    )

    assert candidate is None


def test_forward_press_threshold_boundary_is_treated_as_success_in_idle() -> None:
    candidate = select_daniel_forward_press_feedback_candidate(
        state="idle",
        tracking="tracking_ok",
        wrist_forward=0.5,
        wrist_extension=0.05,
        left_elbow_angle=150.0,
        right_elbow_angle=150.0,
        torso_tilt=10.0,
        forward_threshold=0.5,
        wrist_extension_threshold=0.05,
        arm_straight_threshold=150.0,
        torso_tilt_max=10.0,
    )

    assert candidate is None
