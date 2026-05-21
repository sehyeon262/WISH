import pytest
from fastapi import HTTPException

from app.api.v1 import gymnastics_daniel
from app.schemas.gymnastics import (
    DanielForwardBendEvaluationResponse,
    DanielForwardBendFeaturesResponse,
    DanielForwardPressEvaluationResponse,
    DanielForwardPressFeaturesResponse,
    DanielLeftSideBendEvaluationResponse,
    DanielLeftSideBendFeaturesResponse,
    DanielRightSideBendEvaluationResponse,
    DanielRightSideBendFeaturesResponse,
    DanielStretchEvaluationRequest,
    DanielUpwardPressEvaluationResponse,
    DanielUpwardPressFeaturesResponse,
)
from app.services.gymnastics.constants import (
    DANIEL_FORWARD_BEND_MOTION_NAME,
    DANIEL_FORWARD_PRESS_MOTION_NAME,
    DANIEL_LEFT_SIDE_BEND_MOTION_NAME,
    DANIEL_RIGHT_SIDE_BEND_MOTION_NAME,
    DANIEL_UPWARD_PRESS_MOTION_NAME,
)
from app.services.gymnastics.feedback.common import BEND_FORWARD_MORE


def _build_request(motion_id: str) -> DanielStretchEvaluationRequest:
    return DanielStretchEvaluationRequest(
        motion_id=motion_id,
        frame={
            "timestamp_ms": 1000,
            "mirrored": True,
            "landmarks": [{"name": "LEFT_SHOULDER", "x": 0.5, "y": 0.3, "z": 0.0}],
        },
    )


def _build_forward_press_response() -> DanielForwardPressEvaluationResponse:
    return DanielForwardPressEvaluationResponse(
        motion_id="daniel_forward_press",
        state="holding",
        accuracy=0.88,
        tracking="tracking_ok",
        frame_label="motion_present",
        guidance_code=None,
        guidance_text=None,
        hold_duration_ms=2200,
        hold_completed=False,
        baseline_left_wrist_forward=0.11,
        baseline_right_wrist_forward=0.12,
        features=DanielForwardPressFeaturesResponse(
            wrist_forward=0.32,
            wrist_extension=0.21,
            left_wrist_forward=0.34,
            right_wrist_forward=0.33,
            wrist_gap=0.18,
            wrist_height_error=0.05,
            wrist_shoulder_offset=0.04,
            left_elbow_angle=160.0,
            right_elbow_angle=162.0,
            torso_tilt=1.2,
            pelvis_shift_x=0.0,
            pelvis_shift_y=0.0,
            pelvis_depth_shift=0.0,
        ),
    )


def _build_upward_press_response() -> DanielUpwardPressEvaluationResponse:
    return DanielUpwardPressEvaluationResponse(
        motion_id="daniel_upward_press",
        state="holding",
        accuracy=0.84,
        tracking="tracking_ok",
        frame_label="motion_present",
        guidance_code=None,
        guidance_text=None,
        hold_duration_ms=1800,
        hold_completed=False,
        features=DanielUpwardPressFeaturesResponse(
            wrist_height=0.61,
            wrist_height_balance=0.06,
            left_elbow_angle=159.0,
            right_elbow_angle=158.0,
            torso_tilt=1.4,
            pelvis_shift_x=0.0,
            pelvis_shift_y=0.0,
            pelvis_depth_shift=0.0,
        ),
    )


def _build_left_side_bend_response() -> DanielLeftSideBendEvaluationResponse:
    return DanielLeftSideBendEvaluationResponse(
        motion_id="daniel_side_bend_left",
        state="holding",
        accuracy=0.79,
        tracking="tracking_ok",
        frame_label="motion_present",
        guidance_code=None,
        guidance_text=None,
        hold_duration_ms=1400,
        hold_completed=False,
        features=DanielLeftSideBendFeaturesResponse(
            torso_tilt=0.24,
            wrist_height=0.52,
            left_elbow_angle=157.0,
            right_elbow_angle=156.0,
            pelvis_shift_x=0.01,
            pelvis_shift_y=0.0,
            pelvis_depth_shift=0.0,
        ),
    )


