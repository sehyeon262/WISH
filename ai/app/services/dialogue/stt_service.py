import logging
import os

import httpx

logger = logging.getLogger(__name__)

# GMS 가 OpenAI API 도 같은 키로 프록시하므로, Anthropic 베이스 URL 과 별개로 OpenAI 베이스만 환경변수로 분리.
GMS_OPENAI_BASE_URL = os.getenv(
    "GMS_OPENAI_BASE_URL",
    "https://gms.ssafy.io/gmsapi/api.openai.com/v1",
)
GMS_API_KEY = os.getenv("GMS_KEY", "")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "whisper-1")
# 30초 짧은 발화 + 네트워크 여유. dialogue chat (5초) 보다 길게.
WHISPER_TIMEOUT = int(os.getenv("WHISPER_TIMEOUT_SECONDS", "30"))
WHISPER_LANGUAGE = os.getenv("WHISPER_LANGUAGE", "ko")
# 한국어 고유명사/도메인 어휘를 Whisper 에 미리 알려서 오인식을 줄인다.
# 영철은 등대지기 NPC 이고 대화 상대는 소아암 아이들 — 일상어 + 가족/학교 어휘 위주.
WHISPER_PROMPT = os.getenv(
    "WHISPER_PROMPT",
    "등대지기 영철 할아버지와 아이가 나누는 따뜻한 대화. "
    "등대, 마을, 친구, 학교, 병원, 가족, 엄마, 아빠, 형, 누나, 동생, "
    "선생님, 놀이, 책, 그림, 노래, 바다, 햇빛, 바람.",
)


async def transcribe_audio(
    audio_bytes: bytes,
    filename: str,
    content_type: str | None,
) -> tuple[str, bool]:
    """GMS Whisper 프록시로 오디오 → 텍스트 변환.

    실패 시 (key 미설정, timeout, HTTP 오류 등) ("", True) 를 돌려주어
    호출 측이 fallback UX 로 흐르게 한다. 예외를 위로 던지지 않는다.
    """
    if not GMS_API_KEY:
        logger.warning("[STT] GMS_KEY 미설정 — Whisper 비활성")
        return "", True

    headers = {"Authorization": f"Bearer {GMS_API_KEY}"}
    files = {
        "file": (filename, audio_bytes, content_type or "application/octet-stream"),
        "model": (None, WHISPER_MODEL),
        "language": (None, WHISPER_LANGUAGE),
        "temperature": (None, "0"),
    }
    if WHISPER_PROMPT:
        files["prompt"] = (None, WHISPER_PROMPT)

    try:
        async with httpx.AsyncClient(timeout=WHISPER_TIMEOUT) as client:
            response = await client.post(
                f"{GMS_OPENAI_BASE_URL}/audio/transcriptions",
                headers=headers,
                files=files,
            )
            response.raise_for_status()
            data = response.json()
            text = (data.get("text") or "").strip()
            if not text:
                logger.info("[STT] Whisper 결과 없음 (size=%d)", len(audio_bytes))
                return "", True
            return text, False
    except httpx.TimeoutException:
        logger.warning("[STT] Whisper 타임아웃 (size=%d)", len(audio_bytes))
        return "", True
    except httpx.HTTPStatusError as e:
        logger.error(
            "[STT] Whisper HTTP %d — %s",
            e.response.status_code,
            e.response.text[:200] if e.response is not None else "",
        )
        return "", True
    except Exception as e:
        logger.error("[STT] Whisper 호출 실패: %s", e)
        return "", True
