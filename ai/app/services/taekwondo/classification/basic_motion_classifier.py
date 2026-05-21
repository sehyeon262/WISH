from dataclasses import dataclass

from app.services.taekwondo.constants import (
    ACTION_LABELS,
    ACTION_LOW_BLOCK,
    ACTION_MIDDLE_PUNCH,
    ACTION_READY,
    ACTION_UNCLASSIFIED,
    ELBOW_BENT_MAX,
    ELBOW_BENT_MIN,
    ELBOW_EXTENDED_THRESHOLD,
    ELBOW_SEMI_EXTENDED_THRESHOLD,
    ELBOW_SLIGHTLY_BENT_MAX,
    LOW_BLOCK_EXTENDED_ARM_WEIGHT,
    LOW_BLOCK_FAR_FROM_CENTER_REFERENCE,
    LOW_BLOCK_FAR_FROM_CENTER_WEIGHT,
    LOW_BLOCK_OPPOSITE_NEAR_HIP_WEIGHT,
    LOW_BLOCK_WRIST_LOW_WEIGHT,
    LOW_BLOCK_WRIST_Y_MIN,
    MIDDLE_PUNCH_EXTENDED_ARM_WEIGHT,
    MIDDLE_PUNCH_FAR_FROM_CENTER_REFERENCE,
    MIDDLE_PUNCH_FAR_FROM_CENTER_WEIGHT,
    MIDDLE_PUNCH_OPPOSITE_NEAR_HIP_WEIGHT,
    MIDDLE_PUNCH_TORSO_HEIGHT_WEIGHT,
    MIDDLE_PUNCH_WRIST_Y_MAX,
    MIDDLE_PUNCH_WRIST_Y_MIN,
    MIN_CLASSIFICATION_CONFIDENCE,
    READY_BOTH_NEAR_HIPS_WEIGHT,
    READY_ELBOWS_NOT_LOCKED_WEIGHT,
    READY_HANDS_BALANCED_WEIGHT,
    READY_HANDS_BALANCED_Y_DIFF_MAX,
    READY_HANDS_NOT_EXTENDED_WEIGHT,
    READY_HANDS_NOT_EXTENDED_X_MAX,
)
from app.services.taekwondo.features.basic_motion_features import (
    BasicMotionFeatureSet,
    extract_basic_motion_features,
)
from app.services.taekwondo.types import NormalizedPoseFrame


@dataclass(slots=True)
class BasicMotionClassificationResult:
    action_label: str
    confidence: float
    dominant_side: str | None
    scores: dict[str, float]
    features: BasicMotionFeatureSet


