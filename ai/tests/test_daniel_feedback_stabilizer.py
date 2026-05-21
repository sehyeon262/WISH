from app.services.gymnastics.feedback.common import PRESS_HANDS_FORWARD, TRACKING_LOW
from app.services.gymnastics.feedback.stabilizer import (
    FeedbackStabilizerState,
    stabilize_daniel_feedback,
)


def make_state(
    *,
    displayed_code: str | None = None,
    displayed_text: str | None = None,
    displayed_frames: int = 0,
    candidate_code: str | None = None,
    candidate_text: str | None = None,
    candidate_streak: int = 0,
) -> FeedbackStabilizerState:
    return FeedbackStabilizerState(
        displayed_code=displayed_code,
        displayed_text=displayed_text,
        displayed_frames=displayed_frames,
        candidate_code=candidate_code,
        candidate_text=candidate_text,
        candidate_streak=candidate_streak,
    )


def test_idle_feedback_requires_streak_before_display() -> None:
    first = stabilize_daniel_feedback(
        candidate=PRESS_HANDS_FORWARD,
        motion_state="idle",
        state=make_state(),
        streak_threshold=2,
        display_frames=24,
        clear_frames=1,
    )
    assert first.displayed_text is None
    assert first.candidate_streak == 1

    second = stabilize_daniel_feedback(
        candidate=PRESS_HANDS_FORWARD,
        motion_state="idle",
        state=first,
        streak_threshold=2,
        display_frames=24,
        clear_frames=1,
    )
    assert second.displayed_text == PRESS_HANDS_FORWARD.text
    assert second.displayed_frames == 24


def test_holding_state_clears_previous_posture_feedback_immediately() -> None:
    cleared = stabilize_daniel_feedback(
        candidate=None,
        motion_state="holding",
        state=make_state(
            displayed_code=PRESS_HANDS_FORWARD.code,
            displayed_text=PRESS_HANDS_FORWARD.text,
            displayed_frames=18,
            candidate_code=PRESS_HANDS_FORWARD.code,
            candidate_text=PRESS_HANDS_FORWARD.text,
            candidate_streak=5,
        ),
        streak_threshold=2,
        display_frames=24,
        clear_frames=1,
    )

    assert cleared.displayed_text is None
    assert cleared.displayed_frames == 0
    assert cleared.candidate_text is None


def test_complete_state_clears_previous_posture_feedback_immediately() -> None:
    cleared = stabilize_daniel_feedback(
        candidate=None,
        motion_state="complete",
        state=make_state(
            displayed_code=PRESS_HANDS_FORWARD.code,
            displayed_text=PRESS_HANDS_FORWARD.text,
            displayed_frames=10,
            candidate_code=PRESS_HANDS_FORWARD.code,
            candidate_text=PRESS_HANDS_FORWARD.text,
            candidate_streak=3,
        ),
        streak_threshold=2,
        display_frames=24,
        clear_frames=1,
    )

    assert cleared.displayed_text is None
    assert cleared.displayed_frames == 0
    assert cleared.candidate_text is None


def test_tracking_low_is_displayed_immediately_even_during_holding() -> None:
    tracked = stabilize_daniel_feedback(
        candidate=TRACKING_LOW,
        motion_state="holding",
        state=make_state(),
        streak_threshold=4,
        display_frames=24,
        clear_frames=1,
    )

    assert tracked.displayed_text == TRACKING_LOW.text
    assert tracked.displayed_frames == 24
    assert tracked.candidate_streak == 1


def test_suppress_candidate_clears_feedback_immediately() -> None:
    cleared = stabilize_daniel_feedback(
        candidate=PRESS_HANDS_FORWARD,
        motion_state="idle",
        state=make_state(
            displayed_code=PRESS_HANDS_FORWARD.code,
            displayed_text=PRESS_HANDS_FORWARD.text,
            displayed_frames=8,
            candidate_code=PRESS_HANDS_FORWARD.code,
            candidate_text=PRESS_HANDS_FORWARD.text,
            candidate_streak=2,
        ),
        streak_threshold=2,
        display_frames=24,
        clear_frames=1,
        suppress_candidate=True,
    )

    assert cleared.displayed_text is None
    assert cleared.displayed_frames == 0
    assert cleared.candidate_text is None
