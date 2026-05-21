"""
아이별 FAISS 벡터 DB 관리 모듈.

- 아이(patient_profile_id)별로 독립된 인덱스 파일을 유지한다.
- 세션 종료 시 해당 세션의 대화 턴들을 임베딩하여 저장한다.
- 검색 시 아이 발화와 유사한 과거 대화 기억을 반환한다.

저장 경로: {VECTOR_STORE_BASE}/{patient_profile_id}/
  - index.faiss   : FAISS 인덱스
  - docs.pkl      : 원본 텍스트 및 메타데이터
"""
from __future__ import annotations

import logging
import pickle
import threading
from pathlib import Path
from typing import List, Dict, Tuple, Optional

import faiss
import numpy as np

from app.services.dialogue.embedder import embed_text, embed_texts

logger = logging.getLogger(__name__)

VECTOR_STORE_BASE = Path(__file__).parent.parent.parent.parent / "data" / "vector_store"
TOP_K = 3


class DialogueVectorStore:
    """아이별 FAISS 벡터 DB를 관리하는 클래스."""

    def __init__(self):
        self._locks: dict[int, threading.Lock] = {}
        self._locks_lock = threading.Lock()  # _locks dict 자체를 보호하는 락

    def _get_patient_lock(self, patient_profile_id: int) -> threading.Lock:
        """patient_profile_id별 락 반환. 없으면 생성."""
        with self._locks_lock:
            if patient_profile_id not in self._locks:
                self._locks[patient_profile_id] = threading.Lock()
            return self._locks[patient_profile_id]

    def _patient_dir(self, patient_profile_id: int) -> Path:
        path = VECTOR_STORE_BASE / str(patient_profile_id)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _index_path(self, patient_profile_id: int) -> Path:
        return self._patient_dir(patient_profile_id) / "index.faiss"

    def _docs_path(self, patient_profile_id: int) -> Path:
        return self._patient_dir(patient_profile_id) / "docs.pkl"

    def _load(self, patient_profile_id: int) -> Tuple[Optional[faiss.Index], List[Dict]]:
        """저장된 인덱스와 문서 로드. 없으면 (None, []) 반환."""
        index_path = self._index_path(patient_profile_id)
        docs_path = self._docs_path(patient_profile_id)
        if not index_path.exists() or not docs_path.exists():
            return None, []
        index = faiss.read_index(str(index_path))
        with open(docs_path, "rb") as f:
            docs = pickle.load(f)
        return index, docs

    def _save(self, patient_profile_id: int, index: faiss.Index, docs: List[Dict]) -> None:
        """인덱스와 문서 저장."""
        faiss.write_index(index, str(self._index_path(patient_profile_id)))
        with open(self._docs_path(patient_profile_id), "wb") as f:
            pickle.dump(docs, f)

    def add_session(
        self,
        patient_profile_id: int,
        session_id: int,
        npc_name: str,
        turns: List[Dict],
    ) -> None:
        """
        세션 종료 시 대화 턴들을 임베딩하여 벡터 DB에 추가.

        Args:
            patient_profile_id: 아이 프로필 ID
            session_id: 대화 세션 ID
            npc_name: NPC 이름 (YEONGCHEOL, JOEUN 등)
            turns: [{"question_text": ..., "choice_text": ..., "npc_response": ...}, ...]
        """
        if not turns:
            logger.warning("[VectorStore] 빈 turns, 스킵 (session_id=%d)", session_id)
            return

        # 턴을 자연어 문장으로 변환
        texts = []
        docs = []
        for turn in turns:
            question = turn.get("question_text", "")
            user_input = turn.get("choice_text", "")  # 자유입력 or 선택지 텍스트
            npc_response = turn.get("npc_response", "")

            # 검색에 활용할 텍스트: NPC 질문 + 아이 발화 + NPC 응답
            content = f"[{npc_name}] 질문: {question} / 아이: {user_input} / 응답: {npc_response}"
            texts.append(content)
            docs.append({
                "content": content,
                "session_id": session_id,
                "npc_name": npc_name,
                "question_text": question,
                "user_input": user_input,
                "npc_response": npc_response,
            })

        try:
            vectors = embed_texts(texts)
        except Exception as e:
            logger.error("[VectorStore] 임베딩 실패 (session_id=%d): %s", session_id, e)
            return

        lock = self._get_patient_lock(patient_profile_id)
        with lock:
            index, existing_docs = self._load(patient_profile_id)

            if index is None:
                dimension = vectors.shape[1]
                index = faiss.IndexFlatIP(dimension)  # 코사인 유사도 (normalize된 벡터)

            index.add(vectors)
            existing_docs.extend(docs)

            try:
                self._save(patient_profile_id, index, existing_docs)
                logger.info(
                    "[VectorStore] 저장 완료 (patient=%d, session=%d, turns=%d)",
                    patient_profile_id, session_id, len(turns),
                )
            except Exception as e:
                logger.error("[VectorStore] 저장 실패 (session_id=%d): %s", session_id, e)

    def search(
        self,
        patient_profile_id: int,
        query: str,
        top_k: int = TOP_K,
    ) -> List[Dict]:
        """
        아이 발화와 유사한 과거 대화 기억 검색.

        Returns:
            [{"content": ..., "npc_name": ..., "user_input": ..., "score": ...}, ...]
        """
        index, docs = self._load(patient_profile_id)
        if index is None or index.ntotal == 0:
            logger.debug("[VectorStore] 인덱스 없음 (patient=%d)", patient_profile_id)
            return []

        try:
            query_vector = embed_text(query).reshape(1, -1)
        except Exception as e:
            logger.error("[VectorStore] 쿼리 임베딩 실패: %s", e)
            return []

        k = min(top_k, index.ntotal)
        scores, indices = index.search(query_vector, k)

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1:
                continue
            doc = docs[idx].copy()
            doc["score"] = float(score)
            results.append(doc)

        return results

    def has_data(self, patient_profile_id: int) -> bool:
        """해당 아이의 벡터 DB 데이터 존재 여부."""
        return self._index_path(patient_profile_id).exists()


# 싱글톤 인스턴스
dialogue_vector_store = DialogueVectorStore()
