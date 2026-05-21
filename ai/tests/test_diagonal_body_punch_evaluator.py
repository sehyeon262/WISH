from app.services.gymnastics.evaluators.diagonal_body_punch import DiagonalBodyPunchEvaluator
from app.services.gymnastics.types import HipCenter, NormalizedLandmark, NormalizedPoseFrame


def test_diagonal_body_punch_collecting_baseline_blocks_count_until_ready() -> None:
    evaluator = DiagonalBodyPunchEvaluator()

    first = evaluator.evaluate(
        frame=build_diagonal_body_punch_frame(left_wrist_x=-1.70, stance_span=2.30),
        previous_state="idle",
        step_count=0,
        target_steps=8,
        baseline_status="collecting",
        baseline_target_frames=1,
    )

    assert first.baseline_status == "ready"
    assert first.baseline_frames == 1
    assert first.step_count == 0

    result = evaluator.evaluate(
        frame=build_diagonal_body_punch_frame(left_wrist_x=-2.40, left_elbow_x=-1.80, stance_span=2.30),
        previous_state=first.state,
        step_count=first.step_count,
        target_steps=8,
        reference_hip_x=first.reference_hip_x,
        reference_hip_y=first.reference_hip_y,
        reference_scale=first.reference_scale,
        baseline_status=first.baseline_status,
        baseline_frames=first.baseline_frames,
        baseline_target_frames=first.baseline_target_frames,
        baseline_left_wrist_forward=first.baseline_left_wrist_forward,
        baseline_right_wrist_forward=first.baseline_right_wrist_forward,
        baseline_stance_span=first.baseline_stance_span,
    )

    assert result.state == "left_punch"
    assert result.step_count == 1


def test_diagonal_body_punch_counts_alternating_punches() -> None:
    evaluator = DiagonalBodyPunchEvaluator()

    neutral_frame = build_diagonal_body_punch_frame()
    neutral_result = evaluator.evaluate(
        frame=neutral_frame,
        previous_state="idle",
        step_count=0,
        target_steps=8,
    )

    assert neutral_result.state == "idle"
    assert neutral_result.step_count == 0
    assert neutral_result.baseline_left_wrist_forward is not None
    assert neutral_result.baseline_right_wrist_forward is not None
    assert neutral_result.baseline_stance_span is not None

    left_punch_frame = build_diagonal_body_punch_frame(
        left_wrist_x=-1.70,
        left_elbow_x=-1.20,
        right_elbow_x=0.65,
        stance_span=2.30,
    )
    left_result = evaluator.evaluate(
        frame=left_punch_frame,
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
        baseline_left_wrist_forward=neutral_result.baseline_left_wrist_forward,
        baseline_right_wrist_forward=neutral_result.baseline_right_wrist_forward,
        baseline_stance_span=neutral_result.baseline_stance_span,
    )

    assert left_result.state == "left_punch"
    assert left_result.step_count == 1
    assert left_result.left_armed is False

    left_hold_frame = build_diagonal_body_punch_frame(
        left_wrist_x=-1.62,
        left_elbow_x=-1.15,
        right_elbow_x=0.62,
        stance_span=2.25,
    )
    left_hold_result = evaluator.evaluate(
        frame=left_hold_frame,
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
        baseline_left_wrist_forward=left_result.baseline_left_wrist_forward,
        baseline_right_wrist_forward=left_result.baseline_right_wrist_forward,
        baseline_stance_span=left_result.baseline_stance_span,
    )

    assert left_hold_result.state == "left_punch"
    assert left_hold_result.step_count == 1
    assert left_hold_result.left_armed is False

    release_frame = build_diagonal_body_punch_frame()
    release_result = evaluator.evaluate(
        frame=release_frame,
        previous_state=left_hold_result.state,
        step_count=left_hold_result.step_count,
        target_steps=8,
        last_counted_side=left_hold_result.last_counted_side,
        last_seen_side=left_hold_result.last_seen_side,
        left_armed=left_hold_result.left_armed,
        right_armed=left_hold_result.right_armed,
        reference_hip_x=left_hold_result.reference_hip_x,
        reference_hip_y=left_hold_result.reference_hip_y,
        reference_scale=left_hold_result.reference_scale,
        displayed_feedback_code=left_hold_result.displayed_feedback_code,
        displayed_feedback_text=left_hold_result.displayed_feedback_text,
        displayed_feedback_frames=left_hold_result.displayed_feedback_frames,
        candidate_feedback_code=left_hold_result.candidate_feedback_code,
        candidate_feedback_text=left_hold_result.candidate_feedback_text,
        candidate_feedback_streak=left_hold_result.candidate_feedback_streak,
        representative_feedback_totals=left_hold_result.representative_feedback_totals,
        representative_feedback_code=left_hold_result.representative_feedback_code,
        representative_feedback_text=left_hold_result.representative_feedback_text,
        representative_feedback_frames=left_hold_result.representative_feedback_frames,
        baseline_left_wrist_forward=left_hold_result.baseline_left_wrist_forward,
        baseline_right_wrist_forward=left_hold_result.baseline_right_wrist_forward,
        baseline_stance_span=left_hold_result.baseline_stance_span,
    )

    assert release_result.state == "idle"
    assert release_result.left_armed is True

    right_punch_frame = build_diagonal_body_punch_frame(
        right_wrist_x=1.70,
        right_elbow_x=1.20,
        left_elbow_x=-0.65,
        stance_span=2.30,
    )
    right_result = evaluator.evaluate(
        frame=right_punch_frame,
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
        baseline_left_wrist_forward=release_result.baseline_left_wrist_forward,
        baseline_right_wrist_forward=release_result.baseline_right_wrist_forward,
        baseline_stance_span=release_result.baseline_stance_span,
    )

    assert right_result.state == "right_punch"
    assert right_result.step_count == 2
    assert right_result.right_armed is False


