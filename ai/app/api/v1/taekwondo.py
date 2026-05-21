import logging

import numpy as np
from fastapi import APIRouter, HTTPException

from app.schemas.gymnastics import HipCenterResponse, NormalizedLandmarkResponse
from app.schemas.taekwondo import (
    TaekwondoBasicMotionClassificationRequest,
    TaekwondoBasicMotionClassificationResponse,
    TaekwondoBasicMotionFeaturesResponse,
    TaekwondoCalibrationRequest,
    TaekwondoCalibrationResponse,
    TaekwondoDirectionClassificationRequest,
    TaekwondoDirectionClassificationResponse,
    TaekwondoDirectionFeaturesResponse,
    TaekwondoDtwScoreDetail,
    TaekwondoLstmScoreDetail,
    TaekwondoNormalizedPoseResponse,
    TaekwondoPoseFrameRequest,
    TaekwondoScoringRequest,
    TaekwondoScoringResponse,
    TaekwondoStanceClassificationRequest,
    TaekwondoStanceClassificationResponse,
    TaekwondoStanceFeaturesResponse,
    Taegeuk1AnalyzeRequest,
    Taegeuk1AnalyzeResponse,
    TrackingQualityResponse,
)
from app.services.taekwondo.calibration.calibration_service import CalibrationService
from app.services.taekwondo.classification.basic_motion_classifier import (
    BasicMotionClassificationResult,
    BasicMotionClassifier,
)
from app.services.taekwondo.classification.direction_classifier import (
    DirectionClassificationResult,
    DirectionClassifier,
)
from app.services.taekwondo.classification.stance_classifier import (
    StanceClassificationResult,
    StanceClassifier,
)
from app.services.taekwondo.normalization.pose_normalizer import PoseNormalizer
from app.services.taekwondo.scoring import EnsembleScoreResult, score_ensemble
from app.services.taekwondo.stgcn_taegeuk1 import Taegeuk1AnalyzeResult, analyze_taegeuk1_sequence
from app.services.taekwondo.types import CalibrationResult, NormalizedPoseFrame

logger = logging.getLogger(__name__)

# 채점 입력 시퀀스의 관절 차원 (LSTM AE INPUT_DIM 과 일치해야 함)
SCORING_JOINT_DIM = 8

router = APIRouter(prefix="/taekwondo", tags=["taekwondo"])

normalizer = PoseNormalizer()
calibration_service = CalibrationService(normalizer=normalizer)
basic_motion_classifier = BasicMotionClassifier()
direction_classifier = DirectionClassifier()
stance_classifier = StanceClassifier()


def to_tracking_quality_response(frame: NormalizedPoseFrame | CalibrationResult) -> TrackingQualityResponse:
    return TrackingQualityResponse(
        quality_score=frame.quality.quality_score,
        missing_landmarks=frame.quality.missing_landmarks,
        landmark_completeness=frame.quality.landmark_completeness,
        mean_confidence=frame.quality.mean_confidence,
    )


def to_taekwondo_normalized_pose_response(frame: NormalizedPoseFrame) -> TaekwondoNormalizedPoseResponse:
    landmarks = [
        NormalizedLandmarkResponse(
            name=landmark.name,
            x=landmark.x,
            y=landmark.y,
            z=landmark.z,
            confidence=landmark.confidence,
        )
        for landmark in sorted(frame.landmarks.values(), key=lambda item: item.name)
    ]

    return TaekwondoNormalizedPoseResponse(
        tracking=frame.tracking,
        timestamp_ms=frame.timestamp_ms,
        scale_reference=frame.scale_reference,
        hip_center=HipCenterResponse(x=frame.hip_center.x, y=frame.hip_center.y),
        landmarks=landmarks,
        tracking_quality=to_tracking_quality_response(frame),
    )


def to_taekwondo_calibration_response(result: CalibrationResult) -> TaekwondoCalibrationResponse:
    return TaekwondoCalibrationResponse(
        tracking=result.tracking,
        tracking_quality=to_tracking_quality_response(result),
        stable_frame_count=result.stable_frame_count,
        target_stable_frames=result.target_stable_frames,
        frames_remaining=result.frames_remaining,
        calibration_status=result.calibration_status,
        is_calibrated=result.is_calibrated,
        failure_reason=result.failure_reason,
        reference_hip_center=(
            HipCenterResponse(
                x=result.reference_hip_center.x,
                y=result.reference_hip_center.y,
            )
            if result.reference_hip_center is not None
            else None
        ),
        reference_scale=result.reference_scale,
    )


