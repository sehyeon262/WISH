from app.schemas.report_summary import ReportSummaryRequest


def test_report_summary_request_keeps_backend_dialogue_trend_fields():
    request = ReportSummaryRequest(
        patient_profile_id=1,
        week_start="2026-05-18",
        week_end="2026-05-24",
        is_current_week=True,
        days_elapsed=2,
        activity={
            "participated_days": 1,
            "total_minutes": 25,
            "session_count": 0,
            "fuel_earned": 0,
            "time_of_day": {},
            "achievements": {"music": {"seconds": 1200}},
        },
        dialogue={
            "valence_distribution": {},
            "concern_signals": [],
            "protective_factors": [],
            "topics": [],
            "npc_visits": {},
            "daily_trend": [
                {
                    "date": "2026-05-18",
                    "positive_neutral_percent": 80,
                    "session_count": 2,
                },
                {
                    "date": "2026-05-19",
                    "positive_neutral_percent": None,
                    "session_count": 0,
                },
            ],
            "total_sessions": 2,
        },
        previous_week_delta={
            "participated_days_delta": 1,
            "total_minutes_delta": 10,
            "session_count_delta": 0,
        },
    )

    dialogue = request.dialogue.model_dump()

    assert dialogue["daily_trend"] == [
        {
            "date": "2026-05-18",
            "positive_neutral_percent": 80,
            "session_count": 2,
        },
        {
            "date": "2026-05-19",
            "positive_neutral_percent": None,
            "session_count": 0,
        },
    ]
    assert dialogue["total_sessions"] == 2
