from app.schemas.gymnastics import PoseFrameRequest
from app.services.taekwondo.constants import DEFAULT_CALIBRATION_TARGET_FRAMES
from app.services.taekwondo.normalization.pose_normalizer import PoseNormalizer
from app.services.taekwondo.types import CalibrationResult, HipCenter


class CalibrationService:
    def __init__(self, normalizer: PoseNormalizer | None = None):
        self._normalizer = normalizer or PoseNormalizer()

    def calibrate(
        self,
        frame: PoseFrameRequest,
        stable_frame_count: int = 0,
        target_stable_frames: int = DEFAULT_CALIBRATION_TARGET_FRAMES,
    ) -> CalibrationResult:
        normalized = self._normalizer.normalize(frame)

        if normalized.tracking != "tracking_ok":
            return CalibrationResult(
                tracking=normalized.tracking,
                quality=normalized.quality,
                stable_frame_count=0,
                target_stable_frames=target_stable_frames,
                frames_remaining=target_stable_frames,
                calibration_status="reposition_required",
                is_calibrated=False,
                failure_reason=normalized.tracking,
                reference_hip_center=None,
                reference_scale=None,
            )

        next_count = stable_frame_count + 1
        frames_remaining = max(target_stable_frames - next_count, 0)
        is_calibrated = next_count >= target_stable_frames

        return CalibrationResult(
            tracking=normalized.tracking,
            quality=normalized.quality,
            stable_frame_count=next_count,
            target_stable_frames=target_stable_frames,
            frames_remaining=frames_remaining,
            calibration_status="calibrated" if is_calibrated else "collecting",
            is_calibrated=is_calibrated,
            failure_reason=None,
            reference_hip_center=HipCenter(
                x=normalized.hip_center.x,
                y=normalized.hip_center.y,
            ) if is_calibrated else None,
            reference_scale=normalized.scale_reference if is_calibrated else None,
        )
