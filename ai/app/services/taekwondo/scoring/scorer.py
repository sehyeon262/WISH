"""태극 1장 채점 메인 로직.

세 가지 채점 방식과 결과 타입을 제공한다:

- :func:`score_with_lstm` — LSTM Autoencoder 재구성 오차 → 점수 + 관절별 오차
- :func:`score_with_dtw`  — 사용자 시퀀스 vs 기준 템플릿 DTW 거리 → 점수
- :func:`score_ensemble`  — 위 두 점수의 가중평균 (LSTM × 0.6 + DTW × 0.4)

학습 노트북 ``03_method_comparison_dtw_vs_lstm.ipynb`` 의 알고리즘과 100% 동일하며,
production 사용을 위해 모듈로 추출한 것이다. 채점 가중치 (0.6 / 0.4) 는 노트북
실험을 통해 결정되었다.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import torch
from fastdtw import fastdtw
from scipy.spatial.distance import euclidean
from torch.nn import functional as F

from app.models.taegeuk1.loader import get_device, get_model
from app.services.taekwondo.scoring.normalizer import (
    DEFAULT_SEQ_LEN,
    calc_score,
    resample,
)
from app.services.taekwondo.scoring.resources import (
    get_distance_stats,
    get_error_stats,
    get_template,
)

# ---------- 채점 상수 (노트북과 동일) ----------

# 가중평균 비율 (03_method_comparison 실험 결과 결정)
LSTM_WEIGHT = 0.6
DTW_WEIGHT = 0.4

# 입력 정규화: 관절 각도(0~180°) 를 0~1 로
ANGLE_SCALE = 180.0

# ---------- 모션 페널티 (학습 데이터 한계 보완) ----------
# AI Hub 71259 데이터의 8프레임 시퀀스가 부드러운 모션이 아니라 키프레임 묶음에 가까워서
# LSTM/DTW만으로는 정적 입력과 동적 입력을 구별하기 어려운 한계 보완용.
# 학습 데이터 동작별 평균 프레임간 변화량(11~17°) 의 약 절반을 임계값으로 설정.

# 모션 임계값 (도 단위 — 프레임간 평균 각도 변화)
MOTION_THRESHOLD_DEG = 7.0

# 모션 부족 시 최소 점수 비율 (정지 자세는 30% 까지만 인정)
MOTION_PENALTY_FLOOR = 0.3

# 모션 페널티 미적용 동작 (본질적으로 정적인 자세)
STATIC_ACTIONS: frozenset[str] = frozenset({"기본준비"})


def _compute_motion_intensity(seq: np.ndarray) -> float:
    """시퀀스의 프레임간 평균 각도 변화량 (도 단위).

    가만히 서있으면 거의 0, 큰 동작이면 10~20° 이상.
    """
    if len(seq) < 2:
        return 0.0
    diffs = np.abs(np.diff(seq, axis=0))
    return float(diffs.mean())


def _apply_motion_penalty(final_score: float, motion_intensity: float) -> float:
    """모션 강도에 따른 점수 페널티 적용.

    - motion_intensity ≥ MOTION_THRESHOLD_DEG: 페널티 없음 (factor=1.0)
    - motion_intensity = 0:                    factor = MOTION_PENALTY_FLOOR
    - 그 사이:                                  선형 보간
    """
    if motion_intensity >= MOTION_THRESHOLD_DEG:
        return final_score
    ratio = motion_intensity / MOTION_THRESHOLD_DEG
    factor = MOTION_PENALTY_FLOOR + (1.0 - MOTION_PENALTY_FLOOR) * ratio
    return final_score * factor

# LSTMAutoencoder 입력 8차원과 1:1 대응 (순서 중요!)
JOINT_NAMES: tuple[str, ...] = (
    "왼팔꿈치", "오른팔꿈치", "왼어깨", "오른어깨",
    "왼무릎", "오른무릎", "왼엉덩이", "오른엉덩이",
)


# ---------- 결과 타입 ----------

@dataclass(slots=True)
class LstmScoreResult:
    """LSTM Autoencoder 채점 결과.

    Attributes:
        score: 0~100 점수 (높을수록 정답에 가까움).
        recon_error: 평균 MSE 재구성 오차 (정규화된 0~1 단위).
        joint_errors: 마지막 프레임 기준 관절별 각도 오차 (도, 소수점 둘째 자리).
        worst_joint: ``joint_errors`` 중 가장 큰 오차의 관절명 (피드백 메시지용).
    """

    score: float
    recon_error: float
    joint_errors: dict[str, float]
    worst_joint: str


@dataclass(slots=True)
class DtwScoreResult:
    """DTW 채점 결과.

    Attributes:
        score: 0~100 점수 (높을수록 템플릿에 가까움).
        dtw_distance: 사용자 시퀀스 ↔ 기준 템플릿 DTW 거리 (raw).
    """

    score: float
    dtw_distance: float


@dataclass(slots=True)
class EnsembleScoreResult:
    """LSTM + DTW 가중평균 최종 채점 결과.

    Attributes:
        final_score: ``LSTM × 0.6 + DTW × 0.4`` 가중평균 (0~100).
        action_name: 채점된 동작 이름.
        lstm_result: LSTM 단독 채점 상세.
        dtw_result: DTW 단독 채점 상세.
    """

    final_score: float
    action_name: str
    lstm_result: LstmScoreResult
    dtw_result: DtwScoreResult


# ---------- 채점 함수 ----------

def score_with_lstm(seq: np.ndarray, action_name: str) -> LstmScoreResult:
    """LSTM Autoencoder 재구성 오차 기반 채점.

    Args:
        seq: ``(T, 8)`` 형태의 사용자 동작 시퀀스. T 는 임의 길이 (resample 됨).
            관절 각도(도 단위, 0~180) 가 들어있어야 한다.
        action_name: 채점할 동작 이름 (예: ``"기본준비"``).

    Returns:
        :class:`LstmScoreResult`

    Raises:
        FileNotFoundError: ``action_name`` 의 모델 가중치 / 통계가 없을 때.
    """
    device = get_device()
    model = get_model(action_name)
    error_stats = get_error_stats()

    # (T, 8) → (60, 8) 보간 → 0~1 정규화 → batch 차원
    resampled = resample(seq, n=DEFAULT_SEQ_LEN).astype(np.float32) / ANGLE_SCALE
    tensor = torch.tensor(resampled).unsqueeze(0).to(device)  # (1, 60, 8)

    with torch.no_grad():
        recon = model(tensor)  # (1, 60, 8)

    recon_error = F.mse_loss(recon, tensor).item()
    score = calc_score(recon_error, error_stats[action_name])

    # 마지막 프레임의 관절별 절대오차를 도(°) 단위로 환산
    joint_err_norm = torch.abs(recon[0, -1] - tensor[0, -1]).cpu().numpy()
    joint_errors = {
        name: round(float(err * ANGLE_SCALE), 2)
        for name, err in zip(JOINT_NAMES, joint_err_norm)
    }
    worst_joint = max(joint_errors, key=joint_errors.get)

    return LstmScoreResult(
        score=score,
        recon_error=recon_error,
        joint_errors=joint_errors,
        worst_joint=worst_joint,
    )


def score_with_dtw(seq: np.ndarray, action_name: str) -> DtwScoreResult:
    """DTW 거리 기반 채점.

    사용자 시퀀스를 60프레임으로 보간한 후, 학습 시 저장한 동작별 기준 템플릿과
    DTW 거리를 계산하고 percentile 통계로 0~100 점수로 변환한다.

    Args:
        seq: ``(T, 8)`` 사용자 동작 시퀀스.
        action_name: 채점할 동작 이름.

    Returns:
        :class:`DtwScoreResult`
    """
    template = get_template(action_name)
    distance_stats = get_distance_stats()

    resampled = resample(seq, n=DEFAULT_SEQ_LEN).astype(np.float32)
    dtw_distance, _path = fastdtw(resampled, template, dist=euclidean)
    score = calc_score(float(dtw_distance), distance_stats[action_name])

    return DtwScoreResult(
        score=score,
        dtw_distance=float(dtw_distance),
    )


def score_ensemble(seq: np.ndarray, action_name: str) -> EnsembleScoreResult:
    """LSTM × 0.6 + DTW × 0.4 가중평균 최종 채점.

    노트북 ``03_method_comparison_dtw_vs_lstm.ipynb`` 에서 결정된 채점 방식이며,
    채점 API (``POST /score``) 가 호출하는 메인 진입점이다.

    Args:
        seq: ``(T, 8)`` 사용자 동작 시퀀스 (관절 각도, 도 단위).
        action_name: 채점할 동작 이름.

    Returns:
        :class:`EnsembleScoreResult` — 최종 점수 + LSTM/DTW 단독 결과 포함.
    """
    lstm = score_with_lstm(seq, action_name)
    dtw = score_with_dtw(seq, action_name)
    final = lstm.score * LSTM_WEIGHT + dtw.score * DTW_WEIGHT

    # 모션 페널티 적용 (정적 동작은 제외)
    if action_name not in STATIC_ACTIONS:
        motion_intensity = _compute_motion_intensity(seq)
        final = _apply_motion_penalty(final, motion_intensity)

    return EnsembleScoreResult(
        final_score=final,
        action_name=action_name,
        lstm_result=lstm,
        dtw_result=dtw,
    )
