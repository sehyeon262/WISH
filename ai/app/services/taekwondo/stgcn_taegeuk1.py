from __future__ import annotations

import json
import warnings
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np

from app.services.taekwondo.classification.basic_motion_classifier import BasicMotionClassifier
from app.services.taekwondo.classification.stance_classifier import StanceClassifier
from app.services.taekwondo.constants import (
    ACTION_LOW_BLOCK,
    ACTION_MIDDLE_PUNCH,
    ACTION_READY,
    LEFT_ANKLE,
    LEFT_ELBOW,
    LEFT_HIP,
    LEFT_KNEE,
    LEFT_SHOULDER,
    LEFT_WRIST,
    RIGHT_ANKLE,
    RIGHT_ELBOW,
    RIGHT_HIP,
    RIGHT_KNEE,
    RIGHT_SHOULDER,
    RIGHT_WRIST,
    STANCE_FRONT,
    STANCE_READY,
    STANCE_WALKING,
)
from app.services.taekwondo.types import HipCenter, NormalizedLandmark, NormalizedPoseFrame, TrackingQuality

try:
    import torch
    from torch import nn
except ImportError:  # pragma: no cover - local docs tooling may not include torch.
    torch = None
    nn = None


RESOURCE_DIR = Path(__file__).resolve().parents[2] / "resources" / "taegeuk1" / "stgcn"
PROTOTYPES_PATH = RESOURCE_DIR / "taegeuk1_prototypes.npz"
SIMILARITY_REPORT_PATH = RESOURCE_DIR / "taegeuk1_similarity_score_report.json"
BODY_PART_REPORT_PATH = RESOURCE_DIR / "taegeuk1_body_part_report_summary.json"
STGCN_CHECKPOINT_PATH = RESOURCE_DIR / "stgcn_taegeuk1_camera_finetuned_best.pt"

TARGET_SEQUENCE_SHAPE = (3, 60, 29)
PASS_THRESHOLD_DEFAULT = 80.0
LEFT_SHOULDER_INDEX = 6
RIGHT_SHOULDER_INDEX = 7
LEFT_HIP_INDEX = 16
RIGHT_HIP_INDEX = 17
MIN_CAMERA_SCALE = 0.05
FINAL_FRAME_WINDOW = 10
RULE_SCORE_START_RATIO = 0.35
RULE_SCORE_CANDIDATE_FRAME_COUNT = 12
TARGET_RULE_STANCE_WEIGHT = 0.55
TARGET_RULE_ACTION_WEIGHT = 0.45
TARGET_RULE_STANCE_FLOOR = 0.9
TARGET_RULE_ACTION_FLOOR = 0.85
TARGET_RULE_LOW_MOTION_SCORE_CAP = 40.0
TARGET_RULE_MIN_SEQUENCE_MOTION = 0.12
TARGET_RULE_ACTION_MOTION_MIN_DELTA = 0.06
TARGET_RULE_ACTION_MOTION_FULL_DELTA = 0.22
TARGET_RULE_MIN_TRACKED_FRAMES_FOR_MOTION = 4
TARGET_RULE_AGGREGATION_MEDIAN_WEIGHT = 0.65
TARGET_RULE_AGGREGATION_TOP_MEAN_WEIGHT = 0.35
SEQUENCE_FINAL_LOW_MOTION_SCORE_CAP = 75.0
SEQUENCE_FINAL_SINGLE_JOINT_MOTION_SCORE_CAP = 65.0
SEQUENCE_FINAL_MIN_ACTIVE_JOINTS = 2
SEQUENCE_FINAL_ACTIVE_JOINT_MIN_RANGE = 0.08
SEQUENCE_CENTERED_PROTOTYPE_WEIGHT = 0.65
SEQUENCE_CENTERED_CAMERA_WEIGHT = 0.15
SEQUENCE_CENTERED_TARGET_RULE_WEIGHT = 0.20
SEQUENCE_CENTERED_LIVE_PROTOTYPE_WEIGHT = 0.25
SEQUENCE_CENTERED_LIVE_CAMERA_WEIGHT = 0.10
SEQUENCE_CENTERED_LIVE_TARGET_RULE_WEIGHT = 0.65
# Live camera input can be farther from the stored prototype because of camera angle and user scale.
# If target-rule scoring already passes, keep most of that rule score while motion caps still guard static poses.
SEQUENCE_CENTERED_LIVE_TARGET_RULE_RECOVERY_RATIO = 0.90
SEQUENCE_CENTERED_WEIGHT_TOTAL = (
    SEQUENCE_CENTERED_PROTOTYPE_WEIGHT
    + SEQUENCE_CENTERED_CAMERA_WEIGHT
    + SEQUENCE_CENTERED_TARGET_RULE_WEIGHT
)
SEQUENCE_CENTERED_LIVE_WEIGHT_TOTAL = (
    SEQUENCE_CENTERED_LIVE_PROTOTYPE_WEIGHT
    + SEQUENCE_CENTERED_LIVE_CAMERA_WEIGHT
    + SEQUENCE_CENTERED_LIVE_TARGET_RULE_WEIGHT
)
if abs(SEQUENCE_CENTERED_WEIGHT_TOTAL - 1.0) > 1e-9:
    raise ValueError("Sequence-centered score weights must sum to 1.0")
if abs(SEQUENCE_CENTERED_LIVE_WEIGHT_TOTAL - 1.0) > 1e-9:
    raise ValueError("Live camera sequence-centered score weights must sum to 1.0")
