from fastapi.testclient import TestClient

from app.main import create_app
from app.services.dialogue import emotion_service


client = TestClient(create_app())


def _payload() -> dict:
    return {
        "patient_profile_id": 1,
        "session_id": 912,
        "npc_name": "LIGHTHOUSE",
        "turns": [
            {
                "question_text": "오늘 해본 것 중에 뭐가 제일 기억나?",
                "choice_text": "태권도 해본 거",
                "npc_response": "태권도 해봤구나. 해보니까 어땠어?",
            },
            {
                "question_text": "해보니까 어땠어?",
                "choice_text": "조금 어려웠어",
                "npc_response": "처음부터 딱 되기는 어렵지. 그래도 끝까지 해봤잖아.",
            },
        ],
    }


def test_dialogue_emotion_summary_endpoint_returns_safe_fallback(monkeypatch) -> None:
    monkeypatch.setattr(emotion_service, "GMS_API_KEY", "")

    response = client.post("/api/v1/dialogue/emotion-summary", json=_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["session_id"] == 912
    assert body["overall_valence"] == "NEUTRAL"
    assert body["tone"] == "CALM"
    assert body["intensity"] == 0
    assert body["is_fallback"] is True
    assert body["guardian_message"]


def test_dialogue_emotion_summary_coerces_model_response() -> None:
    response = emotion_service._coerce_response(
        912,
        {
            "overall_valence": "negative",
            "tone": "worried",
            "intensity": 9,
            "concern_flags": ["worry_present", "unknown_flag", "needs_rest"],
            "protective_factors": ["verbal_expression", "unknown_factor"],
            "guardian_message": "태권도가 조금 어려웠다고 말했어요. 나중에 가볍게 물어봐 주세요.",
        },
    )

    assert response.session_id == 912
    assert response.overall_valence == "NEGATIVE"
    assert response.tone == "WORRIED"
    assert response.intensity == 3
    assert response.concern_flags == ["worry_present", "needs_rest"]
    assert response.protective_factors == ["verbal_expression"]
    assert response.is_fallback is False


def test_dialogue_emotion_summary_extracts_fenced_json() -> None:
    parsed = emotion_service._extract_json_object(
        """Here is the result:
```json
{"overall_valence":"POSITIVE","tone":"CALM","intensity":1}
```
"""
    )

    assert parsed == {
        "overall_valence": "POSITIVE",
        "tone": "CALM",
        "intensity": 1,
    }
