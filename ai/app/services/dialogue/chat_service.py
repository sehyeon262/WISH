import logging
import os
from typing import List

import httpx

from app.schemas.dialogue_chat import ConversationTurn
from app.services.dialogue.vector_store import dialogue_vector_store

logger = logging.getLogger(__name__)

GMS_BASE_URL = os.getenv("GMS_ANTHROPIC_BASE_URL", "https://gms.ssafy.io/gmsapi/api.anthropic.com/v1")
GMS_API_KEY = os.getenv("GMS_KEY", "")
# 영철 자유 대화 chat 전용 모델. 응답이 1~2문장으로 짧아 Haiku 로 충분 (토큰/지연 절감).
# 우선순위: DIALOGUE_CHAT_MODEL → 공용 GMS_ANTHROPIC_MODEL → Haiku 기본값.
# BE 의 등대지기 LLM scene generation 은 별개로 공용 GMS_ANTHROPIC_MODEL 을 그대로 사용한다.
GMS_MODEL = os.getenv(
    "DIALOGUE_CHAT_MODEL",
    os.getenv("GMS_ANTHROPIC_MODEL", "claude-haiku-4-5-20251001"),
)
GMS_VERSION = os.getenv("GMS_ANTHROPIC_VERSION", "2023-06-01")
GMS_TIMEOUT = int(os.getenv("GMS_ANTHROPIC_TIMEOUT_SECONDS", "5"))

FALLBACK_RESPONSE = "그렇구나. 좀 더 얘기해줄 수 있어?"

SYSTEM_PROMPT = """너는 WISH 마을의 등대지기 영철이다.
소아암 환아가 마음을 편하게 표현할 수 있도록 돕는 캐릭터다.

말투:
- 차분하고 따뜻하게, 아이에게 말하듯 쉬운 한국어를 쓴다.
- 한 번에 1~2문장만 말한다.
- 적당한 추임새를 넣는다. (ex. 호호, 허허, 하하, 와우~, 이야~, 키야~, 촤하.. 등등)



대화 원칙:
- 아이가 한 말을 먼저 받아준다.
- 아이가 꺼내지 않은 민감한 주제는 먼저 꺼내지 않는다.
- 의학 조언, 진단, 예후 언급 금지.
- 참으라거나 긍정적으로 생각하라고 강요하지 않는다.
- 아이가 힘들다고 하면 쉬거나 도움 요청을 먼저 안내한다.

금지 표현: 진단, 위험, 심각, 우울증, 불안장애, 참아야 해, 이겨내야 해,
괜찮아질 거야, 아프지 않을 거야, 죽음, 예후, 생존, 병이 낫는다, 약 복용."""


def _build_system_prompt(memories: List[dict]) -> str:
    if not memories:
        return SYSTEM_PROMPT

    memory_lines = "\n".join(
        f"- {m['user_input']} (with {m['npc_name']})"
        for m in memories
        if m.get("user_input")
    )
    return f"{SYSTEM_PROMPT}\n\n이 아이의 과거 대화 기억:\n{memory_lines}"


def _build_messages(
    conversation_history: List[ConversationTurn],
    user_message: str,
) -> List[dict]:
    messages = [{"role": t.role, "content": t.content} for t in conversation_history]
    messages.append({"role": "user", "content": user_message})
    return messages


def _search_memories(patient_profile_id: int, user_message: str) -> List[dict]:
    try:
        return dialogue_vector_store.search(
            patient_profile_id=patient_profile_id,
            query=user_message,
            top_k=3,
        )
    except Exception as e:
        logger.warning("[ChatService] RAG 검색 실패, 기억 없이 진행 (patient=%d): %s", patient_profile_id, e)
        return []


def _extract_npc_message(data: dict) -> str | None:
    content = data.get("content")
    if not content or not isinstance(content, list):
        return None
    first = content[0]
    if not isinstance(first, dict) or first.get("type") != "text":
        return None
    text = first.get("text", "").strip()
    return text if text else None


async def generate_response(
    patient_profile_id: int,
    user_message: str,
    conversation_history: List[ConversationTurn],
) -> tuple[str, bool]:
    memories = _search_memories(patient_profile_id, user_message)
    system_prompt = _build_system_prompt(memories)
    messages = _build_messages(conversation_history, user_message)

    headers = {
        "x-api-key": GMS_API_KEY,
        "anthropic-version": GMS_VERSION,
        "content-type": "application/json",
    }
    body = {
        "model": GMS_MODEL,
        "max_tokens": 256,
        "system": system_prompt,
        "messages": messages,
    }

    try:
        async with httpx.AsyncClient(timeout=GMS_TIMEOUT) as client:
            response = await client.post(f"{GMS_BASE_URL}/messages", headers=headers, json=body)
            response.raise_for_status()
            data = response.json()
            npc_message = _extract_npc_message(data)
            if npc_message is None:
                logger.warning("[ChatService] Claude 응답 구조 이상 (patient=%d)", patient_profile_id)
                return FALLBACK_RESPONSE, True
            return npc_message, False
    except httpx.TimeoutException:
        logger.warning("[ChatService] Claude 타임아웃 (patient=%d)", patient_profile_id)
        return FALLBACK_RESPONSE, True
    except httpx.HTTPStatusError as e:
        logger.error("[ChatService] Claude HTTP 오류 %d (patient=%d)", e.response.status_code, patient_profile_id)
        return FALLBACK_RESPONSE, True
    except Exception as e:
        logger.error("[ChatService] Claude 호출 실패 (patient=%d): %s", patient_profile_id, e)
        return FALLBACK_RESPONSE, True
