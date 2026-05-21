from app.services.gymnastics.evaluators.daniel_forward_bend import DanielForwardBendEvaluator
from app.services.gymnastics.types import HipCenter, NormalizedLandmark, NormalizedPoseFrame


def test_daniel_forward_bend_stays_idle_on_first_neutral_frame() -> None:
    evaluator = DanielForwardBendEvaluator()

    result = evaluator.evaluate(
        frame=build_forward_bend_frame(timestamp_ms=0, pose="neutral"),
        previous_state="idle",
        step_count=0,
        target_steps=1,
    )

    assert result.state == "idle"
    assert result.hold_duration_ms == 0
    assert result.hold_completed is False
    assert result.feedback is None


def test_daniel_forward_bend_holds_and_completes_after_target_duration() -> None:
    evaluator = DanielForwardBendEvaluator()

    baseline_result = evaluator.evaluate(
        frame=build_forward_bend_frame(timestamp_ms=0, pose="neutral"),
        previous_state="idle",
        step_count=0,
        target_steps=1,
        target_hold_ms=150,
    )
    holding_result = evaluator.evaluate(
        frame=build_forward_bend_frame(timestamp_ms=100, pose="forward_bend"),
        previous_state=baseline_result.state,
        step_count=0,
        target_steps=1,
        reference_hip_x=baseline_result.reference_hip_x,
        reference_hip_y=baseline_result.reference_hip_y,
        reference_scale=baseline_result.reference_scale,
        target_hold_ms=150,
        hold_duration_ms=baseline_result.hold_duration_ms,
        hold_last_timestamp_ms=baseline_result.hold_last_timestamp_ms,
    )
    complete_result = evaluator.evaluate(
        frame=build_forward_bend_frame(timestamp_ms=250, pose="forward_bend"),
        previous_state=holding_result.state,
        step_count=0,
        target_steps=1,
        reference_hip_x=holding_result.reference_hip_x,
        reference_hip_y=holding_result.reference_hip_y,
        reference_scale=holding_result.reference_scale,
        target_hold_ms=150,
        hold_duration_ms=holding_result.hold_duration_ms,
        hold_last_timestamp_ms=holding_result.hold_last_timestamp_ms,
    )

    assert holding_result.state == "holding"
    assert holding_result.hold_duration_ms == 0
    assert complete_result.state == "complete"
    assert complete_result.hold_duration_ms == 150
    assert complete_result.hold_completed is True


def test_daniel_forward_bend_sets_bend_forward_candidate_when_tilt_is_too_small() -> None:
    evaluator = DanielForwardBendEvaluator()

    baseline_result = evaluator.evaluate(
        frame=build_forward_bend_frame(timestamp_ms=0, pose="neutral"),
        previous_state="idle",
        step_count=0,
        target_steps=1,
    )
    weak_result = evaluator.evaluate(
        frame=build_forward_bend_frame(timestamp_ms=100, pose="shallow_forward_bend"),
        previous_state=baseline_result.state,
        step_count=0,
        target_steps=1,
        reference_hip_x=baseline_result.reference_hip_x,
        reference_hip_y=baseline_result.reference_hip_y,
        reference_scale=baseline_result.reference_scale,
    )

    assert weak_result.state == "idle"
    assert weak_result.candidate_feedback_code == "BEND_FORWARD_MORE"


def test_daniel_forward_bend_sets_lower_hands_candidate_when_hands_are_too_high() -> None:
    evaluator = DanielForwardBendEvaluator()

    baseline_result = evaluator.evaluate(
        frame=build_forward_bend_frame(timestamp_ms=0, pose="neutral"),
        previous_state="idle",
        step_count=0,
        target_steps=1,
    )
    low_hand_result = evaluator.evaluate(
        frame=build_forward_bend_frame(timestamp_ms=100, pose="high_hands_forward_bend"),
        previous_state=baseline_result.state,
        step_count=0,
        target_steps=1,
        reference_hip_x=baseline_result.reference_hip_x,
        reference_hip_y=baseline_result.reference_hip_y,
        reference_scale=baseline_result.reference_scale,
    )

    assert low_hand_result.state == "idle"
    assert low_hand_result.candidate_feedback_code == "LOWER_HANDS_MORE"