CORE_SCORING_JOINT_NAMES = (
    "코",
    "목",
    "왼쪽 어깨",
    "오른쪽 어깨",
    "왼쪽 팔꿈치",
    "오른쪽 팔꿈치",
    "왼쪽 손목",
    "오른쪽 손목",
    "왼쪽 엉덩이",
    "오른쪽 엉덩이",
    "가운데 엉덩이",
    "왼쪽 무릎",
    "오른쪽 무릎",
    "왼쪽 발목",
    "오른쪽 발목",
)
KOREAN_TO_TAEKWONDO_LANDMARK = {
    "왼쪽 어깨": LEFT_SHOULDER,
    "오른쪽 어깨": RIGHT_SHOULDER,
    "왼쪽 팔꿈치": LEFT_ELBOW,
    "오른쪽 팔꿈치": RIGHT_ELBOW,
    "왼쪽 손목": LEFT_WRIST,
    "오른쪽 손목": RIGHT_WRIST,
    "왼쪽 엉덩이": LEFT_HIP,
    "오른쪽 엉덩이": RIGHT_HIP,
    "왼쪽 무릎": LEFT_KNEE,
    "오른쪽 무릎": RIGHT_KNEE,
    "왼쪽 발목": LEFT_ANKLE,
    "오른쪽 발목": RIGHT_ANKLE,
}


@dataclass(slots=True)
class Taegeuk1Prediction:
    movement_index: int
    movement_name: str
    probability: float


@dataclass(slots=True)
class Taegeuk1AnalyzeResult:
    session_id: str | None
    target_movement_index: int
    target_movement_name: str
    predicted_movement_index: int
    predicted_movement_name: str
    confidence: float
    top3_predictions: list[Taegeuk1Prediction]
    scored_movement_index: int
    scored_movement_name: str
    classification_match: bool
    score: float
    prototype_score: float
    target_rule_score: float | None
    scoring_method: str
    pass_threshold: float
    passed: bool
    distance: float
    worst_joint: str
    joint_errors_top5: list[dict[str, float | str]]
    body_part_scores: dict[str, float]
    body_part_errors: dict[str, float]
    weakest_body_part: str
    feedback_summary: str


@dataclass(slots=True)
class Taegeuk1Resources:
    prototypes: np.ndarray
    class_names: list[str]
    keypoint_names: list[str]
    similarity_report: dict[str, Any]
    body_part_report: dict[str, Any]


if nn is not None:

    class GraphConv(nn.Module):
        def __init__(self, in_channels: int, out_channels: int, num_joints: int) -> None:
            super().__init__()
            self.register_buffer("adj", torch.eye(num_joints, dtype=torch.float32))
            self.proj = nn.Conv2d(in_channels, out_channels, kernel_size=1)

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            x = torch.einsum("nctv,vw->nctw", x, self.adj)
            return self.proj(x)


    class STGCNBlock(nn.Module):
        def __init__(self, in_channels: int, out_channels: int, num_joints: int) -> None:
            super().__init__()
            self.gcn = GraphConv(in_channels, out_channels, num_joints)
            self.tcn = nn.Sequential(
                nn.BatchNorm2d(out_channels),
                nn.ReLU(inplace=True),
                nn.Conv2d(out_channels, out_channels, kernel_size=(9, 1), padding=(4, 0)),
                nn.BatchNorm2d(out_channels),
                nn.Dropout(0.2),
            )
            if in_channels == out_channels:
                self.residual = nn.Identity()
            else:
                self.residual = nn.Sequential(
                    nn.Conv2d(in_channels, out_channels, kernel_size=1),
                    nn.BatchNorm2d(out_channels),
                )
            self.relu = nn.ReLU(inplace=True)

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            return self.relu(self.tcn(self.gcn(x)) + self.residual(x))


    class STGCNClassifier(nn.Module):
        def __init__(self, num_classes: int, in_channels: int = 3, num_joints: int = 29) -> None:
            super().__init__()
            self.input_bn = nn.BatchNorm1d(in_channels * num_joints)
            self.blocks = nn.ModuleList(
                [
                    STGCNBlock(in_channels, 64, num_joints),
                    STGCNBlock(64, 64, num_joints),
                    STGCNBlock(64, 128, num_joints),
                    STGCNBlock(128, 128, num_joints),
                ]
            )
            self.head = nn.Linear(128, num_classes)

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            batch_size, channels, frames, joints = x.shape
            x = x.permute(0, 3, 1, 2).contiguous().view(batch_size, joints * channels, frames)
            x = self.input_bn(x)
            x = x.view(batch_size, joints, channels, frames).permute(0, 2, 3, 1).contiguous()
            for block in self.blocks:
                x = block(x)
            x = x.mean(dim=(2, 3))
            return self.head(x)

else:
    STGCNClassifier = None


@lru_cache(maxsize=1)
def load_taegeuk1_resources() -> Taegeuk1Resources:
    if not PROTOTYPES_PATH.is_file():
        raise FileNotFoundError(f"Taegeuk 1 prototype file not found: {PROTOTYPES_PATH}")
    if not SIMILARITY_REPORT_PATH.is_file():
        raise FileNotFoundError(f"Taegeuk 1 similarity report not found: {SIMILARITY_REPORT_PATH}")
    if not BODY_PART_REPORT_PATH.is_file():
        raise FileNotFoundError(f"Taegeuk 1 body-part report not found: {BODY_PART_REPORT_PATH}")

    prototype_data = np.load(PROTOTYPES_PATH, allow_pickle=True)
    prototypes = prototype_data["prototypes"].astype(np.float32)
    class_names = [str(name) for name in prototype_data["class_names"].tolist()]
    keypoint_names = [str(name) for name in prototype_data["keypoint_names"].tolist()]

    if tuple(prototypes.shape[1:]) != TARGET_SEQUENCE_SHAPE:
        raise ValueError(f"Unexpected prototype shape: {prototypes.shape}")

    with SIMILARITY_REPORT_PATH.open(encoding="utf-8") as f:
        similarity_report = json.load(f)
    with BODY_PART_REPORT_PATH.open(encoding="utf-8") as f:
        body_part_report = json.load(f)

    return Taegeuk1Resources(
        prototypes=prototypes,
        class_names=class_names,
        keypoint_names=keypoint_names,
        similarity_report=similarity_report,
        body_part_report=body_part_report,
    )


