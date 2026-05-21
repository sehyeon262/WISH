"""태극 1장 채점 API (POST /api/v1/taekwondo/score) 통합 테스트.

학습된 모델/템플릿/통계 자산이 레포에 포함되어 있다는 가정 하에 동작한다
(S14P31E103-335 에서 커밋된 ``ai/app/models/taegeuk1/checkpoints/`` 등).

관련 이슈: S14P31E103-341
"""
from __future__ import annotations

import numpy as np
from fastapi.testclient import TestClient

from app.main import create_app

client = TestClient(create_app())

SCORING_URL = "/api/v1/taekwondo/score"
KNOWN_ACTION = "기본준비"  # 학습된 9개 동작 중 하나
JOINT_DIM = 8


def _make_dummy_sequence(n_frames: int = 30, *, seed: int = 42) -> list[list[float]]:
    """관절 각도(0~180) 시뮬레이션 시퀀스. 결정론적이라 회귀 테스트 안정.

    실제 학습된 동작과 다른 패턴이라 점수는 낮게 나오겠지만, 라우트 동작
    검증에는 충분하다.
    """
    rng = np.random.default_rng(seed)
    return rng.uniform(0.0, 180.0, size=(n_frames, JOINT_DIM)).tolist()


# ---------- 정상 응답 ----------

def test_score_returns_valid_response_shape() -> None:
    response = client.post(
        SCORING_URL,
        json={
            "action_name": KNOWN_ACTION,
            "keypoints": _make_dummy_sequence(),
        },
    )
    assert response.status_code == 200, response.text

    data = response.json()
    assert data["action_name"] == KNOWN_ACTION

    # 점수 범위 검증
    assert 0.0 <= data["final_score"] <= 100.0
    assert 0.0 <= data["lstm"]["score"] <= 100.0
    assert 0.0 <= data["dtw"]["score"] <= 100.0

    # 가중평균 검증 (LSTM × 0.6 + DTW × 0.4)
    expected_final = data["lstm"]["score"] * 0.6 + data["dtw"]["score"] * 0.4
    assert abs(data["final_score"] - expected_final) < 1e-6

    # LSTM 상세
    assert data["lstm"]["recon_error"] >= 0.0
    assert isinstance(data["lstm"]["joint_errors"], dict)
    assert len(data["lstm"]["joint_errors"]) == JOINT_DIM
    assert data["lstm"]["worst_joint"] in data["lstm"]["joint_errors"]

    # DTW 상세
    assert data["dtw"]["distance"] >= 0.0


def test_score_short_sequence_is_resampled() -> None:
    """짧은 시퀀스도 60프레임으로 보간되어 정상 처리되어야 함."""
    response = client.post(
        SCORING_URL,
        json={
            "action_name": KNOWN_ACTION,
            "keypoints": _make_dummy_sequence(n_frames=5),
        },
    )
    assert response.status_code == 200


# ---------- 에러 응답 ----------

def test_score_invalid_joint_dim_returns_422() -> None:
    """관절 차원이 8이 아니면 422."""
    response = client.post(
        SCORING_URL,
        json={
            "action_name": KNOWN_ACTION,
            "keypoints": [[1.0, 2.0, 3.0]],  # 3 joints — 8이어야 함
        },
    )
    assert response.status_code == 422
    assert "shape" in response.text.lower() or "8" in response.text


def test_score_unknown_action_returns_404() -> None:
    """학습되지 않은 동작 이름은 404."""
    response = client.post(
        SCORING_URL,
        json={
            "action_name": "존재하지않는동작",
            "keypoints": _make_dummy_sequence(),
        },
    )
    assert response.status_code == 404


def test_score_empty_keypoints_returns_validation_error() -> None:
    """빈 keypoints 는 Pydantic min_length 검증으로 422."""
    response = client.post(
        SCORING_URL,
        json={
            "action_name": KNOWN_ACTION,
            "keypoints": [],
        },
    )
    assert response.status_code == 422


def test_score_missing_action_name_returns_422() -> None:
    """action_name 누락 시 Pydantic 검증으로 422."""
    response = client.post(
        SCORING_URL,
        json={"keypoints": _make_dummy_sequence()},
    )
    assert response.status_code == 422
