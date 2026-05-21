from dataclasses import dataclass

from app.services.taekwondo.constants import (
    MIN_STANCE_CLASSIFICATION_CONFIDENCE,
    STANCE_FRONT,
    STANCE_FRONT_ASYMMETRY_WEIGHT,
    STANCE_FRONT_BENT_KNEE_WEIGHT,
    STANCE_FRONT_STRAIGHT_KNEE_WEIGHT,
    STANCE_FRONT_WIDTH_RATIO_MIN,
    STANCE_FRONT_WIDTH_RATIO_REFERENCE,
    STANCE_FRONT_WIDTH_WEIGHT,
    STANCE_KNEE_BENT_THRESHOLD,
    STANCE_KNEE_DEEP_BENT_THRESHOLD,
    STANCE_KNEE_SOFT_STRAIGHT_THRESHOLD,
    STANCE_KNEE_STRAIGHT_THRESHOLD,
    STANCE_LABELS,
    STANCE_READY,
    STANCE_READY_KNEES_WEIGHT,
    STANCE_READY_WIDTH_RATIO_MAX,
    STANCE_READY_WIDTH_WEIGHT,
    STANCE_WALKING,
    STANCE_WALKING_BALANCE_WEIGHT,
    STANCE_WALKING_KNEES_WEIGHT,
    STANCE_WALKING_WIDTH_RATIO_MAX,
    STANCE_WALKING_WIDTH_RATIO_MIN,
    STANCE_WALKING_WIDTH_WEIGHT,
)
from app.services.taekwondo.features.stance_features import StanceFeatureSet, extract_stance_features
from app.services.taekwondo.types import NormalizedPoseFrame


@dataclass(slots=True)
class StanceClassificationResult:
    stance_label: str
    confidence: float
    bend_side: str | None
    scores: dict[str, float]
    features: StanceFeatureSet


class StanceClassifier:
    def classify(self, frame: NormalizedPoseFrame) -> StanceClassificationResult:
        features = extract_stance_features(frame)

        if frame.tracking != "tracking_ok":
            return StanceClassificationResult(
                stance_label="unclassified",
                confidence=0.0,
                bend_side=features.bend_side,
                scores={label: 0.0 for label in STANCE_LABELS},
                features=features,
            )

        scores = {
            STANCE_READY: self._score_ready_stance(features),
            STANCE_WALKING: self._score_walking_stance(features),
            STANCE_FRONT: self._score_front_stance(features),
        }
        if not scores:
            return StanceClassificationResult(
                stance_label="unclassified",
                confidence=0.0,
                bend_side=features.bend_side,
                scores={},
                features=features,
            )

        best_label = max(scores, key=scores.get)
        best_score = scores[best_label]
        if best_score < MIN_STANCE_CLASSIFICATION_CONFIDENCE:
            best_label = "unclassified"

        return StanceClassificationResult(
            stance_label=best_label,
            confidence=round(best_score, 4),
            bend_side=features.bend_side,
            scores={label: round(score, 4) for label, score in scores.items()},
            features=features,
        )

    def _score_ready_stance(self, features: StanceFeatureSet) -> float:
        width_score = 1.0 if features.stance_width_ratio <= STANCE_READY_WIDTH_RATIO_MAX else 0.0
        knees_score = self._both_knees_straight_score(features)
        return min(
            (width_score * STANCE_READY_WIDTH_WEIGHT) + (knees_score * STANCE_READY_KNEES_WEIGHT),
            1.0,
        )

    def _score_walking_stance(self, features: StanceFeatureSet) -> float:
        width_ok = STANCE_WALKING_WIDTH_RATIO_MIN <= features.stance_width_ratio <= STANCE_WALKING_WIDTH_RATIO_MAX
        knees_soft_straight = self._both_knees_soft_straight_score(features)
        balanced_knees = 1.0 if features.knee_angle_difference <= 12.0 else 0.0

        score = 0.0
        score += (1.0 if width_ok else 0.0) * STANCE_WALKING_WIDTH_WEIGHT
        score += knees_soft_straight * STANCE_WALKING_KNEES_WEIGHT
        score += balanced_knees * STANCE_WALKING_BALANCE_WEIGHT
        return min(score, 1.0)

    def _score_front_stance(self, features: StanceFeatureSet) -> float:
        bent_angle, straight_angle = self._ordered_knee_angles(features)
        width_score = 0.0
        if features.stance_width_ratio >= STANCE_FRONT_WIDTH_RATIO_MIN:
            width_score = min(features.stance_width_ratio / STANCE_FRONT_WIDTH_RATIO_REFERENCE, 1.0)

        bent_score = self._bent_knee_score(bent_angle)
        straight_score = self._straight_knee_score(straight_angle)
        asymmetry_score = 1.0 if features.bend_side is not None else 0.0

        score = 0.0
        score += width_score * STANCE_FRONT_WIDTH_WEIGHT
        score += bent_score * STANCE_FRONT_BENT_KNEE_WEIGHT
        score += straight_score * STANCE_FRONT_STRAIGHT_KNEE_WEIGHT
        score += asymmetry_score * STANCE_FRONT_ASYMMETRY_WEIGHT
        return min(score, 1.0)

    def _ordered_knee_angles(self, features: StanceFeatureSet) -> tuple[float | None, float | None]:
        left = features.left_knee_angle
        right = features.right_knee_angle
        if left is None or right is None:
            return None, None
        return (left, right) if left <= right else (right, left)

    def _both_knees_straight_score(self, features: StanceFeatureSet) -> float:
        left = features.left_knee_angle
        right = features.right_knee_angle
        if left is None or right is None:
            return 0.0
        return 1.0 if left >= STANCE_KNEE_STRAIGHT_THRESHOLD and right >= STANCE_KNEE_STRAIGHT_THRESHOLD else 0.0

    def _both_knees_soft_straight_score(self, features: StanceFeatureSet) -> float:
        left = features.left_knee_angle
        right = features.right_knee_angle
        if left is None or right is None:
            return 0.0
        return 1.0 if left >= STANCE_KNEE_SOFT_STRAIGHT_THRESHOLD and right >= STANCE_KNEE_SOFT_STRAIGHT_THRESHOLD else 0.0

    def _bent_knee_score(self, knee_angle: float | None) -> float:
        if knee_angle is None:
            return 0.0
        if knee_angle <= STANCE_KNEE_DEEP_BENT_THRESHOLD:
            return 1.0
        if knee_angle <= STANCE_KNEE_BENT_THRESHOLD:
            return 0.7
        return 0.0

    def _straight_knee_score(self, knee_angle: float | None) -> float:
        if knee_angle is None:
            return 0.0
        if knee_angle >= STANCE_KNEE_STRAIGHT_THRESHOLD:
            return 1.0
        if knee_angle >= STANCE_KNEE_SOFT_STRAIGHT_THRESHOLD:
            return 0.7
        return 0.0