@lru_cache(maxsize=1)
def load_stgcn_model() -> Any | None:
    if torch is None or STGCNClassifier is None:
        return None
    if not STGCN_CHECKPOINT_PATH.is_file():
        raise FileNotFoundError(f"Taegeuk 1 ST-GCN checkpoint not found: {STGCN_CHECKPOINT_PATH}")

    resources = load_taegeuk1_resources()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = STGCNClassifier(num_classes=len(resources.class_names)).to(device)
    checkpoint = torch.load(STGCN_CHECKPOINT_PATH, map_location=device)
    state_dict = checkpoint.get("model_state_dict") or checkpoint.get("state_dict") or checkpoint
    model.load_state_dict(state_dict)
    model.eval()
    return model, device


def analyze_taegeuk1_sequence(
    sequence: Any,
    movement_name: str,
    *,
    session_id: str | None = None,
    input_normalized: bool = True,
    pass_threshold: float = PASS_THRESHOLD_DEFAULT,
) -> Taegeuk1AnalyzeResult:
    resources = load_taegeuk1_resources()
    if movement_name not in resources.class_names:
        raise ValueError(f"Unknown Taegeuk 1 movement: {movement_name}")

    seq = _coerce_sequence(sequence)
    if not input_normalized:
        seq = _normalize_camera_sequence(seq)

    scoring_joint_indexes = _core_scoring_joint_indexes(resources.keypoint_names)
    scoring_keypoint_names = [resources.keypoint_names[index] for index in scoring_joint_indexes]
    distances = np.array(
        [
            _sequence_distance(seq, prototype, joint_indexes=scoring_joint_indexes)[0]
            for prototype in resources.prototypes
        ],
        dtype=np.float32,
    )
    probabilities = _prediction_probabilities(
        seq,
        distances,
        input_normalized=input_normalized,
    )
    prediction_indexes = np.argsort(-probabilities)[:3].tolist()
    top3 = [
        Taegeuk1Prediction(
            movement_index=int(index),
            movement_name=resources.class_names[index],
            probability=round(float(probabilities[index]), 6),
        )
        for index in prediction_indexes
    ]

    predicted_index = int(prediction_indexes[0])
    target_index = resources.class_names.index(movement_name)
    target_prototype = resources.prototypes[target_index]
    distance, joint_errors = _sequence_distance(
        seq,
        target_prototype,
        joint_indexes=scoring_joint_indexes,
    )
    prototype_score = _score_from_distance(
        distance,
        resources.similarity_report["per_class"][movement_name]["distance"],
    )
    camera_score: float | None = None
    target_rule_score: float | None = None
    if not input_normalized:
        camera_score = _camera_adjusted_score(
            absolute_score=prototype_score,
            target_index=target_index,
            distances=distances,
            probabilities=probabilities,
        )
        target_rule_score = _target_rule_score(seq, resources.keypoint_names, movement_name)
    score, scoring_method = _sequence_centered_score(
        prototype_score=prototype_score,
        camera_score=camera_score,
        target_rule_score=target_rule_score,
        live_camera=not input_normalized,
    )
    if not input_normalized:
        score, scoring_method = _apply_sequence_motion_final_cap(
            score,
            scoring_method,
            seq,
            resources.keypoint_names,
        )

    joint_error_rows = [
        {"joint": joint_name, "error": round(float(error), 6)}
        for joint_name, error in zip(scoring_keypoint_names, joint_errors)
    ]
    joint_error_rows.sort(key=lambda row: float(row["error"]), reverse=True)

    body_part_errors, body_part_scores = _body_part_scores(
        joint_errors,
        scoring_keypoint_names,
        resources.body_part_report,
    )
    weakest_body_part = min(body_part_scores, key=body_part_scores.get)

    return Taegeuk1AnalyzeResult(
        session_id=session_id,
        target_movement_index=target_index,
        target_movement_name=movement_name,
        predicted_movement_index=predicted_index,
        predicted_movement_name=resources.class_names[predicted_index],
        confidence=round(float(probabilities[predicted_index]), 6),
        top3_predictions=top3,
        scored_movement_index=target_index,
        scored_movement_name=movement_name,
        classification_match=predicted_index == target_index,
        score=round(float(score), 2),
        prototype_score=round(float(prototype_score), 2),
        target_rule_score=round(float(target_rule_score), 2) if target_rule_score is not None else None,
        scoring_method=scoring_method,
        pass_threshold=round(float(pass_threshold), 2),
        passed=float(score) >= float(pass_threshold),
        distance=round(float(distance), 6),
        worst_joint=str(joint_error_rows[0]["joint"]),
        joint_errors_top5=joint_error_rows[:5],
        body_part_scores={key: round(float(value), 2) for key, value in body_part_scores.items()},
        body_part_errors={key: round(float(value), 6) for key, value in body_part_errors.items()},
        weakest_body_part=weakest_body_part,
        feedback_summary=_feedback_for_body_part(weakest_body_part),
    )


def _coerce_sequence(sequence: Any) -> np.ndarray:
    arr = np.asarray(sequence, dtype=np.float32)
    if arr.ndim != 3:
        raise ValueError(f"sequence must be a 3D array, got shape={arr.shape}")

    if arr.shape == TARGET_SEQUENCE_SHAPE:
        return arr

    if arr.shape[0] == 3 and arr.shape[2] == TARGET_SEQUENCE_SHAPE[2]:
        return _resample_channels_first(arr)

    if arr.shape[1] == TARGET_SEQUENCE_SHAPE[2] and arr.shape[2] in (2, 3):
        if arr.shape[2] == 2:
            visibility = np.ones((arr.shape[0], arr.shape[1], 1), dtype=np.float32)
            arr = np.concatenate([arr, visibility], axis=2)
        return _resample_channels_first(np.transpose(arr, (2, 0, 1)))

    raise ValueError(
        "sequence must have shape (3, 60, 29), (3, T, 29), (T, 29, 3), or (T, 29, 2); "
        f"got shape={arr.shape}"
    )