def _build_right_side_bend_response() -> DanielRightSideBendEvaluationResponse:
    return DanielRightSideBendEvaluationResponse(
        motion_id="daniel_side_bend_right",
        state="holding",
        accuracy=0.81,
        tracking="tracking_ok",
        frame_label="motion_present",
        guidance_code=None,
        guidance_text=None,
        hold_duration_ms=1450,
        hold_completed=False,
        features=DanielRightSideBendFeaturesResponse(
            torso_tilt=0.23,
            wrist_height=0.50,
            left_elbow_angle=156.0,
            right_elbow_angle=157.0,
            pelvis_shift_x=0.01,
            pelvis_shift_y=0.0,
            pelvis_depth_shift=0.0,
        ),
    )


def _build_forward_bend_response() -> DanielForwardBendEvaluationResponse:
    return DanielForwardBendEvaluationResponse(
        motion_id="daniel_forward_bend",
        state="idle",
        accuracy=0.61,
        feedback=BEND_FORWARD_MORE.text,
        tracking="tracking_ok",
        frame_label="guidance_needed",
        guidance_code=BEND_FORWARD_MORE.code,
        guidance_text=BEND_FORWARD_MORE.text,
        hold_duration_ms=900,
        hold_completed=False,
        features=DanielForwardBendFeaturesResponse(
            forward_bend_angle=48.0,
            wrist_drop=0.82,
            left_knee_angle=158.0,
            right_knee_angle=156.0,
            pelvis_shift_x=0.01,
            pelvis_shift_y=0.02,
            pelvis_depth_shift=0.0,
        ),
    )


@pytest.mark.parametrize(
    (
        "motion_id",
        "motion_name",
        "response_builder",
        "feature_key",
        "expected_feature",
        "expected_baseline_left",
        "expected_frame_label",
    ),
    [
        (
            "daniel_forward_press",
            DANIEL_FORWARD_PRESS_MOTION_NAME,
            _build_forward_press_response,
            "wrist_forward",
            0.32,
            0.11,
            "motion_present",
        ),
        (
            "daniel_upward_press",
            DANIEL_UPWARD_PRESS_MOTION_NAME,
            _build_upward_press_response,
            "wrist_height",
            0.61,
            None,
            "motion_present",
        ),
        (
            "daniel_side_bend_left",
            DANIEL_LEFT_SIDE_BEND_MOTION_NAME,
            _build_left_side_bend_response,
            "torso_tilt",
            0.24,
            None,
            "motion_present",
        ),
        (
            "daniel_side_bend_right",
            DANIEL_RIGHT_SIDE_BEND_MOTION_NAME,
            _build_right_side_bend_response,
            "torso_tilt",
            0.23,
            None,
            "motion_present",
        ),
        (
            "daniel_forward_bend",
            DANIEL_FORWARD_BEND_MOTION_NAME,
            _build_forward_bend_response,
            "forward_bend_angle",
            48.0,
            None,
            "guidance_needed",
        ),
    ],
)
def test_integrated_daniel_evaluate_dispatches_each_motion(
    monkeypatch,
    motion_id: str,
    motion_name: str,
    response_builder,
    feature_key: str,
    expected_feature: float,
    expected_baseline_left: float | None,
    expected_frame_label: str,
) -> None:
    _, request_model, _ = gymnastics_daniel._DANIEL_STRETCH_EVALUATION_SPECS[motion_id]

    def fake_handler(_payload):
        return response_builder()

    monkeypatch.setitem(
        gymnastics_daniel._DANIEL_STRETCH_EVALUATION_SPECS,
        motion_id,
        (motion_name, request_model, fake_handler),
    )

    response = gymnastics_daniel.evaluate_daniel_stretch(_build_request(motion_id))

    assert response.motion_id == motion_id
    assert response.motion_name == motion_name
    assert response.baseline_left_wrist_forward == expected_baseline_left
    assert response.features[feature_key] == expected_feature
    assert response.frame_label == expected_frame_label


def test_integrated_daniel_evaluate_rejects_missing_motion_mapping(monkeypatch) -> None:
    monkeypatch.delitem(
        gymnastics_daniel._DANIEL_STRETCH_EVALUATION_SPECS,
        "daniel_forward_press",
        raising=False,
    )

    with pytest.raises(HTTPException) as exc_info:
        gymnastics_daniel.evaluate_daniel_stretch(_build_request("daniel_forward_press"))

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Invalid daniel stretch motion_id"
