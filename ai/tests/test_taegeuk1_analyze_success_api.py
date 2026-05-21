from __future__ import annotations

import numpy as np
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.taekwondo.constants import LEFT_KNEE
from app.services.taekwondo.stgcn_taegeuk1 import (
    KOREAN_TO_TAEKWONDO_LANDMARK,
    TARGET_SEQUENCE_SHAPE,
    load_taegeuk1_resources,
)


client = TestClient(create_app())
ANALYZE_URL = "/api/v1/taekwondo/taegeuk1/analyze"


def _keypoint_index(resources, landmark_name: str) -> int:
    for index, keypoint_name in enumerate(resources.keypoint_names):
        if KOREAN_TO_TAEKWONDO_LANDMARK.get(keypoint_name) == landmark_name:
            return index
    raise AssertionError(f"missing keypoint for {landmark_name}")


def _static_camera_sequence_from_target(resources, target_index: int) -> np.ndarray:
    final_frame = resources.prototypes[target_index][:, -1:, :]
    return np.repeat(final_frame, TARGET_SEQUENCE_SHAPE[1], axis=1).astype(np.float32)


def _single_joint_motion_sequence(resources, target_index: int) -> np.ndarray:
    sequence = _static_camera_sequence_from_target(resources, target_index)
    knee_index = _keypoint_index(resources, LEFT_KNEE)
    progress = np.sin(np.linspace(0.0, np.pi, TARGET_SEQUENCE_SHAPE[1], dtype=np.float32))
    sequence[0, :, knee_index] = sequence[0, :, knee_index] + (0.35 * progress)
    return sequence


def test_taegeuk1_analyze_response_exposes_success_decision_fields() -> None:
    resources = load_taegeuk1_resources()
    movement_name = resources.class_names[0]

    response = client.post(
        ANALYZE_URL,
        json={
            "session_id": "success-field-test",
            "movement_name": movement_name,
            "sequence": resources.prototypes[0].tolist(),
            "input_normalized": True,
            "pass_threshold": 80.0,
        },
    )

    assert response.status_code == 200, response.text
    data = response.json()

    assert data["session_id"] == "success-field-test"
    assert data["target_movement_name"] == movement_name
    assert data["pass_threshold"] == 80.0
    assert data["scoring_method"] in {"prototype_distance", "camera_similarity", "target_rule"}
    assert isinstance(data["passed"], bool)
    assert data["passed"] == (data["score"] >= data["pass_threshold"])
    assert set(data) == {
        "session_id",
        "target_movement_index",
        "target_movement_name",
        "score",
        "pass_threshold",
        "passed",
        "scoring_method",
        "worst_joint",
        "weakest_body_part",
        "feedback_summary",
    }


def test_taegeuk1_analyze_rejects_invalid_pass_threshold() -> None:
    resources = load_taegeuk1_resources()

    response = client.post(
        ANALYZE_URL,
        json={
            "movement_name": resources.class_names[0],
            "sequence": resources.prototypes[0].tolist(),
            "pass_threshold": 101.0,
        },
    )

    assert response.status_code == 422


def test_taegeuk1_analyze_rejects_static_camera_sequence() -> None:
    resources = load_taegeuk1_resources()
    target_index = 4
    sequence = _static_camera_sequence_from_target(resources, target_index)

    response = client.post(
        ANALYZE_URL,
        json={
            "session_id": "static-camera-sequence-test",
            "movement_name": resources.class_names[target_index],
            "sequence": sequence.tolist(),
            "input_normalized": False,
            "pass_threshold": 80.0,
        },
    )

    assert response.status_code == 200, response.text
    data = response.json()

    assert data["session_id"] == "static-camera-sequence-test"
    assert data["target_movement_name"] == resources.class_names[target_index]
    assert data["score"] < data["pass_threshold"]
    assert data["passed"] is False


def test_taegeuk1_analyze_rejects_single_joint_camera_motion() -> None:
    resources = load_taegeuk1_resources()
    target_index = 4
    sequence = _single_joint_motion_sequence(resources, target_index)

    response = client.post(
        ANALYZE_URL,
        json={
            "session_id": "single-joint-motion-test",
            "movement_name": resources.class_names[target_index],
            "sequence": sequence.tolist(),
            "input_normalized": False,
            "pass_threshold": 80.0,
        },
    )

    assert response.status_code == 200, response.text
    data = response.json()

    assert data["session_id"] == "single-joint-motion-test"
    assert data["target_movement_name"] == resources.class_names[target_index]
    assert data["score"] < data["pass_threshold"]
    assert data["passed"] is False


def test_taegeuk1_analyze_keeps_reference_sequence_passable() -> None:
    resources = load_taegeuk1_resources()
    target_index = 4

    response = client.post(
        ANALYZE_URL,
        json={
            "session_id": "reference-sequence-test",
            "movement_name": resources.class_names[target_index],
            "sequence": resources.prototypes[target_index].tolist(),
            "input_normalized": True,
            "pass_threshold": 80.0,
        },
    )

    assert response.status_code == 200, response.text
    data = response.json()

    assert data["session_id"] == "reference-sequence-test"
    assert data["target_movement_name"] == resources.class_names[target_index]
    assert data["score"] >= data["pass_threshold"]
    assert data["passed"] is True