def _resample_channels_first(sequence: np.ndarray, target_len: int = 60) -> np.ndarray:
    channels, frames, joints = sequence.shape
    if channels != 3 or joints != TARGET_SEQUENCE_SHAPE[2]:
        raise ValueError(f"Unexpected sequence shape: {sequence.shape}")
    if frames == target_len:
        return sequence.astype(np.float32)

    old_x = np.linspace(0.0, 1.0, frames)
    new_x = np.linspace(0.0, 1.0, target_len)
    out = np.empty((channels, target_len, joints), dtype=np.float32)
    for channel in range(channels):
        for joint in range(joints):
            out[channel, :, joint] = np.interp(new_x, old_x, sequence[channel, :, joint])
    return out


def _normalize_camera_sequence(sequence: np.ndarray) -> np.ndarray:
    normalized = sequence.copy()
    xy = normalized[:2]
    hip_centers: list[np.ndarray] = []
    scales: list[float] = []

    for frame_index in range(normalized.shape[1]):
        frame_xy = xy[:, frame_index, :]
        left_hip = frame_xy[:, LEFT_HIP_INDEX]
        right_hip = frame_xy[:, RIGHT_HIP_INDEX]
        left_shoulder = frame_xy[:, LEFT_SHOULDER_INDEX]
        right_shoulder = frame_xy[:, RIGHT_SHOULDER_INDEX]

        if not (
            np.isfinite(left_hip).all()
            and np.isfinite(right_hip).all()
            and np.isfinite(left_shoulder).all()
            and np.isfinite(right_shoulder).all()
        ):
            continue

        hip_center = (left_hip + right_hip) / 2.0
        shoulder_scale = float(np.linalg.norm(right_shoulder - left_shoulder))
        hip_scale = float(np.linalg.norm(right_hip - left_hip))
        scale = max(shoulder_scale, hip_scale)
        if np.isfinite(scale) and scale > 0.0:
            hip_centers.append(hip_center)
            scales.append(max(scale, MIN_CAMERA_SCALE))

    if hip_centers and scales:
        sequence_hip_center = np.median(np.stack(hip_centers), axis=0)
        sequence_scale = max(float(np.median(scales)), MIN_CAMERA_SCALE)
        normalized[:2] = (xy - sequence_hip_center[:, None, None]) / sequence_scale

    normalized[:2] = np.nan_to_num(normalized[:2], nan=0.0, posinf=0.0, neginf=0.0)
    normalized[2] = np.nan_to_num(np.clip(normalized[2], 0.0, 1.0), nan=0.0, posinf=1.0, neginf=0.0)
    return normalized


def _core_scoring_joint_indexes(keypoint_names: list[str]) -> list[int]:
    indexes = [
        index
        for index, name in enumerate(keypoint_names)
        if name in CORE_SCORING_JOINT_NAMES
    ]
    return indexes or list(range(len(keypoint_names)))


def _sequence_distance(
    sequence: np.ndarray,
    prototype: np.ndarray,
    *,
    joint_indexes: list[int] | None = None,
) -> tuple[float, np.ndarray]:
    xy_diff = sequence[:2] - prototype[:2]
    point_errors = np.sqrt(np.sum(xy_diff * xy_diff, axis=0))
    visibility = np.clip((sequence[2] + prototype[2]) / 2.0, 0.0, 1.0)
    if joint_indexes is not None:
        point_errors = point_errors[:, joint_indexes]
        visibility = visibility[:, joint_indexes]
    weight_sum = float(visibility.sum())
    if weight_sum > 1e-6:
        joint_errors = (point_errors * visibility).sum(axis=0) / np.maximum(visibility.sum(axis=0), 1e-6)
        distance = float((point_errors * visibility).sum() / weight_sum)
    else:
        joint_errors = point_errors.mean(axis=0)
        distance = float(point_errors.mean())
    return distance, joint_errors.astype(np.float32)


def _distance_probabilities(distances: np.ndarray) -> np.ndarray:
    logits = -distances * 15.0
    logits = logits - logits.max()
    exp = np.exp(logits)
    return exp / exp.sum()


def _predict_probabilities(sequence: np.ndarray) -> np.ndarray | None:
    model_context = load_stgcn_model()
    if model_context is None:
        return None
    model, device = model_context
    with torch.no_grad():
        tensor = torch.tensor(sequence, dtype=torch.float32, device=device).unsqueeze(0)
        logits = model(tensor)
        probabilities = torch.softmax(logits, dim=1)[0].detach().cpu().numpy()
    return probabilities.astype(np.float32)


def _prediction_probabilities(
    sequence: np.ndarray,
    distances: np.ndarray,
    *,
    input_normalized: bool,
) -> np.ndarray:
    if input_normalized:
        model_probabilities = _predict_probabilities(sequence)
        if model_probabilities is not None:
            return model_probabilities

    return _distance_probabilities(distances)


def _score_from_distance(distance: float, stats: dict[str, float]) -> float:
    min_distance = float(stats.get("min", 0.0))
    p50 = float(stats["p50"])
    p90 = float(stats["p90"])
    p95 = float(stats["p95"])
    max_distance = float(stats.get("max", p95 * 1.5))

    if distance <= p50:
        return _interpolate(distance, min_distance, p50, 100.0, 90.0)
    if distance <= p90:
        return _interpolate(distance, p50, p90, 90.0, 70.0)
    if distance <= p95:
        return _interpolate(distance, p90, p95, 70.0, 50.0)
    return _interpolate(distance, p95, max_distance, 50.0, 0.0)


