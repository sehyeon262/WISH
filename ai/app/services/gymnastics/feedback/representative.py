from dataclasses import dataclass, field


@dataclass(slots=True)
class RepresentativeFeedbackState:
    totals: dict[str, int] = field(default_factory=dict)
    representative_code: str | None = None
    representative_text: str | None = None
    representative_frames: int = 0


def update_representative_feedback(
    displayed_code: str | None,
    displayed_text: str | None,
    state: RepresentativeFeedbackState,
) -> RepresentativeFeedbackState:
    if displayed_code is None or displayed_text is None:
        return RepresentativeFeedbackState(
            totals=dict(state.totals),
            representative_code=state.representative_code,
            representative_text=state.representative_text,
            representative_frames=state.representative_frames,
        )

    next_totals = dict(state.totals)
    next_totals[displayed_code] = next_totals.get(displayed_code, 0) + 1
    next_frames = next_totals[displayed_code]

    next_representative_code = state.representative_code
    next_representative_text = state.representative_text
    next_representative_frames = state.representative_frames

    if state.representative_code is None or displayed_code == state.representative_code:
        next_representative_code = displayed_code
        next_representative_text = displayed_text
        next_representative_frames = next_frames
    elif next_frames > state.representative_frames:
        next_representative_code = displayed_code
        next_representative_text = displayed_text
        next_representative_frames = next_frames

    return RepresentativeFeedbackState(
        totals=next_totals,
        representative_code=next_representative_code,
        representative_text=next_representative_text,
        representative_frames=next_representative_frames,
    )
