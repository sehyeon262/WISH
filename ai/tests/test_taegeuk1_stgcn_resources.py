from __future__ import annotations

import numpy as np
import pytest

from app.services.taekwondo.constants import (
    LEFT_ANKLE,
    LEFT_ELBOW,
    LEFT_HIP,
    LEFT_KNEE,
    LEFT_SHOULDER,
    LEFT_WRIST,
    RIGHT_ANKLE,
    RIGHT_ELBOW,
    RIGHT_HIP,
    RIGHT_KNEE,
    RIGHT_SHOULDER,
    RIGHT_WRIST,
)
from app.services.taekwondo import stgcn_taegeuk1
from app.services.taekwondo.stgcn_taegeuk1 import (
    CORE_SCORING_JOINT_NAMES,
    KOREAN_TO_TAEKWONDO_LANDMARK,
    STGCN_CHECKPOINT_PATH,
    TARGET_RULE_LOW_MOTION_SCORE_CAP,
    TARGET_SEQUENCE_SHAPE,
    _apply_sequence_motion_final_cap,
    _camera_adjusted_score,
    _normalize_camera_sequence,
    _prediction_probabilities,
    _sequence_centered_score,
    _sequence_final_motion_score_cap,
    _target_rule_candidate_frames,
    _target_rule_score,
    analyze_taegeuk1_sequence,
    load_taegeuk1_resources,
    load_stgcn_model,
)


TARGET_RULE_TEST_PASS_SCORE = 80.0


def _keypoint_index(resources, landmark_name: str) -> int:
    for index, keypoint_name in enumerate(resources.keypoint_names):
        if KOREAN_TO_TAEKWONDO_LANDMARK.get(keypoint_name) == landmark_name:
            return index
    raise AssertionError(f"missing keypoint for {landmark_name}")


def _set_landmark(
    sequence: np.ndarray,
    resources,
    landmark_name: str,
    x: float | np.ndarray,
    y: float | np.ndarray,
) -> None:
    index = _keypoint_index(resources, landmark_name)
    sequence[0, :, index] = x
    sequence[1, :, index] = y


def _walking_low_block_sequence(resources, *, animated: bool) -> np.ndarray:
    sequence = np.zeros(TARGET_SEQUENCE_SHAPE, dtype=np.float32)
    sequence[2, :, :] = 1.0

    _set_landmark(sequence, resources, LEFT_SHOULDER, -0.2, -1.0)
    _set_landmark(sequence, resources, RIGHT_SHOULDER, 0.2, -1.0)
    _set_landmark(sequence, resources, LEFT_HIP, -0.2, 0.0)
    _set_landmark(sequence, resources, RIGHT_HIP, 0.2, 0.0)
    _set_landmark(sequence, resources, LEFT_KNEE, -0.35, 0.75)
    _set_landmark(sequence, resources, RIGHT_KNEE, 0.35, 0.75)
    _set_landmark(sequence, resources, LEFT_ANKLE, -0.5, 1.5)
    _set_landmark(sequence, resources, RIGHT_ANKLE, 0.5, 1.5)
    _set_landmark(sequence, resources, RIGHT_ELBOW, 0.25, -0.3)
    _set_landmark(sequence, resources, RIGHT_WRIST, 0.2, 0.1)

    if animated:
        progress = np.clip((np.linspace(0.0, 1.0, TARGET_SEQUENCE_SHAPE[1]) - 0.25) / 0.55, 0.0, 1.0)
        _set_landmark(sequence, resources, LEFT_ELBOW, -0.6, -0.75 + (0.55 * progress))
        _set_landmark(sequence, resources, LEFT_WRIST, -1.0, -0.65 + (1.25 * progress))
    else:
        _set_landmark(sequence, resources, LEFT_ELBOW, -0.6, -0.2)
        _set_landmark(sequence, resources, LEFT_WRIST, -1.0, 0.6)

    return sequence


