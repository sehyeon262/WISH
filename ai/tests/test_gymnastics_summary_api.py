import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api.v1 import gymnastics_summary
from app.main import create_app
from app.schemas.gymnastics import DanielStretchSummaryRequest
from app.services.gymnastics.constants import (
    DANIEL_FORWARD_BEND_MOTION_NAME,
    DANIEL_FORWARD_PRESS_MOTION_NAME,
    DANIEL_LEFT_SIDE_BEND_MOTION_NAME,
    DANIEL_RIGHT_SIDE_BEND_MOTION_NAME,
    DANIEL_UPWARD_PRESS_MOTION_NAME,
)


client = TestClient(create_app())

MARCH_MOTION_NAME = "\uc81c\uc790\ub9ac \uac77\uae30"
REPRESENTATIVE_FEEDBACK = "\ub2e4\ub9ac\ub97c \ub354 \ub192\uac8c \ub4e4\uc5b4\uc694"


def test_march_summary_returns_be_payload_shape() -> None:
    response = client.post(
        "/api/v1/gymnastics/march/summary",
        json={
            "started_at": "2026-04-30T10:00:05+09:00",
            "ended_at": "2026-04-30T10:00:17.400000+09:00",
            "step_count": 8,
            "accuracy": 0.87,
            "representative_feedback": REPRESENTATIVE_FEEDBACK,
            "tracking": "tracking_ok",
            "state": "complete",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "motionId": "top_march",
        "motionName": MARCH_MOTION_NAME,
        "durationSec": 12.4,
        "stepCount": 8,
        "accuracy": 0.87,
        "representativeFeedback": REPRESENTATIVE_FEEDBACK,
        "tracking": "tracking_ok",
        "state": "complete",
    }


def test_march_summary_rejects_end_before_start() -> None:
    response = client.post(
        "/api/v1/gymnastics/march/summary",
        json={
            "started_at": "2026-04-30T10:00:17+09:00",
            "ended_at": "2026-04-30T10:00:05+09:00",
            "step_count": 8,
            "accuracy": 0.87,
            "representative_feedback": REPRESENTATIVE_FEEDBACK,
            "tracking": "tracking_ok",
            "state": "complete",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "ended_at must be greater than or equal to started_at"


@pytest.mark.parametrize(
    ("motion_id", "motion_name"),
    [
        ("daniel_forward_press", DANIEL_FORWARD_PRESS_MOTION_NAME),
        ("daniel_upward_press", DANIEL_UPWARD_PRESS_MOTION_NAME),
        ("daniel_side_bend_left", DANIEL_LEFT_SIDE_BEND_MOTION_NAME),
        ("daniel_side_bend_right", DANIEL_RIGHT_SIDE_BEND_MOTION_NAME),
        ("daniel_forward_bend", DANIEL_FORWARD_BEND_MOTION_NAME),
    ],
)
def test_integrated_daniel_stretch_summary_returns_motion_specific_payload(
    motion_id: str,
    motion_name: str,
) -> None:
    response = client.post(
        "/api/v1/gymnastics/daniel/summary",
        json={
            "motion_id": motion_id,
            "started_at": "2026-04-30T10:00:05+09:00",
            "ended_at": "2026-04-30T10:00:17.400000+09:00",
            "accuracy": 0.91,
            "hold_completed": True,
            "representative_feedback": REPRESENTATIVE_FEEDBACK,
            "tracking": "tracking_ok",
            "state": "complete",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "motionId": motion_id,
        "motionName": motion_name,
        "durationSec": 12.4,
        "accuracy": 0.91,
        "holdCompleted": True,
        "representativeFeedback": REPRESENTATIVE_FEEDBACK,
        "tracking": "tracking_ok",
        "state": "complete",
    }


def test_integrated_daniel_stretch_summary_rejects_missing_motion_mapping(monkeypatch) -> None:
    monkeypatch.delitem(
        gymnastics_summary._DANIEL_STRETCH_MOTION_NAMES,
        "daniel_upward_press",
        raising=False,
    )

    payload = DanielStretchSummaryRequest(
        motion_id="daniel_upward_press",
        started_at="2026-04-30T10:00:05+09:00",
        ended_at="2026-04-30T10:00:17.400000+09:00",
        accuracy=0.91,
        hold_completed=True,
        representative_feedback=REPRESENTATIVE_FEEDBACK,
        tracking="tracking_ok",
        state="complete",
    )

    with pytest.raises(HTTPException) as exc_info:
        gymnastics_summary.summarize_daniel_stretch(payload)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Invalid daniel stretch motion_id"


def test_march_summary_supports_mixed_timezones() -> None:
    response = client.post(
        "/api/v1/gymnastics/march/summary",
        json={
            "started_at": "2026-04-30T10:00:05+09:00",
            "ended_at": "2026-04-30T01:00:17.400000+00:00",
            "step_count": 8,
            "accuracy": 0.87,
            "representative_feedback": REPRESENTATIVE_FEEDBACK,
            "tracking": "tracking_ok",
            "state": "complete",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["durationSec"] == 12.4
    assert body["motionId"] == "top_march"


@pytest.mark.parametrize(
    ("endpoint", "motion_id", "motion_name"),
    [
        ("/api/v1/gymnastics/daniel-forward-press/summary", "daniel_forward_press", DANIEL_FORWARD_PRESS_MOTION_NAME),
        ("/api/v1/gymnastics/daniel-upward-press/summary", "daniel_upward_press", DANIEL_UPWARD_PRESS_MOTION_NAME),
        ("/api/v1/gymnastics/daniel-left-side-bend/summary", "daniel_side_bend_left", DANIEL_LEFT_SIDE_BEND_MOTION_NAME),
        ("/api/v1/gymnastics/daniel-right-side-bend/summary", "daniel_side_bend_right", DANIEL_RIGHT_SIDE_BEND_MOTION_NAME),
        ("/api/v1/gymnastics/daniel-forward-bend/summary", "daniel_forward_bend", DANIEL_FORWARD_BEND_MOTION_NAME),
    ],
)
def test_daniel_stretch_summary_returns_hold_payload_shape(
    endpoint: str,
    motion_id: str,
    motion_name: str,
) -> None:
    response = client.post(
        endpoint,
        json={
            "started_at": "2026-04-30T10:00:05+09:00",
            "ended_at": "2026-04-30T10:00:17.400000+09:00",
            "accuracy": 0.91,
            "hold_completed": True,
            "representative_feedback": REPRESENTATIVE_FEEDBACK,
            "tracking": "tracking_ok",
            "state": "complete",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "motionId": motion_id,
        "motionName": motion_name,
        "durationSec": 12.4,
        "accuracy": 0.91,
        "holdCompleted": True,
        "representativeFeedback": REPRESENTATIVE_FEEDBACK,
        "tracking": "tracking_ok",
        "state": "complete",
    }


def test_daniel_stretch_summary_rejects_end_before_start() -> None:
    response = client.post(
        "/api/v1/gymnastics/daniel-forward-press/summary",
        json={
            "started_at": "2026-04-30T10:00:17+09:00",
            "ended_at": "2026-04-30T10:00:05+09:00",
            "accuracy": 0.87,
            "hold_completed": False,
            "representative_feedback": REPRESENTATIVE_FEEDBACK,
            "tracking": "tracking_ok",
            "state": "idle",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "ended_at must be greater than or equal to started_at"
