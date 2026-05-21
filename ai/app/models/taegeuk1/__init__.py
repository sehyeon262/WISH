"""태극 1장 LSTM Autoencoder 모델 패키지.

동작별 9개의 학습된 가중치(.pth)를 ``checkpoints/`` 에 보관한다.
각 가중치는 해당 동작 시퀀스를 LSTM Autoencoder 로 재구성한 결과로,
재구성 오차(MSE) 가 채점 점수의 입력값이 된다.

관련 자산
---------
- 모델 구조 정의:    ``ai/notebooks/taegeuk1/02_lstm_train.ipynb``
- 채점 / 평가 로직:  ``ai/notebooks/taegeuk1/03_method_comparison_dtw_vs_lstm.ipynb``
- 채점 정규화 통계:  ``ai/app/resources/taegeuk1/stats/``
- 비교 기준 템플릿:  ``ai/app/resources/taegeuk1/templates/``

관련 작업
---------
- 모델 클래스 추출:    `S14P31E103-341` (본 PR)
- 채점 서비스 통합:    `S14P31E103-341` (본 PR)
- 가중치 버전 관리:    `S14P31E103-342` (별도 이슈)
"""

from app.models.taegeuk1.lstm_autoencoder import (
    Decoder,
    Encoder,
    LSTMAutoencoder,
    INPUT_DIM,
    HIDDEN_DIM,
    LATENT_DIM,
    SEQ_LEN,
)

__all__ = [
    "Decoder",
    "Encoder",
    "LSTMAutoencoder",
    "INPUT_DIM",
    "HIDDEN_DIM",
    "LATENT_DIM",
    "SEQ_LEN",
]
