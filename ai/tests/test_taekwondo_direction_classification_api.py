from fastapi.testclient import TestClient

from app.main import create_app


client = TestClient(create_app())


def build_payload(landmarks: list[dict], previous_direction: str | None = None) -> dict:
    return {
        "frame": {
            "timestamp_ms": 100,
            "mirrored": False,
            "landmarks": landmarks,
        },
        "previous_direction": previous_direction,
    }


def base_landmarks() -> list[dict]:
    return [
        {"name": "LEFT_ELBOW", "x": 0.43, "y": 0.36, "z": 0.0, "visibility": 0.99},
        {"name": "RIGHT_ELBOW", "x": 0.57, "y": 0.36, "z": 0.0, "visibility": 0.99},
        {"name": "LEFT_WRIST", "x": 0.44, "y": 0.50, "z": 0.0, "visibility": 0.99},
        {"name": "RIGHT_WRIST", "x": 0.56, "y": 0.50, "z": 0.0, "visibility": 0.99},
        {"name": "LEFT_KNEE", "x": 0.45, "y": 0.70, "z": 0.0, "visibility": 0.99},
        {"name": "RIGHT_KNEE", "x": 0.55, "y": 0.70, "z": 0.0, "visibility": 0.99},
    ]


def front_direction_landmarks() -> list[dict]:
    return base_landmarks() + [
        {"name": "LEFT_SHOULDER", "x": 0.40, "y": 0.20, "z": 0.0, "visibility": 0.99},
        {"name": "RIGHT_SHOULDER", "x": 0.60, "y": 0.20, "z": 0.0, "visibility": 0.99},
        {"name": "LEFT_HIP", "x": 0.45, "y": 0.50, "z": 0.0, "visibility": 0.99},
        {"name": "RIGHT_HIP", "x": 0.55, "y": 0.50, "z": 0.0, "visibility": 0.99},
        {"name": "LEFT_ANKLE", "x": 0.45, "y": 0.90, "z": 0.0, "visibility": 0.99},
        {"name": "RIGHT_ANKLE", "x": 0.55, "y": 0.90, "z": 0.0, "visibility": 0.99},
    ]


def left_direction_landmarks() -> list[dict]:
    return base_landmarks() + [
        {"name": "LEFT_SHOULDER", "x": 0.20, "y": 0.20, "z": 0.0, "visibility": 0.99},
        {"name": "RIGHT_SHOULDER", "x": 0.80, "y": 0.20, "z": 0.0, "visibility": 0.99},
        {"name": "LEFT_HIP", "x": 0.35, "y": 0.50, "z": 0.0, "visibility": 0.99},
        {"name": "RIGHT_HIP", "x": 0.60, "y": 0.50, "z": 0.0, "visibility": 0.99},
        {"name": "LEFT_ANKLE", "x": 0.10, "y": 0.90, "z": 0.0, "visibility": 0.99},
        {"name": "RIGHT_ANKLE", "x": 0.60, "y": 0.90, "z": 0.0, "visibility": 0.99},
    ]


def right_direction_landmarks() -> list[dict]:
    return base_landmarks() + [
        {"name": "LEFT_SHOULDER", "x": 0.20, "y": 0.20, "z": 0.0, "visibility": 0.99},
        {"name": "RIGHT_SHOULDER", "x": 0.80, "y": 0.20, "z": 0.0, "visibility": 0.99},
        {"name": "LEFT_HIP", "x": 0.40, "y": 0.50, "z": 0.0, "visibility": 0.99},
        {"name": "RIGHT_HIP", "x": 0.65, "y": 0.50, "z": 0.0, "visibility": 0.99},
        {"name": "LEFT_ANKLE", "x": 0.40, "y": 0.90, "z": 0.0, "visibility": 0.99},
        {"name": "RIGHT_ANKLE", "x": 0.90, "y": 0.90, "z": 0.0, "visibility": 0.99},
    ]


def tracking_low_landmarks() -> list[dict]:
    return [item for item in front_direction_landmarks() if item["name"] != "RIGHT_ANKLE"]


def test_classify_front_direction() -> None:
    response = client.post("/api/v1/taekwondo/classify-direction", json=build_payload(front_direction_landmarks()))

    assert response.status_code == 200
    body = response.json()
    assert body["tracking"] == "tracking_ok"
    assert body["direction_label"] == "front"
    assert body["turn_label"] == "no_turn"
    assert body["confidence"] >= 0.45
    assert body["features"]["shoulder_balance"] <= 0.2
    assert abs(body["features"]["side_extent_difference"]) <= 0.5


def test_classify_left_direction_and_turn() -> None:
    response = client.post(
        "/api/v1/taekwondo/classify-direction",
        json=build_payload(left_direction_landmarks(), previous_direction="front"),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["direction_label"] == "left"
    assert body["turn_label"] == "turn_left"
    assert body["confidence"] >= 0.45
    assert body["features"]["side_extent_difference"] > 0
    assert body["scores"]["left"] > body["scores"]["front"]


def test_classify_right_direction_and_turn() -> None:
    response = client.post(
        "/api/v1/taekwondo/classify-direction",
        json=build_payload(right_direction_landmarks(), previous_direction="front"),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["direction_label"] == "right"
    assert body["turn_label"] == "turn_right"
    assert body["confidence"] >= 0.45
    assert body["features"]["side_extent_difference"] < 0
    assert body["scores"]["right"] > body["scores"]["front"]


def test_classify_direction_returns_unclassified_when_tracking_is_not_ok() -> None:
    response = client.post(
        "/api/v1/taekwondo/classify-direction",
        json=build_payload(tracking_low_landmarks(), previous_direction="left"),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["tracking"] == "tracking_low"
    assert body["direction_label"] == "unclassified"
    assert body["turn_label"] == "no_turn"
    assert body["confidence"] == 0.0


def test_classify_direction_rejects_invalid_previous_direction() -> None:
    response = client.post(
        "/api/v1/taekwondo/classify-direction",
        json=build_payload(front_direction_landmarks(), previous_direction="back"),
    )

    assert response.status_code == 422
