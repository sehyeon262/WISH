from app.services.gymnastics.evaluators.daniel_forward_press import DanielForwardPressEvaluator
from app.services.gymnastics.feedback.common import PRESS_HANDS_FORWARD
from app.services.gymnastics.types import HipCenter, NormalizedLandmark, NormalizedPoseFrame


def test_daniel_forward_press_captures_baseline_on_first_valid_frame() -> None:
    evaluator = DanielForwardPressEvaluator()

    result = evaluator.evaluate(
        frame=build_forward_press_frame(timestamp_ms=0, pose="neutral"),
        previous_state="idle",
        step_count=0,
        target_steps=1,
    )

    assert result.state == "idle"
    assert result.hold_duration_ms == 0
    assert result.hold_completed is False
    assert result.baseline_left_wrist_forward is not None
    assert result.baseline_right_wrist_forward is not None
    assert result.feedback is None
    assert result.frame_label == "guidance_needed"


def test_daniel_forward_press_holds_and_completes_after_target_duration() -> None:
    evaluator = DanielForwardPressEvaluator()

    baseline_result = evaluator.evaluate(
        frame=build_forward_press_frame(timestamp_ms=0, pose="neutral"),
        previous_state="idle",
        step_count=0,
        target_steps=1,
        target_hold_ms=150,
    )
    holding_result = evaluator.evaluate(
        frame=build_forward_press_frame(timestamp_ms=100, pose="forward"),
        previous_state=baseline_result.state,
        step_count=0,
        target_steps=1,
        reference_hip_x=baseline_result.reference_hip_x,
        reference_hip_y=baseline_result.reference_hip_y,
        reference_scale=baseline_result.reference_scale,
        baseline_left_wrist_forward=baseline_result.baseline_left_wrist_forward,
        baseline_right_wrist_forward=baseline_result.baseline_right_wrist_forward,
        target_hold_ms=150,
        hold_duration_ms=baseline_result.hold_duration_ms,
        hold_last_timestamp_ms=baseline_result.hold_last_timestamp_ms,
    )
    complete_result = evaluator.evaluate(
        frame=build_forward_press_frame(timestamp_ms=250, pose="forward"),
        previous_state=holding_result.state,
        step_count=0,
        target_steps=1,
        reference_hip_x=holding_result.reference_hip_x,
        reference_hip_y=holding_result.reference_hip_y,
        reference_scale=holding_result.reference_scale,
        baseline_left_wrist_forward=holding_result.baseline_left_wrist_forward,
        baseline_right_wrist_forward=holding_result.baseline_right_wrist_forward,
        target_hold_ms=150,
        hold_duration_ms=holding_result.hold_duration_ms,
        hold_last_timestamp_ms=holding_result.hold_last_timestamp_ms,
    )

    assert holding_result.state == "holding"
    assert holding_result.hold_duration_ms == 100
    assert holding_result.frame_label == "motion_present"
    assert complete_result.state == "complete"
    assert complete_result.hold_duration_ms == 150
    assert complete_result.hold_completed is True


def test_daniel_forward_press_sets_forward_feedback_candidate_when_not_pushed_enough() -> None:
    evaluator = DanielForwardPressEvaluator()

    baseline_result = evaluator.evaluate(
        frame=build_forward_press_frame(timestamp_ms=0, pose="neutral"),
        previous_state="idle",
        step_count=0,
        target_steps=1,
    )
    weak_result = evaluator.evaluate(
        frame=build_forward_press_frame(timestamp_ms=100, pose="weak_forward"),
        previous_state=baseline_result.state,
        step_count=0,
        target_steps=1,
        reference_hip_x=baseline_result.reference_hip_x,
        reference_hip_y=baseline_result.reference_hip_y,
        reference_scale=baseline_result.reference_scale,
        baseline_left_wrist_forward=baseline_result.baseline_left_wrist_forward,
        baseline_right_wrist_forward=baseline_result.baseline_right_wrist_forward,
        target_hold_ms=150,
        hold_duration_ms=baseline_result.hold_duration_ms,
        hold_last_timestamp_ms=baseline_result.hold_last_timestamp_ms,
    )

    assert weak_result.state == "idle"
    assert weak_result.frame_label == "attempting"
    assert weak_result.candidate_feedback_code == PRESS_HANDS_FORWARD.code
    assert weak_result.candidate_feedback_text == PRESS_HANDS_FORWARD.text


def test_daniel_forward_press_does_not_hold_when_arms_are_raised_wide() -> None:
    evaluator = DanielForwardPressEvaluator()

    baseline_result = evaluator.evaluate(
        frame=build_forward_press_frame(timestamp_ms=0, pose="neutral"),
        previous_state="idle",
        step_count=0,
        target_steps=1,
    )
    raised_result = evaluator.evaluate(
        frame=build_forward_press_frame(timestamp_ms=100, pose="raised_wide"),
        previous_state=baseline_result.state,
        step_count=0,
        target_steps=1,
        reference_hip_x=baseline_result.reference_hip_x,
        reference_hip_y=baseline_result.reference_hip_y,
        reference_scale=baseline_result.reference_scale,
        baseline_left_wrist_forward=baseline_result.baseline_left_wrist_forward,
        baseline_right_wrist_forward=baseline_result.baseline_right_wrist_forward,
        target_hold_ms=150,
        hold_duration_ms=baseline_result.hold_duration_ms,
        hold_last_timestamp_ms=baseline_result.hold_last_timestamp_ms,
    )

    assert raised_result.state == "idle"
    assert raised_result.frame_label == "guidance_needed"