def test_daniel_forward_bend_sets_do_not_bend_knees_candidate_when_knees_are_too_bent() -> None:
    evaluator = DanielForwardBendEvaluator()

    baseline_result = evaluator.evaluate(
        frame=build_forward_bend_frame(timestamp_ms=0, pose="neutral"),
        previous_state="idle",
        step_count=0,
        target_steps=1,
    )
    bent_knee_result = evaluator.evaluate(
        frame=build_forward_bend_frame(timestamp_ms=100, pose="bent_knees_forward_bend"),
        previous_state=baseline_result.state,
        step_count=0,
        target_steps=1,
        reference_hip_x=baseline_result.reference_hip_x,
        reference_hip_y=baseline_result.reference_hip_y,
        reference_scale=baseline_result.reference_scale,
    )

    assert bent_knee_result.state == "idle"
    assert bent_knee_result.candidate_feedback_code == "DO_NOT_BEND_KNEES"


def test_daniel_forward_bend_keeps_holding_when_knee_angle_is_temporarily_missing() -> None:
    evaluator = DanielForwardBendEvaluator()

    baseline_result = evaluator.evaluate(
        frame=build_forward_bend_frame(timestamp_ms=0, pose="neutral"),
        previous_state="idle",
        step_count=0,
        target_steps=1,
        target_hold_ms=300,
    )
    holding_result = evaluator.evaluate(
        frame=build_forward_bend_frame(timestamp_ms=100, pose="forward_bend"),
        previous_state=baseline_result.state,
        step_count=0,
        target_steps=1,
        reference_hip_x=baseline_result.reference_hip_x,
        reference_hip_y=baseline_result.reference_hip_y,
        reference_scale=baseline_result.reference_scale,
        target_hold_ms=300,
        hold_duration_ms=baseline_result.hold_duration_ms,
        hold_last_timestamp_ms=baseline_result.hold_last_timestamp_ms,
    )
    recovered_result = evaluator.evaluate(
        frame=build_forward_bend_frame(timestamp_ms=200, pose="forward_bend_missing_knees"),
        previous_state=holding_result.state,
        step_count=0,
        target_steps=1,
        reference_hip_x=holding_result.reference_hip_x,
        reference_hip_y=holding_result.reference_hip_y,
        reference_scale=holding_result.reference_scale,
        target_hold_ms=300,
        hold_duration_ms=holding_result.hold_duration_ms,
        hold_last_timestamp_ms=holding_result.hold_last_timestamp_ms,
    )

    assert holding_result.state == "holding"
    assert recovered_result.state == "holding"
    assert recovered_result.hold_duration_ms == 100


def test_daniel_forward_bend_stays_idle_when_knees_are_occluded_before_hold() -> None:
    evaluator = DanielForwardBendEvaluator()

    baseline_result = evaluator.evaluate(
        frame=build_forward_bend_frame(timestamp_ms=0, pose="neutral"),
        previous_state="idle",
        step_count=0,
        target_steps=1,
        target_hold_ms=300,
    )
    holding_result = evaluator.evaluate(
        frame=build_forward_bend_frame(timestamp_ms=100, pose="forward_bend_missing_knees"),
        previous_state=baseline_result.state,
        step_count=0,
        target_steps=1,
        reference_hip_x=baseline_result.reference_hip_x,
        reference_hip_y=baseline_result.reference_hip_y,
        reference_scale=baseline_result.reference_scale,
        target_hold_ms=300,
        hold_duration_ms=baseline_result.hold_duration_ms,
        hold_last_timestamp_ms=baseline_result.hold_last_timestamp_ms,
    )

    assert holding_result.state == "idle"
    assert holding_result.tracking == "tracking_ok"