def test_diagonal_body_punch_counts_forward_progress_even_with_narrow_stance() -> None:
    evaluator = DiagonalBodyPunchEvaluator()

    neutral_result = evaluator.evaluate(
        frame=build_diagonal_body_punch_frame(),
        previous_state="idle",
        step_count=0,
        target_steps=8,
    )

    result = evaluator.evaluate(
        frame=build_diagonal_body_punch_frame(
            left_wrist_x=-1.70,
            left_elbow_x=-1.20,
            right_elbow_x=0.65,
            stance_span=1.30,
        ),
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
        baseline_left_wrist_forward=neutral_result.baseline_left_wrist_forward,
        baseline_right_wrist_forward=neutral_result.baseline_right_wrist_forward,
        baseline_stance_span=neutral_result.baseline_stance_span,
    )

    assert result.state == "left_punch"
    assert result.step_count == 1
    assert result.frame_label == "motion_present"
    assert result.candidate_feedback_code == "WIDEN_PUNCH_STANCE"


def build_diagonal_body_punch_frame(
    left_wrist_x: float = -0.80,
    right_wrist_x: float = 0.80,
    left_elbow_x: float = -0.70,
    right_elbow_x: float = 0.70,
    stance_span: float = 1.30,
) -> NormalizedPoseFrame:
    left_ankle_x = -stance_span / 2.0
    right_ankle_x = stance_span / 2.0
    landmarks = {
        "LEFT_SHOULDER": landmark("LEFT_SHOULDER", -0.55, -1.10),
        "RIGHT_SHOULDER": landmark("RIGHT_SHOULDER", 0.55, -1.10),
        "LEFT_ELBOW": landmark("LEFT_ELBOW", left_elbow_x, -0.95),
        "RIGHT_ELBOW": landmark("RIGHT_ELBOW", right_elbow_x, -0.95),
        "LEFT_WRIST": landmark("LEFT_WRIST", left_wrist_x, -0.90),
        "RIGHT_WRIST": landmark("RIGHT_WRIST", right_wrist_x, -0.90),
        "LEFT_HIP": landmark("LEFT_HIP", -0.35, 0.0),
        "RIGHT_HIP": landmark("RIGHT_HIP", 0.35, 0.0),
        "LEFT_KNEE": landmark("LEFT_KNEE", -0.55, 1.05),
        "RIGHT_KNEE": landmark("RIGHT_KNEE", 0.55, 1.05),
        "LEFT_ANKLE": landmark("LEFT_ANKLE", left_ankle_x, 2.10),
        "RIGHT_ANKLE": landmark("RIGHT_ANKLE", right_ankle_x, 2.10),
    }
    return NormalizedPoseFrame(
        tracking="tracking_ok",
        timestamp_ms=0,
        scale_reference=1.0,
        hip_center=HipCenter(x=0.5, y=0.5),
        landmarks=landmarks,
    )


def landmark(name: str, x: float, y: float) -> NormalizedLandmark:
    return NormalizedLandmark(
        name=name,
        x=x,
        y=y,
        z=0.0,
        confidence=1.0,
    )
