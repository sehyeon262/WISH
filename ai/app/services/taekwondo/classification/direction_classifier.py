from dataclasses import dataclass

from app.services.taekwondo.constants import (
    DIRECTION_FRONT,
    DIRECTION_FRONT_ANKLE_BALANCE_MAX,
    DIRECTION_FRONT_ANKLE_WEIGHT,
    DIRECTION_FRONT_EXTENT_DIFF_MAX,
    DIRECTION_FRONT_EXTENT_WEIGHT,
    DIRECTION_FRONT_SHOULDER_BALANCE_MAX,
    DIRECTION_FRONT_SHOULDER_WEIGHT,
    DIRECTION_LABELS,
    DIRECTION_LEFT,
    DIRECTION_RIGHT,
    DIRECTION_SIDE_ANKLE_MARGIN,
    DIRECTION_SIDE_ANKLE_WEIGHT,
    DIRECTION_SIDE_EXTENT_DIFF_REFERENCE,
    DIRECTION_SIDE_EXTENT_WEIGHT,
    DIRECTION_UNCLASSIFIED,
    MIN_DIRECTION_CLASSIFICATION_CONFIDENCE,
    TURN_LEFT,
    TURN_NONE,
    TURN_RIGHT,
)
from app.services.taekwondo.features.direction_features import (
    DirectionFeatureSet,
    extract_direction_features,
)
from app.services.taekwondo.types import NormalizedPoseFrame


@dataclass(slots=True)
class DirectionClassificationResult:
    direction_label: str
    turn_label: str
    confidence: float
    scores: dict[str, float]
    features: DirectionFeatureSet


class DirectionClassifier:
    def classify(
        self,
        frame: NormalizedPoseFrame,
        previous_direction: str | None = None,
    ) -> DirectionClassificationResult:
        features = extract_direction_features(frame)

        if frame.tracking != "tracking_ok":
            return DirectionClassificationResult(
                direction_label=DIRECTION_UNCLASSIFIED,
                turn_label=TURN_NONE,
                confidence=0.0,
                scores={label: 0.0 for label in DIRECTION_LABELS},
                features=features,
            )

        scores = {
            DIRECTION_FRONT: self._score_front(features),
            DIRECTION_LEFT: self._score_left(features),
            DIRECTION_RIGHT: self._score_right(features),
        }
        # This map is built from fixed direction labels, so it should never be empty.
        if not scores:
            return DirectionClassificationResult(
                direction_label=DIRECTION_UNCLASSIFIED,
                turn_label=TURN_NONE,
                confidence=0.0,
                scores={},
                features=features,
            )

        best_label = max(scores, key=scores.get)
        best_score = scores[best_label]
        if best_score < MIN_DIRECTION_CLASSIFICATION_CONFIDENCE:
            best_label = DIRECTION_UNCLASSIFIED

        turn_label = self._resolve_turn_label(previous_direction, best_label)
        return DirectionClassificationResult(
            direction_label=best_label,
            turn_label=turn_label,
            confidence=round(best_score, 4),
            scores={label: round(score, 4) for label, score in scores.items()},
            features=features,
        )

    def _score_front(self, features: DirectionFeatureSet) -> float:
        shoulder_score = (
            1.0 if features.shoulder_balance <= DIRECTION_FRONT_SHOULDER_BALANCE_MAX else 0.0
        )
        ankle_score = 1.0 if features.ankle_balance <= DIRECTION_FRONT_ANKLE_BALANCE_MAX else 0.0
        extent_score = 1.0 if abs(features.side_extent_difference) <= DIRECTION_FRONT_EXTENT_DIFF_MAX else 0.0
        return min(
            (shoulder_score * DIRECTION_FRONT_SHOULDER_WEIGHT)
            + (ankle_score * DIRECTION_FRONT_ANKLE_WEIGHT)
            + (extent_score * DIRECTION_FRONT_EXTENT_WEIGHT),
            1.0,
        )

    def _score_left(self, features: DirectionFeatureSet) -> float:
        extent_score = min(max(features.side_extent_difference, 0.0) / DIRECTION_SIDE_EXTENT_DIFF_REFERENCE, 1.0)
        ankle_score = (
            1.0
            if abs(features.left_ankle_x) >= abs(features.right_ankle_x) + DIRECTION_SIDE_ANKLE_MARGIN
            else 0.0
        )
        return min(
            (extent_score * DIRECTION_SIDE_EXTENT_WEIGHT)
            + (ankle_score * DIRECTION_SIDE_ANKLE_WEIGHT),
            1.0,
        )

    def _score_right(self, features: DirectionFeatureSet) -> float:
        extent_score = min(max(-features.side_extent_difference, 0.0) / DIRECTION_SIDE_EXTENT_DIFF_REFERENCE, 1.0)
        ankle_score = (
            1.0
            if abs(features.right_ankle_x) >= abs(features.left_ankle_x) + DIRECTION_SIDE_ANKLE_MARGIN
            else 0.0
        )
        return min(
            (extent_score * DIRECTION_SIDE_EXTENT_WEIGHT)
            + (ankle_score * DIRECTION_SIDE_ANKLE_WEIGHT),
            1.0,
        )

    def _resolve_turn_label(self, previous_direction: str | None, current_direction: str) -> str:
        if previous_direction is None or current_direction == DIRECTION_UNCLASSIFIED:
            return TURN_NONE
        if previous_direction == current_direction:
            return TURN_NONE
        if current_direction == DIRECTION_LEFT:
            return TURN_LEFT
        if current_direction == DIRECTION_RIGHT:
            return TURN_RIGHT
        if current_direction == DIRECTION_FRONT and previous_direction == DIRECTION_LEFT:
            return TURN_RIGHT
        if current_direction == DIRECTION_FRONT and previous_direction == DIRECTION_RIGHT:
            return TURN_LEFT
        return TURN_NONE
