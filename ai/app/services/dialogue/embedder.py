"""
한국어 텍스트 임베딩 모듈.
sentence-transformers의 한국어 특화 모델을 사용해 텍스트를 벡터로 변환한다.
모델은 최초 실행 시 자동 다운로드되며 이후 캐시에서 로드된다.
"""
from __future__ import annotations

import logging
import threading
from typing import List

import numpy as np

logger = logging.getLogger(__name__)

MODEL_NAME = "jhgan/ko-sroberta-multitask"
_model = None
_model_lock = threading.Lock()


def _get_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:  # double-checked locking
                from sentence_transformers import SentenceTransformer
                logger.info("[Embedder] 한국어 임베딩 모델 로드 중: %s", MODEL_NAME)
                _model = SentenceTransformer(MODEL_NAME)
                logger.info("[Embedder] 모델 로드 완료")
    return _model


def embed_texts(texts: List[str]) -> np.ndarray:
    """
    텍스트 리스트를 임베딩 벡터로 변환.
    Returns: shape (len(texts), dimension) float32 numpy array
    """
    model = _get_model()
    vectors = model.encode(texts, convert_to_numpy=True, normalize_embeddings=True)
    return vectors.astype(np.float32)


def embed_text(text: str) -> np.ndarray:
    """단일 텍스트 임베딩. Returns: shape (dimension,) float32 numpy array"""
    return embed_texts([text])[0]