def to_taekwondo_basic_motion_response(
    frame: NormalizedPoseFrame,
    result: BasicMotionClassificationResult,
) -> TaekwondoBasicMotionClassificationResponse:
    return TaekwondoBasicMotionClassificationResponse(
        tracking=frame.tracking,
        tracking_quality=to_tracking_quality_response(frame),
        action_label=result.action_label,
        confidence=result.confidence,
        dominant_side=result.dominant_side,
        scores=result.scores,
        features=TaekwondoBasicMotionFeaturesResponse(
            left_wrist_y=result.features.left_wrist_y,
            right_wrist_y=result.features.right_wrist_y,
            left_wrist_far_from_center=result.features.left_wrist_far_from_center,
            right_wrist_far_from_center=result.features.right_wrist_far_from_center,
            left_wrist_to_hip_distance=result.features.left_wrist_to_hip_distance,
            right_wrist_to_hip_distance=result.features.right_wrist_to_hip_distance,
            left_elbow_angle=result.features.left_elbow_angle,
            right_elbow_angle=result.features.right_elbow_angle,
            left_wrist_near_hip=result.features.left_wrist_near_hip,
            right_wrist_near_hip=result.features.right_wrist_near_hip,
            dominant_action_side=result.features.dominant_action_side,
        ),
    )


def to_taekwondo_stance_response(
    frame: NormalizedPoseFrame,
    result: StanceClassificationResult,
) -> TaekwondoStanceClassificationResponse:
    return TaekwondoStanceClassificationResponse(
        tracking=frame.tracking,
        tracking_quality=to_tracking_quality_response(frame),
        stance_label=result.stance_label,
        confidence=result.confidence,
        bend_side=result.bend_side,
        scores=result.scores,
        features=TaekwondoStanceFeaturesResponse(
            hip_width=result.features.hip_width,
            foot_distance=result.features.foot_distance,
            stance_width_ratio=result.features.stance_width_ratio,
            left_knee_angle=result.features.left_knee_angle,
            right_knee_angle=result.features.right_knee_angle,
            knee_angle_difference=result.features.knee_angle_difference,
            bend_side=result.features.bend_side,
        ),
    )


def to_taekwondo_direction_response(
    frame: NormalizedPoseFrame,
    result: DirectionClassificationResult,
) -> TaekwondoDirectionClassificationResponse:
    return TaekwondoDirectionClassificationResponse(
        tracking=frame.tracking,
        tracking_quality=to_tracking_quality_response(frame),
        direction_label=result.direction_label,
        turn_label=result.turn_label,
        confidence=result.confidence,
        scores=result.scores,
        features=TaekwondoDirectionFeaturesResponse(
            left_shoulder_x=result.features.left_shoulder_x,
            right_shoulder_x=result.features.right_shoulder_x,
            left_hip_x=result.features.left_hip_x,
            right_hip_x=result.features.right_hip_x,
            left_ankle_x=result.features.left_ankle_x,
            right_ankle_x=result.features.right_ankle_x,
            left_side_extent=result.features.left_side_extent,
            right_side_extent=result.features.right_side_extent,
            side_extent_difference=result.features.side_extent_difference,
            shoulder_balance=result.features.shoulder_balance,
            ankle_balance=result.features.ankle_balance,
        ),
    )


@router.post("/normalize", response_model=TaekwondoNormalizedPoseResponse)
def normalize_pose(frame: TaekwondoPoseFrameRequest) -> TaekwondoNormalizedPoseResponse:
    normalized = normalizer.normalize(frame)
    return to_taekwondo_normalized_pose_response(normalized)


@router.post("/calibrate", response_model=TaekwondoCalibrationResponse)
def calibrate_pose(request: TaekwondoCalibrationRequest) -> TaekwondoCalibrationResponse:
    result = calibration_service.calibrate(
        frame=request.frame,
        stable_frame_count=request.stable_frame_count,
        target_stable_frames=request.target_stable_frames,
    )
    return to_taekwondo_calibration_response(result)


@router.post("/classify", response_model=TaekwondoBasicMotionClassificationResponse)
def classify_basic_motion(
    request: TaekwondoBasicMotionClassificationRequest,
) -> TaekwondoBasicMotionClassificationResponse:
    normalized = normalizer.normalize(request.frame)
    result = basic_motion_classifier.classify(normalized)
    return to_taekwondo_basic_motion_response(normalized, result)


