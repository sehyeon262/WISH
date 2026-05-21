from app.services.gymnastics.evaluators.diagonal_face_punch import DiagonalFacePunchEvaluator
from app.services.gymnastics.types import HipCenter, NormalizedLandmark, NormalizedPoseFrame


def test_diagonal_face_punch_uses_baseline_relative_hand_height() -> None:
    evaluator = DiagonalFacePunchEvaluator()

    baseline = evaluator.evaluate(
        frame=build_diagonal_face_punch_frame(left_wrist_y=-1.20),
        previous_state="idle",
        step_count=0,
        target_steps=8,
        baseline_status="collecting",
        baseline_target_frames=1,
    )

    assert baseline.baseline_status == "ready"
    assert baseline.baseline_left_wrist_height is not None
    assert baseline.step_count == 0

    near_baseline = evaluator.evaluate(
        frame=build_diagonal_face_punch_frame(
            left_wrist_x=-1.70,
            left_wrist_y=-1.25,
            left_elbow_x=-1.20,
            left_elbow_y=-1.12,
        ),
        previous_state=baseline.state,
        step_count=baseline.step_count,
        target_steps=8,
        reference_hip_x=baseline.reference_hip_x,
        reference_hip_y=baseline.reference_hip_y,
        reference_scale=baseline.reference_scale,
        baseline_status=baseline.baseline_status,
        baseline_frames=baseline.baseline_frames,
        baseline_target_frames=baseline.baseline_target_frames,
        baseline_left_wrist_forward=baseline.baseline_left_wrist_forward,
        baseline_right_wrist_forward=baseline.baseline_right_wrist_forward,
        baseline_left_wrist_height=baseline.baseline_left_wrist_height,
        baseline_right_wrist_height=baseline.baseline_right_wrist_height,
        baseline_stance_span=baseline.baseline_stance_span,
    )

    assert near_baseline.state == "idle"
    assert near_baseline.step_count == 0

    result = evaluator.evaluate(
        frame=build_diagonal_face_punch_frame(
            left_wrist_x=-1.70,
            left_wrist_y=-1.32,
            left_elbow_x=-1.20,
            left_elbow_y=-1.12,
        ),
        previous_state=near_baseline.state,
        step_count=near_baseline.step_count,
        target_steps=8,
        reference_hip_x=near_baseline.reference_hip_x,
        reference_hip_y=near_baseline.reference_hip_y,
        reference_scale=near_baseline.reference_scale,
        baseline_status=near_baseline.baseline_status,
        baseline_frames=near_baseline.baseline_frames,
        baseline_target_frames=near_baseline.baseline_target_frames,
        baseline_left_wrist_forward=near_baseline.baseline_left_wrist_forward,
        baseline_right_wrist_forward=near_baseline.baseline_right_wrist_forward,
        baseline_left_wrist_height=near_baseline.baseline_left_wrist_height,
        baseline_right_wrist_height=near_baseline.baseline_right_wrist_height,
        baseline_stance_span=near_baseline.baseline_stance_span,
    )

    assert result.state == "left_punch"
    assert result.step_count == 1


