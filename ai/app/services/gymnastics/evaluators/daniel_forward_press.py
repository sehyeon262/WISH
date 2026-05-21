from dataclasses import dataclass

from app.services.gymnastics.constants import (
    DEFAULT_DANIEL_FEEDBACK_CLEAR_FRAMES,
    DEFAULT_DANIEL_FEEDBACK_DISPLAY_FRAMES,
    DEFAULT_DANIEL_FEEDBACK_STREAK_THRESHOLD,
    DEFAULT_DANIEL_FORWARD_PRESS_ARM_STRAIGHT_THRESHOLD,
    DEFAULT_DANIEL_FORWARD_PRESS_FORWARD_THRESHOLD,
    DEFAULT_DANIEL_FORWARD_PRESS_HEIGHT_ERROR_MAX,
    DEFAULT_DANIEL_FORWARD_PRESS_TORSO_TILT_MAX,
    DEFAULT_DANIEL_FORWARD_PRESS_WRIST_BELOW_SHOULDER_MIN,
    DEFAULT_DANIEL_FORWARD_PRESS_WRIST_GAP_MAX,
    DEFAULT_DANIEL_FORWARD_PRESS_WRIST_EXTENSION_THRESHOLD,
    DEFAULT_HOLD_MAX_FRAME_GAP_MS,
    DEFAULT_STRETCH_HOLD_TARGET_MS,
)
from app.services.gymnastics.evaluators.base import (
    BaseHoldEvaluator,
    EvaluatorResult,
    HoldEvaluatorConfig,
)
from app.services.gymnastics.features.daniel_forward_press_features import (
    DanielForwardPressFeatureSet,
    extract_daniel_forward_press_features,
)
from app.services.gymnastics.feedback import (
    FeedbackStabilizerState,
    RepresentativeFeedbackState,
    select_daniel_forward_press_feedback_candidate,
    stabilize_daniel_feedback,
    update_representative_feedback,
)
from app.services.gymnastics.feedback.common import average_elbow_angle
from app.services.gymnastics.types import NormalizedPoseFrame


@dataclass(slots=True)
class DanielForwardPressEvaluatorConfig:
    target_hold_ms: int = DEFAULT_STRETCH_HOLD_TARGET_MS
    max_frame_gap_ms: int = DEFAULT_HOLD_MAX_FRAME_GAP_MS
    forward_threshold: float = DEFAULT_DANIEL_FORWARD_PRESS_FORWARD_THRESHOLD
    wrist_extension_threshold: float = DEFAULT_DANIEL_FORWARD_PRESS_WRIST_EXTENSION_THRESHOLD
    wrist_gap_max: float = DEFAULT_DANIEL_FORWARD_PRESS_WRIST_GAP_MAX
    wrist_height_error_max: float = DEFAULT_DANIEL_FORWARD_PRESS_HEIGHT_ERROR_MAX
    wrist_below_shoulder_min: float = DEFAULT_DANIEL_FORWARD_PRESS_WRIST_BELOW_SHOULDER_MIN
    arm_straight_threshold: float = DEFAULT_DANIEL_FORWARD_PRESS_ARM_STRAIGHT_THRESHOLD
    torso_tilt_max: float = DEFAULT_DANIEL_FORWARD_PRESS_TORSO_TILT_MAX
    feedback_streak_threshold: int = DEFAULT_DANIEL_FEEDBACK_STREAK_THRESHOLD
    feedback_display_frames: int = DEFAULT_DANIEL_FEEDBACK_DISPLAY_FRAMES
    feedback_clear_frames: int = DEFAULT_DANIEL_FEEDBACK_CLEAR_FRAMES


