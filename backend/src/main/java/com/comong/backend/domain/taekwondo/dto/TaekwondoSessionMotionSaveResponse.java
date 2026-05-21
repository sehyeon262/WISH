package com.comong.backend.domain.taekwondo.dto;

import com.comong.backend.domain.performance.service.PerformanceVideoService;
import com.comong.backend.domain.taekwondo.entity.TaekwondoSession;
import com.comong.backend.domain.taekwondo.entity.TaekwondoSessionMotion;

public record TaekwondoSessionMotionSaveResponse(
        Long sessionId,
        int sessionDurationSec,
        double sessionAverageAccuracy,
        int sessionCompletedMotionCount,
        int sessionMonstersDefeated,
        TaekwondoSessionMotionResponse savedMotion,
        BeltPromotionResponse beltPromotion) {

    public static TaekwondoSessionMotionSaveResponse of(
            TaekwondoSession session,
            TaekwondoSessionMotion savedMotion,
            BeltPromotionResponse beltPromotion,
            PerformanceVideoService performanceVideoService) {
        return new TaekwondoSessionMotionSaveResponse(
                session.getId(),
                session.getDurationSec(),
                session.getAverageAccuracy(),
                session.getCompletedMotionCount(),
                session.getMonstersDefeated(),
                TaekwondoSessionMotionResponse.from(savedMotion, performanceVideoService),
                beltPromotion);
    }
}
