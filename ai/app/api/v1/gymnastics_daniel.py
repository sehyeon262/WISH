from fastapi import APIRouter, HTTPException

from app.api.v1.gymnastics_shared import (
    build_feedback_tts_response,
    build_replay_metadata_response,
    daniel_forward_bend_evaluator,
    daniel_forward_press_evaluator,
    daniel_left_side_bend_evaluator,
    daniel_right_side_bend_evaluator,
    daniel_upward_press_evaluator,
    logger,
    normalizer,
    to_motion_replay_pose_response,
)
from app.schemas.gymnastics import (
    DanielForwardBendEvaluationRequest,
    DanielForwardBendEvaluationResponse,
    DanielForwardBendFeaturesResponse,
    DanielForwardPressEvaluationRequest,
    DanielForwardPressEvaluationResponse,
    DanielForwardPressFeaturesResponse,
    DanielLeftSideBendEvaluationRequest,
    DanielLeftSideBendEvaluationResponse,
    DanielLeftSideBendFeaturesResponse,
    DanielRightSideBendEvaluationRequest,
    DanielRightSideBendEvaluationResponse,
    DanielRightSideBendFeaturesResponse,
    DanielStretchEvaluationRequest,
    DanielStretchEvaluationResponse,
    DanielUpwardPressEvaluationRequest,
    DanielUpwardPressEvaluationResponse,
    DanielUpwardPressFeaturesResponse,
    NormalizedPoseResponse,
)
from app.services.gymnastics.constants import (
    DANIEL_FORWARD_BEND_MOTION_NAME,
    DANIEL_FORWARD_PRESS_MOTION_NAME,
    DANIEL_LEFT_SIDE_BEND_MOTION_NAME,
    DANIEL_RIGHT_SIDE_BEND_MOTION_NAME,
    DANIEL_UPWARD_PRESS_MOTION_NAME,
)
from app.services.gymnastics.features.daniel_forward_bend_features import (
    extract_daniel_forward_bend_features,
)
from app.services.gymnastics.features.daniel_forward_press_features import (
    extract_daniel_forward_press_features,
)
from app.services.gymnastics.features.daniel_left_side_bend_features import (
    extract_daniel_left_side_bend_features,
)
from app.services.gymnastics.features.daniel_right_side_bend_features import (
    extract_daniel_right_side_bend_features,
)
from app.services.gymnastics.features.daniel_upward_press_features import (
    extract_daniel_upward_press_features,
)

router = APIRouter()


def _resolve_daniel_response_frame_label(result: object) -> str:
    frame_label = getattr(result, "frame_label", None)
    if frame_label is not None:
        return frame_label
    if getattr(result, "tracking", None) != "tracking_ok":
        return "tracking_low"
    if getattr(result, "state", None) in {"holding", "complete"}:
        return "motion_present"
    return "guidance_needed"


def _resolve_daniel_response_guidance_code(result: object) -> str | None:
    return getattr(result, "guidance_code", None) or getattr(result, "displayed_feedback_code", None)


def _resolve_daniel_response_guidance_text(result: object) -> str | None:
    return getattr(result, "guidance_text", None) or getattr(result, "displayed_feedback_text", None)


def _build_daniel_replay_metadata(result: object, timestamp_ms: int):
    return build_replay_metadata_response(
        motion_id=getattr(result, "motion_id", None),
        timestamp_ms=timestamp_ms,
        tracking=getattr(result, "tracking", None),
        frame_label=_resolve_daniel_response_frame_label(result),
        state=getattr(result, "state", None),
        hold_duration_ms=getattr(result, "hold_duration_ms", None),
        hold_completed=getattr(result, "hold_completed", None),
        guidance_code=_resolve_daniel_response_guidance_code(result),
        guidance_text=_resolve_daniel_response_guidance_text(result),
    )


