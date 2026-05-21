from app.services.taekwondo.constants import (
    MIN_SAFE_SCALE_REFERENCE,
    REQUIRED_TAEKWONDO_TRACKING_POINTS,
    TRACKING_CONFIDENCE_GOOD,
    TRACKING_LOST_THRESHOLD,
)
from app.services.taekwondo.types import RawLandmark, TrackingQuality

_TOTAL_REQUIRED = len(REQUIRED_TAEKWONDO_TRACKING_POINTS)


class TrackingQualityChecker:
    def check(
        self,
        landmarks: dict[str, RawLandmark],
        scale_reference: float,
    ) -> TrackingQuality:
        missing = [
            name
            for name in REQUIRED_TAEKWONDO_TRACKING_POINTS
            if name not in landmarks
        ]
        completeness = (_TOTAL_REQUIRED - len(missing)) / _TOTAL_REQUIRED

        confidences = [
            lm.confidence
            for lm in landmarks.values()
            if lm.confidence is not None
        ]
        mean_confidence = sum(confidences) / len(confidences) if confidences else 0.0

        scale_ok = scale_reference >= MIN_SAFE_SCALE_REFERENCE

        if not missing and scale_ok:
            status = "tracking_ok"
        elif completeness >= TRACKING_LOST_THRESHOLD:
            status = "tracking_low"
        else:
            status = "tracking_lost"

        confidence_factor = min(mean_confidence / TRACKING_CONFIDENCE_GOOD, 1.0)
        scale_factor = (
            1.0
            if scale_ok
            else min(scale_reference / MIN_SAFE_SCALE_REFERENCE, 1.0)
        )
        quality_score = max(
            0.0,
            min(completeness * confidence_factor * scale_factor, 1.0),
        )

        return TrackingQuality(
            status=status,
            quality_score=round(quality_score, 4),
            missing_landmarks=missing,
            landmark_completeness=round(completeness, 4),
            mean_confidence=round(mean_confidence, 4),
        )
