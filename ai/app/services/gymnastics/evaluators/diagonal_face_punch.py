from dataclasses import dataclass

from app.services.gymnastics.constants import (
    DEFAULT_DIAGONAL_FACE_PUNCH_ARM_STRAIGHT_THRESHOLD,
    DEFAULT_DIAGONAL_FACE_PUNCH_DEPTH_SHIFT_MAX,
    DEFAULT_DIAGONAL_FACE_PUNCH_DOMINANCE_MARGIN,
    DEFAULT_DIAGONAL_FACE_PUNCH_FORWARD_THRESHOLD,
    DEFAULT_DIAGONAL_FACE_PUNCH_GUARD_BEND_THRESHOLD,
    DEFAULT_DIAGONAL_FACE_PUNCH_HEIGHT_THRESHOLD,
    DEFAULT_DIAGONAL_FACE_PUNCH_RELEASE_THRESHOLD,
    DEFAULT_DIAGONAL_FACE_PUNCH_STANCE_SPAN_THRESHOLD,
    DEFAULT_DIAGONAL_FACE_PUNCH_TARGET_STEPS,
    DEFAULT_DIAGONAL_FACE_PUNCH_TORSO_TILT_MAX,
    DEFAULT_FEEDBACK_CLEAR_FRAMES,
    DEFAULT_FEEDBACK_DISPLAY_FRAMES,
    DEFAULT_FEEDBACK_STREAK_THRESHOLD,
    DEFAULT_GYMNASTICS_BASELINE_TARGET_FRAMES,
)
from app.services.gymnastics.evaluators.base import BaseEvaluator, EvaluatorResult
from app.services.gymnastics.features.diagonal_face_punch_features import (
    DiagonalFacePunchFeatureSet,
    extract_diagonal_face_punch_features,
)
from app.services.gymnastics.feedback import (
    FeedbackStabilizerState,
    RepresentativeFeedbackState,
    select_diagonal_face_punch_feedback_candidate,
    stabilize_feedback,
    update_representative_feedback,
)
from app.services.gymnastics.types import NormalizedPoseFrame


@dataclass(slots=True)
class DiagonalFacePunchEvaluatorConfig:
    target_steps: int = DEFAULT_DIAGONAL_FACE_PUNCH_TARGET_STEPS
    forward_threshold: float = DEFAULT_DIAGONAL_FACE_PUNCH_FORWARD_THRESHOLD
    height_threshold: float = DEFAULT_DIAGONAL_FACE_PUNCH_HEIGHT_THRESHOLD
    stance_span_threshold: float = DEFAULT_DIAGONAL_FACE_PUNCH_STANCE_SPAN_THRESHOLD
    dominance_margin: float = DEFAULT_DIAGONAL_FACE_PUNCH_DOMINANCE_MARGIN
    release_threshold: float = DEFAULT_DIAGONAL_FACE_PUNCH_RELEASE_THRESHOLD
    arm_straight_threshold: float = DEFAULT_DIAGONAL_FACE_PUNCH_ARM_STRAIGHT_THRESHOLD
    guard_bend_threshold: float = DEFAULT_DIAGONAL_FACE_PUNCH_GUARD_BEND_THRESHOLD
    torso_tilt_max: float = DEFAULT_DIAGONAL_FACE_PUNCH_TORSO_TILT_MAX
    depth_shift_max: float = DEFAULT_DIAGONAL_FACE_PUNCH_DEPTH_SHIFT_MAX
    feedback_streak_threshold: int = DEFAULT_FEEDBACK_STREAK_THRESHOLD
    feedback_display_frames: int = DEFAULT_FEEDBACK_DISPLAY_FRAMES
    feedback_clear_frames: int = DEFAULT_FEEDBACK_CLEAR_FRAMES


