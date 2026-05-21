from dataclasses import dataclass

from app.services.gymnastics.constants import (
    DEFAULT_FEEDBACK_CLEAR_FRAMES,
    DEFAULT_FEEDBACK_DISPLAY_FRAMES,
    DEFAULT_FEEDBACK_STREAK_THRESHOLD,
    DEFAULT_GYMNASTICS_BASELINE_TARGET_FRAMES,
    DEFAULT_SQUAT_BOTTOM_THRESHOLD,
    DEFAULT_SQUAT_DESCEND_THRESHOLD,
    DEFAULT_SQUAT_LATERAL_SHIFT_MAX,
    DEFAULT_SQUAT_RETURN_THRESHOLD,
    DEFAULT_SQUAT_TARGET_STEPS,
    DEFAULT_SQUAT_TORSO_TILT_MAX,
)
from app.services.gymnastics.evaluators.base import BaseEvaluator, EvaluatorResult
from app.services.gymnastics.features.squat_features import SquatFeatureSet, extract_squat_features
from app.services.gymnastics.feedback import (
    FeedbackStabilizerState,
    RepresentativeFeedbackState,
    select_squat_feedback_candidate,
    stabilize_feedback,
    update_representative_feedback,
)
from app.services.gymnastics.types import NormalizedPoseFrame


@dataclass(slots=True)
class SquatEvaluatorConfig:
    target_steps: int = DEFAULT_SQUAT_TARGET_STEPS
    descend_threshold: float = DEFAULT_SQUAT_DESCEND_THRESHOLD
    bottom_threshold: float = DEFAULT_SQUAT_BOTTOM_THRESHOLD
    return_threshold: float = DEFAULT_SQUAT_RETURN_THRESHOLD
    torso_tilt_max: float = DEFAULT_SQUAT_TORSO_TILT_MAX
    lateral_shift_max: float = DEFAULT_SQUAT_LATERAL_SHIFT_MAX
    feedback_streak_threshold: int = DEFAULT_FEEDBACK_STREAK_THRESHOLD
    feedback_display_frames: int = DEFAULT_FEEDBACK_DISPLAY_FRAMES
    feedback_clear_frames: int = DEFAULT_FEEDBACK_CLEAR_FRAMES