def _camera_adjusted_score(
    *,
    absolute_score: float,
    target_index: int,
    distances: np.ndarray,
    probabilities: np.ndarray,
) -> float:
    """Stabilize webcam scoring when absolute prototype distance is out of range.

    The original score is calibrated on normalized AIHub-style data. Live webcam
    landmarks can have different scale and camera geometry, so their absolute
    distance may exceed the report max even when the target action is still the
    nearest movement. For live camera input, keep the calibrated score but allow
    target probability and target-distance rank to recover a usable game score.
    """

    target_probability = float(probabilities[target_index])
    probability_score = target_probability * 100.0

    sorted_indexes = np.argsort(distances).tolist()
    target_rank = sorted_indexes.index(target_index) + 1
    best_distance = max(float(distances[sorted_indexes[0]]), 1e-6)
    target_distance = max(float(distances[target_index]), 1e-6)
    distance_ratio = target_distance / best_distance

    if target_rank == 1:
        rank_score = _interpolate(distance_ratio, 1.0, 1.4, 95.0, 82.0)
    elif target_rank == 2:
        rank_score = _interpolate(distance_ratio, 1.0, 1.8, 78.0, 58.0)
    elif target_rank == 3:
        rank_score = _interpolate(distance_ratio, 1.0, 2.2, 68.0, 45.0)
    else:
        rank_score = _interpolate(distance_ratio, 1.0, 3.0, 50.0, 20.0)

    return max(float(absolute_score), probability_score, rank_score)


def _sequence_centered_score(
    *,
    prototype_score: float,
    camera_score: float | None,
    target_rule_score: float | None,
    live_camera: bool = False,
) -> tuple[float, str]:
    prototype = _safe_score(prototype_score, 0.0)
    # Missing supplementary signals fall back to the prototype score so they do not move the final score.
    camera = _safe_score(camera_score, prototype) if camera_score is not None else prototype
    target_rule = _safe_score(target_rule_score, prototype) if target_rule_score is not None else prototype

    # Live camera weights depend on target-rule evidence. If that signal is absent,
    # use the default prototype-centered weights instead of overweighting a fallback value.
    if live_camera and target_rule_score is not None:
        prototype_weight = SEQUENCE_CENTERED_LIVE_PROTOTYPE_WEIGHT
        camera_weight = SEQUENCE_CENTERED_LIVE_CAMERA_WEIGHT
        target_rule_weight = SEQUENCE_CENTERED_LIVE_TARGET_RULE_WEIGHT
    else:
        prototype_weight = SEQUENCE_CENTERED_PROTOTYPE_WEIGHT
        camera_weight = SEQUENCE_CENTERED_CAMERA_WEIGHT
        target_rule_weight = SEQUENCE_CENTERED_TARGET_RULE_WEIGHT

    weighted_score = _safe_score(
        (prototype_weight * prototype)
        + (camera_weight * camera)
        + (target_rule_weight * target_rule),
        prototype,
    )
    if live_camera and target_rule_score is not None and target_rule >= PASS_THRESHOLD_DEFAULT:
        weighted_score = max(
            weighted_score,
            target_rule * SEQUENCE_CENTERED_LIVE_TARGET_RULE_RECOVERY_RATIO,
        )
    weighted_score = max(0.0, min(100.0, weighted_score))
    if camera_score is None and target_rule_score is None:
        return prototype, "prototype_distance"
    if weighted_score > prototype:
        return weighted_score, "sequence_weighted"
    return prototype, "prototype_distance"


def _apply_sequence_motion_final_cap(
    score: float,
    scoring_method: str,
    sequence: np.ndarray,
    keypoint_names: list[str],
) -> tuple[float, str]:
    score = _safe_score(score, 0.0)
    final_motion_cap = _sequence_final_motion_score_cap(sequence, keypoint_names)
    if final_motion_cap < 100.0 and score > final_motion_cap:
        return final_motion_cap, "sequence_motion_limited"
    return score, scoring_method


def _target_rule_score(
    sequence: np.ndarray,
    keypoint_names: list[str],
    movement_name: str,
) -> float | None:
    expected_stance = _expected_stance_label(movement_name)
    expected_action = _expected_action_label(movement_name)
    if expected_stance is None and expected_action is None:
        return None

    candidate_scores: list[float] = []
    for frame in _target_rule_candidate_frames(sequence, keypoint_names):
        try:
            frame_score = _score_target_rule_frame(frame, expected_stance, expected_action)
        except (FloatingPointError, IndexError, ValueError):
            continue
        if frame_score is not None:
            candidate_scores.append(frame_score)

    if not candidate_scores:
        return None

    score = _safe_score(_aggregate_target_rule_frame_scores(candidate_scores), 0.0)
    motion_score_cap = _safe_score(
        _sequence_motion_score_cap(sequence, keypoint_names),
        TARGET_RULE_LOW_MOTION_SCORE_CAP,
    )
    score = min(score, motion_score_cap)

    action_motion_cap = _target_action_motion_score_cap(
        sequence,
        keypoint_names,
        movement_name,
        expected_action,
    )
    if action_motion_cap is not None:
        score = min(score, _safe_score(action_motion_cap, TARGET_RULE_LOW_MOTION_SCORE_CAP))

    return _safe_score(score, 0.0)


def _safe_score(value: float | None, default: float) -> float:
    if value is None:
        return default
    try:
        score = float(value)
    except (TypeError, ValueError):
        return default
    if not np.isfinite(score):
        return default
    return score


