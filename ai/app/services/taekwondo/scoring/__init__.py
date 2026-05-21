"""태극 1장 채점 서비스.

LSTM Autoencoder 재구성 오차와 DTW 거리를 가중평균 (LSTM × 0.6 + DTW × 0.4)
하여 동작별 점수(0~100) 를 산출한다.

공개 API
--------
- :func:`score_ensemble` — 메인 채점 함수 (라우트가 호출)
- :func:`score_with_lstm` / :func:`score_with_dtw` — 단독 방식 (디버깅 / 비교용)
- 결과 타입: :class:`EnsembleScoreResult`, :class:`LstmScoreResult`,
  :class:`DtwScoreResult`

모듈 구성
---------
- :mod:`.normalizer`  : ``resample`` (시퀀스 길이 통일) / ``calc_score``
                       (percentile → 점수 변환)
- :mod:`.resources`   : 채점 templates (``.npy``) / stats (``.json``) 캐싱
- :mod:`.scorer`      : LSTM / DTW / 앙상블 채점 (메인 로직)
"""

from app.services.taekwondo.scoring.scorer import (
    DtwScoreResult,
    EnsembleScoreResult,
    LstmScoreResult,
    score_ensemble,
    score_with_dtw,
    score_with_lstm,
)

__all__ = [
    "DtwScoreResult",
    "EnsembleScoreResult",
    "LstmScoreResult",
    "score_ensemble",
    "score_with_dtw",
    "score_with_lstm",
]

