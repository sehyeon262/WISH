from app.services.gymnastics.evaluators.march import MarchEvaluator
from app.services.gymnastics.types import HipCenter, NormalizedLandmark, NormalizedPoseFrame


def test_march_collects_baseline_before_progress_counting() -> None:
    evaluator = MarchEvaluator()

    first = evaluator.evaluate(
        frame=build_march_frame(),
        previous_state="idle",
        step_count=0,
        target_steps=8,
        baseline_status="collecting",
        baseline_target_frames=2,
    )

    assert first.baseline_status == "collecting"
    assert first.baseline_frames == 1
    assert first.step_count == 0

    second = evaluator.evaluate(
        frame=build_march_frame(left_knee_x=-0.10, right_knee_x=0.10),
        previous_state=first.state,
        step_count=first.step_count,
        target_steps=8,
        reference_hip_x=first.reference_hip_x,
        reference_hip_y=first.reference_hip_y,
        reference_scale=first.reference_scale,
        baseline_status=first.baseline_status,
        baseline_frames=first.baseline_frames,
        baseline_target_frames=first.baseline_target_frames,
        baseline_left_knee_lift=first.baseline_left_knee_lift,
        baseline_right_knee_lift=first.baseline_right_knee_lift,
        baseline_left_thigh_angle=first.baseline_left_thigh_angle,
        baseline_right_thigh_angle=first.baseline_right_thigh_angle,
    )

    assert second.baseline_status == "ready"
    assert second.baseline_frames == 2
    assert second.step_count == 0

    result = evaluator.evaluate(
        frame=build_march_frame(left_knee_x=0.65, left_knee_y=1.0),
        previous_state=second.state,
        step_count=second.step_count,
        target_steps=8,
        reference_hip_x=second.reference_hip_x,
        reference_hip_y=second.reference_hip_y,
        reference_scale=second.reference_scale,
        baseline_status=second.baseline_status,
        baseline_frames=second.baseline_frames,
        baseline_target_frames=second.baseline_target_frames,
        baseline_left_knee_lift=second.baseline_left_knee_lift,
        baseline_right_knee_lift=second.baseline_right_knee_lift,
        baseline_left_thigh_angle=second.baseline_left_thigh_angle,
        baseline_right_thigh_angle=second.baseline_right_thigh_angle,
    )

    assert result.state == "left_peak"
    assert result.step_count == 1


def test_march_counts_progress_even_when_child_drifts_from_place() -> None:
    evaluator = MarchEvaluator()

    neutral_result = evaluator.evaluate(
        frame=build_march_frame(),
        previous_state="idle",
        step_count=0,
        target_steps=8,
    )

    drifted_peak = build_march_frame(
        hip_center_x=0.9,
        left_knee_x=0.65,
        left_knee_y=1.0,
    )
    result = evaluator.evaluate(
        frame=drifted_peak,
        previous_state=neutral_result.state,
        step_count=neutral_result.step_count,
        target_steps=8,
        last_counted_side=neutral_result.last_counted_side,
        last_seen_side=neutral_result.last_seen_side,
        left_armed=neutral_result.left_armed,
        right_armed=neutral_result.right_armed,
        reference_hip_x=neutral_result.reference_hip_x,
        reference_hip_y=neutral_result.reference_hip_y,
        reference_scale=neutral_result.reference_scale,
        displayed_feedback_code=neutral_result.displayed_feedback_code,
        displayed_feedback_text=neutral_result.displayed_feedback_text,
        displayed_feedback_frames=neutral_result.displayed_feedback_frames,
        candidate_feedback_code=neutral_result.candidate_feedback_code,
        candidate_feedback_text=neutral_result.candidate_feedback_text,
        candidate_feedback_streak=neutral_result.candidate_feedback_streak,
        representative_feedback_totals=neutral_result.representative_feedback_totals,
        representative_feedback_code=neutral_result.representative_feedback_code,
        representative_feedback_text=neutral_result.representative_feedback_text,
        representative_feedback_frames=neutral_result.representative_feedback_frames,
    )

    assert result.state == "left_peak"
    assert result.step_count == 1
    assert result.frame_label == "motion_present"
    assert result.candidate_feedback_code == "STAY_IN_PLACE"


def build_march_frame(
    hip_center_x: float = 0.5,
    hip_center_y: float = 0.5,
    left_knee_x: float = -0.05,
    left_knee_y: float = 1.2,
    right_knee_x: float = 0.05,
    right_knee_y: float = 1.2,
    tracking: str = "tracking_ok",
) -> NormalizedPoseFrame:
    landmarks = {
        "LEFT_SHOULDER": landmark("LEFT_SHOULDER", -0.30, -1.10),
        "RIGHT_SHOULDER": landmark("RIGHT_SHOULDER", 0.30, -1.10),
        "LEFT_HIP": landmark("LEFT_HIP", -0.20, 0.0),
        "RIGHT_HIP": landmark("RIGHT_HIP", 0.20, 0.0),
        "LEFT_KNEE": landmark("LEFT_KNEE", left_knee_x, left_knee_y),
        "RIGHT_KNEE": landmark("RIGHT_KNEE", right_knee_x, right_knee_y),
        "LEFT_ANKLE": landmark("LEFT_ANKLE", -0.25, 2.10),
        "RIGHT_ANKLE": landmark("RIGHT_ANKLE", 0.25, 2.10),
    }
    return NormalizedPoseFrame(
        tracking=tracking,
        timestamp_ms=0,
        scale_reference=1.0,
        hip_center=HipCenter(x=hip_center_x, y=hip_center_y),
        landmarks=landmarks,
    )


def landmark(name: str, x: float, y: float) -> NormalizedLandmark:
    return NormalizedLandmark(name=name, x=x, y=y, z=0.0, confidence=1.0)
