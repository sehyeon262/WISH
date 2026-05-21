"""태극 1장 채점용 LSTM Autoencoder 모델 정의.

학습 노트북 ``ai/notebooks/taegeuk1/02_lstm_train.ipynb`` 에서 정의된 모델 구조를
production 사용을 위해 모듈로 추출한 것이다. 학습된 가중치는
``ai/app/models/taegeuk1/checkpoints/{action_name}_autoencoder.pth`` 에 동작별로
보관되며, 가중치 로딩 / 캐싱은 :mod:`app.models.taegeuk1.loader` 의
``load_models()`` 헬퍼를 사용한다.

채점 원리
---------
입력 시퀀스 ``x`` 를 Encoder → latent → Decoder 거쳐 재구성한 ``x'`` 와의
MSE 차이가 작을수록 학습된 동작과 유사하다고 판단한다. 이 재구성 오차가
:mod:`app.services.taekwondo.scoring` 의 점수 변환 입력값이 된다.

하이퍼파라미터
--------------
아래 상수들은 학습 시 사용한 값과 반드시 일치해야 한다. 학습을 다시 돌릴 경우
``02_lstm_train.ipynb`` 와 본 모듈을 함께 수정해야 한다.
"""
from __future__ import annotations

import torch
from torch import nn

# 학습 시 고정된 하이퍼파라미터 (변경 시 weights 재학습 필수)
INPUT_DIM = 8       # 관절 8개: 양 팔꿈치/어깨/무릎/엉덩이
HIDDEN_DIM = 64     # LSTM hidden state 크기
LATENT_DIM = 32     # Encoder 출력 latent 차원
SEQ_LEN = 60        # 정규화된 동작 시퀀스 길이 (프레임 수)
NUM_LAYERS = 2      # LSTM 적층 수
DROPOUT = 0.2       # LSTM 내부 dropout (num_layers > 1 일 때만 활성)


class Encoder(nn.Module):
    """동작 시퀀스를 latent 벡터로 압축한다.

    Args:
        input_dim: 한 프레임당 관절 차원 (기본 8).
        hidden_dim: LSTM hidden 크기.
        latent_dim: 출력 latent 차원.
        num_layers: LSTM 층 수.

    Forward shape:
        x: ``(batch, seq_len, input_dim)`` → latent: ``(batch, latent_dim)``
    """

    def __init__(
        self,
        input_dim: int = INPUT_DIM,
        hidden_dim: int = HIDDEN_DIM,
        latent_dim: int = LATENT_DIM,
        num_layers: int = NUM_LAYERS,
    ) -> None:
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=input_dim,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            dropout=DROPOUT if num_layers > 1 else 0.0,
        )
        self.fc = nn.Linear(hidden_dim, latent_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # 마지막 타임스텝의 hidden state 만 사용
        _out, (h, _c) = self.lstm(x)
        latent = self.fc(h[-1])  # (batch, latent_dim)
        return latent


class Decoder(nn.Module):
    """latent 벡터를 다시 동작 시퀀스로 복원한다.

    Args:
        latent_dim: 입력 latent 차원.
        hidden_dim: LSTM hidden 크기.
        output_dim: 한 프레임당 관절 차원 (기본 8, 입력과 동일).
        seq_len: 출력 시퀀스 길이 (학습 데이터와 동일해야 함).
        num_layers: LSTM 층 수.

    Forward shape:
        latent: ``(batch, latent_dim)`` → ``(batch, seq_len, output_dim)``
    """

    def __init__(
        self,
        latent_dim: int = LATENT_DIM,
        hidden_dim: int = HIDDEN_DIM,
        output_dim: int = INPUT_DIM,
        seq_len: int = SEQ_LEN,
        num_layers: int = NUM_LAYERS,
    ) -> None:
        super().__init__()
        self.seq_len = seq_len
        self.fc = nn.Linear(latent_dim, hidden_dim)
        self.lstm = nn.LSTM(
            input_size=hidden_dim,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            dropout=DROPOUT if num_layers > 1 else 0.0,
        )
        self.out = nn.Linear(hidden_dim, output_dim)

    def forward(self, latent: torch.Tensor) -> torch.Tensor:
        x = self.fc(latent)                                 # (batch, hidden_dim)
        x = x.unsqueeze(1).repeat(1, self.seq_len, 1)       # (batch, seq_len, hidden_dim)
        out, _ = self.lstm(x)                               # (batch, seq_len, hidden_dim)
        return self.out(out)                                # (batch, seq_len, output_dim)


class LSTMAutoencoder(nn.Module):
    """동작 시퀀스 재구성 Autoencoder.

    재구성 오차(MSE) 가 작을수록 학습된 정답 동작과 유사하다고 판단한다.

    Forward shape:
        x: ``(batch, seq_len, input_dim)`` → recon: ``(batch, seq_len, input_dim)``
    """

    def __init__(
        self,
        input_dim: int = INPUT_DIM,
        hidden_dim: int = HIDDEN_DIM,
        latent_dim: int = LATENT_DIM,
        seq_len: int = SEQ_LEN,
        num_layers: int = NUM_LAYERS,
    ) -> None:
        super().__init__()
        self.encoder = Encoder(input_dim, hidden_dim, latent_dim, num_layers)
        self.decoder = Decoder(latent_dim, hidden_dim, input_dim, seq_len, num_layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        latent = self.encoder(x)
        return self.decoder(latent)

    def encode(self, x: torch.Tensor) -> torch.Tensor:
        """latent 만 필요한 경우 (예: 임베딩 분석)."""
        return self.encoder(x)
