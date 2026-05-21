from typing import List, Optional, Dict
from pydantic import BaseModel, Field


class WeekActivityData(BaseModel):
    """한 주 활동 집계 (BE가 ReportData 에서 추려서 보냄)."""
    participated_days: int = Field(ge=0, le=7)
    total_minutes: int = Field(ge=0)
    session_count: int = Field(ge=0)
    fuel_earned: int = Field(ge=0)
    time_of_day: Dict[str, int] = Field(
        default_factory=dict,
        description="morning/day/evening/night 별 세션 수",
    )
    achievements: Dict[str, Dict[str, float]] = Field(
        default_factory=dict,
        description="게임별 성취 요약. 예: {music: {sessions: 3, avg_accuracy: 87.5}, ...}",
    )


class DialogueTrendPoint(BaseModel):
    """일별 대화 톤 추이. BE GuardianReportSummaryService 가 전달하는 값."""
    date: str
    positive_neutral_percent: Optional[int] = Field(default=None, ge=0, le=100)
    session_count: int = Field(ge=0)


class WeekDialogueData(BaseModel):
    """한 주 대화 집계 (등대지기 영철과의 대화 신호)."""
    valence_distribution: Dict[str, int] = Field(
        default_factory=dict,
        description="positive/neutral/negative 발화 수",
    )
    concern_signals: List[str] = Field(default_factory=list)
    protective_factors: List[str] = Field(default_factory=list)
    topics: List[str] = Field(default_factory=list)
    npc_visits: Dict[str, int] = Field(default_factory=dict)
    qualitative_summary: Optional[str] = None
    daily_trend: List[DialogueTrendPoint] = Field(default_factory=list)
    total_sessions: int = Field(default=0, ge=0)


class WeekDelta(BaseModel):
    """지난 주 대비 변화량. 숫자 델타만 (raw 데이터 X) → 토큰 절감."""
    participated_days_delta: int = 0
    total_minutes_delta: int = 0
    session_count_delta: int = 0


class ReportSummaryRequest(BaseModel):
    """주간 리포트 AI 요약 요청 스키마."""
    patient_profile_id: int
    week_start: str = Field(description="월요일 YYYY-MM-DD")
    week_end: str = Field(description="일요일 YYYY-MM-DD")
    is_current_week: bool = Field(
        description="진행 중인 주이면 true → 단정 줄이는 톤",
    )
    days_elapsed: int = Field(ge=1, le=7)
    activity: WeekActivityData
    dialogue: WeekDialogueData
    previous_week_delta: Optional[WeekDelta] = None


class ReportSummaryResponse(BaseModel):
    """주간 리포트 AI 요약 응답."""
    summary: List[str] = Field(
        default_factory=list,
        description="3줄 종합 코멘트",
    )
    activity_observations: List[str] = Field(default_factory=list)
    emotion_observations: List[str] = Field(default_factory=list)
    connection: Optional[str] = None
    suggestion: str = ""
    is_fallback: bool = False
    # DEBUG (임시): fallback 발생 시 원인 추적용. 운영 안정화 후 제거.
    debug_reason: Optional[str] = None
    debug_raw: Optional[str] = None
