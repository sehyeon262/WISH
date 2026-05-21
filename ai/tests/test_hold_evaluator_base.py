from app.services.gymnastics.evaluators.base import BaseHoldEvaluator, HoldEvaluatorConfig
from app.services.gymnastics.types import HipCenter, NormalizedPoseFrame


class DummyHoldEvaluator(BaseHoldEvaluator):
    motion_id = "dummy_hold"

    def evaluate(self, *args, **kwargs):  # pragma: no cover - not used in these unit tests
        raise NotImplementedError


def make_frame(
    *,
    tracking: str = "tracking_ok",
    timestamp_ms: int = 0,
    hip_x: float = 0.5,
    hip_y: float = 0.6,
    scale_reference: float = 1.2,
) -> NormalizedPoseFrame:
    return NormalizedPoseFrame(
        tracking=tracking,
        timestamp_ms=timestamp_ms,
        scale_reference=scale_reference,
        hip_center=HipCenter(x=hip_x, y=hip_y),
        landmarks={},
    )


def test_reference_is_captured_only_on_tracking_ok_frame() -> None:
    evaluator = DummyHoldEvaluator()

    tracking_low_frame = make_frame(tracking="tracking_low", hip_x=0.1, hip_y=0.2, scale_reference=0.3)
    reference = evaluator._capture_reference_if_needed(tracking_low_frame, None, None, None)
    assert reference == (None, None, None)

    tracking_ok_frame = make_frame(tracking="tracking_ok", hip_x=0.45, hip_y=0.55, scale_reference=1.15)
    reference = evaluator._capture_reference_if_needed(tracking_ok_frame, None, None, None)
    assert reference == (0.45, 0.55, 1.15)


def test_first_valid_hold_frame_enters_holding_without_accumulating_extra_time() -> None:
    evaluator = DummyHoldEvaluator(HoldEvaluatorConfig(target_hold_ms=10_000, max_frame_gap_ms=250))

    progress = evaluator._update_hold_progress(
        previous_state="idle",
        previous_hold_duration_ms=0,
        previous_hold_last_timestamp_ms=None,
        frame_timestamp_ms=1_000,
        is_pose_valid=True,
    )

    assert progress.state == "holding"
    assert progress.hold_duration_ms == 0
    assert progress.hold_last_timestamp_ms == 1_000
    assert progress.hold_completed is False


def test_valid_hold_frames_accumulate_time_with_frame_gap_clamp() -> None:
    evaluator = DummyHoldEvaluator(HoldEvaluatorConfig(target_hold_ms=10_000, max_frame_gap_ms=250))

    progress = evaluator._update_hold_progress(
        previous_state="holding",
        previous_hold_duration_ms=900,
        previous_hold_last_timestamp_ms=1_000,
        frame_timestamp_ms=1_800,
        is_pose_valid=True,
    )

    assert progress.state == "holding"
    assert progress.hold_duration_ms == 1_150
    assert progress.hold_last_timestamp_ms == 1_800
    assert progress.hold_completed is False


def test_invalid_frame_preserves_accumulated_hold_and_returns_idle() -> None:
    evaluator = DummyHoldEvaluator(HoldEvaluatorConfig(target_hold_ms=10_000, max_frame_gap_ms=250))

    progress = evaluator._update_hold_progress(
        previous_state="holding",
        previous_hold_duration_ms=2_400,
        previous_hold_last_timestamp_ms=1_000,
        frame_timestamp_ms=1_100,
        is_pose_valid=False,
    )

    assert progress.state == "idle"
    assert progress.hold_duration_ms == 2_400
    assert progress.hold_last_timestamp_ms is None
    assert progress.hold_completed is False


def test_valid_frame_resumes_accumulated_hold_when_timestamp_was_cleared() -> None:
    evaluator = DummyHoldEvaluator(HoldEvaluatorConfig(target_hold_ms=10_000, max_frame_gap_ms=250))

    progress = evaluator._update_hold_progress(
        previous_state="idle",
        previous_hold_duration_ms=2_400,
        previous_hold_last_timestamp_ms=None,
        frame_timestamp_ms=1_200,
        is_pose_valid=True,
    )

    assert progress.state == "holding"
    assert progress.hold_duration_ms == 2_400
    assert progress.hold_last_timestamp_ms == 1_200
    assert progress.hold_completed is False


def test_hold_reaches_complete_when_target_duration_is_met() -> None:
    evaluator = DummyHoldEvaluator(HoldEvaluatorConfig(target_hold_ms=1_000, max_frame_gap_ms=250))

    progress = evaluator._update_hold_progress(
        previous_state="holding",
        previous_hold_duration_ms=900,
        previous_hold_last_timestamp_ms=0,
        frame_timestamp_ms=200,
        is_pose_valid=True,
    )

    assert progress.state == "complete"
    assert progress.hold_duration_ms == 1_000
    assert progress.hold_last_timestamp_ms == 200
    assert progress.hold_completed is True


def test_session_progress_accumulates_elapsed_time_without_pose_validity() -> None:
    evaluator = DummyHoldEvaluator(HoldEvaluatorConfig(target_hold_ms=10_000, max_frame_gap_ms=250))

    progress = evaluator._update_session_progress(
        previous_state="idle",
        previous_hold_duration_ms=0,
        previous_hold_last_timestamp_ms=None,
        frame_timestamp_ms=1_000,
    )

    assert progress.state == "holding"
    assert progress.hold_duration_ms == 0
    assert progress.hold_last_timestamp_ms == 1_000
    assert progress.hold_completed is False

    progress = evaluator._update_session_progress(
        previous_state="idle",
        previous_hold_duration_ms=progress.hold_duration_ms,
        previous_hold_last_timestamp_ms=progress.hold_last_timestamp_ms,
        frame_timestamp_ms=1_350,
    )

    assert progress.hold_duration_ms == 250
    assert progress.hold_last_timestamp_ms == 1_350
    assert progress.hold_completed is False


def test_session_progress_resets_after_complete_state_for_new_session() -> None:
    evaluator = DummyHoldEvaluator(HoldEvaluatorConfig(target_hold_ms=1_000, max_frame_gap_ms=250))

    progress = evaluator._update_session_progress(
        previous_state="complete",
        previous_hold_duration_ms=1_000,
        previous_hold_last_timestamp_ms=2_000,
        frame_timestamp_ms=2_500,
    )

    assert progress.state == "holding"
    assert progress.hold_duration_ms == 0
    assert progress.hold_last_timestamp_ms == 2_500
    assert progress.hold_completed is False


def test_session_progress_resets_when_timestamp_rewinds() -> None:
    evaluator = DummyHoldEvaluator(HoldEvaluatorConfig(target_hold_ms=10_000, max_frame_gap_ms=250))

    progress = evaluator._update_session_progress(
        previous_state="idle",
        previous_hold_duration_ms=700,
        previous_hold_last_timestamp_ms=2_000,
        frame_timestamp_ms=1_500,
    )

    assert progress.state == "holding"
    assert progress.hold_duration_ms == 0
    assert progress.hold_last_timestamp_ms == 1_500
    assert progress.hold_completed is False