class BasicMotionClassifier:
    def classify(self, frame: NormalizedPoseFrame) -> BasicMotionClassificationResult:
        features = extract_basic_motion_features(frame)

        if frame.tracking != "tracking_ok":
            return BasicMotionClassificationResult(
                action_label=ACTION_UNCLASSIFIED,
                confidence=0.0,
                dominant_side=features.dominant_action_side,
                scores={label: 0.0 for label in ACTION_LABELS},
                features=features,
            )

        scores = {
            ACTION_READY: self._score_ready(features),
            ACTION_LOW_BLOCK: self._score_low_block(features),
            ACTION_MIDDLE_PUNCH: self._score_middle_punch(features),
        }

        best_label = max(scores, key=scores.get)
        best_score = scores[best_label]

        if best_score < MIN_CLASSIFICATION_CONFIDENCE:
            return BasicMotionClassificationResult(
                action_label=ACTION_UNCLASSIFIED,
                confidence=round(best_score, 4),
                dominant_side=features.dominant_action_side,
                scores={label: round(score, 4) for label, score in scores.items()},
                features=features,
            )

        return BasicMotionClassificationResult(
            action_label=best_label,
            confidence=round(best_score, 4),
            dominant_side=features.dominant_action_side,
            scores={label: round(score, 4) for label, score in scores.items()},
            features=features,
        )

    def _score_ready(self, features: BasicMotionFeatureSet) -> float:
        both_near_hips = features.left_wrist_near_hip and features.right_wrist_near_hip
        hands_balanced = abs(features.left_wrist_y - features.right_wrist_y) <= READY_HANDS_BALANCED_Y_DIFF_MAX
        hands_not_extended = (
            features.left_wrist_far_from_center <= READY_HANDS_NOT_EXTENDED_X_MAX
            and features.right_wrist_far_from_center <= READY_HANDS_NOT_EXTENDED_X_MAX
        )
        elbows_not_locked = self._max_score(
            self._bent_elbow_score(features.left_elbow_angle),
            self._bent_elbow_score(features.right_elbow_angle),
        )

        score = 0.0
        score += READY_BOTH_NEAR_HIPS_WEIGHT if both_near_hips else 0.0
        score += READY_HANDS_BALANCED_WEIGHT if hands_balanced else 0.0
        score += READY_HANDS_NOT_EXTENDED_WEIGHT if hands_not_extended else 0.0
        score += elbows_not_locked * READY_ELBOWS_NOT_LOCKED_WEIGHT
        return min(score, 1.0)

    def _score_low_block(self, features: BasicMotionFeatureSet) -> float:
        return max(
            self._score_low_block_side(features, "left"),
            self._score_low_block_side(features, "right"),
        )

    def _score_low_block_side(self, features: BasicMotionFeatureSet, side: str) -> float:
        wrist_y = features.left_wrist_y if side == "left" else features.right_wrist_y
        far_from_center = (
            features.left_wrist_far_from_center
            if side == "left"
            else features.right_wrist_far_from_center
        )
        elbow_angle = features.left_elbow_angle if side == "left" else features.right_elbow_angle
        opposite_near_hip = features.right_wrist_near_hip if side == "left" else features.left_wrist_near_hip

        score = 0.0
        score += LOW_BLOCK_WRIST_LOW_WEIGHT if wrist_y >= LOW_BLOCK_WRIST_Y_MIN else 0.0
        score += min(far_from_center / LOW_BLOCK_FAR_FROM_CENTER_REFERENCE, 1.0) * LOW_BLOCK_FAR_FROM_CENTER_WEIGHT
        score += self._extended_arm_score(elbow_angle) * LOW_BLOCK_EXTENDED_ARM_WEIGHT
        score += LOW_BLOCK_OPPOSITE_NEAR_HIP_WEIGHT if opposite_near_hip else 0.0
        return min(score, 1.0)

    def _score_middle_punch(self, features: BasicMotionFeatureSet) -> float:
        return max(
            self._score_middle_punch_side(features, "left"),
            self._score_middle_punch_side(features, "right"),
        )

    def _score_middle_punch_side(self, features: BasicMotionFeatureSet, side: str) -> float:
        wrist_y = features.left_wrist_y if side == "left" else features.right_wrist_y
        far_from_center = (
            features.left_wrist_far_from_center
            if side == "left"
            else features.right_wrist_far_from_center
        )
        elbow_angle = features.left_elbow_angle if side == "left" else features.right_elbow_angle
        opposite_near_hip = features.right_wrist_near_hip if side == "left" else features.left_wrist_near_hip

        torso_height_score = 1.0 if MIDDLE_PUNCH_WRIST_Y_MIN <= wrist_y <= MIDDLE_PUNCH_WRIST_Y_MAX else 0.0

        score = 0.0
        score += torso_height_score * MIDDLE_PUNCH_TORSO_HEIGHT_WEIGHT
        score += min(far_from_center / MIDDLE_PUNCH_FAR_FROM_CENTER_REFERENCE, 1.0) * MIDDLE_PUNCH_FAR_FROM_CENTER_WEIGHT
        score += self._extended_arm_score(elbow_angle) * MIDDLE_PUNCH_EXTENDED_ARM_WEIGHT
        score += MIDDLE_PUNCH_OPPOSITE_NEAR_HIP_WEIGHT if opposite_near_hip else 0.0
        return min(score, 1.0)

    def _extended_arm_score(self, elbow_angle: float | None) -> float:
        if elbow_angle is None:
            return 0.0
        if elbow_angle >= ELBOW_EXTENDED_THRESHOLD:
            return 1.0
        if elbow_angle >= ELBOW_SEMI_EXTENDED_THRESHOLD:
            return 0.7
        return 0.0

    def _bent_elbow_score(self, elbow_angle: float | None) -> float:
        if elbow_angle is None:
            return 0.0
        if ELBOW_BENT_MIN <= elbow_angle <= ELBOW_BENT_MAX:
            return 1.0
        if ELBOW_BENT_MAX < elbow_angle <= ELBOW_SLIGHTLY_BENT_MAX:
            return 0.5
        return 0.0

    def _max_score(self, first: float, second: float) -> float:
        return first if first >= second else second
