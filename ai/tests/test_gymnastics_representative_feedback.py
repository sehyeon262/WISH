from app.services.gymnastics.feedback import (
    RepresentativeFeedbackState,
    update_representative_feedback,
)


LOWER_LEG = "\ub2e4\ub9ac\ub97c \ub354 \ub192\uac8c \ub4e4\uc5b4\uc694"
STRAIGHT_BACK = "\ud5c8\ub9ac\ub97c \uacf3\uac8c \uc138\uc6cc\uc694"


def test_representative_feedback_accumulates_displayed_frames() -> None:
    state = RepresentativeFeedbackState()

    state = update_representative_feedback("LIFT_LEG_BIGGER", LOWER_LEG, state)
    state = update_representative_feedback("LIFT_LEG_BIGGER", LOWER_LEG, state)
    state = update_representative_feedback(None, None, state)

    assert state.totals == {"LIFT_LEG_BIGGER": 2}
    assert state.representative_code == "LIFT_LEG_BIGGER"
    assert state.representative_text == LOWER_LEG
    assert state.representative_frames == 2


def test_representative_feedback_switches_when_new_feedback_overtakes() -> None:
    state = RepresentativeFeedbackState(
        totals={"LIFT_LEG_BIGGER": 2},
        representative_code="LIFT_LEG_BIGGER",
        representative_text=LOWER_LEG,
        representative_frames=2,
    )

    state = update_representative_feedback("STRAIGHTEN_BACK", STRAIGHT_BACK, state)
    state = update_representative_feedback("STRAIGHTEN_BACK", STRAIGHT_BACK, state)
    state = update_representative_feedback("STRAIGHTEN_BACK", STRAIGHT_BACK, state)

    assert state.totals == {
        "LIFT_LEG_BIGGER": 2,
        "STRAIGHTEN_BACK": 3,
    }
    assert state.representative_code == "STRAIGHTEN_BACK"
    assert state.representative_text == STRAIGHT_BACK
    assert state.representative_frames == 3
