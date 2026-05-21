from fastapi.testclient import TestClient

from app.main import create_app


client = TestClient(create_app())


def build_payload(
    *,
    mirrored: bool = True,
    left_shoulder_x: float = 0.4,
    right_shoulder_x: float = 0.6,
    left_wrist_x: float = 0.3,
    right_wrist_x: float = 0.7,
    visibility: float = 0.99,
) -> dict:
    return {
        "timestamp_ms": 100,
        "mirrored": mirrored,
        "landmarks": [
            {"name": "LEFT_SHOULDER", "x": left_shoulder_x, "y": 0.2, "z": 0.0, "visibility": visibility},
            {"name": "RIGHT_SHOULDER", "x": right_shoulder_x, "y": 0.2, "z": 0.0, "visibility": visibility},
            {"name": "LEFT_ELBOW", "x": 0.35, "y": 0.35, "z": 0.0, "visibility": visibility},
            {"name": "RIGHT_ELBOW", "x": 0.65, "y": 0.35, "z": 0.0, "visibility": visibility},
            {"name": "LEFT_WRIST", "x": left_wrist_x, "y": 0.5, "z": 0.0, "visibility": visibility},
            {"name": "RIGHT_WRIST", "x": right_wrist_x, "y": 0.5, "z": 0.0, "visibility": visibility},
            {"name": "LEFT_HIP", "x": 0.45, "y": 0.5, "z": 0.0, "visibility": visibility},
            {"name": "RIGHT_HIP", "x": 0.55, "y": 0.5, "z": 0.0, "visibility": visibility},
            {"name": "LEFT_KNEE", "x": 0.45, "y": 0.7, "z": 0.0, "visibility": visibility},
            {"name": "RIGHT_KNEE", "x": 0.55, "y": 0.7, "z": 0.0, "visibility": visibility},
            {"name": "LEFT_ANKLE", "x": 0.45, "y": 0.9, "z": 0.0, "visibility": visibility},
            {"name": "RIGHT_ANKLE", "x": 0.55, "y": 0.9, "z": 0.0, "visibility": visibility},
        ],
    }


def test_taekwondo_normalize_returns_normalized_pose() -> None:
    payload = build_payload()

    response = client.post("/api/v1/taekwondo/normalize", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["tracking"] == "tracking_ok"
    assert body["timestamp_ms"] == 100
    assert body["scale_reference"] > 0
    assert len(body["landmarks"]) == 12


def test_taekwondo_normalize_returns_tracking_low_when_required_landmark_missing() -> None:
    payload = build_payload()
    payload["landmarks"] = [
        landmark for landmark in payload["landmarks"] if landmark["name"] != "RIGHT_ANKLE"
    ]

    response = client.post("/api/v1/taekwondo/normalize", json=payload)

    assert response.status_code == 200
    assert response.json()["tracking"] == "tracking_low"


def test_taekwondo_normalize_returns_tracking_lost_when_visibility_is_too_low() -> None:
    # 모든 랜드마크가 필터링되면 completeness=0 → tracking_lost
    payload = build_payload(visibility=0.2)

    response = client.post("/api/v1/taekwondo/normalize", json=payload)

    assert response.status_code == 200
    assert response.json()["tracking"] == "tracking_lost"


def test_taekwondo_normalize_keeps_side_orientation_when_not_mirrored() -> None:
    payload = build_payload(mirrored=False, left_wrist_x=0.25, right_wrist_x=0.8)

    response = client.post("/api/v1/taekwondo/normalize", json=payload)

    assert response.status_code == 200
    landmarks = {item["name"]: item for item in response.json()["landmarks"]}
    assert landmarks["LEFT_WRIST"]["x"] < 0
    assert landmarks["RIGHT_WRIST"]["x"] > 0


def test_taekwondo_normalize_returns_tracking_low_when_scale_is_too_small() -> None:
    payload = build_payload(left_shoulder_x=0.499, right_shoulder_x=0.501)

    response = client.post("/api/v1/taekwondo/normalize", json=payload)

    assert response.status_code == 200
    assert response.json()["tracking"] == "tracking_low"
