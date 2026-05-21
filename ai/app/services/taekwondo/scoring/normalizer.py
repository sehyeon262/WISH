"""채점에 필요한 저수준 정규화 헬퍼.

두 가지 함수만 제공한다:

- :func:`resample` — 가변 길이 시퀀스를 학습 시 사용한 60프레임으로 보간
- :func:`calc_score` — 측정값(재구성 오차 / DTW 거리) 을 percentile 통계로
  0~100 점수로 변환

학습 노트북 ``03_method_comparison_dtw_vs_lstm.ipynb`` 의 동일 이름 함수와
완전히 동일한 알고리즘이며, 노트북 출력 결과의 점수 분포를 그대로 재현한다.
"""
from __future__ import annotations

from typing import Mapping

import numpy as np
from scipy.interpolate import interp1d

# 학습 시 사용한 시퀀스 길이 (lstm_autoencoder.SEQ_LEN 과 일치)
DEFAULT_SEQ_LEN = 60

# percentile dict 의 필수 키 (resources 에서 로드되는 stats JSON 의 형식)
PERCENTILE_KEYS = ("min", "p10", "p25", "p50", "p75", "p90", "max")

# 0 으로 나누기 방지용 epsilon
_EPS = 1e-8


def resample(seq: np.ndarray, n: int = DEFAULT_SEQ_LEN) -> np.ndarray:
    """``seq`` 의 시간 축을 ``n`` 프레임으로 균일 보간.

    학습된 모델은 ``SEQ_LEN=60`` 을 가정하므로, 다양한 길이로 들어온 사용자
    동작 시퀀스를 항상 60으로 맞춰서 추론에 넣어야 한다.

    Args:
        seq: ``(T, D)`` 형태의 시퀀스 (T=프레임 수, D=관절 차원).
        n: 출력 프레임 수 (기본 60).

    Returns:
        ``(n, D)`` 형태로 보간된 시퀀스.

    Notes:
        ``T == 1`` 인 경우 보간 불가하므로 동일 프레임을 ``n`` 번 반복한다.
    """
    seq = np.asarray(seq)
    t = len(seq)
    if t == 1:
        # interp1d 는 최소 2개 점이 필요. 단일 프레임은 그대로 복제.
        return np.tile(seq, (n, 1))
    interpolator = interp1d(np.linspace(0, 1, t), seq, axis=0)
    return interpolator(np.linspace(0, 1, n))


def calc_score(value: float, stats: Mapping[str, float]) -> float:
    """측정값을 ``stats`` 의 percentile 을 기준으로 0~100 점수로 변환.

    학습 시 측정한 percentile 분포 (min, p10, p25, p50, p75, p90, max) 를
    기준선으로 사용해, value 가 어느 구간에 있는지에 따라 7단계 선형 보간 점수.

    구간별 점수 매핑::

        value <= min          → 100   (최고 잘함)
        value <= p10          → 85~100 선형 보간
        value <= p25          → 70~85
        value <= p50          → 55~70
        value <= p75          → 40~55
        value <= p90          → 20~40
        value > p90 (~max)    → 0~20  (못함)

    Args:
        value: 측정값 (LSTM 재구성 오차 또는 DTW 거리). 작을수록 좋음.
        stats: 학습 데이터 기반 percentile dict.
            예: ``{"min": 0.001, "p10": 0.005, ..., "max": 0.05}``

    Returns:
        0.0 ~ 100.0 사이 점수 (높을수록 정답 동작과 유사).
    """
    mn, p10, p25, p50, p75, p90, mx = (stats[k] for k in PERCENTILE_KEYS)

    # 분모는 max(diff, _EPS) 로 보호한다. 학습 데이터가 비정상적으로 균질하여
    # percentile 들이 모두 동일한 케이스에서도 NaN / 비합리 점수를 방지.
    if value <= mn:
        return 100.0
    if value <= p10:
        return 85 + 15 * (1 - (value - mn) / max(p10 - mn, _EPS))
    if value <= p25:
        return 70 + 15 * (1 - (value - p10) / max(p25 - p10, _EPS))
    if value <= p50:
        return 55 + 15 * (1 - (value - p25) / max(p50 - p25, _EPS))
    if value <= p75:
        return 40 + 15 * (1 - (value - p50) / max(p75 - p50, _EPS))
    if value <= p90:
        return 20 + 20 * (1 - (value - p75) / max(p90 - p75, _EPS))
    # value > p90: max 까지 0~20 으로 떨어지고, 그 너머는 0
    return max(0.0, 20 * (1 - (value - p90) / max(mx - p90, _EPS)))