class SquatEvaluator(BaseEvaluator):
    motion_id = "squat"

    def __init__(self, config: SquatEvaluatorConfig | None = None):
        self.config = config or SquatEvaluatorConfig()

    def evaluate(
        self,
        frame: NormalizedPoseFrame,
        previous_state: str,
        step_count: int,
        target_steps: int,
        last_counted_side: str | None = None,
        last_seen_side: str | None = None,
        left_armed: bool = True,
        right_armed: bool = True,
        reference_hip_x: float | None = None,
        reference_hip_y: float | None = None,
        reference_scale: float | None = None,
        baseline_status: str = "ready",
        baseline_frames: int = 0,
        baseline_target_frames: int = DEFAULT_GYMNASTICS_BASELINE_TARGET_FRAMES,
        displayed_feedback_code: str | None = None,
        displayed_feedback_text: str | None = None,
        displayed_feedback_frames: int = 0,
        candidate_feedback_code: str | None = None,
        candidate_feedback_text: str | None = None,
        candidate_feedback_streak: int = 0,
        representative_feedback_totals: dict[str, int] | None = None,
        representative_feedback_code: str | None = None,
        representative_feedback_text: str | None = None,
        representative_feedback_frames: int = 0,
        baseline_left_step_extent: float | None = None,
        baseline_right_step_extent: float | None = None,
        baseline_ankle_span: float | None = None,
        baseline_left_wrist_forward: float | None = None,
        baseline_right_wrist_forward: float | None = None,
        baseline_stance_span: float | None = None,
    ) -> EvaluatorResult:
        del (
            last_counted_side, last_seen_side, left_armed, right_armed,
            baseline_left_step_extent, baseline_right_step_extent, baseline_ankle_span,
            baseline_left_wrist_forward, baseline_right_wrist_forward, baseline_stance_span,
        )

        effective_target = target_steps or self.config.target_steps
        normalized_step_count = min(max(step_count, 0), effective_target)

        next_reference_hip_x = reference_hip_x
        next_reference_hip_y = reference_hip_y
        next_reference_scale = reference_scale
        next_baseline_status = baseline_status
        next_baseline_frames = self._normalize_baseline_frames(baseline_frames)
        next_baseline_target_frames = self._normalize_baseline_target_frames(baseline_target_frames)

        if frame.tracking == "tracking_ok" and reference_hip_x is None:
            next_reference_hip_x = frame.hip_center.x
            next_reference_hip_y = frame.hip_center.y
            next_reference_scale = frame.scale_reference

        features = extract_squat_features(
            frame,
            reference_hip_x=next_reference_hip_x,
            reference_hip_y=next_reference_hip_y,
            reference_scale=next_reference_scale,
        )

        previous_feedback_state = FeedbackStabilizerState(
            displayed_code=displayed_feedback_code,
            displayed_text=displayed_feedback_text,
            displayed_frames=displayed_feedback_frames,
            candidate_code=candidate_feedback_code,
            candidate_text=candidate_feedback_text,
            candidate_streak=candidate_feedback_streak,
        )
        previous_representative_state = RepresentativeFeedbackState(
            totals=dict(representative_feedback_totals or {}),
            representative_code=representative_feedback_code,
            representative_text=representative_feedback_text,
            representative_frames=representative_feedback_frames,
        )

        if frame.tracking != "tracking_ok":
            next_feedback_state = self._stabilize_feedback(features, previous_state, frame.tracking, previous_feedback_state)
            next_representative_state = self._update_representative_feedback(next_feedback_state, previous_representative_state)
            return self._make_result(
                state=previous_state,
                step_count=normalized_step_count,
                accuracy=0.0,
                tracking=frame.tracking,
                reference_hip_x=next_reference_hip_x,
                reference_hip_y=next_reference_hip_y,
                reference_scale=next_reference_scale,
                baseline_status=next_baseline_status,
                baseline_frames=next_baseline_frames,
                baseline_target_frames=next_baseline_target_frames,
                feedback_state=next_feedback_state,
                representative_state=next_representative_state,
                frame_label=self._resolve_frame_label(
                    tracking=frame.tracking,
                    motion_present=False,
                    attempting=False,
                ),
            )

        if self._is_collecting_baseline(next_baseline_status):
            sample_count = next_baseline_frames
            next_reference_hip_x = self._update_baseline_average(
                reference_hip_x,
                frame.hip_center.x,
                sample_count,
            )
            next_reference_hip_y = self._update_baseline_average(
                reference_hip_y,
                frame.hip_center.y,
                sample_count,
            )
            next_reference_scale = self._update_baseline_average(
                reference_scale,
                frame.scale_reference,
                sample_count,
            )
            next_baseline_status, next_baseline_frames = self._advance_baseline_collection(
                baseline_frames=next_baseline_frames,
                baseline_target_frames=next_baseline_target_frames,
            )
            next_feedback_state = self._stabilize_feedback(features, "idle", frame.tracking, previous_feedback_state)
            next_representative_state = self._update_representative_feedback(next_feedback_state, previous_representative_state)
            return self._make_result(
                state="idle",
                step_count=normalized_step_count,
                accuracy=0.0,
                tracking=frame.tracking,
                reference_hip_x=next_reference_hip_x,
                reference_hip_y=next_reference_hip_y,
                reference_scale=next_reference_scale,
                baseline_status=next_baseline_status,
                baseline_frames=next_baseline_frames,
                baseline_target_frames=next_baseline_target_frames,
                feedback_state=next_feedback_state,
                representative_state=next_representative_state,
                frame_label=self._resolve_top_frame_label(features, frame.tracking, "idle"),
            )

        if next_reference_hip_x is None or next_reference_hip_y is None or next_reference_scale is None:
            next_feedback_state = self._stabilize_feedback(features, "idle", frame.tracking, previous_feedback_state)
            next_representative_state = self._update_representative_feedback(next_feedback_state, previous_representative_state)
            return self._make_result(
                state="idle",
                step_count=normalized_step_count,
                accuracy=0.0,
                tracking=frame.tracking,
                reference_hip_x=next_reference_hip_x,
                reference_hip_y=next_reference_hip_y,
                reference_scale=next_reference_scale,
                baseline_status=next_baseline_status,
                baseline_frames=next_baseline_frames,
                baseline_target_frames=next_baseline_target_frames,
                feedback_state=next_feedback_state,
                representative_state=next_representative_state,
                frame_label=self._resolve_top_frame_label(features, frame.tracking, "idle"),
            )

        next_state = self._resolve_next_state(features, previous_state)
        next_step_count = normalized_step_count

        if next_state == "idle" and previous_state in ("bottom", "ascending"):
            if next_step_count < effective_target:
                next_step_count += 1

        frame_label = self._resolve_top_frame_label(features, frame.tracking, next_state)
        if next_step_count >= effective_target:
            next_state = "complete"

        accuracy = self._compute_accuracy(features)
        next_feedback_state = self._stabilize_feedback(features, next_state, frame.tracking, previous_feedback_state)
        next_representative_state = self._update_representative_feedback(next_feedback_state, previous_representative_state)

        return self._make_result(
            state=next_state,
            step_count=min(next_step_count, effective_target),
            accuracy=accuracy,
            tracking=frame.tracking,
            reference_hip_x=next_reference_hip_x,
            reference_hip_y=next_reference_hip_y,
            reference_scale=next_reference_scale,
            baseline_status=next_baseline_status,
            baseline_frames=next_baseline_frames,
            baseline_target_frames=next_baseline_target_frames,
            feedback_state=next_feedback_state,
            representative_state=next_representative_state,
            frame_label=frame_label,
        )

    def _resolve_next_state(self, features: SquatFeatureSet, previous_state: str) -> str:
        if features.hip_drop >= self.config.bottom_threshold:
            return "bottom"

        if features.hip_drop <= self.config.return_threshold:
            return "idle"

        # middle range: between return_threshold and bottom_threshold
        if previous_state == "idle":
            if features.hip_drop >= self.config.descend_threshold:
                return "descending"
            return "idle"

        if previous_state == "descending":
            return "descending"

        if previous_state in ("bottom", "ascending"):
            return "ascending"

        return "idle"

    def _resolve_top_frame_label(
        self,
        features: SquatFeatureSet,
        tracking: str,
        state: str,
    ) -> str:
        return self._resolve_frame_label(
            tracking=tracking,
            motion_present=state in {"bottom", "ascending"},
            attempting=self._is_attempting_squat(features, state),
        )

    def _is_attempting_squat(self, features: SquatFeatureSet, state: str) -> bool:
        if state == "descending":
            return True
        return features.hip_drop >= self.config.descend_threshold

    def _compute_accuracy(self, features: SquatFeatureSet) -> float:
        depth_score = min(features.hip_drop / max(self.config.bottom_threshold, 1e-6), 1.0)
        torso_score = max(1.0 - features.torso_tilt / max(self.config.torso_tilt_max, 1.0), 0.0)

        symmetry_score = 1.0
        if features.left_knee_angle is not None and features.right_knee_angle is not None:
            diff = abs(features.left_knee_angle - features.right_knee_angle)
            symmetry_score = max(1.0 - diff / 30.0, 0.0)

        accuracy = depth_score * 0.5 + torso_score * 0.3 + symmetry_score * 0.2
        return round(max(min(accuracy, 1.0), 0.0), 2)

    def _stabilize_feedback(
        self,
        features: SquatFeatureSet,
        state: str,
        tracking: str,
        previous_feedback_state: FeedbackStabilizerState,
    ) -> FeedbackStabilizerState:
        candidate = select_squat_feedback_candidate(
            features=features,
            state=state,
            tracking=tracking,
            bottom_threshold=self.config.bottom_threshold,
            torso_tilt_max=self.config.torso_tilt_max,
        )
        return stabilize_feedback(
            candidate=candidate,
            state=previous_feedback_state,
            streak_threshold=self.config.feedback_streak_threshold,
            display_frames=self.config.feedback_display_frames,
            clear_frames=self.config.feedback_clear_frames,
        )

    def _update_representative_feedback(
        self,
        feedback_state: FeedbackStabilizerState,
        previous_representative_state: RepresentativeFeedbackState,
    ) -> RepresentativeFeedbackState:
        return update_representative_feedback(
            displayed_code=feedback_state.displayed_code,
            displayed_text=feedback_state.displayed_text,
            state=previous_representative_state,
        )

    def _make_result(
        self,
        state: str,
        step_count: int,
        accuracy: float,
        tracking: str,
        reference_hip_x: float | None,
        reference_hip_y: float | None,
        reference_scale: float | None,
        baseline_status: str,
        baseline_frames: int,
        baseline_target_frames: int,
        feedback_state: FeedbackStabilizerState,
        representative_state: RepresentativeFeedbackState,
        frame_label: str,
    ) -> EvaluatorResult:
        return EvaluatorResult(
            motion_id=self.motion_id,
            state=state,
            step_count=step_count,
            accuracy=accuracy,
            feedback=feedback_state.displayed_text,
            tracking=tracking,
            reference_hip_x=reference_hip_x,
            reference_hip_y=reference_hip_y,
            reference_scale=reference_scale,
            baseline_status=baseline_status,
            baseline_frames=baseline_frames,
            baseline_target_frames=baseline_target_frames,
            displayed_feedback_code=feedback_state.displayed_code,
            displayed_feedback_text=feedback_state.displayed_text,
            displayed_feedback_frames=feedback_state.displayed_frames,
            candidate_feedback_code=feedback_state.candidate_code,
            candidate_feedback_text=feedback_state.candidate_text,
            candidate_feedback_streak=feedback_state.candidate_streak,
            representative_feedback_totals=representative_state.totals,
            representative_feedback_code=representative_state.representative_code,
            representative_feedback_text=representative_state.representative_text,
            representative_feedback_frames=representative_state.representative_frames,
            frame_label=frame_label,
            guidance_code=feedback_state.displayed_code,
            guidance_text=feedback_state.displayed_text,
        )