def _aggregate_target_rule_frame_scores(frame_scores: list[float]) -> float:
    scores = np.asarray([score for score in frame_scores if np.isfinite(score)], dtype=np.float32)
    if scores.size == 0:
        return 0.0
    if scores.size == 1:
        return float(scores[0])

    sorted_scores = np.sort(scores)
    top_count = max(1, min(scores.size, scores.size // 2))
    top_scores = sorted_scores[-top_count:]
    return float(
        (TARGET_RULE_AGGREGATION_MEDIAN_WEIGHT * np.median(scores))
        + (TARGET_RULE_AGGREGATION_TOP_MEAN_WEIGHT * np.mean(top_scores))
    )


def _score_target_rule_frame(
    frame: NormalizedPoseFrame,
    expected_stance: str | None,
    expected_action: str | None,
) -> float | None:
    stance_score = None
    action_score = None

    if expected_stance is not None:
        stance_result = StanceClassifier().classify(frame)
        stance_score = float(stance_result.scores.get(expected_stance, 0.0))
    if expected_action is not None:
        action_result = BasicMotionClassifier().classify(frame)
        action_score = float(action_result.scores.get(expected_action, 0.0))

    if stance_score is not None and action_score is not None:
        combined_score = 100.0 * (
            (stance_score * TARGET_RULE_STANCE_WEIGHT) + (action_score * TARGET_RULE_ACTION_WEIGHT)
        )
        stance_floor_score = 100.0 * stance_score * TARGET_RULE_STANCE_FLOOR
        action_floor_score = 100.0 * action_score * TARGET_RULE_ACTION_FLOOR
        return min(100.0, max(combined_score, stance_floor_score, action_floor_score))
    if stance_score is not None:
        return 100.0 * stance_score
    if action_score is not None:
        return 100.0 * action_score
    return None


def _target_rule_candidate_frames(
    sequence: np.ndarray,
    keypoint_names: list[str],
) -> list[NormalizedPoseFrame]:
    if sequence.ndim != 3 or sequence.shape[1] <= 0:
        return []

    start_frame = max(0, min(sequence.shape[1] - 1, int(sequence.shape[1] * RULE_SCORE_START_RATIO)))
    candidates: list[NormalizedPoseFrame] = []

    final_frame = _sequence_to_pose_frame(sequence, keypoint_names)
    if final_frame.landmarks:
        candidates.append(final_frame)

    for frame_index in _target_rule_candidate_frame_indexes(sequence.shape[1], start_frame):
        frame = _sequence_frame_to_pose_frame(sequence, keypoint_names, frame_index)
        if frame.landmarks:
            candidates.append(frame)

    return candidates


def _target_rule_candidate_frame_indexes(frame_count: int, start_frame: int) -> list[int]:
    if frame_count <= 0:
        return []

    start_frame = max(0, min(frame_count - 1, start_frame))
    end_frame = frame_count - 1
    span = end_frame - start_frame + 1
    if span <= RULE_SCORE_CANDIDATE_FRAME_COUNT:
        return list(range(start_frame, end_frame + 1))

    sampled = np.linspace(start_frame, end_frame, RULE_SCORE_CANDIDATE_FRAME_COUNT)
    return sorted({int(round(frame_index)) for frame_index in sampled})


def _sequence_final_motion_score_cap(sequence: np.ndarray, keypoint_names: list[str]) -> float:
    motion_amount = _sequence_motion_amount(sequence, keypoint_names)
    if not np.isfinite(motion_amount) or motion_amount <= 0.0:
        return TARGET_RULE_LOW_MOTION_SCORE_CAP

    if motion_amount < TARGET_RULE_MIN_SEQUENCE_MOTION:
        motion_cap = _safe_score(
            _interpolate(
                motion_amount,
                0.0,
                TARGET_RULE_MIN_SEQUENCE_MOTION,
                TARGET_RULE_LOW_MOTION_SCORE_CAP,
                SEQUENCE_FINAL_LOW_MOTION_SCORE_CAP,
            ),
            TARGET_RULE_LOW_MOTION_SCORE_CAP,
        )
    else:
        motion_cap = 100.0

    active_joint_count = _sequence_active_joint_count(sequence, keypoint_names)
    if active_joint_count < SEQUENCE_FINAL_MIN_ACTIVE_JOINTS:
        return min(motion_cap, SEQUENCE_FINAL_SINGLE_JOINT_MOTION_SCORE_CAP)
    return motion_cap


def _sequence_motion_score_cap(sequence: np.ndarray, keypoint_names: list[str]) -> float:
    motion_amount = _sequence_motion_amount(sequence, keypoint_names)
    if not np.isfinite(motion_amount) or motion_amount < 0.0:
        return TARGET_RULE_LOW_MOTION_SCORE_CAP
    if motion_amount >= TARGET_RULE_MIN_SEQUENCE_MOTION:
        return 100.0

    return _safe_score(
        _interpolate(
            motion_amount,
            0.0,
            TARGET_RULE_MIN_SEQUENCE_MOTION,
            TARGET_RULE_LOW_MOTION_SCORE_CAP,
            100.0,
        ),
        TARGET_RULE_LOW_MOTION_SCORE_CAP,
    )


def _sequence_motion_amount(sequence: np.ndarray, keypoint_names: list[str]) -> float:
    joint_ranges = _sequence_joint_motion_ranges(sequence, keypoint_names)
    if not joint_ranges:
        return 0.0

    range_values = np.asarray(joint_ranges, dtype=np.float32)
    range_values = range_values[np.isfinite(range_values)]
    if range_values.size == 0:
        return 0.0
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=RuntimeWarning)
        motion_amount = float(np.nanpercentile(range_values, 75))
    if not np.isfinite(motion_amount):
        return 0.0
    return motion_amount


def _sequence_active_joint_count(sequence: np.ndarray, keypoint_names: list[str]) -> int:
    return sum(
        1
        for joint_range in _sequence_joint_motion_ranges(sequence, keypoint_names)
        if joint_range >= SEQUENCE_FINAL_ACTIVE_JOINT_MIN_RANGE
    )


def _sequence_joint_motion_ranges(sequence: np.ndarray, keypoint_names: list[str]) -> list[float]:
    indexes = _landmark_indexes(
        keypoint_names,
        (
            LEFT_WRIST,
            RIGHT_WRIST,
            LEFT_ELBOW,
            RIGHT_ELBOW,
            LEFT_KNEE,
            RIGHT_KNEE,
            LEFT_ANKLE,
            RIGHT_ANKLE,
        ),
    )
    if not indexes:
        return []

    joint_ranges: list[float] = []
    for index in indexes.values():
        points = _tracked_joint_points(sequence, index)
        if points is None or points.size == 0 or not np.isfinite(points).all():
            continue
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", category=RuntimeWarning)
            lower = np.nanpercentile(points, 10, axis=0)
            upper = np.nanpercentile(points, 90, axis=0)
        ranges = upper - lower
        if np.isfinite(ranges).all():
            joint_ranges.append(float(np.linalg.norm(ranges)))

    return joint_ranges


def _target_action_motion_score_cap(
    sequence: np.ndarray,
    keypoint_names: list[str],
    movement_name: str,
    expected_action: str | None,
) -> float | None:
    if expected_action == ACTION_LOW_BLOCK:
        delta = _max_wrist_vertical_delta(sequence, keypoint_names, direction="down")
    elif expected_action == ACTION_MIDDLE_PUNCH:
        delta = _max_arm_extension_delta(sequence, keypoint_names)
    elif _movement_requires_inner_block(movement_name):
        delta = _max_wrist_horizontal_delta(sequence, keypoint_names)
    elif _movement_requires_face_block(movement_name):
        delta = _max_wrist_vertical_delta(sequence, keypoint_names, direction="up")
    else:
        return None

    if delta is None or not np.isfinite(delta):
        return TARGET_RULE_LOW_MOTION_SCORE_CAP

    return _safe_score(
        _interpolate(
            delta,
            TARGET_RULE_ACTION_MOTION_MIN_DELTA,
            TARGET_RULE_ACTION_MOTION_FULL_DELTA,
            TARGET_RULE_LOW_MOTION_SCORE_CAP,
            100.0,
        ),
        TARGET_RULE_LOW_MOTION_SCORE_CAP,
    )


def _movement_requires_face_block(movement_name: str) -> bool:
    return "얼굴막" in movement_name


def _movement_requires_inner_block(movement_name: str) -> bool:
    return "안막" in movement_name


def _max_wrist_vertical_delta(
    sequence: np.ndarray,
    keypoint_names: list[str],
    *,
    direction: str,
) -> float | None:
    indexes = _landmark_indexes(keypoint_names, (LEFT_WRIST, RIGHT_WRIST))
    deltas: list[float] = []
    for index in indexes.values():
        early = _joint_phase_median(sequence, index, 0.0, 0.35)
        late = _joint_phase_median(sequence, index, 0.65, 1.0)
        if early is None or late is None:
            continue
        if direction == "up":
            delta = float(early[1] - late[1])
        else:
            delta = float(late[1] - early[1])
        if np.isfinite(delta):
            deltas.append(delta)

    return max(deltas) if deltas else None


def _max_wrist_horizontal_delta(sequence: np.ndarray, keypoint_names: list[str]) -> float | None:
    indexes = _landmark_indexes(keypoint_names, (LEFT_WRIST, RIGHT_WRIST))
    deltas: list[float] = []
    for index in indexes.values():
        early = _joint_phase_median(sequence, index, 0.0, 0.35)
        late = _joint_phase_median(sequence, index, 0.65, 1.0)
        if early is None or late is None:
            continue

        delta = float(abs(late[0] - early[0]))
        if np.isfinite(delta):
            deltas.append(delta)

    return max(deltas) if deltas else None


def _max_arm_extension_delta(sequence: np.ndarray, keypoint_names: list[str]) -> float | None:
    indexes = _landmark_indexes(
        keypoint_names,
        (LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_WRIST, RIGHT_WRIST),
    )
    side_pairs = (
        (LEFT_SHOULDER, LEFT_WRIST),
        (RIGHT_SHOULDER, RIGHT_WRIST),
    )
    deltas: list[float] = []

    for shoulder_name, wrist_name in side_pairs:
        shoulder_index = indexes.get(shoulder_name)
        wrist_index = indexes.get(wrist_name)
        if shoulder_index is None or wrist_index is None:
            continue

        early_shoulder = _joint_phase_median(sequence, shoulder_index, 0.0, 0.35)
        early_wrist = _joint_phase_median(sequence, wrist_index, 0.0, 0.35)
        late_shoulder = _joint_phase_median(sequence, shoulder_index, 0.65, 1.0)
        late_wrist = _joint_phase_median(sequence, wrist_index, 0.65, 1.0)
        if (
            early_shoulder is None
            or early_wrist is None
            or late_shoulder is None
            or late_wrist is None
        ):
            continue

        early_extension = float(np.linalg.norm(early_wrist - early_shoulder))
        late_extension = float(np.linalg.norm(late_wrist - late_shoulder))
        delta = late_extension - early_extension
        if np.isfinite(delta):
            deltas.append(delta)

    return max(deltas) if deltas else None


def _landmark_indexes(keypoint_names: list[str], landmark_names: tuple[str, ...]) -> dict[str, int]:
    requested = set(landmark_names)
    indexes: dict[str, int] = {}
    for index, korean_name in enumerate(keypoint_names):
        landmark_name = KOREAN_TO_TAEKWONDO_LANDMARK.get(korean_name)
        if landmark_name in requested:
            indexes[landmark_name] = index
    return indexes


def _tracked_joint_points(sequence: np.ndarray, joint_index: int) -> np.ndarray | None:
    if sequence.ndim != 3 or sequence.shape[0] < 2 or joint_index >= sequence.shape[2]:
        return None

    points = sequence[:2, :, joint_index].T
    valid = np.isfinite(points).all(axis=1)
    if sequence.shape[0] > 2:
        confidence = sequence[2, :, joint_index]
        valid &= np.isfinite(confidence) & (confidence > 0.0)

    if int(np.count_nonzero(valid)) < TARGET_RULE_MIN_TRACKED_FRAMES_FOR_MOTION:
        return None
    return points[valid]


def _joint_phase_median(
    sequence: np.ndarray,
    joint_index: int,
    start_ratio: float,
    end_ratio: float,
) -> np.ndarray | None:
    if sequence.ndim != 3 or sequence.shape[1] <= 0:
        return None

    frame_count = sequence.shape[1]
    start = max(0, min(frame_count - 1, int(round(frame_count * start_ratio))))
    end = max(start + 1, min(frame_count, int(round(frame_count * end_ratio))))
    if end <= start:
        return None

    phase = sequence[:, start:end, :]
    points = _tracked_joint_points(phase, joint_index)
    if points is None:
        return None

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=RuntimeWarning)
        median = np.nanmedian(points, axis=0)
    if not np.isfinite(median).all():
        return None
    return median.astype(np.float32)


