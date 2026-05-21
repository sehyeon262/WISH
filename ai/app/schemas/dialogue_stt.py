from pydantic import BaseModel


class TranscribeResponse(BaseModel):
    text: str
    is_fallback: bool = False
