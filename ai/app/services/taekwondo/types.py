from dataclasses import dataclass, field


@dataclass(slots=True)
class RawLandmark:
    name: str
    x: float
    y: float
    z: float | None
    confidence: float | None


@dataclass(slots=True)
class NormalizedLandmark:
    name: str
    x: float
    y: float
    z: float | None
    confidence: float | None


@dataclass(slots=True)
class HipCenter:
    x: float
    y: float


@dataclass(slots=True)
class TrackingQuality:
    status: str
    quality_score: float
    missing_landmarks: list[str]
    landmark_completeness: float
    mean_confidence: float


@dataclass(slots=True)
class NormalizedPoseFrame:
    tracking: str
    quality: TrackingQuality
    timestamp_ms: int
    scale_reference: float
    hip_center: HipCenter
    landmarks: dict[str, NormalizedLandmark]


@dataclass(slots=True)
class CalibrationResult:
    tracking: str
    quality: TrackingQuality
    stable_frame_count: int
    target_stable_frames: int
    frames_remaining: int
    calibration_status: str
    is_calibrated: bool
    failure_reason: str | None
    reference_hip_center: HipCenter | None
    reference_scale: float | None
