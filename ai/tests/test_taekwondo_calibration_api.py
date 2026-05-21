from fastapi.testclient import TestClient

from app.main import create_app


client = TestClient(create_app())


def build_frame_payload(
    *,
    visibility: float = 0.99,
    left_shoulder_x: float = 0.4,
    right_shoulder_x: float = 0.6,
    exclude: list[str] | None = None,
) -> dict:
    landmarks = [
        {"name": "LEFT_SHOULDER", "x": left_shoulder_x, "y": 0.2, "z": 0.0, "visibility": visibility},
        {"name": "RIGHT_SHOULDER", "x": right_shoulder_x, "y": 0.2, "z": 0.0, "visibility": visibility},
        {"name": "LEFT_ELBOW", "x": 0.35, "y": 0.35, "z": 0.0, "visibility": visibility},
        {"name": "RIGHT_ELBOW", "x": 0.65, "y": 0.35, "z": 0.0, "visibility": visibility},
        {"name": "LEFT_WRIST", "x": 0.3, "y": 0.5, "z": 0.0, "visibility": visibility},
        {"name": "RIGHT_WRIST", "x": 0.7, "y": 0.5, "z": 0.0, "visibility": visibility},
        {"name": "LEFT_HIP", "x": 0.45, "y": 0.5, "z": 0.0, "visibility": visibility},
        {"name": "RIGHT_HIP", "x": 0.55, "y": 0.5, "z": 0.0, "visibility": visibility},
        {"name": "LEFT_KNEE", "x": 0.45, "y": 0.7, "z": 0.0, "visibility": visibility},
        {"name": "RIGHT_KNEE", "x": 0.55, "y": 0.7, "z": 0.0, "visibility": visibility},
        {"name": "LEFT_ANKLE", "x": 0.45, "y": 0.9, "z": 0.0, "visibility": visibility},
        {"name": "RIGHT_ANKLE", "x": 0.55, "y": 0.9, "z": 0.0, "visibility": visibility},
    ]
    if exclude:
        landmarks = [landmark for landmark in landmarks if landmark["name"] not in exclude]

    return {
        "timestamp_ms": 100,
        "mirrored": True,
        "landmarks": landmarks,
    }


def build_calibration_payload(
    *,
    stable_frame_count: int = 0,
    target_stable_frames: int = 5,
    frame: dict | None = None,
) -> dict:
    return {
        "frame": frame or build_frame_payload(),
        "stable_frame_count": stable_frame_count,
        "target_stable_frames": target_stable_frames,
    }


def test_calibration_collects_stable_frames_when_tracking_is_ok() -> None:
    response = client.post(
        "/api/v1/taekwondo/calibrate",
        json=build_calibration_payload(stable_frame_count=1, target_stable_frames=5),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["tracking"] == "tracking_ok"
    assert body["calibration_status"] == "collecting"
    assert body["stable_frame_count"] == 2
    assert body["frames_remaining"] == 3
    assert body["is_calibrated"] is False


def test_calibration_finishes_when_target_is_reached() -> None:
    response = client.post(
        "/api/v1/taekwondo/calibrate",
        json=build_calibration_payload(stable_frame_count=4, target_stable_frames=5),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["calibration_status"] == "calibrated"
    assert body["is_calibrated"] is True
    assert body["stable_frame_count"] == 5
    assert body["frames_remaining"] == 0
    assert body["reference_hip_center"] == {"x": 0.5, "y": 0.5}
    assert body["reference_scale"] > 0


def test_calibration_resets_when_tracking_is_not_ok() -> None:
    frame = build_frame_payload(exclude=["RIGHT_ANKLE"])
    response = client.post(
        "/api/v1/taekwondo/calibrate",
        json=build_calibration_payload(
            stable_frame_count=3,
            target_stable_frames=5,
            frame=frame,
        ),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["tracking"] == "tracking_low"
    assert body["calibration_status"] == "reposition_required"
    assert body["stable_frame_count"] == 0
    assert body["frames_remaining"] == 5
    assert body["is_calibrated"] is False
    assert body["failure_reason"] == "tracking_low"
    assert body["reference_hip_center"] is None


def test_calibration_returns_tracking_lost_reason_when_visibility_is_too_low() -> None:
    frame = build_frame_payload(visibility=0.2)
    response = client.post(
        "/api/v1/taekwondo/calibrate",
        json=build_calibration_payload(frame=frame),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["tracking"] == "tracking_lost"
    assert body["failure_reason"] == "tracking_lost"
    assert body["calibration_status"] == "reposition_required"


def test_calibration_keeps_frames_remaining_at_zero_when_count_already_exceeds_target() -> None:
    response = client.post(
        "/api/v1/taekwondo/calibrate",
        json=build_calibration_payload(stable_frame_count=6, target_stable_frames=5),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["calibration_status"] == "calibrated"
    assert body["stable_frame_count"] == 7
    assert body["frames_remaining"] == 0


def test_calibration_rejects_unrealistically_large_target_frame_count() -> None:
    response = client.post(
        "/api/v1/taekwondo/calibrate",
        json=build_calibration_payload(target_stable_frames=1000),
    )

    assert response.status_code == 422