def _walking_inner_block_sequence(
    resources,
    *,
    animated: bool,
    unrelated_motion: bool = False,
) -> np.ndarray:
    sequence = np.zeros(TARGET_SEQUENCE_SHAPE, dtype=np.float32)
    sequence[2, :, :] = 1.0

    _set_landmark(sequence, resources, LEFT_SHOULDER, -0.2, -1.0)
    _set_landmark(sequence, resources, RIGHT_SHOULDER, 0.2, -1.0)
    _set_landmark(sequence, resources, LEFT_HIP, -0.2, 0.0)
    _set_landmark(sequence, resources, RIGHT_HIP, 0.2, 0.0)
    _set_landmark(sequence, resources, LEFT_KNEE, -0.35, 0.75)
    _set_landmark(sequence, resources, RIGHT_KNEE, 0.35, 0.75)
    _set_landmark(sequence, resources, LEFT_ANKLE, -0.5, 1.5)
    _set_landmark(sequence, resources, RIGHT_ANKLE, 0.5, 1.5)
    _set_landmark(sequence, resources, RIGHT_ELBOW, 0.25, -0.3)
    _set_landmark(sequence, resources, RIGHT_WRIST, 0.2, 0.1)

    if unrelated_motion:
        progress = np.sin(np.linspace(0.0, np.pi, TARGET_SEQUENCE_SHAPE[1]))
        _set_landmark(sequence, resources, LEFT_KNEE, -0.35 + (0.25 * progress), 0.75)

    if animated:
        progress = np.clip((np.linspace(0.0, 1.0, TARGET_SEQUENCE_SHAPE[1]) - 0.25) / 0.55, 0.0, 1.0)
        _set_landmark(sequence, resources, LEFT_ELBOW, -0.65 + (0.3 * progress), -0.35)
        _set_landmark(sequence, resources, LEFT_WRIST, -1.0 + (0.8 * progress), -0.15)
    else:
        _set_landmark(sequence, resources, LEFT_ELBOW, -0.35, -0.35)
        _set_landmark(sequence, resources, LEFT_WRIST, -0.2, -0.15)

    return sequence


def test_taegeuk1_resources_load_with_expected_schema() -> None:
    resources = load_taegeuk1_resources()

    assert resources.prototypes.shape == (len(resources.class_names), *TARGET_SEQUENCE_SHAPE)
    assert resources.prototypes.dtype == np.float32
    assert len(resources.class_names) == 9
    assert len(set(resources.class_names)) == len(resources.class_names)
    assert len(resources.keypoint_names) == TARGET_SEQUENCE_SHAPE[2]
    assert len(set(resources.keypoint_names)) == TARGET_SEQUENCE_SHAPE[2]
    assert np.isfinite(resources.prototypes).all()

    per_class = resources.similarity_report["per_class"]
    assert set(resources.class_names).issubset(per_class)
    for class_name in resources.class_names:
        stats = per_class[class_name]["distance"]
        assert 0.0 <= float(stats["p50"]) <= float(stats["p90"]) <= float(stats["p95"])

    body_parts = resources.body_part_report["body_parts"]
    reference = resources.body_part_report["part_reference_error_p90"]
    assert set(body_parts) == set(reference)
    known_joints = set(resources.keypoint_names)
    for part, joints in body_parts.items():
        assert joints
        assert set(joints).issubset(known_joints)
        assert float(reference[part]) > 0.0


def test_taegeuk1_checkpoint_matches_resource_dimensions() -> None:
    if stgcn_taegeuk1.torch is None:
        pytest.skip("torch is not installed in this environment")

    resources = load_taegeuk1_resources()
    checkpoint = stgcn_taegeuk1.torch.load(STGCN_CHECKPOINT_PATH, map_location="cpu")
    state_dict = checkpoint.get("model_state_dict") or checkpoint.get("state_dict") or checkpoint

    assert state_dict["head.weight"].shape[0] == len(resources.class_names)
    assert state_dict["input_bn.weight"].shape[0] == TARGET_SEQUENCE_SHAPE[0] * TARGET_SEQUENCE_SHAPE[2]
    assert tuple(state_dict["blocks.0.gcn.adj"].shape) == (
        TARGET_SEQUENCE_SHAPE[2],
        TARGET_SEQUENCE_SHAPE[2],
    )

    model_context = load_stgcn_model()
    assert model_context is not None
    model, _device = model_context
    assert model.head.out_features == len(resources.class_names)