@router.post("/daniel-forward-press/evaluate", response_model=DanielForwardPressEvaluationResponse)
def evaluate_daniel_forward_press(
    payload: DanielForwardPressEvaluationRequest,
) -> DanielForwardPressEvaluationResponse:
    try:
        normalized = normalizer.normalize(payload.frame)
        result = daniel_forward_press_evaluator.evaluate(
            frame=normalized,
            previous_state=payload.previous_state,
            step_count=0,
            target_steps=1,
            reference_hip_x=payload.reference_hip_x,
            reference_hip_y=payload.reference_hip_y,
            reference_scale=payload.reference_scale,
            displayed_feedback_code=payload.displayed_feedback_code,
            displayed_feedback_text=payload.displayed_feedback_text,
            displayed_feedback_frames=payload.displayed_feedback_frames,
            candidate_feedback_code=payload.candidate_feedback_code,
            candidate_feedback_text=payload.candidate_feedback_text,
            candidate_feedback_streak=payload.candidate_feedback_streak,
            representative_feedback_totals=payload.representative_feedback_totals,
            representative_feedback_code=payload.representative_feedback_code,
            representative_feedback_text=payload.representative_feedback_text,
            representative_feedback_frames=payload.representative_feedback_frames,
            baseline_left_wrist_forward=payload.baseline_left_wrist_forward,
            baseline_right_wrist_forward=payload.baseline_right_wrist_forward,
            target_hold_ms=payload.target_hold_ms,
            hold_duration_ms=payload.hold_duration_ms,
            hold_last_timestamp_ms=payload.hold_last_timestamp_ms,
        )
        features = extract_daniel_forward_press_features(
            normalized,
            reference_hip_x=result.reference_hip_x,
            reference_hip_y=result.reference_hip_y,
            reference_scale=result.reference_scale,
            baseline_left_wrist_forward=result.baseline_left_wrist_forward,
            baseline_right_wrist_forward=result.baseline_right_wrist_forward,
        )
    except ValueError as exc:
        logger.warning("Invalid daniel-forward-press evaluation request: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        logger.exception("Unexpected error while evaluating daniel-forward-press motion")
        raise HTTPException(status_code=500, detail="Failed to evaluate daniel-forward-press motion")

    return DanielForwardPressEvaluationResponse(
        motion_id=result.motion_id,
        state=result.state,
        accuracy=result.accuracy,
        feedback=result.feedback,
        tracking=result.tracking,
        frame_label=_resolve_daniel_response_frame_label(result),
        guidance_code=_resolve_daniel_response_guidance_code(result),
        guidance_text=_resolve_daniel_response_guidance_text(result),
        hold_duration_ms=result.hold_duration_ms,
        hold_completed=result.hold_completed,
        hold_last_timestamp_ms=result.hold_last_timestamp_ms,
        reference_hip_x=result.reference_hip_x,
        reference_hip_y=result.reference_hip_y,
        reference_scale=result.reference_scale,
        displayed_feedback_code=result.displayed_feedback_code,
        displayed_feedback_text=result.displayed_feedback_text,
        displayed_feedback_frames=result.displayed_feedback_frames,
        candidate_feedback_code=result.candidate_feedback_code,
        candidate_feedback_text=result.candidate_feedback_text,
        candidate_feedback_streak=result.candidate_feedback_streak,
        representative_feedback_totals=result.representative_feedback_totals or {},
        representative_feedback_code=result.representative_feedback_code,
        representative_feedback_text=result.representative_feedback_text,
        representative_feedback_frames=result.representative_feedback_frames,
        baseline_left_wrist_forward=result.baseline_left_wrist_forward,
        baseline_right_wrist_forward=result.baseline_right_wrist_forward,
        tts=build_feedback_tts_response(
            previous_displayed_code=payload.displayed_feedback_code,
            previous_displayed_text=payload.displayed_feedback_text,
            displayed_code=result.displayed_feedback_code,
            displayed_text=result.displayed_feedback_text,
        ),
        normalized_pose=to_motion_replay_pose_response(normalized),
        replay_metadata=_build_daniel_replay_metadata(result, payload.frame.timestamp_ms),
        features=DanielForwardPressFeaturesResponse(
            wrist_forward=features.wrist_forward,
            wrist_extension=features.wrist_extension,
            left_wrist_forward=features.left_wrist_forward,
            right_wrist_forward=features.right_wrist_forward,
            wrist_gap=features.wrist_gap,
            wrist_height_error=features.wrist_height_error,
            wrist_shoulder_offset=features.wrist_shoulder_offset,
            left_elbow_angle=features.left_elbow_angle,
            right_elbow_angle=features.right_elbow_angle,
            torso_tilt=features.torso_tilt,
            pelvis_shift_x=features.pelvis_shift_x,
            pelvis_shift_y=features.pelvis_shift_y,
            pelvis_depth_shift=features.pelvis_depth_shift,
        ),
    )


@router.post("/daniel-forward-bend/evaluate", response_model=DanielForwardBendEvaluationResponse)
def evaluate_daniel_forward_bend(
    payload: DanielForwardBendEvaluationRequest,
) -> DanielForwardBendEvaluationResponse:
    try:
        normalized = normalizer.normalize(payload.frame)
        result = daniel_forward_bend_evaluator.evaluate(
            frame=normalized,
            previous_state=payload.previous_state,
            step_count=0,
            target_steps=1,
            reference_hip_x=payload.reference_hip_x,
            reference_hip_y=payload.reference_hip_y,
            reference_scale=payload.reference_scale,
            displayed_feedback_code=payload.displayed_feedback_code,
            displayed_feedback_text=payload.displayed_feedback_text,
            displayed_feedback_frames=payload.displayed_feedback_frames,
            candidate_feedback_code=payload.candidate_feedback_code,
            candidate_feedback_text=payload.candidate_feedback_text,
            candidate_feedback_streak=payload.candidate_feedback_streak,
            representative_feedback_totals=payload.representative_feedback_totals,
            representative_feedback_code=payload.representative_feedback_code,
            representative_feedback_text=payload.representative_feedback_text,
            representative_feedback_frames=payload.representative_feedback_frames,
            target_hold_ms=payload.target_hold_ms,
            hold_duration_ms=payload.hold_duration_ms,
            hold_last_timestamp_ms=payload.hold_last_timestamp_ms,
        )
        features = extract_daniel_forward_bend_features(
            normalized,
            reference_hip_x=result.reference_hip_x,
            reference_hip_y=result.reference_hip_y,
            reference_scale=result.reference_scale,
        )
    except ValueError as exc:
        logger.warning("Invalid daniel-forward-bend evaluation request: %s", exc)
        raise HTTPException(
            status_code=400,
            detail="Invalid daniel-forward-bend evaluation request",
        ) from exc
    except Exception:
        logger.exception("Unexpected error while evaluating daniel-forward-bend motion")
        raise HTTPException(status_code=500, detail="Failed to evaluate daniel-forward-bend motion")

    return DanielForwardBendEvaluationResponse(
        motion_id=result.motion_id,
        state=result.state,
        accuracy=result.accuracy,
        feedback=result.feedback,
        tracking=result.tracking,
        frame_label=_resolve_daniel_response_frame_label(result),
        guidance_code=_resolve_daniel_response_guidance_code(result),
        guidance_text=_resolve_daniel_response_guidance_text(result),
        hold_duration_ms=result.hold_duration_ms,
        hold_completed=result.hold_completed,
        hold_last_timestamp_ms=result.hold_last_timestamp_ms,
        reference_hip_x=result.reference_hip_x,
        reference_hip_y=result.reference_hip_y,
        reference_scale=result.reference_scale,
        displayed_feedback_code=result.displayed_feedback_code,
        displayed_feedback_text=result.displayed_feedback_text,
        displayed_feedback_frames=result.displayed_feedback_frames,
        candidate_feedback_code=result.candidate_feedback_code,
        candidate_feedback_text=result.candidate_feedback_text,
        candidate_feedback_streak=result.candidate_feedback_streak,
        representative_feedback_totals=result.representative_feedback_totals or {},
        representative_feedback_code=result.representative_feedback_code,
        representative_feedback_text=result.representative_feedback_text,
        representative_feedback_frames=result.representative_feedback_frames,
        tts=build_feedback_tts_response(
            previous_displayed_code=payload.displayed_feedback_code,
            previous_displayed_text=payload.displayed_feedback_text,
            displayed_code=result.displayed_feedback_code,
            displayed_text=result.displayed_feedback_text,
        ),
        normalized_pose=to_motion_replay_pose_response(normalized),
        replay_metadata=_build_daniel_replay_metadata(result, payload.frame.timestamp_ms),
        features=DanielForwardBendFeaturesResponse(
            forward_bend_angle=features.forward_bend_angle,
            wrist_drop=features.wrist_drop,
            left_knee_angle=features.left_knee_angle,
            right_knee_angle=features.right_knee_angle,
            pelvis_shift_x=features.pelvis_shift_x,
            pelvis_shift_y=features.pelvis_shift_y,
            pelvis_depth_shift=features.pelvis_depth_shift,
        ),
    )


@router.post("/daniel-upward-press/evaluate", response_model=DanielUpwardPressEvaluationResponse)
def evaluate_daniel_upward_press(
    payload: DanielUpwardPressEvaluationRequest,
) -> DanielUpwardPressEvaluationResponse:
    try:
        normalized = normalizer.normalize(payload.frame)
        result = daniel_upward_press_evaluator.evaluate(
            frame=normalized,
            previous_state=payload.previous_state,
            step_count=0,
            target_steps=1,
            reference_hip_x=payload.reference_hip_x,
            reference_hip_y=payload.reference_hip_y,
            reference_scale=payload.reference_scale,
            displayed_feedback_code=payload.displayed_feedback_code,
            displayed_feedback_text=payload.displayed_feedback_text,
            displayed_feedback_frames=payload.displayed_feedback_frames,
            candidate_feedback_code=payload.candidate_feedback_code,
            candidate_feedback_text=payload.candidate_feedback_text,
            candidate_feedback_streak=payload.candidate_feedback_streak,
            representative_feedback_totals=payload.representative_feedback_totals,
            representative_feedback_code=payload.representative_feedback_code,
            representative_feedback_text=payload.representative_feedback_text,
            representative_feedback_frames=payload.representative_feedback_frames,
            target_hold_ms=payload.target_hold_ms,
            hold_duration_ms=payload.hold_duration_ms,
            hold_last_timestamp_ms=payload.hold_last_timestamp_ms,
        )
        features = extract_daniel_upward_press_features(
            normalized,
            reference_hip_x=result.reference_hip_x,
            reference_hip_y=result.reference_hip_y,
            reference_scale=result.reference_scale,
        )
    except ValueError as exc:
        logger.warning("Invalid daniel-upward-press evaluation request: %s", exc)
        raise HTTPException(
            status_code=400,
            detail="Invalid daniel-upward-press evaluation request",
        ) from exc
    except Exception:
        logger.exception("Unexpected error while evaluating daniel-upward-press motion")
        raise HTTPException(status_code=500, detail="Failed to evaluate daniel-upward-press motion")

    return DanielUpwardPressEvaluationResponse(
        motion_id=result.motion_id,
        state=result.state,
        accuracy=result.accuracy,
        feedback=result.feedback,
        tracking=result.tracking,
        frame_label=_resolve_daniel_response_frame_label(result),
        guidance_code=_resolve_daniel_response_guidance_code(result),
        guidance_text=_resolve_daniel_response_guidance_text(result),
        hold_duration_ms=result.hold_duration_ms,
        hold_completed=result.hold_completed,
        hold_last_timestamp_ms=result.hold_last_timestamp_ms,
        reference_hip_x=result.reference_hip_x,
        reference_hip_y=result.reference_hip_y,
        reference_scale=result.reference_scale,
        displayed_feedback_code=result.displayed_feedback_code,
        displayed_feedback_text=result.displayed_feedback_text,
        displayed_feedback_frames=result.displayed_feedback_frames,
        candidate_feedback_code=result.candidate_feedback_code,
        candidate_feedback_text=result.candidate_feedback_text,
        candidate_feedback_streak=result.candidate_feedback_streak,
        representative_feedback_totals=result.representative_feedback_totals or {},
        representative_feedback_code=result.representative_feedback_code,
        representative_feedback_text=result.representative_feedback_text,
        representative_feedback_frames=result.representative_feedback_frames,
        tts=build_feedback_tts_response(
            previous_displayed_code=payload.displayed_feedback_code,
            previous_displayed_text=payload.displayed_feedback_text,
            displayed_code=result.displayed_feedback_code,
            displayed_text=result.displayed_feedback_text,
        ),
        normalized_pose=to_motion_replay_pose_response(normalized),
        replay_metadata=_build_daniel_replay_metadata(result, payload.frame.timestamp_ms),
        features=DanielUpwardPressFeaturesResponse(
            wrist_height=features.wrist_height,
            wrist_height_balance=features.wrist_height_balance,
            left_elbow_angle=features.left_elbow_angle,
            right_elbow_angle=features.right_elbow_angle,
            torso_tilt=features.torso_tilt,
            pelvis_shift_x=features.pelvis_shift_x,
            pelvis_shift_y=features.pelvis_shift_y,
            pelvis_depth_shift=features.pelvis_depth_shift,
        ),
    )


@router.post("/daniel-left-side-bend/evaluate", response_model=DanielLeftSideBendEvaluationResponse)
def evaluate_daniel_left_side_bend(
    payload: DanielLeftSideBendEvaluationRequest,
) -> DanielLeftSideBendEvaluationResponse:
    try:
        normalized = normalizer.normalize(payload.frame)
        result = daniel_left_side_bend_evaluator.evaluate(
            frame=normalized,
            previous_state=payload.previous_state,
            step_count=0,
            target_steps=1,
            reference_hip_x=payload.reference_hip_x,
            reference_hip_y=payload.reference_hip_y,
            reference_scale=payload.reference_scale,
            displayed_feedback_code=payload.displayed_feedback_code,
            displayed_feedback_text=payload.displayed_feedback_text,
            displayed_feedback_frames=payload.displayed_feedback_frames,
            candidate_feedback_code=payload.candidate_feedback_code,
            candidate_feedback_text=payload.candidate_feedback_text,
            candidate_feedback_streak=payload.candidate_feedback_streak,
            representative_feedback_totals=payload.representative_feedback_totals,
            representative_feedback_code=payload.representative_feedback_code,
            representative_feedback_text=payload.representative_feedback_text,
            representative_feedback_frames=payload.representative_feedback_frames,
            target_hold_ms=payload.target_hold_ms,
            hold_duration_ms=payload.hold_duration_ms,
            hold_last_timestamp_ms=payload.hold_last_timestamp_ms,
        )
        features = extract_daniel_left_side_bend_features(
            normalized,
            reference_hip_x=result.reference_hip_x,
            reference_hip_y=result.reference_hip_y,
            reference_scale=result.reference_scale,
        )
    except ValueError as exc:
        logger.warning("Invalid daniel-left-side-bend evaluation request: %s", exc)
        raise HTTPException(
            status_code=400,
            detail="Invalid daniel-left-side-bend evaluation request",
        ) from exc
    except Exception:
        logger.exception("Unexpected error while evaluating daniel-left-side-bend motion")
        raise HTTPException(status_code=500, detail="Failed to evaluate daniel-left-side-bend motion")

    return DanielLeftSideBendEvaluationResponse(
        motion_id=result.motion_id,
        state=result.state,
        accuracy=result.accuracy,
        feedback=result.feedback,
        tracking=result.tracking,
        frame_label=_resolve_daniel_response_frame_label(result),
        guidance_code=_resolve_daniel_response_guidance_code(result),
        guidance_text=_resolve_daniel_response_guidance_text(result),
        hold_duration_ms=result.hold_duration_ms,
        hold_completed=result.hold_completed,
        hold_last_timestamp_ms=result.hold_last_timestamp_ms,
        reference_hip_x=result.reference_hip_x,
        reference_hip_y=result.reference_hip_y,
        reference_scale=result.reference_scale,
        displayed_feedback_code=result.displayed_feedback_code,
        displayed_feedback_text=result.displayed_feedback_text,
        displayed_feedback_frames=result.displayed_feedback_frames,
        candidate_feedback_code=result.candidate_feedback_code,
        candidate_feedback_text=result.candidate_feedback_text,
        candidate_feedback_streak=result.candidate_feedback_streak,
        representative_feedback_totals=result.representative_feedback_totals or {},
        representative_feedback_code=result.representative_feedback_code,
        representative_feedback_text=result.representative_feedback_text,
        representative_feedback_frames=result.representative_feedback_frames,
        tts=build_feedback_tts_response(
            previous_displayed_code=payload.displayed_feedback_code,
            previous_displayed_text=payload.displayed_feedback_text,
            displayed_code=result.displayed_feedback_code,
            displayed_text=result.displayed_feedback_text,
        ),
        normalized_pose=to_motion_replay_pose_response(normalized),
        replay_metadata=_build_daniel_replay_metadata(result, payload.frame.timestamp_ms),
        features=DanielLeftSideBendFeaturesResponse(
            torso_tilt=features.torso_tilt,
            wrist_height=features.wrist_height,
            left_elbow_angle=features.left_elbow_angle,
            right_elbow_angle=features.right_elbow_angle,
            pelvis_shift_x=features.pelvis_shift_x,
            pelvis_shift_y=features.pelvis_shift_y,
            pelvis_depth_shift=features.pelvis_depth_shift,
        ),
    )


@router.post("/daniel-right-side-bend/evaluate", response_model=DanielRightSideBendEvaluationResponse)
def evaluate_daniel_right_side_bend(
    payload: DanielRightSideBendEvaluationRequest,
) -> DanielRightSideBendEvaluationResponse:
    try:
        normalized = normalizer.normalize(payload.frame)
        result = daniel_right_side_bend_evaluator.evaluate(
            frame=normalized,
            previous_state=payload.previous_state,
            step_count=0,
            target_steps=1,
            reference_hip_x=payload.reference_hip_x,
            reference_hip_y=payload.reference_hip_y,
            reference_scale=payload.reference_scale,
            displayed_feedback_code=payload.displayed_feedback_code,
            displayed_feedback_text=payload.displayed_feedback_text,
            displayed_feedback_frames=payload.displayed_feedback_frames,
            candidate_feedback_code=payload.candidate_feedback_code,
            candidate_feedback_text=payload.candidate_feedback_text,
            candidate_feedback_streak=payload.candidate_feedback_streak,
            representative_feedback_totals=payload.representative_feedback_totals,
            representative_feedback_code=payload.representative_feedback_code,
            representative_feedback_text=payload.representative_feedback_text,
            representative_feedback_frames=payload.representative_feedback_frames,
            target_hold_ms=payload.target_hold_ms,
            hold_duration_ms=payload.hold_duration_ms,
            hold_last_timestamp_ms=payload.hold_last_timestamp_ms,
        )
        features = extract_daniel_right_side_bend_features(
            normalized,
            reference_hip_x=result.reference_hip_x,
            reference_hip_y=result.reference_hip_y,
            reference_scale=result.reference_scale,
        )
    except ValueError as exc:
        logger.warning("Invalid daniel-right-side-bend evaluation request: %s", exc)
        raise HTTPException(
            status_code=400,
            detail="Invalid daniel-right-side-bend evaluation request",
        ) from exc
    except Exception:
        logger.exception("Unexpected error while evaluating daniel-right-side-bend motion")
        raise HTTPException(status_code=500, detail="Failed to evaluate daniel-right-side-bend motion")

    return DanielRightSideBendEvaluationResponse(
        motion_id=result.motion_id,
        state=result.state,
        accuracy=result.accuracy,
        feedback=result.feedback,
        tracking=result.tracking,
        frame_label=_resolve_daniel_response_frame_label(result),
        guidance_code=_resolve_daniel_response_guidance_code(result),
        guidance_text=_resolve_daniel_response_guidance_text(result),
        hold_duration_ms=result.hold_duration_ms,
        hold_completed=result.hold_completed,
        hold_last_timestamp_ms=result.hold_last_timestamp_ms,
        reference_hip_x=result.reference_hip_x,
        reference_hip_y=result.reference_hip_y,
        reference_scale=result.reference_scale,
        displayed_feedback_code=result.displayed_feedback_code,
        displayed_feedback_text=result.displayed_feedback_text,
        displayed_feedback_frames=result.displayed_feedback_frames,
        candidate_feedback_code=result.candidate_feedback_code,
        candidate_feedback_text=result.candidate_feedback_text,
        candidate_feedback_streak=result.candidate_feedback_streak,
        representative_feedback_totals=result.representative_feedback_totals or {},
        representative_feedback_code=result.representative_feedback_code,
        representative_feedback_text=result.representative_feedback_text,
        representative_feedback_frames=result.representative_feedback_frames,
        tts=build_feedback_tts_response(
            previous_displayed_code=payload.displayed_feedback_code,
            previous_displayed_text=payload.displayed_feedback_text,
            displayed_code=result.displayed_feedback_code,
            displayed_text=result.displayed_feedback_text,
        ),
        normalized_pose=to_motion_replay_pose_response(normalized),
        replay_metadata=_build_daniel_replay_metadata(result, payload.frame.timestamp_ms),
        features=DanielRightSideBendFeaturesResponse(
            torso_tilt=features.torso_tilt,
            wrist_height=features.wrist_height,
            left_elbow_angle=features.left_elbow_angle,
            right_elbow_angle=features.right_elbow_angle,
            pelvis_shift_x=features.pelvis_shift_x,
            pelvis_shift_y=features.pelvis_shift_y,
            pelvis_depth_shift=features.pelvis_depth_shift,
        ),
    )


_DANIEL_STRETCH_EVALUATION_SPECS = {
    "daniel_forward_press": (
        DANIEL_FORWARD_PRESS_MOTION_NAME,
        DanielForwardPressEvaluationRequest,
        evaluate_daniel_forward_press,
    ),
    "daniel_upward_press": (
        DANIEL_UPWARD_PRESS_MOTION_NAME,
        DanielUpwardPressEvaluationRequest,
        evaluate_daniel_upward_press,
    ),
    "daniel_side_bend_left": (
        DANIEL_LEFT_SIDE_BEND_MOTION_NAME,
        DanielLeftSideBendEvaluationRequest,
        evaluate_daniel_left_side_bend,
    ),
    "daniel_side_bend_right": (
        DANIEL_RIGHT_SIDE_BEND_MOTION_NAME,
        DanielRightSideBendEvaluationRequest,
        evaluate_daniel_right_side_bend,
    ),
    "daniel_forward_bend": (
        DANIEL_FORWARD_BEND_MOTION_NAME,
        DanielForwardBendEvaluationRequest,
        evaluate_daniel_forward_bend,
    ),
}


def _to_integrated_daniel_response(
    *,
    motion_name: str,
    normalized_pose: NormalizedPoseResponse | None,
    result: (
        DanielForwardPressEvaluationResponse
        | DanielUpwardPressEvaluationResponse
        | DanielLeftSideBendEvaluationResponse
        | DanielRightSideBendEvaluationResponse
        | DanielForwardBendEvaluationResponse
    ),
) -> DanielStretchEvaluationResponse:
    baseline_left = getattr(result, "baseline_left_wrist_forward", None)
    baseline_right = getattr(result, "baseline_right_wrist_forward", None)

    return DanielStretchEvaluationResponse(
        motion_id=result.motion_id,
        motion_name=motion_name,
        state=result.state,
        accuracy=result.accuracy,
        feedback=result.feedback,
        tracking=result.tracking,
        frame_label=result.frame_label,
        guidance_code=result.guidance_code,
        guidance_text=result.guidance_text,
        hold_duration_ms=result.hold_duration_ms,
        hold_completed=result.hold_completed,
        hold_last_timestamp_ms=result.hold_last_timestamp_ms,
        reference_hip_x=result.reference_hip_x,
        reference_hip_y=result.reference_hip_y,
        reference_scale=result.reference_scale,
        displayed_feedback_code=result.displayed_feedback_code,
        displayed_feedback_text=result.displayed_feedback_text,
        displayed_feedback_frames=result.displayed_feedback_frames,
        candidate_feedback_code=result.candidate_feedback_code,
        candidate_feedback_text=result.candidate_feedback_text,
        candidate_feedback_streak=result.candidate_feedback_streak,
        representative_feedback_totals=result.representative_feedback_totals or {},
        representative_feedback_code=result.representative_feedback_code,
        representative_feedback_text=result.representative_feedback_text,
        representative_feedback_frames=result.representative_feedback_frames,
        tts=result.tts,
        baseline_left_wrist_forward=baseline_left,
        baseline_right_wrist_forward=baseline_right,
        normalized_pose=normalized_pose,
        replay_metadata=result.replay_metadata,
        features=result.features.model_dump(),
    )


@router.post("/daniel/evaluate", response_model=DanielStretchEvaluationResponse)
def evaluate_daniel_stretch(payload: DanielStretchEvaluationRequest) -> DanielStretchEvaluationResponse:
    spec = _DANIEL_STRETCH_EVALUATION_SPECS.get(payload.motion_id)
    if spec is None:
        logger.warning("Invalid daniel stretch motion_id: %s", payload.motion_id)
        raise HTTPException(status_code=400, detail="Invalid daniel stretch motion_id")

    motion_name, request_model, handler = spec
    specific_payload = request_model.model_validate(payload.model_dump())
    result = handler(specific_payload)
    return _to_integrated_daniel_response(
        motion_name=motion_name,
        normalized_pose=result.normalized_pose,
        result=result,
    )
