from app.services.gymnastics.evaluators.side_step import SideStepEvaluator
from app.services.gymnastics.types import HipCenter, NormalizedLandmark, NormalizedPoseFrame


def test_side_step_collecting_baseline_blocks_count_until_ready() -> None:
    evaluator = SideStepEvaluator()

    first = evaluator.evaluate(
        frame=build_side_step_frame(
            hip_center_x=0.45,
            left_ankle_raw_x=0.15,
            right_ankle_raw_x=0.58,
        ),
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
        frame=build_side_step_frame(
            hip_center_x=0.5,
            left_ankle_raw_x=0.40,
            right_ankle_raw_x=0.60,
        ),
        previous_state=first.state,
        step_count=first.step_count,
        target_steps=8,
        reference_hip_x=first.reference_hip_x,
        reference_hip_y=first.reference_hip_y,
        reference_scale=first.reference_scale,
        baseline_status=first.baseline_status,
        baseline_frames=first.baseline_frames,
        baseline_target_frames=first.baseline_target_frames,
        baseline_left_step_extent=first.baseline_left_step_extent,
        baseline_right_step_extent=first.baseline_right_step_extent,
        baseline_ankle_span=first.baseline_ankle_span,
    )

    assert second.baseline_status == "ready"
    assert second.baseline_frames == 2
    assert second.step_count == 0

    result = evaluator.evaluate(
        frame=build_side_step_frame(
            hip_center_x=0.45,
            left_ankle_raw_x=0.15,
            right_ankle_raw_x=0.58,
        ),
        previous_state=second.state,
        step_count=second.step_count,
        target_steps=8,
        reference_hip_x=second.reference_hip_x,
        reference_hip_y=second.reference_hip_y,
        reference_scale=second.reference_scale,
        baseline_status=second.baseline_status,
        baseline_frames=second.baseline_frames,
        baseline_target_frames=second.baseline_target_frames,
        baseline_left_step_extent=second.baseline_left_step_extent,
        baseline_right_step_extent=second.baseline_right_step_extent,
        baseline_ankle_span=second.baseline_ankle_span,
    )

    assert result.state == "left_open"
    assert result.step_count == 1


def test_side_step_counts_alternating_open_positions() -> None:
    evaluator = SideStepEvaluator()

    neutral_frame = build_side_step_frame(
        hip_center_x=0.5,
        left_ankle_raw_x=0.40,
        right_ankle_raw_x=0.60,
    )
    neutral_result = evaluator.evaluate(
        frame=neutral_frame,
        previous_state="idle",
        step_count=0,
        target_steps=8,
    )

    assert neutral_result.state == "idle"
    assert neutral_result.step_count == 0

    left_open_frame = build_side_step_frame(
        hip_center_x=0.45,
        left_ankle_raw_x=0.15,
        right_ankle_raw_x=0.58,
    )
    left_result = evaluator.evaluate(
        frame=left_open_frame,
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
        baseline_left_step_extent=neutral_result.baseline_left_step_extent,
        baseline_right_step_extent=neutral_result.baseline_right_step_extent,
        baseline_ankle_span=neutral_result.baseline_ankle_span,
    )

    assert left_result.state == "left_open"
    assert left_result.step_count == 1
    assert left_result.left_armed is False

    release_frame = build_side_step_frame(
        hip_center_x=0.5,
        left_ankle_raw_x=0.40,
        right_ankle_raw_x=0.60,
    )
    release_result = evaluator.evaluate(
        frame=release_frame,
        previous_state=left_result.state,
        step_count=left_result.step_count,
        target_steps=8,
        last_counted_side=left_result.last_counted_side,
        last_seen_side=left_result.last_seen_side,
        left_armed=left_result.left_armed,
        right_armed=left_result.right_armed,
        reference_hip_x=left_result.reference_hip_x,
        reference_hip_y=left_result.reference_hip_y,
        reference_scale=left_result.reference_scale,
        displayed_feedback_code=left_result.displayed_feedback_code,
        displayed_feedback_text=left_result.displayed_feedback_text,
        displayed_feedback_frames=left_result.displayed_feedback_frames,
        candidate_feedback_code=left_result.candidate_feedback_code,
        candidate_feedback_text=left_result.candidate_feedback_text,
        candidate_feedback_streak=left_result.candidate_feedback_streak,
        representative_feedback_totals=left_result.representative_feedback_totals,
        representative_feedback_code=left_result.representative_feedback_code,
        representative_feedback_text=left_result.representative_feedback_text,
        representative_feedback_frames=left_result.representative_feedback_frames,
        baseline_left_step_extent=left_result.baseline_left_step_extent,
        baseline_right_step_extent=left_result.baseline_right_step_extent,
        baseline_ankle_span=left_result.baseline_ankle_span,
    )

    assert release_result.state == "idle"
    assert release_result.left_armed is True

    right_open_frame = build_side_step_frame(
        hip_center_x=0.55,
        left_ankle_raw_x=0.42,
        right_ankle_raw_x=0.85,
    )
    right_result = evaluator.evaluate(
        frame=right_open_frame,
        previous_state=release_result.state,
        step_count=release_result.step_count,
        target_steps=8,
        last_counted_side=release_result.last_counted_side,
        last_seen_side=release_result.last_seen_side,
        left_armed=release_result.left_armed,
        right_armed=release_result.right_armed,
        reference_hip_x=release_result.reference_hip_x,
        reference_hip_y=release_result.reference_hip_y,
        reference_scale=release_result.reference_scale,
        displayed_feedback_code=release_result.displayed_feedback_code,
        displayed_feedback_text=release_result.displayed_feedback_text,
        displayed_feedback_frames=release_result.displayed_feedback_frames,
        candidate_feedback_code=release_result.candidate_feedback_code,
        candidate_feedback_text=release_result.candidate_feedback_text,
        candidate_feedback_streak=release_result.candidate_feedback_streak,
        representative_feedback_totals=release_result.representative_feedback_totals,
        representative_feedback_code=release_result.representative_feedback_code,
        representative_feedback_text=release_result.representative_feedback_text,
        representative_feedback_frames=release_result.representative_feedback_frames,
        baseline_left_step_extent=release_result.baseline_left_step_extent,
        baseline_right_step_extent=release_result.baseline_right_step_extent,
        baseline_ankle_span=release_result.baseline_ankle_span,
    )

    assert right_result.state == "right_open"
    assert right_result.step_count == 2
    assert right_result.right_armed is False


