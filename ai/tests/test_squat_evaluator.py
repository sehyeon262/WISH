from app.services.gymnastics.evaluators.base import EvaluatorResult
from app.services.gymnastics.evaluators.squat import SquatEvaluator
from app.services.gymnastics.types import HipCenter, NormalizedLandmark, NormalizedPoseFrame


def test_squat_collects_average_reference_before_counting() -> None:
    evaluator = SquatEvaluator()

    first = evaluator.evaluate(
        frame=build_squat_frame(hip_y=0.50),
        previous_state="idle",
        step_count=0,
        target_steps=8,
        baseline_status="collecting",
        baseline_target_frames=2,
    )
    second = evaluator.evaluate(
        frame=build_squat_frame(hip_y=0.52),
        previous_state=first.state,
        step_count=first.step_count,
        target_steps=8,
        reference_hip_x=first.reference_hip_x,
        reference_hip_y=first.reference_hip_y,
        reference_scale=first.reference_scale,
        baseline_status=first.baseline_status,
        baseline_frames=first.baseline_frames,
        baseline_target_frames=first.baseline_target_frames,
    )

    assert second.baseline_status == "ready"
    assert second.baseline_frames == 2
    assert round(second.reference_hip_y or 0.0, 2) == 0.51
    assert second.step_count == 0

    result = evaluator.evaluate(
        frame=build_squat_frame(hip_y=0.60),
        previous_state=second.state,
        step_count=second.step_count,
        target_steps=8,
        reference_hip_x=second.reference_hip_x,
        reference_hip_y=second.reference_hip_y,
        reference_scale=second.reference_scale,
        baseline_status=second.baseline_status,
        baseline_frames=second.baseline_frames,
        baseline_target_frames=second.baseline_target_frames,
    )

    assert result.state == "descending"
    assert result.step_count == 0


def test_squat_counts_rep_on_full_cycle() -> None:
    """idle → descending → bottom → ascending → idle 사이클이 1회 카운트."""
    evaluator = SquatEvaluator()

    # 1. baseline 수립 (서 있는 자세)
    standing = build_squat_frame(hip_y=0.50)
    init = evaluator.evaluate(frame=standing, previous_state="idle", step_count=0, target_steps=8)
    assert init.state == "idle"
    assert init.step_count == 0

    # 2. 내려가는 중 (hip_drop > descend_threshold=0.08)
    descending = build_squat_frame(hip_y=0.60)
    desc_result = _evaluate(evaluator, descending, init)
    assert desc_result.state == "descending"
    assert desc_result.frame_label == "attempting"

    # 3. 충분히 앉음 (hip_drop >= bottom_threshold=0.30)
    bottom = build_squat_frame(hip_y=0.80)
    bot_result = _evaluate(evaluator, bottom, desc_result)
    assert bot_result.state == "bottom"
    assert bot_result.frame_label == "motion_present"

    # 4. 올라오는 중 (return_threshold < hip_drop < bottom_threshold)
    ascending = build_squat_frame(hip_y=0.65)
    asc_result = _evaluate(evaluator, ascending, bot_result)
    assert asc_result.state == "ascending"

    # 5. 복귀 (hip_drop <= return_threshold=0.03) → 카운트
    returned = build_squat_frame(hip_y=0.51)
    done_result = _evaluate(evaluator, returned, asc_result)
    assert done_result.state == "idle"
    assert done_result.step_count == 1


def test_squat_no_count_without_reaching_bottom() -> None:
    """bottom에 도달하지 않고 복귀하면 카운트 없음."""
    evaluator = SquatEvaluator()

    standing = build_squat_frame(hip_y=0.50)
    init = evaluator.evaluate(frame=standing, previous_state="idle", step_count=0, target_steps=8)

    # 얕게 내려갔다가 복귀 (bottom_threshold 미달)
    shallow = build_squat_frame(hip_y=0.60)
    desc_result = _evaluate(evaluator, shallow, init)
    assert desc_result.state == "descending"

    returned = build_squat_frame(hip_y=0.51)
    back_result = _evaluate(evaluator, returned, desc_result)
    assert back_result.state == "idle"
    assert back_result.step_count == 0


