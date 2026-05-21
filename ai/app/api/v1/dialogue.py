import logging

from fastapi import APIRouter, File, UploadFile

from app.schemas.dialogue import (
    EmbedSessionRequest,
    EmbedSessionResponse,
    DialogueEmotionSummaryRequest,
    DialogueEmotionSummaryResponse,
    SearchMemoryRequest,
    SearchMemoryResponse,
    MemoryResult,
)
from app.schemas.dialogue_chat import ChatRequest, ChatResponse
from app.schemas.dialogue_stt import TranscribeResponse
from app.services.dialogue.vector_store import dialogue_vector_store
from app.services.dialogue.chat_service import generate_response
from app.services.dialogue.emotion_service import summarize_dialogue_emotion
from app.services.dialogue.stt_service import transcribe_audio

router = APIRouter(prefix="/dialogue", tags=["Dialogue RAG"])
logger = logging.getLogger(__name__)


@router.post("/embed-session", response_model=EmbedSessionResponse)
async def embed_session(request: EmbedSessionRequest) -> EmbedSessionResponse:
    turns = [t.model_dump() for t in request.turns]
    try:
        dialogue_vector_store.add_session(
            patient_profile_id=request.patient_profile_id,
            session_id=request.session_id,
            npc_name=request.npc_name,
            turns=turns,
        )
        return EmbedSessionResponse(
            success=True,
            session_id=request.session_id,
            embedded_turns=len(turns),
            message="임베딩 완료",
        )
    except Exception as e:
        logger.error("[EmbedSession] 실패 (session_id=%d): %s", request.session_id, e)
        return EmbedSessionResponse(
            success=False,
            session_id=request.session_id,
            embedded_turns=0,
            message=f"임베딩 실패: {str(e)}",
        )


@router.post("/search-memory", response_model=SearchMemoryResponse)
async def search_memory(request: SearchMemoryRequest) -> SearchMemoryResponse:
    results = dialogue_vector_store.search(
        patient_profile_id=request.patient_profile_id,
        query=request.query,
        top_k=request.top_k,
    )
    return SearchMemoryResponse(
        patient_profile_id=request.patient_profile_id,
        results=[
            MemoryResult(
                content=r["content"],
                npc_name=r["npc_name"],
                user_input=r["user_input"],
                npc_response=r.get("npc_response", ""),
                score=r["score"],
            )
            for r in results
        ],
    )


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    npc_message, is_fallback = await generate_response(
        patient_profile_id=request.patient_profile_id,
        user_message=request.user_message,
        conversation_history=request.conversation_history,
    )
    return ChatResponse(npc_message=npc_message, is_fallback=is_fallback)


@router.post("/emotion-summary", response_model=DialogueEmotionSummaryResponse)
async def emotion_summary(
    request: DialogueEmotionSummaryRequest,
) -> DialogueEmotionSummaryResponse:
    return await summarize_dialogue_emotion(request)


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(file: UploadFile = File(...)) -> TranscribeResponse:
    audio_bytes = await file.read()
    text, is_fallback = await transcribe_audio(
        audio_bytes=audio_bytes,
        filename=file.filename or "audio.webm",
        content_type=file.content_type,
    )
    return TranscribeResponse(text=text, is_fallback=is_fallback)