def test_diagonal_face_punch_counts_alternating_punches() -> None:
    evaluator = DiagonalFacePunchEvaluator()

    neutral_frame = build_diagonal_face_punch_frame()
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

    left_punch_frame = build_diagonal_face_punch_frame(
        left_wrist_x=-1.70,
        left_wrist_y=-1.28,
        left_elbow_x=-1.20,
        left_elbow_y=-1.12,
        right_elbow_x=0.65,
        stance_span=2.20,
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

    release_frame = build_diagonal_face_punch_frame()
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
        baseline_left_wrist_forward=left_result.baseline_left_wrist_forward,
        baseline_right_wrist_forward=left_result.baseline_right_wrist_forward,
        baseline_stance_span=left_result.baseline_stance_span,
    )

    assert release_result.state == "idle"
    assert release_result.left_armed is True

    right_punch_frame = build_diagonal_face_punch_frame(
        right_wrist_x=1.70,
        right_wrist_y=-1.28,
        right_elbow_x=1.20,
        right_elbow_y=-1.12,
        left_elbow_x=-0.65,
        stance_span=2.20,
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


def test_diagonal_face_punch_requires_punch_height() -> None:
    evaluator = DiagonalFacePunchEvaluator()

    neutral_result = evaluator.evaluate(
        frame=build_diagonal_face_punch_frame(),
        previous_state="idle",
        step_count=0,
        target_steps=8,
    )

    low_punch_result = evaluator.evaluate(
        frame=build_diagonal_face_punch_frame(
            left_wrist_x=-1.70,
            left_wrist_y=-0.92,
            left_elbow_x=-1.20,
            left_elbow_y=-0.98,
            stance_span=2.20,
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

    assert low_punch_result.state == "idle"
    assert low_punch_result.step_count == 0


def test_diagonal_face_punch_counts_high_hand_even_when_forward_is_short() -> None:
    evaluator = DiagonalFacePunchEvaluator()

    neutral_result = evaluator.evaluate(
        frame=build_diagonal_face_punch_frame(),
        previous_state="idle",
        step_count=0,
        target_steps=8,
    )

    result = evaluator.evaluate(
        frame=build_diagonal_face_punch_frame(
            left_wrist_x=-0.90,
            left_wrist_y=-1.28,
            left_elbow_x=-0.85,
            left_elbow_y=-1.12,
            stance_span=2.20,
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
    assert result.candidate_feedback_code == "PUNCH_FURTHER"


def test_punch_hold_via_previous_state() -> None:
    """punch 자세 유지 중 strict 조건 미달이어도 previous_state로 hold 유지."""
    evaluator = DiagonalFacePunchEvaluator()

    neutral = evaluator.evaluate(
        frame=build_diagonal_face_punch_frame(),
        previous_state="idle",
        step_count=0,
        target_steps=8,
    )

    # right_wrist_forward = max(1.20 - 0.55, 0) - 0.25 = 0.40
    # 0.30 < 0.40 < 0.60 : release 초과, punch 미달 → hold 조건 충족
    partial_retract = build_diagonal_face_punch_frame(
        right_wrist_x=1.20,
        right_wrist_y=-1.15,
        right_elbow_x=0.90,
        right_elbow_y=-1.05,
    )
    result = evaluator.evaluate(
        frame=partial_retract,
        previous_state="right_punch",
        step_count=neutral.step_count,
        target_steps=8,
        last_seen_side="right",
        baseline_left_wrist_forward=neutral.baseline_left_wrist_forward,
        baseline_right_wrist_forward=neutral.baseline_right_wrist_forward,
        baseline_stance_span=neutral.baseline_stance_span,
        reference_hip_x=neutral.reference_hip_x,
        reference_hip_y=neutral.reference_hip_y,
        reference_scale=neutral.reference_scale,
    )

    assert result.state == "right_punch"


def test_punch_hold_via_last_seen_side() -> None:
    """previous_state가 idle이어도 last_seen_side로 brief idle 동안 hold 유지."""
    evaluator = DiagonalFacePunchEvaluator()

    neutral = evaluator.evaluate(
        frame=build_diagonal_face_punch_frame(),
        previous_state="idle",
        step_count=0,
        target_steps=8,
    )

    partial_retract = build_diagonal_face_punch_frame(
        right_wrist_x=1.20,
        right_wrist_y=-1.15,
        right_elbow_x=0.90,
        right_elbow_y=-1.05,
    )
    result = evaluator.evaluate(
        frame=partial_retract,
        previous_state="idle",
        step_count=neutral.step_count,
        target_steps=8,
        last_seen_side="right",
        baseline_left_wrist_forward=neutral.baseline_left_wrist_forward,
        baseline_right_wrist_forward=neutral.baseline_right_wrist_forward,
        baseline_stance_span=neutral.baseline_stance_span,
        reference_hip_x=neutral.reference_hip_x,
        reference_hip_y=neutral.reference_hip_y,
        reference_scale=neutral.reference_scale,
    )

    assert result.state == "right_punch"


def test_punch_releases_to_idle_when_arm_drops() -> None:
    """손목이 release_threshold 이하로 내려가면 idle로 전환."""
    evaluator = DiagonalFacePunchEvaluator()

    neutral = evaluator.evaluate(
        frame=build_diagonal_face_punch_frame(),
        previous_state="idle",
        step_count=0,
        target_steps=8,
    )

    # right_wrist_forward = max(1.00 - 0.55, 0) - 0.25 = 0.20 < release_threshold (0.30)
    dropped_arm = build_diagonal_face_punch_frame(right_wrist_x=1.00)
    result = evaluator.evaluate(
        frame=dropped_arm,
        previous_state="right_punch",
        step_count=neutral.step_count,
        target_steps=8,
        last_seen_side="right",
        baseline_left_wrist_forward=neutral.baseline_left_wrist_forward,
        baseline_right_wrist_forward=neutral.baseline_right_wrist_forward,
        baseline_stance_span=neutral.baseline_stance_span,
        reference_hip_x=neutral.reference_hip_x,
        reference_hip_y=neutral.reference_hip_y,
        reference_scale=neutral.reference_scale,
    )

    assert result.state == "idle"


def test_no_hold_when_last_seen_side_is_none() -> None:
    """last_seen_side가 None이고 previous_state가 idle이면 hold 없이 idle 반환."""
    evaluator = DiagonalFacePunchEvaluator()

    neutral = evaluator.evaluate(
        frame=build_diagonal_face_punch_frame(),
        previous_state="idle",
        step_count=0,
        target_steps=8,
    )

    partial_retract = build_diagonal_face_punch_frame(
        right_wrist_x=1.20,
        right_wrist_y=-1.15,
        right_elbow_x=0.90,
        right_elbow_y=-1.05,
    )
    result = evaluator.evaluate(
        frame=partial_retract,
        previous_state="idle",
        step_count=neutral.step_count,
        target_steps=8,
        last_seen_side=None,
        baseline_left_wrist_forward=neutral.baseline_left_wrist_forward,
        baseline_right_wrist_forward=neutral.baseline_right_wrist_forward,
        baseline_stance_span=neutral.baseline_stance_span,
        reference_hip_x=neutral.reference_hip_x,
        reference_hip_y=neutral.reference_hip_y,
        reference_scale=neutral.reference_scale,
    )

    assert result.state == "idle"


def build_diagonal_face_punch_frame(
    left_wrist_x: float = -0.80,
    right_wrist_x: float = 0.80,
    left_wrist_y: float = -0.90,
    right_wrist_y: float = -0.90,
    left_elbow_x: float = -0.70,
    right_elbow_x: float = 0.70,
    left_elbow_y: float = -0.95,
    right_elbow_y: float = -0.95,
    stance_span: float = 1.30,
) -> NormalizedPoseFrame:
    left_ankle_x = -stance_span / 2.0
    right_ankle_x = stance_span / 2.0
    landmarks = {
        "LEFT_SHOULDER": landmark("LEFT_SHOULDER", -0.55, -1.10),
        "RIGHT_SHOULDER": landmark("RIGHT_SHOULDER", 0.55, -1.10),
        "LEFT_ELBOW": landmark("LEFT_ELBOW", left_elbow_x, left_elbow_y),
        "RIGHT_ELBOW": landmark("RIGHT_ELBOW", right_elbow_x, right_elbow_y),
        "LEFT_WRIST": landmark("LEFT_WRIST", left_wrist_x, left_wrist_y),
        "RIGHT_WRIST": landmark("RIGHT_WRIST", right_wrist_x, right_wrist_y),
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
    return NormalizedLandmark(name=name, x=x, y=y, z=0.0, confidence=1.0)
