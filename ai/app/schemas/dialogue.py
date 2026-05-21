from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class DialogueTurnData(BaseModel):
    """세션 종료 시 BE가 AI 서버로 전달하는 단일 턴 데이터."""
    question_text: str = Field(description="NPC 질문 텍스트")
    choice_text: str = Field(description="아이 발화 (자유입력 or 선택지 텍스트)")
    npc_response: str = Field(default="", description="NPC 응답 텍스트")


class EmbedSessionRequest(BaseModel):
    """세션 종료 시 임베딩 요청 스키마."""
    patient_profile_id: int = Field(description="아이 프로필 ID")
    session_id: int = Field(description="대화 세션 ID")
    npc_name: str = Field(description="NPC 이름 (YEONGCHEOL, JOEUN 등)")
    turns: List[DialogueTurnData] = Field(description="대화 턴 목록")


class EmbedSessionResponse(BaseModel):
    """임베딩 결과 응답 스키마."""
    success: bool
    session_id: int
    embedded_turns: int
    message: str


class SearchMemoryRequest(BaseModel):
    """과거 대화 기억 검색 요청 스키마."""
    patient_profile_id: int = Field(description="아이 프로필 ID")
    query: str = Field(description="검색 쿼리 (아이 발화)")
    top_k: int = Field(default=3, ge=1, le=10)


class MemoryResult(BaseModel):
    """검색된 기억 단건."""
    content: str
    npc_name: str
    user_input: str
    npc_response: str
    score: float


class SearchMemoryResponse(BaseModel):
    """과거 대화 기억 검색 응답 스키마."""
    patient_profile_id: int
    results: List[MemoryResult]


class DialogueEmotionSummaryRequest(BaseModel):
    """등대지기 대화 종료 후 보호자 요약용 정서 신호 분석 요청."""

    patient_profile_id: int = Field(description="아이 프로필 ID")
    session_id: int = Field(description="대화 세션 ID")
    npc_name: str = Field(default="LIGHTHOUSE", description="NPC 이름")
    turns: List[DialogueTurnData] = Field(description="분석할 대화 turn 목록")


class DialogueEmotionSummaryResponse(BaseModel):
    """보호자 페이지와 백엔드 저장을 위한 대화 정서 신호 분석 결과."""

    success: bool = True
    session_id: int
    overall_valence: Literal["POSITIVE", "NEUTRAL", "NEGATIVE"]
    tone: Literal["CALM", "TIRED", "WORRIED"]
    intensity: int = Field(ge=0, le=3)
    concern_flags: List[str] = Field(default_factory=list)
    protective_factors: List[str] = Field(default_factory=list)
    guardian_message: str
    is_fallback: bool = False
