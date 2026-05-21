"""채점에 필요한 정적 자산(templates / stats) 로딩 및 메모리 캐시.

채점 시 매번 디스크에서 읽지 않도록 ``@lru_cache`` 로 캐시한다. 자산 위치는
``ai/app/resources/taegeuk1/`` 패키지 기준 상대 경로.

자산 종류
---------
- **templates** (``.npy``) : 동작별 기준 시퀀스 (DTW 비교 대상)
- **distance_stats** (``.json``) : 동작별 DTW 거리 percentile (DTW 점수 변환 룩업)
- **error_stats** (``.json``) : 동작별 LSTM 재구성 오차 percentile (LSTM 점수 변환 룩업)
"""
from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Mapping

import numpy as np

logger = logging.getLogger(__name__)

# ai/app/resources/taegeuk1/ 의 절대 경로 (패키지 위치 기준)
# 이 파일: ai/app/services/taekwondo/scoring/resources.py
# 자산:    ai/app/resources/taegeuk1/
RESOURCE_DIR = Path(__file__).resolve().parents[3] / "resources" / "taegeuk1"
TEMPLATES_DIR = RESOURCE_DIR / "templates"
STATS_DIR = RESOURCE_DIR / "stats"

DISTANCE_STATS_PATH = STATS_DIR / "distance_stats.json"
ERROR_STATS_PATH = STATS_DIR / "error_stats.json"


# ---------- templates (.npy) ----------

@lru_cache(maxsize=None)
def get_template(action_name: str) -> np.ndarray:
    """동작 이름으로 기준 템플릿 시퀀스 반환 (메모리 캐시).

    Returns:
        ``(seq_len, joint_dim)`` 형태의 ``np.ndarray``.

    Raises:
        FileNotFoundError: 해당 동작의 템플릿이 없을 때.
    """
    template_path = TEMPLATES_DIR / f"{action_name}.npy"
    if not template_path.is_file():
        available = list_template_actions()
        raise FileNotFoundError(
            f"동작 '{action_name}' 의 템플릿이 없습니다: {template_path}\n"
            f"사용 가능한 템플릿: {available}"
        )
    template = np.load(template_path)
    logger.info(f"템플릿 로드: '{action_name}' shape={template.shape}")
    return template


def list_template_actions() -> list[str]:
    """``templates/`` 안에 있는 동작 이름 리스트."""
    if not TEMPLATES_DIR.is_dir():
        raise FileNotFoundError(f"템플릿 디렉토리 없음: {TEMPLATES_DIR}")
    return [p.stem for p in sorted(TEMPLATES_DIR.glob("*.npy"))]


# ---------- stats (.json) ----------

@lru_cache(maxsize=1)
def get_distance_stats() -> Mapping[str, Mapping[str, float]]:
    """DTW 거리 percentile 통계 (전체).

    Returns:
        ``{action_name: {"min": ..., "p10": ..., ..., "max": ...}}``
    """
    return _load_stats_json(DISTANCE_STATS_PATH, label="distance_stats")


@lru_cache(maxsize=1)
def get_error_stats() -> Mapping[str, Mapping[str, float]]:
    """LSTM 재구성 오차 percentile 통계 (전체)."""
    return _load_stats_json(ERROR_STATS_PATH, label="error_stats")


def _load_stats_json(path: Path, *, label: str) -> Mapping[str, Mapping[str, float]]:
    if not path.is_file():
        raise FileNotFoundError(f"{label} 파일 없음: {path}")
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    logger.info(f"{label} 로드: {len(data)}개 동작 ({path.name})")
    return data


# ---------- 사전 로딩 (startup 용) ----------

def preload_resources() -> None:
    """모든 templates / stats 를 미리 메모리에 로드.

    FastAPI startup 이벤트에서 ``loader.load_all_models()`` 와 함께 호출.
    """
    actions = list_template_actions()
    logger.info(f"채점 리소스 사전 로드 시작: {len(actions)}개 동작")

    for action in actions:
        get_template(action)
    get_distance_stats()
    get_error_stats()

    logger.info("채점 리소스 사전 로드 완료")


def clear_resource_cache() -> None:
    """리소스 캐시 초기화. 테스트 / 자산 reload 시 사용."""
    get_template.cache_clear()
    get_distance_stats.cache_clear()
    get_error_stats.cache_clear()
    logger.info("채점 리소스 캐시 초기화됨")