@router.post("/classify-stance", response_model=TaekwondoStanceClassificationResponse)
def classify_stance(
    request: TaekwondoStanceClassificationRequest,
) -> TaekwondoStanceClassificationResponse:
    normalized = normalizer.normalize(request.frame)
    result = stance_classifier.classify(normalized)
    return to_taekwondo_stance_response(normalized, result)


@router.post("/classify-direction", response_model=TaekwondoDirectionClassificationResponse)
def classify_direction(
    request: TaekwondoDirectionClassificationRequest,
) -> TaekwondoDirectionClassificationResponse:
    normalized = normalizer.normalize(request.frame)
    result = direction_classifier.classify(normalized, request.previous_direction)
    return to_taekwondo_direction_response(normalized, result)


def to_taekwondo_scoring_response(result: EnsembleScoreResult) -> TaekwondoScoringResponse:
    return TaekwondoScoringResponse(
        action_name=result.action_name,
        final_score=result.final_score,
        lstm=TaekwondoLstmScoreDetail(
            score=result.lstm_result.score,
            recon_error=result.lstm_result.recon_error,
            joint_errors=result.lstm_result.joint_errors,
            worst_joint=result.lstm_result.worst_joint,
        ),
        dtw=TaekwondoDtwScoreDetail(
            score=result.dtw_result.score,
            distance=result.dtw_result.dtw_distance,
        ),
    )


def to_taegeuk1_analyze_response(result: Taegeuk1AnalyzeResult) -> Taegeuk1AnalyzeResponse:
    return Taegeuk1AnalyzeResponse(
        session_id=result.session_id,
        target_movement_index=result.target_movement_index,
        target_movement_name=result.target_movement_name,
        score=result.score,
        pass_threshold=result.pass_threshold,
        passed=result.passed,
        scoring_method=result.scoring_method,
        worst_joint=result.worst_joint,
        weakest_body_part=result.weakest_body_part,
        feedback_summary=result.feedback_summary,
    )


@router.post("/score", response_model=TaekwondoScoringResponse)
def score_poomsae(request: TaekwondoScoringRequest) -> TaekwondoScoringResponse:
    """태극 1장 동작 채점 — LSTM Autoencoder + DTW 가중평균 (S14P31E103-341)."""
    seq = np.asarray(request.keypoints, dtype=np.float32)

    # shape 검증: (T, SCORING_JOINT_DIM)
    if seq.ndim != 2 or seq.shape[1] != SCORING_JOINT_DIM:
        raise HTTPException(
            status_code=422,
            detail=(
                f"keypoints는 (T, {SCORING_JOINT_DIM}) shape이어야 합니다. "
                f"받은 shape: {seq.shape}"
            ),
        )

    try:
        result = score_ensemble(seq, request.action_name)
    except FileNotFoundError as exc:
        # 학습되지 않은 동작 이름 (사용자 입력 문제) → 404
        logger.warning(f"채점 실패 — 자산 누락: action_name='{request.action_name}'")
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except KeyError as exc:
        # 모델 / 템플릿은 있으나 stats JSON 에는 누락 = 배포 일관성 오류 → 500
        logger.error(
            f"채점 실패 — stats 일관성 오류: action='{request.action_name}', missing_key={exc}"
        )
        raise HTTPException(
            status_code=500,
            detail="서버 채점 통계가 누락되어 있습니다. 관리자에게 문의해 주세요.",
        ) from exc
    except RuntimeError as exc:
        # GPU OOM / CUDA 오류 / 모델 구조 불일치 등 → 503 (재시도 가능)
        logger.exception(
            f"채점 실패 — 모델 추론 오류: action='{request.action_name}'"
        )
        raise HTTPException(
            status_code=503,
            detail="AI 모델 추론에 일시적 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
        ) from exc

    return to_taekwondo_scoring_response(result)


@router.post("/taegeuk1/analyze", response_model=Taegeuk1AnalyzeResponse)
def analyze_taegeuk1(request: Taegeuk1AnalyzeRequest) -> Taegeuk1AnalyzeResponse:
    try:
        result = analyze_taegeuk1_sequence(
            request.sequence,
            request.movement_name,
            session_id=request.session_id,
            input_normalized=request.input_normalized,
            pass_threshold=request.pass_threshold,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return to_taegeuk1_analyze_response(result)
