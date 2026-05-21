import json
import logging
import os
import re
from typing import Optional

import httpx

from app.schemas.dialogue import (
    DialogueEmotionSummaryRequest,
    DialogueEmotionSummaryResponse,
    DialogueTurnData,
)

logger = logging.getLogger(__name__)

GMS_BASE_URL = os.getenv(
    "GMS_ANTHROPIC_BASE_URL",
    "https://gms.ssafy.io/gmsapi/api.anthropic.com/v1",
)
GMS_API_KEY = os.getenv("GMS_KEY", "")
GMS_MODEL = os.getenv(
    "DIALOGUE_EMOTION_MODEL",
    os.getenv("GMS_ANTHROPIC_MODEL", "claude-haiku-4-5-20251001"),
)
GMS_VERSION = os.getenv("GMS_ANTHROPIC_VERSION", "2023-06-01")
GMS_TIMEOUT = int(os.getenv("DIALOGUE_EMOTION_TIMEOUT_SECONDS", "8"))
GMS_MAX_TOKENS = int(os.getenv("DIALOGUE_EMOTION_MAX_TOKENS", "512"))

VALENCES = {"POSITIVE", "NEUTRAL", "NEGATIVE"}
TONES = {"CALM", "TIRED", "WORRIED"}

ALLOWED_CONCERN_FLAGS = {
    "anger_or_frustration",
    "body_discomfort",
    "distress_present",
    "family_worry",
    "fatigue_high",
    "fatigue_present",
    "hesitation_to_share",
    "hospital_worry",
    "information_need",
    "loneliness",
    "needs_comfort",
    "needs_connection",
    "needs_rest",
    "pain_concern",
    "parent_concern",
    "peer_separation",
    "prefers_nonverbal_expression",
    "procedure_fear",
    "school_connection",
    "sleep_worry",
    "uncertainty",
    "worry_present",
}

ALLOWED_PROTECTIVE_FACTORS = {
    "adult_support_plan",
    "adult_support_preference",
    "agency_coping",
    "alternative_expression",
    "body_checkin_interest",
    "body_state_named",
    "breathing_coping",
    "calm_state_named",
    "can_name_fear",
    "comfort_preference_named",
    "comfort_received",
    "creative_expression",
    "emotion_named",
    "empathy",
    "family_support_preference",
    "information_need_named",
    "information_seeking",
    "medical_support_preference",
    "movement_interest",
    "music_interest",
    "pause_coping",
    "playful_coping",
    "positive_activity",
    "positive_activity_interest",
    "positive_body_state",
    "positive_memory",
    "positive_mood",
    "positive_social_state",
    "relationship_named",
    "rest_need_named",
    "self_care_action",
    "self_regulation",
    "sets_boundary",
    "social_connection",
    "social_connection_interest",
    "support_need_named",
    "support_seeking",
    "uncertainty_named",
    "verbal_expression",
}

SYSTEM_PROMPT = """You are WISH's child dialogue emotion signal classifier.
Analyze only the given lighthouse dialogue and return JSON only.

Rules:
- This is not a medical diagnosis or risk assessment.
- Use only the child's words and choices in the transcript.
- Do not infer disease names, prognosis, treatment effect, or clinical condition.
- Keep guardian_message calm, short, and useful for a caregiver.
- guardian_message must be Korean, max 70 characters, and must not use diagnostic wording.

Allowed overall_valence: POSITIVE, NEUTRAL, NEGATIVE
Allowed tone: CALM, TIRED, WORRIED
Allowed intensity: integer 0 to 3

Return exactly this JSON shape:
{
  "overall_valence": "POSITIVE|NEUTRAL|NEGATIVE",
  "tone": "CALM|TIRED|WORRIED",
  "intensity": 0,
  "concern_flags": ["..."],
  "protective_factors": ["..."],
  "guardian_message": "..."
}
"""


def _fallback(
    request: DialogueEmotionSummaryRequest,
    reason: str,
    raw: Optional[str] = None,
) -> DialogueEmotionSummaryResponse:
    logger.warning(
        "[DialogueEmotion] fallback reason=%s patient=%d session=%d raw=%s",
        reason,
        request.patient_profile_id,
        request.session_id,
        raw[:200] if raw else None,
    )
    return DialogueEmotionSummaryResponse(
        success=True,
        session_id=request.session_id,
        overall_valence="NEUTRAL",
        tone="CALM",
        intensity=0,
        concern_flags=[],
        protective_factors=["verbal_expression"],
        guardian_message="대화 기록이 남았어요. 아이와 천천히 이야기해 보세요.",
        is_fallback=True,
    )


def _clip(text: str, limit: int = 300) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return f"{text[:limit].rstrip()}..."


def _format_turn(turn: DialogueTurnData, index: int) -> str:
    parts = [f"{index}. QUESTION: {_clip(turn.question_text)}"]
    if turn.choice_text:
        parts.append(f"   CHILD: {_clip(turn.choice_text)}")
    if turn.npc_response:
        parts.append(f"   LIGHTHOUSE: {_clip(turn.npc_response)}")
    return "\n".join(parts)