def test_side_step_counts_progress_even_with_forward_backward_sway() -> None:
    evaluator = SideStepEvaluator()
    neutral_result = evaluator.evaluate(
        frame=build_side_step_frame(
            hip_center_x=0.5,
            left_ankle_raw_x=0.40,
            right_ankle_raw_x=0.60,
        ),
        previous_state="idle",
        step_count=0,
        target_steps=8,
    )

    sway_frame = build_side_step_frame(
        hip_center_x=0.45,
        left_ankle_raw_x=0.15,
        right_ankle_raw_x=0.58,
    )
    sway_frame.scale_reference = 0.35

    result = evaluator.evaluate(
        frame=sway_frame,
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
        baseline_left_step_extent=neutral_result.baseline_left_step_extent,
        baseline_right_step_extent=neutral_result.baseline_right_step_extent,
        baseline_ankle_span=neutral_result.baseline_ankle_span,
    )

    assert result.state == "left_open"
    assert result.step_count == 1
    assert result.frame_label == "motion_present"
    assert result.candidate_feedback_code == "MOVE_SIDE_ONLY"


def test_side_step_tracking_low_does_not_initialize_baseline() -> None:
    evaluator = SideStepEvaluator()
    tracking_low_frame = build_side_step_frame(
        hip_center_x=0.5,
        left_ankle_raw_x=0.40,
        right_ankle_raw_x=0.60,
        tracking="tracking_low",
    )

    result = evaluator.evaluate(
        frame=tracking_low_frame,
        previous_state="idle",
        step_count=0,
        target_steps=8,
    )

    assert result.state == "idle"
    assert result.step_count == 0
    assert result.baseline_left_step_extent is None
    assert result.baseline_right_step_extent is None
    assert result.baseline_ankle_span is None


def test_side_step_first_tracking_ok_frame_only_captures_baseline() -> None:
    evaluator = SideStepEvaluator()
    first_good_frame = build_side_step_frame(
        hip_center_x=0.45,
        left_ankle_raw_x=0.15,
        right_ankle_raw_x=0.58,
    )

    result = evaluator.evaluate(
        frame=first_good_frame,
        previous_state="idle",
        step_count=0,
        target_steps=8,
    )

    assert result.state == "idle"
    assert result.step_count == 0
    assert result.left_armed is True
    assert result.right_armed is True
    assert result.baseline_left_step_extent is not None
    assert result.baseline_right_step_extent is not None
    assert result.baseline_ankle_span is not None


def test_side_step_clamps_step_count_when_input_already_exceeds_target() -> None:
    evaluator = SideStepEvaluator()
    neutral_frame = build_side_step_frame(
        hip_center_x=0.5,
        left_ankle_raw_x=0.40,
        right_ankle_raw_x=0.60,
    )

    result = evaluator.evaluate(
        frame=neutral_frame,
        previous_state="complete",
        step_count=99,
        target_steps=8,
    )

    assert result.state == "complete"
    assert result.step_count == 8


def build_side_step_frame(
    hip_center_x: float,
    left_ankle_raw_x: float,
    right_ankle_raw_x: float,
    hip_center_y: float = 0.5,
    scale_reference: float = 0.2,
    tracking: str = "tracking_ok",
) -> NormalizedPoseFrame:
    def landmark(name: str, raw_x: float, raw_y: float) -> NormalizedLandmark:
        return NormalizedLandmark(
            name=name,
            x=(raw_x - hip_center_x) / scale_reference,
            y=(raw_y - hip_center_y) / scale_reference,
            z=0.0,
            confidence=1.0,
        )

    landmarks = {
        "LEFT_SHOULDER": landmark("LEFT_SHOULDER", hip_center_x - 0.10, 0.26),
        "RIGHT_SHOULDER": landmark("RIGHT_SHOULDER", hip_center_x + 0.10, 0.26),
        "LEFT_HIP": landmark("LEFT_HIP", hip_center_x - 0.05, 0.50),
        "RIGHT_HIP": landmark("RIGHT_HIP", hip_center_x + 0.05, 0.50),
        "LEFT_KNEE": landmark("LEFT_KNEE", hip_center_x - 0.04, 0.72),
        "RIGHT_KNEE": landmark("RIGHT_KNEE", hip_center_x + 0.04, 0.72),
        "LEFT_ANKLE": landmark("LEFT_ANKLE", left_ankle_raw_x, 0.94),
        "RIGHT_ANKLE": landmark("RIGHT_ANKLE", right_ankle_raw_x, 0.94),
    }
    return NormalizedPoseFrame(
        tracking=tracking,
        timestamp_ms=0,
        scale_reference=scale_reference,
        hip_center=HipCenter(x=hip_center_x, y=hip_center_y),
        landmarks=landmarks,
    )
