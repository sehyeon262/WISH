from app.services.gymnastics.evaluators.daniel_upward_press import DanielUpwardPressEvaluator
from app.services.gymnastics.features.daniel_upward_press_features import (
    extract_daniel_upward_press_features,
)
from app.services.gymnastics.types import HipCenter, NormalizedLandmark, NormalizedPoseFrame


def test_daniel_upward_press_stays_idle_on_first_neutral_frame() -> None:
    evaluator = DanielUpwardPressEvaluator()

    result = evaluator.evaluate(
        frame=build_upward_press_frame(timestamp_ms=0, pose="neutral"),
        previous_state="idle",
        step_count=0,
        target_steps=1,
    )

    assert result.state == "idle"
    assert result.hold_duration_ms == 0
    assert result.hold_completed is False
    assert result.feedback is None


def test_daniel_upward_press_holds_and_completes_after_target_duration() -> None:
    evaluator = DanielUpwardPressEvaluator()

    baseline_result = evaluator.evaluate(
        frame=build_upward_press_frame(timestamp_ms=0, pose="neutral"),
        previous_state="idle",
        step_count=0,
        target_steps=1,
        target_hold_ms=150,
    )
    holding_result = evaluator.evaluate(
        frame=build_upward_press_frame(timestamp_ms=100, pose="upward"),
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
        frame=build_upward_press_frame(timestamp_ms=250, pose="upward"),
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


def test_daniel_upward_press_sets_raise_hands_candidate_when_hands_are_too_low() -> None:
    evaluator = DanielUpwardPressEvaluator()

    baseline_result = evaluator.evaluate(
        frame=build_upward_press_frame(timestamp_ms=0, pose="neutral"),
        previous_state="idle",
        step_count=0,
        target_steps=1,
    )
    low_result = evaluator.evaluate(
        frame=build_upward_press_frame(timestamp_ms=100, pose="low_hands"),
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

    assert low_result.state == "idle"
    assert low_result.candidate_feedback_code == "LIFT_HANDS_HIGHER"


def test_daniel_upward_press_does_not_hold_when_hand_heights_are_unbalanced() -> None:
    evaluator = DanielUpwardPressEvaluator()

    baseline_result = evaluator.evaluate(
        frame=build_upward_press_frame(timestamp_ms=0, pose="neutral"),
        previous_state="idle",
        step_count=0,
        target_steps=1,
    )
    unbalanced_result = evaluator.evaluate(
        frame=build_upward_press_frame(timestamp_ms=100, pose="unbalanced"),
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

    assert unbalanced_result.state == "idle"
    assert unbalanced_result.candidate_feedback_code == "MATCH_HAND_HEIGHTS"


def test_daniel_upward_press_resumes_hold_progress_without_timestamp() -> None:
    evaluator = DanielUpwardPressEvaluator()

    baseline_result = evaluator.evaluate(
        frame=build_upward_press_frame(timestamp_ms=0, pose="neutral"),
        previous_state="idle",
        step_count=0,
        target_steps=1,
        target_hold_ms=200,
    )
    recovered_result = evaluator.evaluate(
        frame=build_upward_press_frame(timestamp_ms=100, pose="upward"),
        previous_state="holding",
        step_count=0,
        target_steps=1,
        reference_hip_x=baseline_result.reference_hip_x,
        reference_hip_y=baseline_result.reference_hip_y,
        reference_scale=baseline_result.reference_scale,
        target_hold_ms=200,
        hold_duration_ms=120,
        hold_last_timestamp_ms=None,
    )

    assert recovered_result.state == "holding"
    assert recovered_result.hold_duration_ms == 120
    assert recovered_result.hold_last_timestamp_ms == 100


def test_daniel_upward_press_accuracy_skips_missing_height_balance() -> None:
    evaluator = DanielUpwardPressEvaluator()

    features = extract_daniel_upward_press_features(
        build_upward_press_frame(timestamp_ms=0, pose="upward"),
    )
    features.wrist_height_balance = None

    accuracy = evaluator._compute_accuracy(features, mean_elbow_angle=160.0)

    assert 0.0 <= accuracy <= 1.0
    assert accuracy > 0.0


def build_upward_press_frame(
    *,
    timestamp_ms: int,
    pose: str,
) -> NormalizedPoseFrame:
    if pose == "neutral":
        landmarks = {
            "LEFT_SHOULDER": landmark("LEFT_SHOULDER", -0.55, -1.10, 0.0),
            "RIGHT_SHOULDER": landmark("RIGHT_SHOULDER", 0.55, -1.10, 0.0),
            "LEFT_ELBOW": landmark("LEFT_ELBOW", -0.50, -0.55, -0.02),
            "RIGHT_ELBOW": landmark("RIGHT_ELBOW", 0.50, -0.55, -0.02),
            "LEFT_WRIST": landmark("LEFT_WRIST", -0.45, -0.10, -0.02),
            "RIGHT_WRIST": landmark("RIGHT_WRIST", 0.45, -0.10, -0.02),
        }
    elif pose == "upward":
        landmarks = {
            "LEFT_SHOULDER": landmark("LEFT_SHOULDER", -0.55, -1.10, 0.0),
            "RIGHT_SHOULDER": landmark("RIGHT_SHOULDER", 0.55, -1.10, 0.0),
            "LEFT_ELBOW": landmark("LEFT_ELBOW", -0.22, -1.62, 0.02),
            "RIGHT_ELBOW": landmark("RIGHT_ELBOW", 0.22, -1.62, 0.02),
            "LEFT_WRIST": landmark("LEFT_WRIST", -0.12, -1.95, 0.04),
            "RIGHT_WRIST": landmark("RIGHT_WRIST", 0.12, -1.95, 0.04),
        }
    elif pose == "low_hands":
        landmarks = {
            "LEFT_SHOULDER": landmark("LEFT_SHOULDER", -0.55, -1.10, 0.0),
            "RIGHT_SHOULDER": landmark("RIGHT_SHOULDER", 0.55, -1.10, 0.0),
            "LEFT_ELBOW": landmark("LEFT_ELBOW", -0.28, -1.18, 0.01),
            "RIGHT_ELBOW": landmark("RIGHT_ELBOW", 0.28, -1.18, 0.01),
            "LEFT_WRIST": landmark("LEFT_WRIST", -0.18, -1.30, 0.02),
            "RIGHT_WRIST": landmark("RIGHT_WRIST", 0.18, -1.30, 0.02),
        }
    elif pose == "unbalanced":
        landmarks = {
            "LEFT_SHOULDER": landmark("LEFT_SHOULDER", -0.55, -1.10, 0.0),
            "RIGHT_SHOULDER": landmark("RIGHT_SHOULDER", 0.55, -1.10, 0.0),
            "LEFT_ELBOW": landmark("LEFT_ELBOW", -0.22, -1.62, 0.02),
            "RIGHT_ELBOW": landmark("RIGHT_ELBOW", 0.25, -1.42, 0.02),
            "LEFT_WRIST": landmark("LEFT_WRIST", -0.12, -1.95, 0.04),
            "RIGHT_WRIST": landmark("RIGHT_WRIST", 0.18, -1.50, 0.04),
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
