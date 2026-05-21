import json
import logging
import os
import re
from typing import Optional

import httpx

from app.schemas.report_summary import (
    ReportSummaryRequest,
    ReportSummaryResponse,
)

logger = logging.getLogger(__name__)

GMS_BASE_URL = os.getenv("GMS_ANTHROPIC_BASE_URL", "https://gms.ssafy.io/gmsapi/api.anthropic.com/v1")
GMS_API_KEY = os.getenv("GMS_KEY", "")
# 리포트 요약은 별도 REPORT_SUMMARY_MODEL 이 있으면 우선 사용하고, 없으면 배포에서 이미 검증한
# 공용 GMS_ANTHROPIC_MODEL 을 따른다. 모델 ID가 서비스별로 갈라지면 GMS 4xx → fallback 이 반복된다.
GMS_MODEL = os.getenv(
    "REPORT_SUMMARY_MODEL",
    os.getenv("GMS_ANTHROPIC_MODEL", "claude-sonnet-4-5-20250929"),
)
GMS_VERSION = os.getenv("GMS_ANTHROPIC_VERSION", "2023-06-01")
# 주간 데이터 + JSON 출력이라 chat 보다 토큰·시간 여유 필요.
GMS_TIMEOUT = int(os.getenv("REPORT_SUMMARY_TIMEOUT_SECONDS", "30"))
GMS_MAX_TOKENS = int(os.getenv("REPORT_SUMMARY_MAX_TOKENS", "1024"))


SYSTEM_PROMPT = """너는 WISH 플랫폼의 주간 리포트 요약 도우미다.
WISH 는 소아암 환아의 일상회복을 돕는 플랫폼이고, 너는 보호자가 한 주 동안의
아이 활동·대화 기록을 한눈에 이해할 수 있도록 따뜻하고 차분한 한국어로 의견을 남긴다.

[원칙]
- 주어진 데이터에만 근거한다. 데이터에 없는 활동/감정/진단은 절대 만들어내지 않는다.
- 의학적 진단·예후·치료 효과·약 효과를 언급하지 않는다.
- 다른 아이/평균과 비교하지 않는다.
- 보호자에게 죄책감이나 의무감을 주지 않는다 ("더 챙겨주세요" 같은 표현 금지).
- 데이터가 적거나 진행 중인 주(is_current_week=true)면 단정하지 않고
  "조금 더 지켜보면 좋겠다" 톤으로 부드럽게 쓴다.
- 아이를 지칭할 때는 "아이"라고만 부른다 (이름·진단명·나이 추정 금지).

[출력 형식]
아래 JSON 스키마에 맞춰서만 응답한다. 다른 텍스트(머리말, 코드펜스, 설명)는 절대 포함하지 않는다.

{
  "summary": ["...", "...", "..."],
  "activity_observations": ["..."],
  "emotion_observations": ["..."],
  "connection": "..." 또는 null,
  "suggestion": "..."
}

각 필드 규칙:
- summary: 정확히 3개 문자열. 각 항목은 2~3문장의 종합 코멘트. 한 줄당 한 가지 관점.
- activity_observations: 1~2개. 활동 데이터(참여일·시간대·게임 성취)에서 관찰된 점.
- emotion_observations: 1~2개. 대화 데이터(발렌스·주제·보호 요인)에서 관찰된 점.
- connection: 활동과 정서 사이 연결을 데이터로 뒷받침할 수 있을 때만 한 문장. 아니면 null.
- suggestion: 이번 주 보호자가 아이와 함께 시도해볼 만한 작은 활동 1개.

JSON 외의 텍스트, 백틱(```), "다음은", "여기" 같은 안내문구는 절대 쓰지 않는다."""


def _fallback(reason: str, raw: Optional[str] = None) -> ReportSummaryResponse:
    """fallback 응답 생성. DEBUG 필드에 원인 + (있으면) 원본 텍스트 첨부."""
    return ReportSummaryResponse(
        summary=[
            "이번 주 데이터를 한눈에 모아 봤어요.",
            "활동과 대화 기록이 차곡차곡 쌓이고 있어요.",
            "다음 주에도 아이의 속도에 맞춰 함께 해주세요.",
        ],
        activity_observations=[],
        emotion_observations=[],
        connection=None,
        suggestion="아이가 가장 좋아한 활동이 무엇이었는지 한 번 물어봐 주세요.",
        is_fallback=True,
        debug_reason=reason,
        debug_raw=raw[:500] if raw else None,
    )


