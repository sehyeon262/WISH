from app.services.gymnastics.evaluators.daniel_left_side_bend import DanielLeftSideBendEvaluator
from app.services.gymnastics.types import HipCenter, NormalizedLandmark, NormalizedPoseFrame


def test_daniel_left_side_bend_stays_idle_on_first_neutral_frame() -> None:
    evaluator = DanielLeftSideBendEvaluator()

    result = evaluator.evaluate(
        frame=build_left_side_bend_frame(timestamp_ms=0, pose="neutral"),
        previous_state="idle",
        step_count=0,
        target_steps=1,
    )

    assert result.state == "idle"
    assert result.hold_duration_ms == 0
    assert result.hold_completed is False
    assert result.feedback is None


def test_daniel_left_side_bend_holds_and_completes_after_target_duration() -> None:
    evaluator = DanielLeftSideBendEvaluator()

    baseline_result = evaluator.evaluate(
        frame=build_left_side_bend_frame(timestamp_ms=0, pose="neutral"),
        previous_state="idle",
        step_count=0,
        target_steps=1,
        target_hold_ms=150,
    )
    holding_result = evaluator.evaluate(
        frame=build_left_side_bend_frame(timestamp_ms=100, pose="left_bend"),
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
        frame=build_left_side_bend_frame(timestamp_ms=250, pose="left_bend"),
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


def test_daniel_left_side_bend_sets_lean_left_candidate_when_tilt_is_too_small() -> None:
    evaluator = DanielLeftSideBendEvaluator()

    baseline_result = evaluator.evaluate(
        frame=build_left_side_bend_frame(timestamp_ms=0, pose="neutral"),
        previous_state="idle",
        step_count=0,
        target_steps=1,
    )
    weak_result = evaluator.evaluate(
        frame=build_left_side_bend_frame(timestamp_ms=100, pose="weak_left_bend"),
        previous_state=baseline_result.state,
        step_count=0,
        target_steps=1,
        reference_hip_x=baseline_result.reference_hip_x,
        reference_hip_y=baseline_result.reference_hip_y,
        reference_scale=baseline_result.reference_scale,
    )

    assert weak_result.state == "idle"
    assert weak_result.candidate_feedback_code == "LEAN_LEFT_MORE"


def test_daniel_left_side_bend_sets_keep_hands_overhead_candidate_when_hands_are_low() -> None:
    evaluator = DanielLeftSideBendEvaluator()

    baseline_result = evaluator.evaluate(
        frame=build_left_side_bend_frame(timestamp_ms=0, pose="neutral"),
        previous_state="idle",
        step_count=0,
        target_steps=1,
    )
    low_hand_result = evaluator.evaluate(
        frame=build_left_side_bend_frame(timestamp_ms=100, pose="low_hands_left_bend"),
        previous_state=baseline_result.state,
        step_count=0,
        target_steps=1,
        reference_hip_x=baseline_result.reference_hip_x,
        reference_hip_y=baseline_result.reference_hip_y,
        reference_scale=baseline_result.reference_scale,
    )

    assert low_hand_result.state == "idle"
    assert low_hand_result.candidate_feedback_code == "KEEP_HANDS_OVERHEAD"


def test_daniel_left_side_bend_keeps_holding_when_elbow_angle_is_temporarily_missing() -> None:
    evaluator = DanielLeftSideBendEvaluator()

    baseline_result = evaluator.evaluate(
        frame=build_left_side_bend_frame(timestamp_ms=0, pose="neutral"),
        previous_state="idle",
        step_count=0,
        target_steps=1,
        target_hold_ms=300,
    )
    holding_result = evaluator.evaluate(
        frame=build_left_side_bend_frame(timestamp_ms=100, pose="left_bend"),
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
        frame=build_left_side_bend_frame(timestamp_ms=200, pose="left_bend_missing_elbows"),
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


def build_left_side_bend_frame(
    *,
    timestamp_ms: int,
    pose: str,
) -> NormalizedPoseFrame:
    if pose == "neutral":
        landmarks = {
            "LEFT_SHOULDER": landmark("LEFT_SHOULDER", -0.55, -1.10, 0.0),
            "RIGHT_SHOULDER": landmark("RIGHT_SHOULDER", 0.55, -1.10, 0.0),
            "LEFT_ELBOW": landmark("LEFT_ELBOW", -0.28, -1.55, 0.02),
            "RIGHT_ELBOW": landmark("RIGHT_ELBOW", 0.28, -1.55, 0.02),
            "LEFT_WRIST": landmark("LEFT_WRIST", -0.15, -1.85, 0.03),
            "RIGHT_WRIST": landmark("RIGHT_WRIST", 0.15, -1.85, 0.03),
        }
    elif pose == "left_bend":
        landmarks = {
            "LEFT_SHOULDER": landmark("LEFT_SHOULDER", -0.92, -1.06, 0.0),
            "RIGHT_SHOULDER": landmark("RIGHT_SHOULDER", -0.02, -1.16, 0.0),
            "LEFT_ELBOW": landmark("LEFT_ELBOW", -0.68, -1.58, 0.02),
            "RIGHT_ELBOW": landmark("RIGHT_ELBOW", 0.08, -1.62, 0.02),
            "LEFT_WRIST": landmark("LEFT_WRIST", -0.58, -1.92, 0.03),
            "RIGHT_WRIST": landmark("RIGHT_WRIST", 0.18, -1.96, 0.03),
        }
    elif pose == "weak_left_bend":
        landmarks = {
            "LEFT_SHOULDER": landmark("LEFT_SHOULDER", -0.66, -1.08, 0.0),
            "RIGHT_SHOULDER": landmark("RIGHT_SHOULDER", 0.24, -1.12, 0.0),
            "LEFT_ELBOW": landmark("LEFT_ELBOW", -0.42, -1.58, 0.02),
            "RIGHT_ELBOW": landmark("RIGHT_ELBOW", 0.34, -1.60, 0.02),
            "LEFT_WRIST": landmark("LEFT_WRIST", -0.32, -1.90, 0.03),
            "RIGHT_WRIST": landmark("RIGHT_WRIST", 0.44, -1.92, 0.03),
        }
    elif pose == "low_hands_left_bend":
        landmarks = {
            "LEFT_SHOULDER": landmark("LEFT_SHOULDER", -0.90, -1.06, 0.0),
            "RIGHT_SHOULDER": landmark("RIGHT_SHOULDER", 0.00, -1.16, 0.0),
            "LEFT_ELBOW": landmark("LEFT_ELBOW", -0.68, -1.36, 0.02),
            "RIGHT_ELBOW": landmark("RIGHT_ELBOW", 0.08, -1.40, 0.02),
            "LEFT_WRIST": landmark("LEFT_WRIST", -0.58, -1.48, 0.03),
            "RIGHT_WRIST": landmark("RIGHT_WRIST", 0.18, -1.52, 0.03),
        }
    elif pose == "left_bend_missing_elbows":
        landmarks = {
            "LEFT_SHOULDER": landmark("LEFT_SHOULDER", -0.92, -1.06, 0.0),
            "RIGHT_SHOULDER": landmark("RIGHT_SHOULDER", -0.02, -1.16, 0.0),
            "LEFT_WRIST": landmark("LEFT_WRIST", -0.58, -1.92, 0.03),
            "RIGHT_WRIST": landmark("RIGHT_WRIST", 0.18, -1.96, 0.03),
        }
    else:
        raise ValueError(f"Unsupported pose fixture: {pose}")

    landmarks.update(
        {
            "LEFT_HIP": landmark("LEFT_HIP", -0.35, 0.0, 0.0),
            "RIGHT_HIP": landmark("RIGHT_HIP", 0.35, 0.0, 0.0),
            "LEFT_KNEE": landmark("LEFT_KNEE", -0.35, 1.05, 0.0),
            "RIGHT_KNEE": landmark("RIGHT_KNEE", 0.35, 1.05, 0.0),
            "LEFT_ANKLE": landmark("LEFT_ANKLE", -0.35, 2.05, 0.0),
            "RIGHT_ANKLE": landmark("RIGHT_ANKLE", 0.35, 2.05, 0.0),
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
