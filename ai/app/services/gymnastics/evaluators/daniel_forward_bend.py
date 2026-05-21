from dataclasses import dataclass

from app.services.gymnastics.constants import (
    DANIEL_FORWARD_BEND_MOTION_NAME,
    DEFAULT_DANIEL_FEEDBACK_CLEAR_FRAMES,
    DEFAULT_DANIEL_FEEDBACK_DISPLAY_FRAMES,
    DEFAULT_DANIEL_FEEDBACK_STREAK_THRESHOLD,
    DEFAULT_DANIEL_FORWARD_BEND_ANGLE_THRESHOLD,
    DEFAULT_DANIEL_FORWARD_BEND_KNEE_MIN_ANGLE,
    DEFAULT_DANIEL_FORWARD_BEND_WRIST_DROP_THRESHOLD,
    DEFAULT_HOLD_MAX_FRAME_GAP_MS,
    DEFAULT_STRETCH_HOLD_TARGET_MS,
)
from app.services.gymnastics.evaluators.base import (
    BaseHoldEvaluator,
    EvaluatorResult,
    HoldEvaluatorConfig,
)
from app.services.gymnastics.features.daniel_forward_bend_features import (
    DanielForwardBendFeatureSet,
    extract_daniel_forward_bend_features,
)
from app.services.gymnastics.feedback import (
    FeedbackStabilizerState,
    RepresentativeFeedbackState,
    select_daniel_forward_bend_feedback_candidate,
    stabilize_daniel_feedback,
    update_representative_feedback,
)
from app.services.gymnastics.feedback.common import lowest_knee_angle
from app.services.gymnastics.types import NormalizedPoseFrame


@dataclass(slots=True)
class DanielForwardBendEvaluatorConfig:
    target_hold_ms: int = DEFAULT_STRETCH_HOLD_TARGET_MS
    max_frame_gap_ms: int = DEFAULT_HOLD_MAX_FRAME_GAP_MS
    forward_bend_threshold: float = DEFAULT_DANIEL_FORWARD_BEND_ANGLE_THRESHOLD
    wrist_drop_threshold: float = DEFAULT_DANIEL_FORWARD_BEND_WRIST_DROP_THRESHOLD
    knee_bend_min_angle: float = DEFAULT_DANIEL_FORWARD_BEND_KNEE_MIN_ANGLE
    feedback_streak_threshold: int = DEFAULT_DANIEL_FEEDBACK_STREAK_THRESHOLD
    feedback_display_frames: int = DEFAULT_DANIEL_FEEDBACK_DISPLAY_FRAMES
    feedback_clear_frames: int = DEFAULT_DANIEL_FEEDBACK_CLEAR_FRAMES


