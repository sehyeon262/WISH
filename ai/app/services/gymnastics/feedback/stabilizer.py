from dataclasses import dataclass

from app.services.gymnastics.feedback.common import FeedbackCandidate, TRACKING_LOW


DANIEL_STABILIZER_ALLOWED_STATES = frozenset({"idle", "holding", "complete"})


@dataclass(slots=True)
class FeedbackStabilizerState:
    displayed_code: str | None
    displayed_text: str | None
    displayed_frames: int
    candidate_code: str | None
    candidate_text: str | None
    candidate_streak: int


def clear_feedback_state() -> FeedbackStabilizerState:
    return FeedbackStabilizerState(
        displayed_code=None,
        displayed_text=None,
        displayed_frames=0,
        candidate_code=None,
        candidate_text=None,
        candidate_streak=0,
    )


def stabilize_feedback(
    candidate: FeedbackCandidate | None,
    state: FeedbackStabilizerState,
    streak_threshold: int,
    display_frames: int,
    clear_frames: int,
) -> FeedbackStabilizerState:
    next_candidate_code = candidate.code if candidate is not None else None
    next_candidate_text = candidate.text if candidate is not None else None

    same_candidate = (
        next_candidate_code == state.candidate_code
        and next_candidate_text == state.candidate_text
    )
    next_candidate_streak = state.candidate_streak + 1 if same_candidate else 1

    displayed_code = state.displayed_code
    displayed_text = state.displayed_text
    remaining_frames = max(state.displayed_frames - 1, 0)

    if candidate is not None:
        if displayed_code == candidate.code and displayed_text == candidate.text:
            remaining_frames = display_frames
        elif next_candidate_streak >= streak_threshold and state.displayed_frames <= 0:
            displayed_code = candidate.code
            displayed_text = candidate.text
            remaining_frames = display_frames
    else:
        if displayed_text is not None and next_candidate_streak >= clear_frames:
            displayed_code = None
            displayed_text = None
            remaining_frames = 0

    if remaining_frames <= 0 and candidate is None:
        displayed_code = None
        displayed_text = None

    return FeedbackStabilizerState(
        displayed_code=displayed_code,
        displayed_text=displayed_text,
        displayed_frames=remaining_frames,
        candidate_code=next_candidate_code,
        candidate_text=next_candidate_text,
        candidate_streak=next_candidate_streak,
    )


def stabilize_daniel_feedback(
    *,
    candidate: FeedbackCandidate | None,
    motion_state: str,
    state: FeedbackStabilizerState,
    streak_threshold: int,
    display_frames: int,
    clear_frames: int,
    suppress_candidate: bool = False,
) -> FeedbackStabilizerState:
    if motion_state not in DANIEL_STABILIZER_ALLOWED_STATES:
        raise ValueError(
            f"Unsupported daniel feedback motion_state: {motion_state!r}. "
            f"Expected one of {sorted(DANIEL_STABILIZER_ALLOWED_STATES)}."
        )

    if suppress_candidate:
        return clear_feedback_state()

    if motion_state in {"holding", "complete"} and (
        candidate is None or candidate.code != TRACKING_LOW.code
    ):
        return clear_feedback_state()

    if candidate is not None and candidate.code == TRACKING_LOW.code:
        same_candidate = (
            candidate.code == state.candidate_code
            and candidate.text == state.candidate_text
        )
        next_candidate_streak = state.candidate_streak + 1 if same_candidate else 1
        return FeedbackStabilizerState(
            displayed_code=candidate.code,
            displayed_text=candidate.text,
            displayed_frames=display_frames,
            candidate_code=candidate.code,
            candidate_text=candidate.text,
            candidate_streak=next_candidate_streak,
        )

    return stabilize_feedback(
        candidate=candidate,
        state=state,
        streak_threshold=streak_threshold,
        display_frames=display_frames,
        clear_frames=clear_frames,
    )
