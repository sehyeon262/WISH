from math import sqrt

from app.schemas.gymnastics import PoseFrameRequest, PoseLandmarkRequest
from app.services.gymnastics.constants import (
    DEFAULT_MIN_CONFIDENCE,
    LEFT_HIP,
    LEFT_SHOULDER,
    MIN_SCALE_REFERENCE,
    REQUIRED_CENTER_POINTS,
    REQUIRED_MARCH_TRACKING_POINTS,
    REQUIRED_SCALE_POINTS,
    RIGHT_HIP,
    RIGHT_SHOULDER,
)
from app.services.gymnastics.types import HipCenter, NormalizedLandmark, NormalizedPoseFrame, RawLandmark


class PoseNormalizer:
    def __init__(self, min_confidence: float = DEFAULT_MIN_CONFIDENCE):
        self.min_confidence = min_confidence

    def normalize(self, frame: PoseFrameRequest) -> NormalizedPoseFrame:
        raw_landmarks = self._to_raw_landmarks(frame.landmarks)
        filtered_landmarks = self._filter_low_confidence(raw_landmarks)
        mirrored_landmarks = self._apply_mirror(filtered_landmarks, frame.mirrored)
        tracking = self._resolve_tracking_status(mirrored_landmarks)

        hip_center = self._compute_hip_center(mirrored_landmarks)
        scale_reference = self._compute_scale_reference(mirrored_landmarks)
        normalized_landmarks = self._normalize_coordinates(
            landmarks=mirrored_landmarks,
            hip_center=hip_center,
            scale_reference=scale_reference,
        )

        # hip_center retains raw image-space coordinates (0–1) so the evaluator
        # can track pelvis position across frames for the in-place movement check.
        return NormalizedPoseFrame(
            tracking=tracking,
            timestamp_ms=frame.timestamp_ms,
            scale_reference=scale_reference,
            hip_center=hip_center,
            landmarks=normalized_landmarks,
        )

    def _to_raw_landmarks(
        self,
        landmarks: list[PoseLandmarkRequest],
    ) -> dict[str, RawLandmark]:
        return {
            landmark.name: RawLandmark(
                name=landmark.name,
                x=landmark.x,
                y=landmark.y,
                z=landmark.z,
                confidence=landmark.visibility,
            )
            for landmark in landmarks
        }

    def _filter_low_confidence(
        self,
        landmarks: dict[str, RawLandmark],
    ) -> dict[str, RawLandmark]:
        filtered: dict[str, RawLandmark] = {}

        for name, landmark in landmarks.items():
            if landmark.confidence is not None and landmark.confidence < self.min_confidence:
                continue
            filtered[name] = landmark

        return filtered

    def _apply_mirror(
        self,
        landmarks: dict[str, RawLandmark],
        mirrored: bool,
    ) -> dict[str, RawLandmark]:
        if not mirrored:
            return landmarks

        mirrored_landmarks: dict[str, RawLandmark] = {}
        for name, landmark in landmarks.items():
            mirrored_landmarks[name] = RawLandmark(
                name=name,
                x=1.0 - landmark.x,
                y=landmark.y,
                z=landmark.z,
                confidence=landmark.confidence,
            )

        mirrored_landmarks = self._swap_side_pairs(mirrored_landmarks)
        return mirrored_landmarks

    def _swap_side_pairs(self, landmarks: dict[str, RawLandmark]) -> dict[str, RawLandmark]:
        swapped = dict(landmarks)

        left_names = [name for name in landmarks if name.startswith("LEFT_")]
        for left_name in left_names:
            right_name = left_name.replace("LEFT_", "RIGHT_", 1)
            if right_name not in landmarks:
                continue

            left_landmark = swapped[left_name]
            right_landmark = swapped[right_name]

            swapped[left_name] = RawLandmark(
                name=left_name,
                x=right_landmark.x,
                y=right_landmark.y,
                z=right_landmark.z,
                confidence=right_landmark.confidence,
            )
            swapped[right_name] = RawLandmark(
                name=right_name,
                x=left_landmark.x,
                y=left_landmark.y,
                z=left_landmark.z,
                confidence=left_landmark.confidence,
            )

        return swapped

    def _compute_hip_center(self, landmarks: dict[str, RawLandmark]) -> HipCenter:
        if not all(point in landmarks for point in REQUIRED_CENTER_POINTS):
            return HipCenter(x=0.5, y=0.5)

        left_hip = landmarks[LEFT_HIP]
        right_hip = landmarks[RIGHT_HIP]
        return HipCenter(
            x=(left_hip.x + right_hip.x) / 2.0,
            y=(left_hip.y + right_hip.y) / 2.0,
        )

    def _compute_scale_reference(self, landmarks: dict[str, RawLandmark]) -> float:
        if not all(point in landmarks for point in REQUIRED_SCALE_POINTS):
            return 1.0

        left_shoulder = landmarks[LEFT_SHOULDER]
        right_shoulder = landmarks[RIGHT_SHOULDER]

        shoulder_width = sqrt(
            (right_shoulder.x - left_shoulder.x) ** 2
            + (right_shoulder.y - left_shoulder.y) ** 2,
        )

        return max(shoulder_width, MIN_SCALE_REFERENCE)

    def _normalize_coordinates(
        self,
        landmarks: dict[str, RawLandmark],
        hip_center: HipCenter,
        scale_reference: float,
    ) -> dict[str, NormalizedLandmark]:
        normalized: dict[str, NormalizedLandmark] = {}

        for name, landmark in landmarks.items():
            normalized[name] = NormalizedLandmark(
                name=name,
                x=(landmark.x - hip_center.x) / scale_reference,
                y=(landmark.y - hip_center.y) / scale_reference,
                z=(landmark.z / scale_reference) if landmark.z is not None else None,
                confidence=landmark.confidence,
            )

        return normalized

    def _resolve_tracking_status(self, landmarks: dict[str, RawLandmark]) -> str:
        if not landmarks:
            return "tracking_low"

        if not all(point in landmarks for point in REQUIRED_MARCH_TRACKING_POINTS):
            return "tracking_low"

        if not all(point in landmarks for point in REQUIRED_CENTER_POINTS + REQUIRED_SCALE_POINTS):
            return "tracking_low"

        return "tracking_ok"