def test_daniel_forward_press_does_not_hold_when_hands_cover_face() -> None:
    evaluator = DanielForwardPressEvaluator()

    baseline_result = evaluator.evaluate(
        frame=build_forward_press_frame(timestamp_ms=0, pose="neutral"),
        previous_state="idle",
        step_count=0,
        target_steps=1,
    )
    face_cover_result = evaluator.evaluate(
        frame=build_forward_press_frame(timestamp_ms=100, pose="face_cover"),
        previous_state=baseline_result.state,
        step_count=0,
        target_steps=1,
        reference_hip_x=baseline_result.reference_hip_x,
        reference_hip_y=baseline_result.reference_hip_y,
        reference_scale=baseline_result.reference_scale,
        baseline_left_wrist_forward=baseline_result.baseline_left_wrist_forward,
        baseline_right_wrist_forward=baseline_result.baseline_right_wrist_forward,
        target_hold_ms=150,
        hold_duration_ms=baseline_result.hold_duration_ms,
        hold_last_timestamp_ms=baseline_result.hold_last_timestamp_ms,
    )

    assert face_cover_result.state == "idle"
    assert face_cover_result.frame_label == "attempting"


def test_daniel_forward_press_recaptures_both_baselines_when_only_one_is_missing() -> None:
    evaluator = DanielForwardPressEvaluator()

    result = evaluator.evaluate(
        frame=build_forward_press_frame(timestamp_ms=100, pose="neutral"),
        previous_state="idle",
        step_count=0,
        target_steps=1,
        baseline_left_wrist_forward=None,
        baseline_right_wrist_forward=0.123,
    )

    assert result.state == "idle"
    assert result.baseline_left_wrist_forward is not None
    assert result.baseline_right_wrist_forward is not None
    assert result.frame_label == "guidance_needed"


def test_daniel_forward_press_resets_elapsed_progress_when_previous_state_is_complete() -> None:
    evaluator = DanielForwardPressEvaluator()

    baseline_result = evaluator.evaluate(
        frame=build_forward_press_frame(timestamp_ms=0, pose="neutral"),
        previous_state="idle",
        step_count=0,
        target_steps=1,
    )
    reset_result = evaluator.evaluate(
        frame=build_forward_press_frame(timestamp_ms=100, pose="forward"),
        previous_state="complete",
        step_count=0,
        target_steps=1,
        reference_hip_x=baseline_result.reference_hip_x,
        reference_hip_y=baseline_result.reference_hip_y,
        reference_scale=baseline_result.reference_scale,
        baseline_left_wrist_forward=baseline_result.baseline_left_wrist_forward,
        baseline_right_wrist_forward=baseline_result.baseline_right_wrist_forward,
        target_hold_ms=150,
        hold_duration_ms=150,
        hold_last_timestamp_ms=50,
    )

    assert reset_result.hold_duration_ms == 0
    assert reset_result.hold_completed is False
    assert reset_result.state == "holding"
    assert reset_result.frame_label == "motion_present"


def build_forward_press_frame(
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
    elif pose == "forward":
        landmarks = {
            "LEFT_SHOULDER": landmark("LEFT_SHOULDER", -0.55, -1.10, 0.0),
            "RIGHT_SHOULDER": landmark("RIGHT_SHOULDER", 0.55, -1.10, 0.0),
            "LEFT_ELBOW": landmark("LEFT_ELBOW", -0.18, -1.02, 0.02),
            "RIGHT_ELBOW": landmark("RIGHT_ELBOW", 0.18, -1.02, 0.02),
            "LEFT_WRIST": landmark("LEFT_WRIST", -0.10, -0.98, 0.08),
            "RIGHT_WRIST": landmark("RIGHT_WRIST", 0.10, -0.98, 0.08),
        }
    elif pose == "weak_forward":
        landmarks = {
            "LEFT_SHOULDER": landmark("LEFT_SHOULDER", -0.55, -1.10, 0.0),
            "RIGHT_SHOULDER": landmark("RIGHT_SHOULDER", 0.55, -1.10, 0.0),
            "LEFT_ELBOW": landmark("LEFT_ELBOW", -0.25, -0.95, -0.01),
            "RIGHT_ELBOW": landmark("RIGHT_ELBOW", 0.25, -0.95, -0.01),
            "LEFT_WRIST": landmark("LEFT_WRIST", -0.12, -0.98, 0.00),
            "RIGHT_WRIST": landmark("RIGHT_WRIST", 0.12, -0.98, 0.00),
        }
    elif pose == "raised_wide":
        landmarks = {
            "LEFT_SHOULDER": landmark("LEFT_SHOULDER", -0.55, -1.10, 0.0),
            "RIGHT_SHOULDER": landmark("RIGHT_SHOULDER", 0.55, -1.10, 0.0),
            "LEFT_ELBOW": landmark("LEFT_ELBOW", -0.80, -1.55, 0.10),
            "RIGHT_ELBOW": landmark("RIGHT_ELBOW", 0.80, -1.55, 0.10),
            "LEFT_WRIST": landmark("LEFT_WRIST", -0.95, -1.85, 0.15),
            "RIGHT_WRIST": landmark("RIGHT_WRIST", 0.95, -1.85, 0.15),
        }
    elif pose == "face_cover":
        landmarks = {
            "LEFT_SHOULDER": landmark("LEFT_SHOULDER", -0.55, -1.10, 0.0),
            "RIGHT_SHOULDER": landmark("RIGHT_SHOULDER", 0.55, -1.10, 0.0),
            "LEFT_ELBOW": landmark("LEFT_ELBOW", -0.12, -1.35, 0.02),
            "RIGHT_ELBOW": landmark("RIGHT_ELBOW", 0.12, -1.35, 0.02),
            "LEFT_WRIST": landmark("LEFT_WRIST", -0.08, -1.55, 0.08),
            "RIGHT_WRIST": landmark("RIGHT_WRIST", 0.08, -1.55, 0.08),
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
