import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.taekwondo.constants import (
    MIN_SAFE_SCALE_REFERENCE,
    REQUIRED_TAEKWONDO_TRACKING_POINTS,
    TRACKING_LOST_THRESHOLD,
)
from app.services.taekwondo.tracking.quality_checker import TrackingQualityChecker
from app.services.taekwondo.types import RawLandmark

client = TestClient(create_app())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_landmarks(
    names: tuple[str, ...] = REQUIRED_TAEKWONDO_TRACKING_POINTS,
    confidence: float = 0.99,
) -> dict[str, RawLandmark]:
    return {
        name: RawLandmark(name=name, x=0.5, y=0.5, z=0.0, confidence=confidence)
        for name in names
    }


def build_api_payload(
    *,
    mirrored: bool = True,
    left_shoulder_x: float = 0.4,
    right_shoulder_x: float = 0.6,
    visibility: float = 0.99,
    exclude: list[str] | None = None,
) -> dict:
    landmarks = [
        {"name": "LEFT_SHOULDER",  "x": left_shoulder_x, "y": 0.2, "z": 0.0, "visibility": visibility},
        {"name": "RIGHT_SHOULDER", "x": right_shoulder_x, "y": 0.2, "z": 0.0, "visibility": visibility},
        {"name": "LEFT_ELBOW",     "x": 0.35, "y": 0.35, "z": 0.0, "visibility": visibility},
        {"name": "RIGHT_ELBOW",    "x": 0.65, "y": 0.35, "z": 0.0, "visibility": visibility},
        {"name": "LEFT_WRIST",     "x": 0.3,  "y": 0.5,  "z": 0.0, "visibility": visibility},
        {"name": "RIGHT_WRIST",    "x": 0.7,  "y": 0.5,  "z": 0.0, "visibility": visibility},
        {"name": "LEFT_HIP",       "x": 0.45, "y": 0.5,  "z": 0.0, "visibility": visibility},
        {"name": "RIGHT_HIP",      "x": 0.55, "y": 0.5,  "z": 0.0, "visibility": visibility},
        {"name": "LEFT_KNEE",      "x": 0.45, "y": 0.7,  "z": 0.0, "visibility": visibility},
        {"name": "RIGHT_KNEE",     "x": 0.55, "y": 0.7,  "z": 0.0, "visibility": visibility},
        {"name": "LEFT_ANKLE",     "x": 0.45, "y": 0.9,  "z": 0.0, "visibility": visibility},
        {"name": "RIGHT_ANKLE",    "x": 0.55, "y": 0.9,  "z": 0.0, "visibility": visibility},
    ]
    if exclude:
        landmarks = [lm for lm in landmarks if lm["name"] not in exclude]
    return {"timestamp_ms": 100, "mirrored": mirrored, "landmarks": landmarks}


# ---------------------------------------------------------------------------
# Unit tests — TrackingQualityChecker
# ---------------------------------------------------------------------------