class DanielForwardPressEvaluator(BaseHoldEvaluator):
    motion_id = "daniel_forward_press"

    def __init__(self, config: DanielForwardPressEvaluatorConfig | None = None):
        self.config = config or DanielForwardPressEvaluatorConfig()
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
            baseline_stance_span,
        )

        next_reference_hip_x, next_reference_hip_y, next_reference_scale = (
            self._capture_reference_if_needed(
                frame=frame,
                reference_hip_x=reference_hip_x,
                reference_hip_y=reference_hip_y,
                reference_scale=reference_scale,
            )
        )

        features = extract_daniel_forward_press_features(
            frame,
            reference_hip_x=next_reference_hip_x,
            reference_hip_y=next_reference_hip_y,
            reference_scale=next_reference_scale,
            baseline_left_wrist_forward=baseline_left_wrist_forward,
            baseline_right_wrist_forward=baseline_right_wrist_forward,
        )

        next_baseline_left_wrist_forward = baseline_left_wrist_forward
        next_baseline_right_wrist_forward = baseline_right_wrist_forward
        captured_baseline_this_frame = False
        if (next_baseline_left_wrist_forward is None) != (next_baseline_right_wrist_forward is None):
            next_baseline_left_wrist_forward = None
            next_baseline_right_wrist_forward = None
        if frame.tracking == "tracking_ok":
            if (
                next_baseline_left_wrist_forward is None
                and next_baseline_right_wrist_forward is None
                and features.raw_left_wrist_forward is not None
                and features.raw_right_wrist_forward is not None
            ):
                next_baseline_left_wrist_forward = features.raw_left_wrist_forward
                next_baseline_right_wrist_forward = features.raw_right_wrist_forward
                captured_baseline_this_frame = True

        mean_elbow_angle = average_elbow_angle(
            features.left_elbow_angle,
            features.right_elbow_angle,
        )
        is_pose_valid = (
            frame.tracking == "tracking_ok"
            and not captured_baseline_this_frame
            and features.wrist_forward is not None
            and features.wrist_forward >= self.config.forward_threshold
            and features.wrist_extension is not None
            and features.wrist_extension >= self.config.wrist_extension_threshold
            and features.wrist_gap is not None
            and features.wrist_gap <= self.config.wrist_gap_max
            and features.wrist_height_error is not None
            and features.wrist_height_error <= self.config.wrist_height_error_max
            and features.wrist_shoulder_offset is not None
            and features.wrist_shoulder_offset >= self.config.wrist_below_shoulder_min
            and features.torso_tilt <= self.config.torso_tilt_max
        )
        is_attempting = self._is_attempting_forward_press(
            features=features,
            mean_elbow_angle=mean_elbow_angle,
            tracking=frame.tracking,
            captured_baseline_this_frame=captured_baseline_this_frame,
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
            tracking=frame.tracking,
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
            tracking=frame.tracking,
            previous_feedback_state=previous_feedback_state,
            suppress_candidate=captured_baseline_this_frame,
        )
        next_representative_state = self._update_representative_feedback(
            feedback_state=next_feedback_state,
            previous_representative_state=previous_representative_state,
        )

        return EvaluatorResult(
            motion_id=self.motion_id,
            state=session_state,
            step_count=0,
            accuracy=self._compute_accuracy(features),
            feedback=next_feedback_state.displayed_text,
            tracking=frame.tracking,
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
            baseline_left_wrist_forward=next_baseline_left_wrist_forward,
            baseline_right_wrist_forward=next_baseline_right_wrist_forward,
            hold_duration_ms=session_progress.hold_duration_ms,
            hold_completed=session_progress.hold_completed,
            hold_last_timestamp_ms=session_progress.hold_last_timestamp_ms,
            frame_label=frame_label,
            guidance_code=next_feedback_state.displayed_code,
            guidance_text=next_feedback_state.displayed_text,
        )

    def _is_attempting_forward_press(
        self,
        *,
        features: DanielForwardPressFeatureSet,
        mean_elbow_angle: float | None,
        tracking: str,
        captured_baseline_this_frame: bool,
    ) -> bool:
        if tracking != "tracking_ok" or captured_baseline_this_frame:
            return False

        has_forward_attempt = self._is_attempting_metric(
            features.wrist_extension,
            self.config.wrist_extension_threshold,
        ) or self._is_attempting_metric(
            mean_elbow_angle,
            self.config.arm_straight_threshold,
        )
        if not has_forward_attempt:
            return False

        return self._has_relaxed_attempting_alignment(features)

    def _has_relaxed_attempting_alignment(
        self,
        features: DanielForwardPressFeatureSet,
    ) -> bool:
        return (
            self._is_relaxed_within_limit(features.torso_tilt, self.config.torso_tilt_max)
            and self._is_relaxed_within_limit(features.wrist_gap, self.config.wrist_gap_max)
            and self._is_relaxed_within_limit(
                features.wrist_height_error,
                self.config.wrist_height_error_max,
            )
        )

    def _compute_accuracy(self, features: DanielForwardPressFeatureSet) -> float:
        mean_elbow_angle = average_elbow_angle(
            features.left_elbow_angle,
            features.right_elbow_angle,
        )
        forward_value = features.wrist_forward if features.wrist_forward is not None else 0.0
        wrist_gap_value = (
            features.wrist_gap
            if features.wrist_gap is not None
            else self.config.wrist_gap_max
        )
        wrist_height_error_value = (
            features.wrist_height_error
            if features.wrist_height_error is not None
            else self.config.wrist_height_error_max
        )

        forward_score = min(
            forward_value / max(self.config.forward_threshold, 1e-6),
            1.0,
        )
        arm_score = min(
            (mean_elbow_angle or 0.0) / max(self.config.arm_straight_threshold, 1.0),
            1.0,
        )
        wrist_gap_score = max(
            1.0 - wrist_gap_value / max(self.config.wrist_gap_max, 1e-6),
            0.0,
        )
        wrist_height_score = max(
            1.0
            - wrist_height_error_value / max(self.config.wrist_height_error_max, 1e-6),
            0.0,
        )
        torso_score = max(
            1.0 - features.torso_tilt / max(self.config.torso_tilt_max, 1.0),
            0.0,
        )
        accuracy = (
            forward_score * 0.35
            + arm_score * 0.25
            + wrist_gap_score * 0.20
            + wrist_height_score * 0.10
            + torso_score * 0.10
        )
        return round(max(min(accuracy, 1.0), 0.0), 2)

    def _stabilize_feedback(
        self,
        *,
        features: DanielForwardPressFeatureSet,
        state: str,
        tracking: str,
        previous_feedback_state: FeedbackStabilizerState,
        suppress_candidate: bool,
    ) -> FeedbackStabilizerState:
        candidate = None
        # Baseline을 캡처하는 프레임에서는 아직 "기준 자세를 잡는 중"이라
        # 교정 피드백을 띄우지 않는다. 그렇지 않으면 시작 직후 자세가 틀린 것처럼
        # 보이는 피드백이 잠깐 뜰 수 있다.
        if not suppress_candidate:
            candidate = select_daniel_forward_press_feedback_candidate(
                state=state,
                tracking=tracking,
                wrist_forward=features.wrist_forward,
                wrist_extension=features.wrist_extension,
                left_elbow_angle=features.left_elbow_angle,
                right_elbow_angle=features.right_elbow_angle,
                torso_tilt=features.torso_tilt,
                forward_threshold=self.config.forward_threshold,
                wrist_extension_threshold=self.config.wrist_extension_threshold,
                arm_straight_threshold=self.config.arm_straight_threshold,
                torso_tilt_max=self.config.torso_tilt_max,
            )
        return stabilize_daniel_feedback(
            candidate=candidate,
            motion_state=state,
            state=previous_feedback_state,
            streak_threshold=self.config.feedback_streak_threshold,
            display_frames=self.config.feedback_display_frames,
            clear_frames=self.config.feedback_clear_frames,
            suppress_candidate=suppress_candidate,
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
