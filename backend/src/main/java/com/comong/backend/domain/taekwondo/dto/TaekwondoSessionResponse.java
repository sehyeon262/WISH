package com.comong.backend.domain.taekwondo.dto;

import java.time.LocalDateTime;
import java.util.List;

import com.comong.backend.domain.taekwondo.entity.Poomsae;
import com.comong.backend.domain.taekwondo.entity.TaekwondoSession;

public record TaekwondoSessionResponse(
        Long id,
        Long patientProfileId,
        Poomsae poomsae,
        int durationSec,
        double averageAccuracy,
        int completedMotionCount,
        int monstersDefeated,
        LocalDateTime createdAt,
        List<TaekwondoSessionMotionResponse> motions,
        BeltPromotionResponse beltPromotion) {

    public static TaekwondoSessionResponse of(
            TaekwondoSession session, List<TaekwondoSessionMotionResponse> motions) {
        return of(session, motions, null);
    }

    public static TaekwondoSessionResponse of(
            TaekwondoSession session,
            List<TaekwondoSessionMotionResponse> motions,
            BeltPromotionResponse beltPromotion) {
        return new TaekwondoSessionResponse(
                session.getId(),
                session.getPatientProfile().getId(),
                session.getPoomsae(),
                session.getDurationSec(),
                session.getAverageAccuracy(),
                session.getCompletedMotionCount(),
                session.getMonstersDefeated(),
                session.getCreatedAt(),
                motions,
                beltPromotion);
    }
}