class TestTrackingQualityChecker:
    checker = TrackingQualityChecker()

    def test_all_landmarks_good_scale_returns_tracking_ok(self):
        lms = _make_landmarks()
        result = self.checker.check(lms, scale_reference=0.2)

        assert result.status == "tracking_ok"
        assert result.missing_landmarks == []
        assert result.landmark_completeness == 1.0
        assert result.quality_score > 0.0

    def test_quality_score_between_zero_and_one(self):
        lms = _make_landmarks()
        result = self.checker.check(lms, scale_reference=0.2)

        assert 0.0 <= result.quality_score <= 1.0

    def test_one_missing_landmark_returns_tracking_low(self):
        names = tuple(n for n in REQUIRED_TAEKWONDO_TRACKING_POINTS if n != "RIGHT_ANKLE")
        lms = _make_landmarks(names)
        result = self.checker.check(lms, scale_reference=0.2)

        assert result.status == "tracking_low"
        assert "RIGHT_ANKLE" in result.missing_landmarks
        assert result.landmark_completeness == pytest.approx(11 / 12, rel=1e-3)

    def test_majority_missing_returns_tracking_lost(self):
        # 4개만 남김 (12개 중 → completeness < 0.5)
        names = REQUIRED_TAEKWONDO_TRACKING_POINTS[:4]
        lms = _make_landmarks(names)
        result = self.checker.check(lms, scale_reference=0.2)

        assert result.status == "tracking_lost"
        assert len(result.missing_landmarks) == 8
        assert result.landmark_completeness == pytest.approx(4 / 12, rel=1e-3)

    def test_boundary_completeness_equal_to_threshold_returns_tracking_low(self):
        required_count = int(len(REQUIRED_TAEKWONDO_TRACKING_POINTS) * TRACKING_LOST_THRESHOLD)
        names = REQUIRED_TAEKWONDO_TRACKING_POINTS[:required_count]
        lms = _make_landmarks(names)
        result = self.checker.check(lms, scale_reference=0.2)

        assert result.landmark_completeness == pytest.approx(TRACKING_LOST_THRESHOLD, rel=1e-3)
        assert result.status == "tracking_low"

    def test_scale_too_small_returns_tracking_low(self):
        lms = _make_landmarks()
        result = self.checker.check(lms, scale_reference=MIN_SAFE_SCALE_REFERENCE * 0.5)

        assert result.status == "tracking_low"

    def test_scale_too_small_reduces_quality_score(self):
        lms = _make_landmarks()
        good = self.checker.check(lms, scale_reference=0.2)
        bad = self.checker.check(lms, scale_reference=MIN_SAFE_SCALE_REFERENCE * 0.5)

        assert bad.quality_score < good.quality_score

    def test_empty_landmarks_returns_tracking_lost(self):
        result = self.checker.check({}, scale_reference=0.2)

        assert result.status == "tracking_lost"
        assert result.quality_score == 0.0
        assert result.mean_confidence == 0.0
        assert result.landmark_completeness == 0.0

    def test_mean_confidence_reflects_input(self):
        lms = _make_landmarks(confidence=0.8)
        result = self.checker.check(lms, scale_reference=0.2)

        assert result.mean_confidence == pytest.approx(0.8, abs=1e-4)

    def test_lower_confidence_produces_lower_quality_score(self):
        high = self.checker.check(_make_landmarks(confidence=0.99), scale_reference=0.2)
        low = self.checker.check(_make_landmarks(confidence=0.55), scale_reference=0.2)

        assert low.quality_score < high.quality_score

    def test_landmarks_without_confidence_do_not_raise(self):
        lms = _make_landmarks()
        for name in lms:
            lms[name] = RawLandmark(name=name, x=0.5, y=0.5, z=0.0, confidence=None)
        result = self.checker.check(lms, scale_reference=0.2)

        assert result.mean_confidence == 0.0


# ---------------------------------------------------------------------------
# Integration tests — API response shape
# ---------------------------------------------------------------------------

class TestTrackingQualityApiResponse:
    def test_response_includes_tracking_quality_field(self):
        response = client.post("/api/v1/taekwondo/normalize", json=build_api_payload())

        assert response.status_code == 200
        assert "tracking_quality" in response.json()

    def test_tracking_quality_fields_present(self):
        body = client.post("/api/v1/taekwondo/normalize", json=build_api_payload()).json()
        tq = body["tracking_quality"]

        assert "quality_score" in tq
        assert "missing_landmarks" in tq
        assert "landmark_completeness" in tq
        assert "mean_confidence" in tq

    def test_full_tracking_ok_quality_score_positive(self):
        body = client.post("/api/v1/taekwondo/normalize", json=build_api_payload()).json()

        assert body["tracking"] == "tracking_ok"
        assert body["tracking_quality"]["quality_score"] > 0.0
        assert body["tracking_quality"]["missing_landmarks"] == []
        assert body["tracking_quality"]["landmark_completeness"] == pytest.approx(1.0)

    def test_missing_landmark_reflected_in_quality(self):
        payload = build_api_payload(exclude=["RIGHT_ANKLE"])
        body = client.post("/api/v1/taekwondo/normalize", json=payload).json()

        assert body["tracking"] == "tracking_low"
        assert "RIGHT_ANKLE" in body["tracking_quality"]["missing_landmarks"]
        assert body["tracking_quality"]["landmark_completeness"] < 1.0

    def test_tracking_lost_when_most_landmarks_missing(self):
        payload = build_api_payload(
            exclude=[
                "LEFT_ELBOW", "RIGHT_ELBOW",
                "LEFT_WRIST", "RIGHT_WRIST",
                "LEFT_KNEE", "RIGHT_KNEE",
                "LEFT_ANKLE", "RIGHT_ANKLE",
            ]
        )
        body = client.post("/api/v1/taekwondo/normalize", json=payload).json()

        assert body["tracking"] == "tracking_lost"
        assert body["tracking_quality"]["landmark_completeness"] == pytest.approx(4 / 12, rel=1e-3)

    def test_small_scale_reduces_quality_score(self):
        good_payload = build_api_payload(left_shoulder_x=0.4, right_shoulder_x=0.6)
        bad_payload = build_api_payload(left_shoulder_x=0.499, right_shoulder_x=0.501)

        good_score = client.post("/api/v1/taekwondo/normalize", json=good_payload).json()["tracking_quality"]["quality_score"]
        bad_score = client.post("/api/v1/taekwondo/normalize", json=bad_payload).json()["tracking_quality"]["quality_score"]

        assert bad_score < good_score
