"""태극 1장 LSTM Autoencoder 가중치 로딩 / 메모리 캐싱 헬퍼.

학습된 9개 동작별 가중치(``checkpoints/{action_name}_autoencoder.pth``) 를
메모리에 캐시하여, 매 채점 요청마다 디스크 I/O 없이 즉시 추론하도록 한다.

서버 시작 시 :func:`load_all_models` 한 번 호출하여 cold start 를 제거한다
(``app/main.py`` 의 startup 이벤트). 이후 :func:`get_model` 은 캐시 조회만 한다.

사용 예
--------
.. code-block:: python

    # FastAPI startup
    from app.models.taegeuk1.loader import load_all_models
    load_all_models()

    # 채점 서비스 안
    from app.models.taegeuk1.loader import get_model
    model = get_model("기본준비")
    with torch.no_grad():
        recon = model(seq_tensor)
"""
from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

import torch

from app.models.taegeuk1.lstm_autoencoder import LSTMAutoencoder

logger = logging.getLogger(__name__)

# 가중치 디렉토리: 본 패키지 기준 상대 경로 (Docker / 테스트 환경 무관)
CHECKPOINT_DIR = Path(__file__).parent / "checkpoints"
CHECKPOINT_SUFFIX = "_autoencoder.pth"


def get_device() -> torch.device:
    """추론 디바이스 결정. CUDA 가능하면 GPU, 아니면 CPU."""
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def list_available_actions() -> list[str]:
    """``checkpoints/`` 안의 ``.pth`` 파일에서 학습된 동작 이름 추출.

    Returns:
        동작 이름 리스트 (정렬됨). 예: ``["기본준비", "앞굽이하고 ...", ...]``

    Raises:
        FileNotFoundError: ``checkpoints/`` 디렉토리가 없을 때.
    """
    if not CHECKPOINT_DIR.is_dir():
        raise FileNotFoundError(
            f"가중치 디렉토리를 찾을 수 없습니다: {CHECKPOINT_DIR}"
        )
    actions = [
        path.stem.removesuffix("_autoencoder")
        for path in sorted(CHECKPOINT_DIR.glob(f"*{CHECKPOINT_SUFFIX}"))
    ]
    if not actions:
        logger.warning(f"가중치 파일이 비어있음: {CHECKPOINT_DIR}")
    return actions


# maxsize 는 학습된 동작 9개 + 향후 확장 여유. 이론상 ``FileNotFoundError`` 가
# raise 되는 호출은 lru_cache 가 캐시하지 않아 메모리 누수는 없으나, 명시적
# 상한을 두어 의도를 분명히 한다.
@lru_cache(maxsize=32)
def get_model(action_name: str) -> LSTMAutoencoder:
    """학습된 가중치를 로드한 모델을 반환 (메모리 캐시).

    같은 ``action_name`` 으로 반복 호출 시 디스크 I/O 없이 캐시된 인스턴스 반환.

    Args:
        action_name: 동작 이름 (예: ``"기본준비"``, ``"앞굽이하고 아래막기"``).

    Returns:
        ``eval()`` 모드로 설정된 ``LSTMAutoencoder`` (해당 디바이스로 이동됨).

    Raises:
        FileNotFoundError: 해당 동작의 가중치 파일이 없을 때.
        RuntimeError: 가중치와 모델 구조가 호환되지 않을 때 (PyTorch 가 던짐).
    """
    weights_path = CHECKPOINT_DIR / f"{action_name}{CHECKPOINT_SUFFIX}"
    if not weights_path.is_file():
        available = list_available_actions()
        raise FileNotFoundError(
            f"동작 '{action_name}' 의 가중치 파일이 없습니다: {weights_path}\n"
            f"사용 가능한 동작: {available}"
        )

    device = get_device()
    model = LSTMAutoencoder()
    state_dict = torch.load(weights_path, map_location=device, weights_only=True)
    model.load_state_dict(state_dict)
    model.to(device)
    model.eval()  # 추론 모드: dropout / batchnorm 비활성

    logger.info(
        f"LSTM AE 모델 로드 완료: action='{action_name}', device={device}"
    )
    return model


def load_all_models() -> dict[str, LSTMAutoencoder]:
    """모든 동작의 모델을 미리 로드하여 메모리에 캐시.

    FastAPI 서버 ``startup`` 이벤트에서 호출하여 첫 요청의 cold start 를 제거한다.

    Returns:
        ``{action_name: model}`` dict (참조용; 실제 캐시는 ``get_model`` lru_cache).
    """
    actions = list_available_actions()
    logger.info(f"전체 모델 로딩 시작: {len(actions)}개 동작 — {actions}")

    models = {action: get_model(action) for action in actions}

    logger.info(f"전체 모델 로딩 완료: {len(models)}개")
    return models


def clear_model_cache() -> None:
    """모델 캐시 초기화. 테스트 / 가중치 reload 시 사용."""
    get_model.cache_clear()
    logger.info("모델 캐시 초기화됨")