def test_taegeuk1_loaded_prototype_can_be_analyzed() -> None:
    resources = load_taegeuk1_resources()
    movement_name = resources.class_names[0]

    result = analyze_taegeuk1_sequence(
        resources.prototypes[0].tolist(),
        movement_name,
        session_id="resource-smoke-test",
    )

    assert result.session_id == "resource-smoke-test"
    assert result.target_movement_name == movement_name
    assert result.scored_movement_name == movement_name
    assert 0.0 <= result.score <= 100.0
    assert isinstance(result.passed, bool)
    assert result.body_part_scores
    assert result.body_part_errors
    assert result.weakest_body_part in result.body_part_scores
    assert result.worst_joint in resources.keypoint_names


def test_taegeuk1_success_decision_uses_pass_threshold() -> None:
    resources = load_taegeuk1_resources()
    movement_name = resources.class_names[0]

    matched_result = analyze_taegeuk1_sequence(
        resources.prototypes[0].tolist(),
        movement_name,
        pass_threshold=TARGET_RULE_TEST_PASS_SCORE,
    )
    assert matched_result.pass_threshold == TARGET_RULE_TEST_PASS_SCORE
    assert matched_result.passed is True
    assert matched_result.passed == (matched_result.score >= matched_result.pass_threshold)

    mismatched_sequence = resources.prototypes[0].copy()
    mismatched_sequence[:2] = mismatched_sequence[:2] + 10.0
    failed_result = analyze_taegeuk1_sequence(
        mismatched_sequence.tolist(),
        movement_name,
        pass_threshold=100.0,
    )
    assert failed_result.pass_threshold == 100.0
    assert failed_result.score < failed_result.pass_threshold
    assert failed_result.passed is False


def test_taegeuk1_scoring_ignores_small_unstable_joints() -> None:
    resources = load_taegeuk1_resources()
    movement_name = resources.class_names[0]
    sequence = resources.prototypes[0].copy()
    core_joint_names = set(CORE_SCORING_JOINT_NAMES)

    for index, joint_name in enumerate(resources.keypoint_names):
        if joint_name not in core_joint_names:
            sequence[:2, :, index] += 10.0

    result = analyze_taegeuk1_sequence(
        sequence.tolist(),
        movement_name,
        input_normalized=True,
        pass_threshold=TARGET_RULE_TEST_PASS_SCORE,
    )

    assert result.score >= TARGET_RULE_TEST_PASS_SCORE
    assert result.worst_joint in core_joint_names
    assert {str(row["joint"]) for row in result.joint_errors_top5}.issubset(core_joint_names)


def test_camera_adjusted_score_recovers_when_target_is_nearest() -> None:
    score = _camera_adjusted_score(
        absolute_score=0.0,
        target_index=1,
        distances=np.array([1.9, 1.0, 1.7, 2.2], dtype=np.float32),
        probabilities=np.array([0.02, 0.84, 0.1, 0.04], dtype=np.float32),
    )

    assert score >= TARGET_RULE_TEST_PASS_SCORE


def test_camera_adjusted_score_stays_low_when_target_is_not_close() -> None:
    score = _camera_adjusted_score(
        absolute_score=0.0,
        target_index=3,
        distances=np.array([1.0, 1.2, 1.4, 3.2], dtype=np.float32),
        probabilities=np.array([0.64, 0.2, 0.12, 0.04], dtype=np.float32),
    )

    assert score < TARGET_RULE_TEST_PASS_SCORE


def test_sequence_centered_score_keeps_prototype_score_dominant() -> None:
    score, method = _sequence_centered_score(
        prototype_score=20.0,
        camera_score=95.0,
        target_rule_score=95.0,
    )

    assert method == "sequence_weighted"
    assert score == pytest.approx(46.25)
    assert score < TARGET_RULE_TEST_PASS_SCORE


def test_sequence_centered_score_can_pass_when_whole_sequence_is_close() -> None:
    score, method = _sequence_centered_score(
        prototype_score=86.0,
        camera_score=70.0,
        target_rule_score=80.0,
    )

    assert method == "prototype_distance"
    assert score == pytest.approx(86.0)
    assert score >= TARGET_RULE_TEST_PASS_SCORE


def test_sequence_centered_score_uses_prototype_for_missing_supplementary_signal() -> None:
    score, method = _sequence_centered_score(
        prototype_score=50.0,
        camera_score=None,
        target_rule_score=95.0,
    )

    assert method == "sequence_weighted"
    assert score == pytest.approx(59.0)
    assert score < TARGET_RULE_TEST_PASS_SCORE


