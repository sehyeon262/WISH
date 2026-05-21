from dataclasses import dataclass


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
class NormalizedPoseFrame:
    tracking: str
    timestamp_ms: int
    scale_reference: float
    hip_center: HipCenter
    landmarks: dict[str, NormalizedLandmark]