def build_forward_bend_frame(
    *,
    timestamp_ms: int,
    pose: str,
) -> NormalizedPoseFrame:
    if pose == "neutral":
        landmarks = {
            "LEFT_SHOULDER": landmark("LEFT_SHOULDER", -0.55, -1.10, 0.0),
            "RIGHT_SHOULDER": landmark("RIGHT_SHOULDER", 0.55, -1.10, 0.0),
            "LEFT_WRIST": landmark("LEFT_WRIST", -0.60, 0.25, 0.03),
            "RIGHT_WRIST": landmark("RIGHT_WRIST", 0.60, 0.25, 0.03),
        }
    elif pose == "forward_bend":
        landmarks = {
            "LEFT_SHOULDER": landmark("LEFT_SHOULDER", 0.25, 0.15, 0.0),
            "RIGHT_SHOULDER": landmark("RIGHT_SHOULDER", 0.85, 0.20, 0.0),
            "LEFT_WRIST": landmark("LEFT_WRIST", 0.20, 1.70, 0.03),
            "RIGHT_WRIST": landmark("RIGHT_WRIST", 0.80, 1.68, 0.03),
        }
    elif pose == "shallow_forward_bend":
        landmarks = {
            "LEFT_SHOULDER": landmark("LEFT_SHOULDER", -0.10, -0.55, 0.0),
            "RIGHT_SHOULDER": landmark("RIGHT_SHOULDER", 0.50, -0.50, 0.0),
            "LEFT_WRIST": landmark("LEFT_WRIST", 0.00, 1.55, 0.03),
            "RIGHT_WRIST": landmark("RIGHT_WRIST", 0.60, 1.52, 0.03),
        }
    elif pose == "high_hands_forward_bend":
        landmarks = {
            "LEFT_SHOULDER": landmark("LEFT_SHOULDER", 0.25, 0.15, 0.0),
            "RIGHT_SHOULDER": landmark("RIGHT_SHOULDER", 0.85, 0.20, 0.0),
            "LEFT_WRIST": landmark("LEFT_WRIST", 0.20, 0.78, 0.03),
            "RIGHT_WRIST": landmark("RIGHT_WRIST", 0.80, 0.75, 0.03),
        }
    elif pose == "bent_knees_forward_bend":
        landmarks = {
            "LEFT_SHOULDER": landmark("LEFT_SHOULDER", 0.25, 0.15, 0.0),
            "RIGHT_SHOULDER": landmark("RIGHT_SHOULDER", 0.85, 0.20, 0.0),
            "LEFT_WRIST": landmark("LEFT_WRIST", 0.20, 1.70, 0.03),
            "RIGHT_WRIST": landmark("RIGHT_WRIST", 0.80, 1.68, 0.03),
        }
    elif pose == "forward_bend_missing_knees":
        landmarks = {
            "LEFT_SHOULDER": landmark("LEFT_SHOULDER", 0.25, 0.15, 0.0),
            "RIGHT_SHOULDER": landmark("RIGHT_SHOULDER", 0.85, 0.20, 0.0),
            "LEFT_WRIST": landmark("LEFT_WRIST", 0.20, 1.70, 0.03),
            "RIGHT_WRIST": landmark("RIGHT_WRIST", 0.80, 1.68, 0.03),
        }
    else:
        raise ValueError(f"Unsupported pose fixture: {pose}")

    if pose == "bent_knees_forward_bend":
        knee_landmarks = {
            "LEFT_KNEE": landmark("LEFT_KNEE", -0.10, 0.75, 0.0),
            "RIGHT_KNEE": landmark("RIGHT_KNEE", 0.10, 0.75, 0.0),
            "LEFT_ANKLE": landmark("LEFT_ANKLE", -0.35, 1.25, 0.0),
            "RIGHT_ANKLE": landmark("RIGHT_ANKLE", 0.35, 1.25, 0.0),
        }
    elif pose != "forward_bend_missing_knees":
        knee_landmarks = {
            "LEFT_KNEE": landmark("LEFT_KNEE", -0.35, 1.05, 0.0),
            "RIGHT_KNEE": landmark("RIGHT_KNEE", 0.35, 1.05, 0.0),
            "LEFT_ANKLE": landmark("LEFT_ANKLE", -0.35, 2.05, 0.0),
            "RIGHT_ANKLE": landmark("RIGHT_ANKLE", 0.35, 2.05, 0.0),
        }
    else:
        knee_landmarks = {}

    landmarks.update(
        {
            "LEFT_HIP": landmark("LEFT_HIP", -0.35, 0.0, 0.0),
            "RIGHT_HIP": landmark("RIGHT_HIP", 0.35, 0.0, 0.0),
            **knee_landmarks,
        }
    )

    return NormalizedPoseFrame(
        tracking="tracking_ok",
        timestamp_ms=timestamp_ms,
        scale_reference=1.0,
        hip_center=HipCenter(x=0.5, y=0.5),
        landmarks=landmarks,
    )


def landmark(name: str, x: float, y: float, z: float) -> NormalizedLandmark:
    return NormalizedLandmark(
        name=name,
        x=x,
        y=y,
        z=z,
        confidence=1.0,
    )