def test_sequence_centered_score_recovers_live_camera_target_rule_score() -> None:
    score, method = _sequence_centered_score(
        prototype_score=20.0,
        camera_score=20.0,
        target_rule_score=90.0,
        live_camera=True,
    )

    assert method == "sequence_weighted"
    assert score == pytest.approx(81.0)
    assert score >= TARGET_RULE_TEST_PASS_SCORE


def test_sequence_centered_score_keeps_low_live_camera_target_rule_below_pass() -> None:
    score, method = _sequence_centered_score(
        prototype_score=20.0,
        camera_score=20.0,
        target_rule_score=70.0,
        live_camera=True,
    )

    assert method == "sequence_weighted"
    assert score == pytest.approx(52.5)
    assert score < TARGET_RULE_TEST_PASS_SCORE


def test_sequence_centered_score_uses_default_weights_when_live_target_rule_missing() -> None:
    score, method = _sequence_centered_score(
        prototype_score=50.0,
        camera_score=95.0,
        target_rule_score=None,
        live_camera=True,
    )

    assert method == "sequence_weighted"
    assert score == pytest.approx(56.75)
    assert score < TARGET_RULE_TEST_PASS_SCORE


def test_sequence_motion_final_cap_limits_static_camera_sequence() -> None:
    resources = load_taegeuk1_resources()
    sequence = _walking_low_block_sequence(resources, animated=False)

    capped_score, method = _apply_sequence_motion_final_cap(
        95.0,
        "sequence_weighted",
        sequence,
        resources.keypoint_names,
    )

    assert method == "sequence_motion_limited"
    assert capped_score <= TARGET_RULE_LOW_MOTION_SCORE_CAP
    assert capped_score < TARGET_RULE_TEST_PASS_SCORE


def test_sequence_motion_final_cap_rejects_single_joint_motion() -> None:
    resources = load_taegeuk1_resources()
    sequence = _walking_low_block_sequence(resources, animated=False)
    progress = np.sin(np.linspace(0.0, np.pi, TARGET_SEQUENCE_SHAPE[1]))
    _set_landmark(sequence, resources, LEFT_KNEE, -0.35 + (0.35 * progress), 0.75)

    cap = _sequence_final_motion_score_cap(sequence, resources.keypoint_names)

    assert cap < TARGET_RULE_TEST_PASS_SCORE


def test_sequence_motion_final_cap_allows_animated_camera_sequence() -> None:
    resources = load_taegeuk1_resources()
    sequence = _walking_low_block_sequence(resources, animated=True)

    cap = _sequence_final_motion_score_cap(sequence, resources.keypoint_names)

    assert cap == pytest.approx(100.0)


def test_camera_prediction_probabilities_ignore_overconfident_softmax(monkeypatch: pytest.MonkeyPatch) -> None:
    def overconfident_model_prediction(_sequence: np.ndarray) -> np.ndarray:
        probabilities = np.zeros(9, dtype=np.float32)
        probabilities[8] = 1.0
        return probabilities

    monkeypatch.setattr(stgcn_taegeuk1, "_predict_probabilities", overconfident_model_prediction)

    distances = np.array([0.10, 0.70, 0.80, 0.90, 1.00, 1.10, 1.20, 1.30, 1.40], dtype=np.float32)
    probabilities = _prediction_probabilities(
        np.zeros(TARGET_SEQUENCE_SHAPE, dtype=np.float32),
        distances,
        input_normalized=False,
    )

    assert int(np.argmax(probabilities)) == 0
    assert float(probabilities[8]) < 0.01


def test_target_rule_score_caps_static_walking_low_block_pose() -> None:
    resources = load_taegeuk1_resources()
    sequence = np.zeros(TARGET_SEQUENCE_SHAPE, dtype=np.float32)
    sequence[2, :, :] = 1.0

    points = {
        "왼쪽 어깨": (-0.2, -1.0),
        "오른쪽 어깨": (0.2, -1.0),
        "왼쪽 엉덩이": (-0.2, 0.0),
        "오른쪽 엉덩이": (0.2, 0.0),
        "왼쪽 무릎": (-0.35, 0.75),
        "오른쪽 무릎": (0.35, 0.75),
        "왼쪽 발목": (-0.5, 1.5),
        "오른쪽 발목": (0.5, 1.5),
        "왼쪽 팔꿈치": (-0.6, -0.2),
        "왼쪽 손목": (-1.0, 0.6),
        "오른쪽 팔꿈치": (0.25, -0.3),
        "오른쪽 손목": (0.2, 0.1),
    }
    name_to_index = {name: index for index, name in enumerate(resources.keypoint_names)}
    for name, (x, y) in points.items():
        index = name_to_index[name]
        sequence[0, :, index] = x
        sequence[1, :, index] = y

    score = _target_rule_score(sequence, resources.keypoint_names, "앞서고 아래막기")

    assert score is not None
    assert score <= TARGET_RULE_LOW_MOTION_SCORE_CAP