class DanielForwardBendEvaluator(BaseHoldEvaluator):
    motion_id = "daniel_forward_bend"
    motion_name = DANIEL_FORWARD_BEND_MOTION_NAME

    def __init__(self, config: DanielForwardBendEvaluatorConfig | None = None):
        self.config = config or DanielForwardBendEvaluatorConfig()
        super().__init__(
            HoldEvaluatorConfig(
                target_hold_ms=self.config.target_hold_ms,
                max_frame_gap_ms=self.config.max_frame_gap_ms,
            )
        )

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
        target_hold_ms: int | None = None,
        hold_duration_ms: int = 0,
        hold_last_timestamp_ms: int | None = None,
    ) -> EvaluatorResult:
        del (
            step_count,
            target_steps,
            last_counted_side,
            last_seen_side,
            left_armed,
            right_armed,
            baseline_left_step_extent,
            baseline_right_step_extent,
            baseline_ankle_span,
            baseline_left_wrist_forward,
            baseline_right_wrist_forward,
            baseline_stance_span,
        )

        next_reference_hip_x, next_reference_hip_y, next_reference_scale = self._capture_reference_if_needed(
            frame=frame,
            reference_hip_x=reference_hip_x,
            reference_hip_y=reference_hip_y,
            reference_scale=reference_scale,
        )

        features = extract_daniel_forward_bend_features(
            frame,
            reference_hip_x=next_reference_hip_x,
            reference_hip_y=next_reference_hip_y,
            reference_scale=next_reference_scale,
        )
        motion_tracking = self._resolve_motion_tracking(frame)
        knee_angle = lowest_knee_angle(features.left_knee_angle, features.right_knee_angle)
        # Entering hold should still require a visible knee angle so we do not
        # accidentally accept a bent-knee posture as valid. Once the user is
        # already holding the pose, temporary knee occlusion is tolerated.
        knee_condition_satisfied = knee_angle is not None and knee_angle >= self.config.knee_bend_min_angle
        can_keep_holding_without_knee_angle = previous_state == "holding" and knee_angle is None
        is_pose_valid = (
            motion_tracking == "tracking_ok"
            and features.forward_bend_angle >= self.config.forward_bend_threshold
            and features.wrist_drop is not None
            and features.wrist_drop >= self.config.wrist_drop_threshold
            and (knee_condition_satisfied or can_keep_holding_without_knee_angle)
        )
        is_attempting = (
            motion_tracking == "tracking_ok"
            and self._is_attempting_metric(
                features.forward_bend_angle,
                self.config.forward_bend_threshold,
            )
        )
        session_progress = self._update_session_progress(
            previous_state=previous_state,
            previous_hold_duration_ms=hold_duration_ms,
            previous_hold_last_timestamp_ms=hold_last_timestamp_ms,
            frame_timestamp_ms=frame.timestamp_ms,
            target_hold_ms=target_hold_ms,
        )
        session_state = self._resolve_session_state(
            hold_completed=session_progress.hold_completed,
            motion_present=is_pose_valid,
        )
        frame_label = self._resolve_frame_label(
            tracking=motion_tracking,
            motion_present=is_pose_valid,
            attempting=is_attempting,
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

        next_feedback_state = self._stabilize_feedback(
            features=features,
            state=session_state,
            tracking=motion_tracking,
            previous_feedback_state=previous_feedback_state,
        )
        next_representative_state = self._update_representative_feedback(
            feedback_state=next_feedback_state,
            previous_representative_state=previous_representative_state,
        )

        return EvaluatorResult(
            motion_id=self.motion_id,
            state=session_state,
            step_count=0,
            accuracy=self._compute_accuracy(features, knee_angle),
            feedback=next_feedback_state.displayed_text,
            tracking=motion_tracking,
            reference_hip_x=next_reference_hip_x,
            reference_hip_y=next_reference_hip_y,
            reference_scale=next_reference_scale,
            displayed_feedback_code=next_feedback_state.displayed_code,
            displayed_feedback_text=next_feedback_state.displayed_text,
            displayed_feedback_frames=next_feedback_state.displayed_frames,
            candidate_feedback_code=next_feedback_state.candidate_code,
            candidate_feedback_text=next_feedback_state.candidate_text,
            candidate_feedback_streak=next_feedback_state.candidate_streak,
            representative_feedback_totals=next_representative_state.totals,
            representative_feedback_code=next_representative_state.representative_code,
            representative_feedback_text=next_representative_state.representative_text,
            representative_feedback_frames=next_representative_state.representative_frames,
            hold_duration_ms=session_progress.hold_duration_ms,
            hold_completed=session_progress.hold_completed,
            hold_last_timestamp_ms=session_progress.hold_last_timestamp_ms,
            frame_label=frame_label,
            guidance_code=next_feedback_state.displayed_code,
            guidance_text=next_feedback_state.displayed_text,
        )

    def _compute_accuracy(
        self,
        features: DanielForwardBendFeatureSet,
        knee_angle: float | None,
    ) -> float:
        scores: list[tuple[float, float]] = [
            (
                min(features.forward_bend_angle / max(self.config.forward_bend_threshold, 1e-6), 1.0),
                0.45,
            ),
        ]
        if features.wrist_drop is not None:
            scores.append(
                (
                    min(features.wrist_drop / max(self.config.wrist_drop_threshold, 1e-6), 1.0),
                    0.30,
                )
            )
        if knee_angle is not None:
            scores.append(
                (
                    min(knee_angle / max(self.config.knee_bend_min_angle, 1.0), 1.0),
                    0.25,
                )
            )

        total_weight = sum(weight for _, weight in scores) or 1.0
        accuracy = sum(score * weight for score, weight in scores) / total_weight
        return round(max(min(accuracy, 1.0), 0.0), 2)

    def _stabilize_feedback(
        self,
        *,
        features: DanielForwardBendFeatureSet,
        state: str,
        tracking: str,
        previous_feedback_state: FeedbackStabilizerState,
    ) -> FeedbackStabilizerState:
        candidate = select_daniel_forward_bend_feedback_candidate(
            state=state,
            tracking=tracking,
            forward_bend_angle=features.forward_bend_angle,
            wrist_drop=features.wrist_drop or 0.0,
            left_knee_angle=features.left_knee_angle,
            right_knee_angle=features.right_knee_angle,
            forward_bend_threshold=self.config.forward_bend_threshold,
            wrist_drop_threshold=self.config.wrist_drop_threshold,
            knee_bend_min_angle=self.config.knee_bend_min_angle,
        )
        return stabilize_daniel_feedback(
            candidate=candidate,
            motion_state=state,
            state=previous_feedback_state,
            streak_threshold=self.config.feedback_streak_threshold,
            display_frames=self.config.feedback_display_frames,
            clear_frames=self.config.feedback_clear_frames,
        )

    def _update_representative_feedback(
        self,
        *,
        feedback_state: FeedbackStabilizerState,
        previous_representative_state: RepresentativeFeedbackState,
    ) -> RepresentativeFeedbackState:
        return update_representative_feedback(
            displayed_code=feedback_state.displayed_code,
            displayed_text=feedback_state.displayed_text,
            state=previous_representative_state,
        )

    def _resolve_motion_tracking(self, frame: NormalizedPoseFrame) -> str:
        required_points = (
            "LEFT_SHOULDER",
            "RIGHT_SHOULDER",
            "LEFT_HIP",
            "RIGHT_HIP",
            "LEFT_WRIST",
            "RIGHT_WRIST",
        )
        if all(point in frame.landmarks for point in required_points):
            return "tracking_ok"
        return "tracking_low"