class DiagonalFacePunchEvaluator(BaseEvaluator):
    motion_id = "diagonal_face_punch"

    def __init__(self, config: DiagonalFacePunchEvaluatorConfig | None = None):
        self.config = config or DiagonalFacePunchEvaluatorConfig()

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
        baseline_left_wrist_height: float | None = None,
        baseline_right_wrist_height: float | None = None,
        baseline_stance_span: float | None = None,
    ) -> EvaluatorResult:
        del baseline_left_step_extent, baseline_right_step_extent, baseline_ankle_span

        effective_target = target_steps or self.config.target_steps
        normalized_step_count = min(max(step_count, 0), effective_target)

        next_reference_hip_x = reference_hip_x
        next_reference_hip_y = reference_hip_y
        next_reference_scale = reference_scale
        next_baseline_status = baseline_status
        next_baseline_frames = self._normalize_baseline_frames(baseline_frames)
        next_baseline_target_frames = self._normalize_baseline_target_frames(baseline_target_frames)
        next_baseline_left_wrist_forward = baseline_left_wrist_forward
        next_baseline_right_wrist_forward = baseline_right_wrist_forward
        next_baseline_left_wrist_height = baseline_left_wrist_height
        next_baseline_right_wrist_height = baseline_right_wrist_height
        next_baseline_stance_span = baseline_stance_span
        captured_baseline_this_frame = False

        if frame.tracking == "tracking_ok" and reference_hip_x is None:
            next_reference_hip_x = frame.hip_center.x
            next_reference_hip_y = frame.hip_center.y
            next_reference_scale = frame.scale_reference

        features = extract_diagonal_face_punch_features(
            frame,
            reference_hip_x=next_reference_hip_x,
            reference_hip_y=next_reference_hip_y,
            reference_scale=next_reference_scale,
            baseline_left_wrist_forward=next_baseline_left_wrist_forward,
            baseline_right_wrist_forward=next_baseline_right_wrist_forward,
            baseline_left_wrist_height=next_baseline_left_wrist_height,
            baseline_right_wrist_height=next_baseline_right_wrist_height,
            baseline_stance_span=next_baseline_stance_span,
        )

        if frame.tracking == "tracking_ok":
            if next_baseline_left_wrist_forward is None:
                next_baseline_left_wrist_forward = features.raw_left_wrist_forward
                captured_baseline_this_frame = True
            if next_baseline_right_wrist_forward is None:
                next_baseline_right_wrist_forward = features.raw_right_wrist_forward
                captured_baseline_this_frame = True
            if self._is_collecting_baseline(next_baseline_status) and next_baseline_left_wrist_height is None:
                next_baseline_left_wrist_height = features.raw_left_wrist_height
                captured_baseline_this_frame = True
            if self._is_collecting_baseline(next_baseline_status) and next_baseline_right_wrist_height is None:
                next_baseline_right_wrist_height = features.raw_right_wrist_height
                captured_baseline_this_frame = True
            if next_baseline_stance_span is None:
                next_baseline_stance_span = features.raw_stance_span
                captured_baseline_this_frame = True

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
                last_counted_side=last_counted_side,
                last_seen_side=last_seen_side,
                left_armed=left_armed,
                right_armed=right_armed,
                reference_hip_x=next_reference_hip_x,
                reference_hip_y=next_reference_hip_y,
                reference_scale=next_reference_scale,
                baseline_status=next_baseline_status,
                baseline_frames=next_baseline_frames,
                baseline_target_frames=next_baseline_target_frames,
                baseline_left_wrist_forward=next_baseline_left_wrist_forward,
                baseline_right_wrist_forward=next_baseline_right_wrist_forward,
                baseline_left_wrist_height=next_baseline_left_wrist_height,
                baseline_right_wrist_height=next_baseline_right_wrist_height,
                baseline_stance_span=next_baseline_stance_span,
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
            next_baseline_left_wrist_forward = self._update_baseline_average(
                next_baseline_left_wrist_forward,
                features.raw_left_wrist_forward,
                sample_count,
            )
            next_baseline_right_wrist_forward = self._update_baseline_average(
                next_baseline_right_wrist_forward,
                features.raw_right_wrist_forward,
                sample_count,
            )
            next_baseline_left_wrist_height = self._update_baseline_average(
                next_baseline_left_wrist_height,
                features.raw_left_wrist_height,
                sample_count,
            )
            next_baseline_right_wrist_height = self._update_baseline_average(
                next_baseline_right_wrist_height,
                features.raw_right_wrist_height,
                sample_count,
            )
            next_baseline_stance_span = self._update_baseline_average(
                next_baseline_stance_span,
                features.raw_stance_span,
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
                last_counted_side=last_counted_side,
                last_seen_side=last_seen_side,
                left_armed=True,
                right_armed=True,
                reference_hip_x=next_reference_hip_x,
                reference_hip_y=next_reference_hip_y,
                reference_scale=next_reference_scale,
                baseline_status=next_baseline_status,
                baseline_frames=next_baseline_frames,
                baseline_target_frames=next_baseline_target_frames,
                baseline_left_wrist_forward=next_baseline_left_wrist_forward,
                baseline_right_wrist_forward=next_baseline_right_wrist_forward,
                baseline_left_wrist_height=next_baseline_left_wrist_height,
                baseline_right_wrist_height=next_baseline_right_wrist_height,
                baseline_stance_span=next_baseline_stance_span,
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
                last_counted_side=last_counted_side,
                last_seen_side=last_seen_side,
                left_armed=True,
                right_armed=True,
                reference_hip_x=next_reference_hip_x,
                reference_hip_y=next_reference_hip_y,
                reference_scale=next_reference_scale,
                baseline_status=next_baseline_status,
                baseline_frames=next_baseline_frames,
                baseline_target_frames=next_baseline_target_frames,
                baseline_left_wrist_forward=next_baseline_left_wrist_forward,
                baseline_right_wrist_forward=next_baseline_right_wrist_forward,
                baseline_left_wrist_height=next_baseline_left_wrist_height,
                baseline_right_wrist_height=next_baseline_right_wrist_height,
                baseline_stance_span=next_baseline_stance_span,
                feedback_state=next_feedback_state,
                representative_state=next_representative_state,
                frame_label=self._resolve_top_frame_label(features, frame.tracking, "idle"),
            )

        if captured_baseline_this_frame:
            next_feedback_state = self._stabilize_feedback(features, "idle", frame.tracking, previous_feedback_state)
            next_representative_state = self._update_representative_feedback(next_feedback_state, previous_representative_state)
            return self._make_result(
                state="idle",
                step_count=normalized_step_count,
                accuracy=0.0,
                tracking=frame.tracking,
                last_counted_side=last_counted_side,
                last_seen_side=last_seen_side,
                left_armed=True,
                right_armed=True,
                reference_hip_x=next_reference_hip_x,
                reference_hip_y=next_reference_hip_y,
                reference_scale=next_reference_scale,
                baseline_status=next_baseline_status,
                baseline_frames=next_baseline_frames,
                baseline_target_frames=next_baseline_target_frames,
                baseline_left_wrist_forward=next_baseline_left_wrist_forward,
                baseline_right_wrist_forward=next_baseline_right_wrist_forward,
                baseline_left_wrist_height=next_baseline_left_wrist_height,
                baseline_right_wrist_height=next_baseline_right_wrist_height,
                baseline_stance_span=next_baseline_stance_span,
                feedback_state=next_feedback_state,
                representative_state=next_representative_state,
                frame_label=self._resolve_top_frame_label(features, frame.tracking, "idle"),
            )

        next_left_armed = left_armed or features.left_wrist_forward <= self.config.release_threshold
        next_right_armed = right_armed or features.right_wrist_forward <= self.config.release_threshold

        next_state = self._resolve_next_state(features=features, previous_state=previous_state, last_seen_side=last_seen_side, left_armed=left_armed, right_armed=right_armed)
        next_step_count = normalized_step_count
        next_counted_side = last_counted_side

        punch_side = self._get_punch_side(next_state)
        if next_step_count < effective_target:
            if punch_side == "left" and next_left_armed and last_counted_side != "left":
                next_step_count += 1
                next_counted_side = "left"
                next_left_armed = False
            elif punch_side == "right" and next_right_armed and last_counted_side != "right":
                next_step_count += 1
                next_counted_side = "right"
                next_right_armed = False

        frame_label = self._resolve_top_frame_label(features, frame.tracking, next_state)
        if next_step_count >= effective_target:
            next_state = "complete"

        active_side = self._get_punch_side(next_state)
        next_seen_side = active_side or last_seen_side
        accuracy = self._compute_accuracy(features)

        next_feedback_state = self._stabilize_feedback(features, next_state, frame.tracking, previous_feedback_state)
        next_representative_state = self._update_representative_feedback(next_feedback_state, previous_representative_state)

        return self._make_result(
            state=next_state,
            step_count=min(next_step_count, effective_target),
            accuracy=accuracy,
            tracking=frame.tracking,
            last_counted_side=next_counted_side,
            last_seen_side=next_seen_side,
            left_armed=next_left_armed,
            right_armed=next_right_armed,
            reference_hip_x=next_reference_hip_x,
            reference_hip_y=next_reference_hip_y,
            reference_scale=next_reference_scale,
            baseline_status=next_baseline_status,
            baseline_frames=next_baseline_frames,
            baseline_target_frames=next_baseline_target_frames,
            baseline_left_wrist_forward=next_baseline_left_wrist_forward,
            baseline_right_wrist_forward=next_baseline_right_wrist_forward,
            baseline_left_wrist_height=next_baseline_left_wrist_height,
            baseline_right_wrist_height=next_baseline_right_wrist_height,
            baseline_stance_span=next_baseline_stance_span,
            feedback_state=next_feedback_state,
            representative_state=next_representative_state,
            frame_label=frame_label,
        )

    def _resolve_next_state(
        self,
        features: DiagonalFacePunchFeatureSet,
        previous_state: str,
        last_seen_side: str | None,
        left_armed: bool,
        right_armed: bool,
    ) -> str:
        if self._is_left_punch(features):
            return "left_punch"
        if self._is_right_punch(features):
            return "right_punch"
        hold_state = previous_state if previous_state in ("left_punch", "right_punch") else (
            f"{last_seen_side}_punch" if last_seen_side else None
        )
        if hold_state == "left_punch" and self._should_hold_left_punch(features):
            return "left_punch"
        if hold_state == "right_punch" and self._should_hold_right_punch(features):
            return "right_punch"
        return "idle"

    def _is_left_punch(self, features: DiagonalFacePunchFeatureSet) -> bool:
        return (
            features.left_wrist_height >= self.config.height_threshold
            and features.left_wrist_height > features.right_wrist_height + self.config.dominance_margin
        )

    def _is_right_punch(self, features: DiagonalFacePunchFeatureSet) -> bool:
        return (
            features.right_wrist_height >= self.config.height_threshold
            and features.right_wrist_height > features.left_wrist_height + self.config.dominance_margin
        )

    def _should_hold_left_punch(self, features: DiagonalFacePunchFeatureSet) -> bool:
        return (
            features.left_wrist_height >= self.config.height_threshold * 0.5
            and features.left_wrist_height > features.right_wrist_height
        )

    def _should_hold_right_punch(self, features: DiagonalFacePunchFeatureSet) -> bool:
        return (
            features.right_wrist_height >= self.config.height_threshold * 0.5
            and features.right_wrist_height > features.left_wrist_height
        )

    def _get_punch_side(self, state: str) -> str | None:
        if state == "left_punch":
            return "left"
        if state == "right_punch":
            return "right"
        return None

    def _resolve_top_frame_label(
        self,
        features: DiagonalFacePunchFeatureSet,
        tracking: str,
        state: str,
    ) -> str:
        return self._resolve_frame_label(
            tracking=tracking,
            motion_present=self._get_punch_side(state) is not None,
            attempting=self._is_attempting_punch(features),
        )

    def _is_attempting_punch(self, features: DiagonalFacePunchFeatureSet) -> bool:
        dominant_height = max(features.left_wrist_height, features.right_wrist_height)
        dominant_forward = max(features.left_wrist_forward, features.right_wrist_forward)
        return (
            dominant_height >= self.config.height_threshold * 0.75
            or dominant_forward >= self.config.forward_threshold * 0.75
        )

    def _compute_accuracy(self, features: DiagonalFacePunchFeatureSet) -> float:
        dominant_forward = max(features.left_wrist_forward, features.right_wrist_forward)
        dominant_height = max(features.left_wrist_height, features.right_wrist_height)
        forward_score = min(dominant_forward / max(self.config.forward_threshold, 1e-6), 1.0)
        height_score = min(dominant_height / max(self.config.height_threshold, 1e-6), 1.0)
        stance_score = min(features.stance_span / max(self.config.stance_span_threshold, 1e-6), 1.0)
        straight_angle = max(features.left_elbow_angle or 0.0, features.right_elbow_angle or 0.0)
        arm_score = min(straight_angle / max(self.config.arm_straight_threshold, 1.0), 1.0)
        torso_score = max(1.0 - features.torso_tilt / max(self.config.torso_tilt_max, 1.0), 0.0)
        depth_score = max(1.0 - abs(features.pelvis_depth_shift) / max(self.config.depth_shift_max, 1e-6), 0.0)
        accuracy = (
            forward_score * 0.25
            + height_score * 0.20
            + arm_score * 0.20
            + stance_score * 0.15
            + torso_score * 0.10
            + depth_score * 0.10
        )
        return round(max(min(accuracy, 1.0), 0.0), 2)

    def _stabilize_feedback(
        self,
        features: DiagonalFacePunchFeatureSet,
        state: str,
        tracking: str,
        previous_feedback_state: FeedbackStabilizerState,
    ) -> FeedbackStabilizerState:
        candidate = select_diagonal_face_punch_feedback_candidate(
            features=features,
            state=state,
            tracking=tracking,
            forward_threshold=self.config.forward_threshold,
            height_threshold=self.config.height_threshold,
            arm_straight_threshold=self.config.arm_straight_threshold,
            guard_bend_threshold=self.config.guard_bend_threshold,
            stance_span_threshold=self.config.stance_span_threshold,
            depth_shift_max=self.config.depth_shift_max,
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
        last_counted_side: str | None,
        last_seen_side: str | None,
        left_armed: bool,
        right_armed: bool,
        reference_hip_x: float | None,
        reference_hip_y: float | None,
        reference_scale: float | None,
        baseline_status: str,
        baseline_frames: int,
        baseline_target_frames: int,
        baseline_left_wrist_forward: float | None,
        baseline_right_wrist_forward: float | None,
        baseline_left_wrist_height: float | None,
        baseline_right_wrist_height: float | None,
        baseline_stance_span: float | None,
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
            last_counted_side=last_counted_side,
            last_seen_side=last_seen_side,
            left_armed=left_armed,
            right_armed=right_armed,
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
            baseline_left_wrist_forward=baseline_left_wrist_forward,
            baseline_right_wrist_forward=baseline_right_wrist_forward,
            baseline_left_wrist_height=baseline_left_wrist_height,
            baseline_right_wrist_height=baseline_right_wrist_height,
            baseline_stance_span=baseline_stance_span,
            frame_label=frame_label,
            guidance_code=feedback_state.displayed_code,
            guidance_text=feedback_state.displayed_text,
        )