def test_target_rule_score_accepts_animated_walking_low_block_sequence() -> None:
    resources = load_taegeuk1_resources()
    sequence = _walking_low_block_sequence(resources, animated=True)

    score = _target_rule_score(sequence, resources.keypoint_names, resources.class_names[4])

    assert score is not None
    assert score >= TARGET_RULE_TEST_PASS_SCORE


def test_target_rule_score_caps_inner_block_without_wrist_motion() -> None:
    resources = load_taegeuk1_resources()
    sequence = _walking_inner_block_sequence(resources, animated=False, unrelated_motion=True)

    score = _target_rule_score(sequence, resources.keypoint_names, resources.class_names[5])

    assert score is not None
    assert score <= TARGET_RULE_LOW_MOTION_SCORE_CAP


def test_target_rule_score_accepts_animated_inner_block_sequence() -> None:
    resources = load_taegeuk1_resources()
    sequence = _walking_inner_block_sequence(resources, animated=True)

    score = _target_rule_score(sequence, resources.keypoint_names, resources.class_names[5])

    assert score is not None
    assert score > TARGET_RULE_LOW_MOTION_SCORE_CAP


def test_target_rule_score_rejects_single_good_late_camera_frame() -> None:
    resources = load_taegeuk1_resources()
    sequence = np.zeros(TARGET_SEQUENCE_SHAPE, dtype=np.float32)
    sequence[2, :, :] = 1.0

    points = {
        "왼쪽 어깨": (-0.2, -1.0),
        "오른쪽 어깨": (0.2, -1.0),
        "왼쪽 엉덩이": (-0.2, 0.0),
        "오른쪽 엉덩이": (0.2, 0.0),
        "왼쪽 무릎": (-0.35, 0.75),
        "오른쪽 무릎": (0.35, 0.75),
        "왼쪽 발목": (-0.5, 1.5),
        "오른쪽 발목": (0.5, 1.5),
        "왼쪽 팔꿈치": (-0.6, -0.2),
        "왼쪽 손목": (-1.0, 0.6),
        "오른쪽 팔꿈치": (0.25, -0.3),
        "오른쪽 손목": (0.2, 0.1),
    }
    name_to_index = {name: index for index, name in enumerate(resources.keypoint_names)}
    for name, (x, y) in points.items():
        index = name_to_index[name]
        sequence[0, 35, index] = x
        sequence[1, 35, index] = y

    score = _target_rule_score(sequence, resources.keypoint_names, "앞서고 아래막기")

    assert score is not None
    assert score < TARGET_RULE_TEST_PASS_SCORE


def test_camera_sequence_normalization_handles_all_nan_input() -> None:
    sequence = np.full(TARGET_SEQUENCE_SHAPE, np.nan, dtype=np.float32)

    normalized = _normalize_camera_sequence(sequence)

    assert normalized.shape == TARGET_SEQUENCE_SHAPE
    assert np.isfinite(normalized).all()
    assert np.count_nonzero(normalized[2]) == 0


def test_target_rule_candidates_skip_empty_tracking_frames() -> None:
    resources = load_taegeuk1_resources()
    sequence = np.full(TARGET_SEQUENCE_SHAPE, np.nan, dtype=np.float32)

    candidates = _target_rule_candidate_frames(sequence, resources.keypoint_names)

    assert candidates == []


def test_target_rule_candidates_sample_late_frames() -> None:
    resources = load_taegeuk1_resources()
    sequence = np.zeros(TARGET_SEQUENCE_SHAPE, dtype=np.float32)
    sequence[2, :, :] = 1.0

    candidates = _target_rule_candidate_frames(sequence, resources.keypoint_names)

    assert 1 < len(candidates) <= stgcn_taegeuk1.RULE_SCORE_CANDIDATE_FRAME_COUNT + 1