def _expected_stance_label(movement_name: str) -> str | None:
    if movement_name == "기본준비":
        return STANCE_READY
    if movement_name.startswith("앞굽이"):
        return STANCE_FRONT
    if movement_name.startswith("앞서고") or movement_name.startswith("앞차고"):
        return STANCE_WALKING
    return None


def _expected_action_label(movement_name: str) -> str | None:
    if movement_name == "기본준비":
        return ACTION_READY
    if "아래막" in movement_name:
        return ACTION_LOW_BLOCK
    if "지르기" in movement_name:
        return ACTION_MIDDLE_PUNCH
    return None


def _sequence_to_pose_frame(sequence: np.ndarray, keypoint_names: list[str]) -> NormalizedPoseFrame:
    start = max(0, sequence.shape[1] - FINAL_FRAME_WINDOW)
    frame_values = _safe_nanmedian(sequence[:, start:, :], axis=1)
    return _frame_values_to_pose_frame(frame_values, keypoint_names)


def _sequence_frame_to_pose_frame(
    sequence: np.ndarray,
    keypoint_names: list[str],
    frame_index: int,
) -> NormalizedPoseFrame:
    frame_values = sequence[:, frame_index, :]
    return _frame_values_to_pose_frame(frame_values, keypoint_names)


def _frame_values_to_pose_frame(frame_values: np.ndarray, keypoint_names: list[str]) -> NormalizedPoseFrame:
    if frame_values.ndim != 2 or frame_values.shape[0] < 2:
        raise ValueError(f"frame_values must have shape (channels, joints), got {frame_values.shape}")

    landmarks: dict[str, NormalizedLandmark] = {}
    missing_landmarks: list[str] = []
    expected_landmark_count = 0

    for index, korean_name in enumerate(keypoint_names):
        landmark_name = KOREAN_TO_TAEKWONDO_LANDMARK.get(korean_name)
        if landmark_name is None:
            continue
        expected_landmark_count += 1
        if index >= frame_values.shape[1]:
            missing_landmarks.append(landmark_name)
            continue

        x = float(frame_values[0, index])
        y = float(frame_values[1, index])
        if not (np.isfinite(x) and np.isfinite(y)):
            missing_landmarks.append(landmark_name)
            continue

        confidence = float(frame_values[2, index]) if frame_values.shape[0] > 2 else 0.0
        if not np.isfinite(confidence):
            confidence = 0.0
        confidence = min(max(confidence, 0.0), 1.0)

        landmarks[landmark_name] = NormalizedLandmark(
            name=landmark_name,
            x=x,
            y=y,
            z=None,
            confidence=confidence,
        )

    confidences = [landmark.confidence or 0.0 for landmark in landmarks.values()]
    mean_confidence = float(np.mean(confidences)) if confidences else 0.0
    landmark_completeness = (
        len(landmarks) / expected_landmark_count if expected_landmark_count > 0 else 0.0
    )
    tracking_status = "tracking_ok" if landmarks else "tracking_lost"
    quality = TrackingQuality(
        status=tracking_status,
        quality_score=mean_confidence,
        missing_landmarks=missing_landmarks,
        landmark_completeness=landmark_completeness,
        mean_confidence=mean_confidence,
    )
    return NormalizedPoseFrame(
        tracking=tracking_status,
        quality=quality,
        timestamp_ms=0,
        scale_reference=1.0,
        hip_center=HipCenter(x=0.0, y=0.0),
        landmarks=landmarks,
    )