def _build_user_message(request: DialogueEmotionSummaryRequest) -> str:
    turns = request.turns[-20:]
    transcript = "\n".join(_format_turn(turn, i + 1) for i, turn in enumerate(turns))
    payload = {
        "patient_profile_id": request.patient_profile_id,
        "session_id": request.session_id,
        "npc_name": request.npc_name,
        "allowed_concern_flags": sorted(ALLOWED_CONCERN_FLAGS),
        "allowed_protective_factors": sorted(ALLOWED_PROTECTIVE_FACTORS),
        "transcript": transcript,
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)


def _extract_text(data: dict) -> Optional[str]:
    content = data.get("content")
    if not content or not isinstance(content, list):
        return None
    first = content[0]
    if not isinstance(first, dict) or first.get("type") != "text":
        return None
    text = first.get("text", "").strip()
    return text if text else None


def _extract_json_object(text: str) -> Optional[dict]:
    if not text:
        return None
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    candidate = fenced.group(1) if fenced else None
    if candidate is None:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None
        candidate = text[start : end + 1]
    try:
        parsed = json.loads(candidate)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


def _as_allowed_list(value, allowed: set[str], limit: int = 5) -> list[str]:
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list):
        return []

    result = []
    for item in value:
        key = str(item).strip()
        if key in allowed and key not in result:
            result.append(key)
        if len(result) >= limit:
            break
    return result


def _coerce_intensity(value) -> int:
    try:
        return max(0, min(3, int(value)))
    except (TypeError, ValueError):
        return 0


def _coerce_guardian_message(value: object, response: DialogueEmotionSummaryResponse) -> str:
    text = str(value or "").strip()
    if text:
        return text[:70]
    if response.concern_flags:
        return "아이의 대화에 걱정 신호가 있어 천천히 물어봐 주세요."
    if response.protective_factors:
        return "아이가 자기 생각을 표현했어요. 함께 이야기해 보세요."
    return "대화 기록이 남았어요. 아이와 천천히 이야기해 보세요."


def _coerce_response(session_id: int, parsed: dict) -> DialogueEmotionSummaryResponse:
    concern_flags = _as_allowed_list(
        parsed.get("concern_flags"),
        ALLOWED_CONCERN_FLAGS,
    )
    protective_factors = _as_allowed_list(
        parsed.get("protective_factors"),
        ALLOWED_PROTECTIVE_FACTORS,
    )

    overall_valence = str(parsed.get("overall_valence") or "NEUTRAL").strip().upper()
    if overall_valence not in VALENCES:
        overall_valence = "NEGATIVE" if concern_flags else "NEUTRAL"

    tone = str(parsed.get("tone") or "CALM").strip().upper()
    if tone not in TONES:
        if any(flag in concern_flags for flag in ("fatigue_present", "fatigue_high", "needs_rest")):
            tone = "TIRED"
        elif concern_flags:
            tone = "WORRIED"
        else:
            tone = "CALM"

    response = DialogueEmotionSummaryResponse(
        success=True,
        session_id=session_id,
        overall_valence=overall_valence,
        tone=tone,
        intensity=_coerce_intensity(parsed.get("intensity")),
        concern_flags=concern_flags,
        protective_factors=protective_factors,
        guardian_message="",
        is_fallback=False,
    )
    response.guardian_message = _coerce_guardian_message(
        parsed.get("guardian_message"),
        response,
    )
    return response


async def summarize_dialogue_emotion(
    request: DialogueEmotionSummaryRequest,
) -> DialogueEmotionSummaryResponse:
    if not request.turns:
        return _fallback(request, "empty-turns")

    if not GMS_API_KEY.strip():
        return _fallback(request, f"missing-api-key model={GMS_MODEL}")

    headers = {
        "x-api-key": GMS_API_KEY,
        "anthropic-version": GMS_VERSION,
        "content-type": "application/json",
    }
    body = {
        "model": GMS_MODEL,
        "max_tokens": GMS_MAX_TOKENS,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": _build_user_message(request)}],
    }

    try:
        async with httpx.AsyncClient(timeout=GMS_TIMEOUT) as client:
            response = await client.post(f"{GMS_BASE_URL}/messages", headers=headers, json=body)
            response.raise_for_status()
            data = response.json()
    except httpx.TimeoutException:
        return _fallback(request, f"timeout:{GMS_TIMEOUT}s model={GMS_MODEL}")
    except httpx.HTTPStatusError as e:
        body_text = ""
        try:
            body_text = e.response.text[:300]
        except Exception:
            pass
        logger.error(
            "[DialogueEmotion] Claude HTTP %d patient=%d body=%s",
            e.response.status_code,
            request.patient_profile_id,
            body_text,
        )
        return _fallback(request, f"http-{e.response.status_code} model={GMS_MODEL}", body_text)
    except Exception as e:
        logger.error(
            "[DialogueEmotion] Claude call failed patient=%d session=%d: %s",
            request.patient_profile_id,
            request.session_id,
            e,
        )
        return _fallback(request, f"exception:{type(e).__name__}:{str(e)[:200]}")

    text = _extract_text(data)
    if text is None:
        return _fallback(request, "response-structure-invalid", json.dumps(data)[:500])

    parsed = _extract_json_object(text)
    if parsed is None:
        return _fallback(request, "json-parse-failed", text)

    return _coerce_response(request.session_id, parsed)
