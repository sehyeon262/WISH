from fastapi.testclient import TestClient

from app.main import create_app


client = TestClient(create_app())


def build_payload(landmarks: list[dict]) -> dict:
    return {
        "frame": {
            "timestamp_ms": 100,
            "mirrored": False,
            "landmarks": landmarks,
        },
    }


def base_upper_body_landmarks() -> list[dict]:
    return [
        {"name": "LEFT_SHOULDER", "x": 0.40, "y": 0.20, "z": 0.0, "visibility": 0.99},
        {"name": "RIGHT_SHOULDER", "x": 0.60, "y": 0.20, "z": 0.0, "visibility": 0.99},
        {"name": "LEFT_ELBOW", "x": 0.43, "y": 0.36, "z": 0.0, "visibility": 0.99},
        {"name": "RIGHT_ELBOW", "x": 0.57, "y": 0.36, "z": 0.0, "visibility": 0.99},
        {"name": "LEFT_WRIST", "x": 0.44, "y": 0.50, "z": 0.0, "visibility": 0.99},
        {"name": "RIGHT_WRIST", "x": 0.56, "y": 0.50, "z": 0.0, "visibility": 0.99},
        {"name": "LEFT_HIP", "x": 0.45, "y": 0.50, "z": 0.0, "visibility": 0.99},
        {"name": "RIGHT_HIP", "x": 0.55, "y": 0.50, "z": 0.0, "visibility": 0.99},
    ]


def ready_stance_landmarks() -> list[dict]:
    return base_upper_body_landmarks() + [
        {"name": "LEFT_KNEE", "x": 0.45, "y": 0.70, "z": 0.0, "visibility": 0.99},
        {"name": "RIGHT_KNEE", "x": 0.55, "y": 0.70, "z": 0.0, "visibility": 0.99},
        {"name": "LEFT_ANKLE", "x": 0.45, "y": 0.90, "z": 0.0, "visibility": 0.99},
        {"name": "RIGHT_ANKLE", "x": 0.55, "y": 0.90, "z": 0.0, "visibility": 0.99},
    ]


def ready_stance_boundary_landmarks() -> list[dict]:
    return base_upper_body_landmarks() + [
        {"name": "LEFT_KNEE", "x": 0.45, "y": 0.70, "z": 0.0, "visibility": 0.99},
        {"name": "RIGHT_KNEE", "x": 0.55, "y": 0.70, "z": 0.0, "visibility": 0.99},
        {"name": "LEFT_ANKLE", "x": 0.42, "y": 0.90, "z": 0.0, "visibility": 0.99},
        {"name": "RIGHT_ANKLE", "x": 0.58, "y": 0.90, "z": 0.0, "visibility": 0.99},
    ]


def walking_stance_landmarks() -> list[dict]:
    return base_upper_body_landmarks() + [
        {"name": "LEFT_KNEE", "x": 0.37, "y": 0.70, "z": 0.0, "visibility": 0.99},
        {"name": "RIGHT_KNEE", "x": 0.63, "y": 0.70, "z": 0.0, "visibility": 0.99},
        {"name": "LEFT_ANKLE", "x": 0.37, "y": 0.90, "z": 0.0, "visibility": 0.99},
        {"name": "RIGHT_ANKLE", "x": 0.63, "y": 0.90, "z": 0.0, "visibility": 0.99},
    ]


def front_stance_landmarks() -> list[dict]:
    return base_upper_body_landmarks() + [
        {"name": "LEFT_KNEE", "x": 0.45, "y": 0.70, "z": 0.0, "visibility": 0.99},
        {"name": "RIGHT_KNEE", "x": 0.47, "y": 0.66, "z": 0.0, "visibility": 0.99},
        {"name": "LEFT_ANKLE", "x": 0.25, "y": 0.90, "z": 0.0, "visibility": 0.99},
        {"name": "RIGHT_ANKLE", "x": 0.70, "y": 0.90, "z": 0.0, "visibility": 0.99},
    ]


def tracking_low_landmarks() -> list[dict]:
    landmarks = ready_stance_landmarks()
    return [item for item in landmarks if item["name"] != "RIGHT_ANKLE"]


def tracking_lost_landmarks() -> list[dict]:
    return [
        {**landmark, "visibility": 0.0}
        for landmark in ready_stance_landmarks()
    ]


def test_classify_ready_stance() -> None:
    response = client.post("/api/v1/taekwondo/classify-stance", json=build_payload(ready_stance_landmarks()))

    assert response.status_code == 200
    body = response.json()
    assert body["tracking"] == "tracking_ok"
    assert body["stance_label"] == "ready_stance"
    assert body["confidence"] > 0.45


def test_classify_ready_stance_at_width_boundary() -> None:
    response = client.post("/api/v1/taekwondo/classify-stance", json=build_payload(ready_stance_boundary_landmarks()))

    assert response.status_code == 200
    body = response.json()
    assert body["tracking"] == "tracking_ok"
    assert body["stance_label"] == "ready_stance"


def test_classify_walking_stance() -> None:
    response = client.post("/api/v1/taekwondo/classify-stance", json=build_payload(walking_stance_landmarks()))

    assert response.status_code == 200
    body = response.json()
    assert body["stance_label"] == "walking_stance"
    assert body["scores"]["walking_stance"] > body["scores"]["ready_stance"]


def test_classify_front_stance() -> None:
    response = client.post("/api/v1/taekwondo/classify-stance", json=build_payload(front_stance_landmarks()))

    assert response.status_code == 200
    body = response.json()
    assert body["stance_label"] == "front_stance"
    assert body["bend_side"] == "right"
    assert body["scores"]["front_stance"] > body["scores"]["walking_stance"]


def test_classify_stance_returns_unclassified_when_tracking_is_not_ok() -> None:
    response = client.post("/api/v1/taekwondo/classify-stance", json=build_payload(tracking_low_landmarks()))

    assert response.status_code == 200
    body = response.json()
    assert body["tracking"] == "tracking_low"
    assert body["stance_label"] == "unclassified"
    assert body["confidence"] == 0.0


def test_classify_stance_returns_unclassified_when_tracking_is_lost() -> None:
    response = client.post("/api/v1/taekwondo/classify-stance", json=build_payload(tracking_lost_landmarks()))

    assert response.status_code == 200
    body = response.json()
    assert body["tracking"] == "tracking_lost"
    assert body["stance_label"] == "unclassified"
    assert body["confidence"] == 0.0