def _safe_nanmedian(values: np.ndarray, axis: int) -> np.ndarray:
    if values.size == 0:
        channels = values.shape[0] if values.ndim >= 1 else TARGET_SEQUENCE_SHAPE[0]
        joints = values.shape[2] if values.ndim >= 3 else TARGET_SEQUENCE_SHAPE[2]
        return np.full((channels, joints), np.nan, dtype=np.float32)

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=RuntimeWarning)
        median = np.nanmedian(values, axis=axis)
    return median.astype(np.float32)


def _interpolate(value: float, x0: float, x1: float, y0: float, y1: float) -> float:
    if abs(x1 - x0) < 1e-9:
        return max(0.0, min(100.0, y1))
    ratio = (value - x0) / (x1 - x0)
    score = y0 + ratio * (y1 - y0)
    return max(0.0, min(100.0, score))


def _body_part_scores(
    joint_errors: np.ndarray,
    keypoint_names: list[str],
    body_part_report: dict[str, Any],
) -> tuple[dict[str, float], dict[str, float]]:
    name_to_index = {name: index for index, name in enumerate(keypoint_names)}
    body_part_errors: dict[str, float] = {}
    body_part_scores: dict[str, float] = {}
    reference = body_part_report["part_reference_error_p90"]

    for part, joints in body_part_report["body_parts"].items():
        indexes = [name_to_index[name] for name in joints if name in name_to_index]
        if not indexes:
            continue
        error = float(joint_errors[indexes].mean())
        ref_error = max(float(reference[part]), 1e-6)
        score = max(0.0, min(100.0, 100.0 - 35.0 * (error / ref_error)))
        body_part_errors[part] = error
        body_part_scores[part] = score

    return body_part_errors, body_part_scores


def _feedback_for_body_part(body_part: str) -> str:
    feedback = {
        "머리": "시선과 머리 위치의 흔들림이 상대적으로 큽니다.",
        "팔": "팔 동작의 위치 차이가 상대적으로 큽니다.",
        "몸통": "몸통 중심과 상체 정렬 차이가 상대적으로 큽니다.",
        "다리": "다리 자세와 중심 이동 차이가 상대적으로 큽니다.",
    }
    return feedback.get(body_part, "목표 동작과 차이가 큰 부위를 다시 확인해 주세요.")
