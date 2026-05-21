from typing import List, Annotated
from pydantic import BaseModel, Field


class ConversationTurn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    patient_profile_id: int
    user_message: Annotated[str, Field(min_length=1, max_length=500)]
    conversation_history: Annotated[
        List[ConversationTurn], Field(max_length=20)
    ] = Field(default_factory=list)


class ChatResponse(BaseModel):
    npc_message: str
    is_fallback: bool = False