def test_squat_reaches_complete_at_target() -> None:
    """목표 횟수 달성 시 complete로 전환."""
    evaluator = SquatEvaluator()

    standing = build_squat_frame(hip_y=0.50)
    result = evaluator.evaluate(frame=standing, previous_state="idle", step_count=0, target_steps=2)

    # 2회 반복
    for _ in range(2):
        result = _evaluate(evaluator, build_squat_frame(hip_y=0.60), result, target_steps=2)   # descending
        result = _evaluate(evaluator, build_squat_frame(hip_y=0.80), result, target_steps=2)   # bottom
        result = _evaluate(evaluator, build_squat_frame(hip_y=0.65), result, target_steps=2)   # ascending
        result = _evaluate(evaluator, build_squat_frame(hip_y=0.51), result, target_steps=2)   # idle+count

    assert result.state == "complete"
    assert result.step_count == 2


def test_squat_state_stays_idle_without_sufficient_drop() -> None:
    """noise 수준의 hip 움직임(descend_threshold 미달)은 idle 유지."""
    evaluator = SquatEvaluator()

    standing = build_squat_frame(hip_y=0.50)
    init = evaluator.evaluate(frame=standing, previous_state="idle", step_count=0, target_steps=8)

    # hip_drop = (0.53 - 0.50) / 1.0 = 0.03 < descend_threshold(0.08)
    noise = build_squat_frame(hip_y=0.53)
    result = _evaluate(evaluator, noise, init)
    assert result.state == "idle"


def _evaluate(evaluator: SquatEvaluator, frame: NormalizedPoseFrame, prev: EvaluatorResult, target_steps: int = 8) -> EvaluatorResult:
    return evaluator.evaluate(
        frame=frame,
        previous_state=prev.state,
        step_count=prev.step_count,
        target_steps=target_steps,
        reference_hip_x=prev.reference_hip_x,
        reference_hip_y=prev.reference_hip_y,
        reference_scale=prev.reference_scale,
        displayed_feedback_code=prev.displayed_feedback_code,
        displayed_feedback_text=prev.displayed_feedback_text,
        displayed_feedback_frames=prev.displayed_feedback_frames,
        candidate_feedback_code=prev.candidate_feedback_code,
        candidate_feedback_text=prev.candidate_feedback_text,
        candidate_feedback_streak=prev.candidate_feedback_streak,
        representative_feedback_totals=prev.representative_feedback_totals,
        representative_feedback_code=prev.representative_feedback_code,
        representative_feedback_text=prev.representative_feedback_text,
        representative_feedback_frames=prev.representative_feedback_frames,
    )


def build_squat_frame(hip_y: float = 0.50) -> NormalizedPoseFrame:
    """
    hip_y: hip_center.y (screen coordinates, 0-1).
    reference_hip_y는 0.50으로 캘리브레이션된다고 가정.
    hip_drop = (hip_y - 0.50) / 1.0
    """
    landmarks = {
        "LEFT_SHOULDER": landmark(-0.30, -1.10),
        "RIGHT_SHOULDER": landmark(0.30, -1.10),
        "LEFT_HIP": landmark(-0.20, 0.0),
        "RIGHT_HIP": landmark(0.20, 0.0),
        "LEFT_KNEE": landmark(-0.25, 1.05),
        "RIGHT_KNEE": landmark(0.25, 1.05),
        "LEFT_ANKLE": landmark(-0.25, 2.10),
        "RIGHT_ANKLE": landmark(0.25, 2.10),
    }
    return NormalizedPoseFrame(
        tracking="tracking_ok",
        timestamp_ms=0,
        scale_reference=1.0,
        hip_center=HipCenter(x=0.5, y=hip_y),
        landmarks=landmarks,
    )


def landmark(x: float, y: float) -> NormalizedLandmark:
    return NormalizedLandmark(name="", x=x, y=y, z=0.0, confidence=1.0)