def _build_user_message(request: ReportSummaryRequest) -> str:
    """LLM 에게 넘길 한 주치 데이터 블록. JSON 문자열 1개로 전달해서 토큰 효율↑."""
    payload = {
        "week_start": request.week_start,
        "week_end": request.week_end,
        "is_current_week": request.is_current_week,
        "days_elapsed": request.days_elapsed,
        "activity": request.activity.model_dump(),
        "dialogue": request.dialogue.model_dump(),
        "previous_week_delta": (
            request.previous_week_delta.model_dump()
            if request.previous_week_delta is not None
            else None
        ),
    }
    return (
        "다음은 한 주간의 활동·대화 집계 데이터다. 이 데이터에만 근거해 시스템 프롬프트의 "
        "JSON 스키마대로 응답해라.\n\n"
        f"{json.dumps(payload, ensure_ascii=False, indent=2)}"
    )


def _extract_json_object(text: str) -> Optional[dict]:
    """Claude 응답에서 JSON 오브젝트만 골라낸다. 코드펜스/앞뒤 문구가 섞여도 복구."""
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
        return json.loads(candidate)
    except json.JSONDecodeError:
        return None


def _coerce_response(parsed: dict) -> ReportSummaryResponse:
    """모델 응답을 스키마에 맞게 정규화. summary 가 문자열로 와도 줄바꿈으로 분리."""
    summary = parsed.get("summary", [])
    if isinstance(summary, str):
        summary = [line.strip() for line in summary.split("\n") if line.strip()]
    if not isinstance(summary, list):
        summary = []

    def _to_str_list(value) -> list:
        if isinstance(value, list):
            return [str(v) for v in value if v]
        if isinstance(value, str) and value.strip():
            return [value.strip()]
        return []

    connection = parsed.get("connection")
    if isinstance(connection, str) and not connection.strip():
        connection = None

    return ReportSummaryResponse(
        summary=[str(s) for s in summary][:3],
        activity_observations=_to_str_list(parsed.get("activity_observations"))[:2],
        emotion_observations=_to_str_list(parsed.get("emotion_observations"))[:2],
        connection=connection if isinstance(connection, str) else None,
        suggestion=str(parsed.get("suggestion") or "").strip(),
        is_fallback=False,
    )


def _extract_text(data: dict) -> Optional[str]:
    content = data.get("content")
    if not content or not isinstance(content, list):
        return None
    first = content[0]
    if not isinstance(first, dict) or first.get("type") != "text":
        return None
    text = first.get("text", "").strip()
    return text if text else None


async def summarize_weekly_report(request: ReportSummaryRequest) -> ReportSummaryResponse:
    if not GMS_API_KEY.strip():
        logger.warning(
            "[ReportSummary] GMS_KEY 미설정 — fallback (patient=%d, week_start=%s)",
            request.patient_profile_id,
            request.week_start,
        )
        return _fallback(f"missing-api-key model={GMS_MODEL}")

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
        logger.warning(
            "[ReportSummary] Claude 타임아웃 (patient=%d, week_start=%s)",
            request.patient_profile_id,
            request.week_start,
        )
        return _fallback(f"timeout:{GMS_TIMEOUT}s model={GMS_MODEL}")
    except httpx.HTTPStatusError as e:
        body_text = ""
        try:
            body_text = e.response.text[:300]
        except Exception:
            pass
        logger.error(
            "[ReportSummary] Claude HTTP %d (patient=%d) body=%s",
            e.response.status_code,
            request.patient_profile_id,
            body_text,
        )
        return _fallback(f"http-{e.response.status_code} model={GMS_MODEL}", body_text)
    except Exception as e:
        logger.error(
            "[ReportSummary] Claude 호출 실패 (patient=%d): %s",
            request.patient_profile_id,
            e,
        )
        return _fallback(f"exception:{type(e).__name__}:{str(e)[:200]}")

    text = _extract_text(data)
    if text is None:
        logger.warning(
            "[ReportSummary] Claude 응답 구조 이상 (patient=%d)",
            request.patient_profile_id,
        )
        return _fallback("response-structure-invalid", json.dumps(data)[:500])

    parsed = _extract_json_object(text)
    if parsed is None:
        logger.warning(
            "[ReportSummary] JSON 파싱 실패 (patient=%d): %s",
            request.patient_profile_id,
            text[:200],
        )
        return _fallback("json-parse-failed", text)

    coerced = _coerce_response(parsed)
    if not coerced.summary or not coerced.suggestion:
        logger.warning(
            "[ReportSummary] 필수 필드 누락 → fallback (patient=%d)",
            request.patient_profile_id,
        )
        return _fallback(
            f"missing-fields summary_len={len(coerced.summary)} "
            f"suggestion_len={len(coerced.suggestion)}",
            text,
        )
    return coerced
