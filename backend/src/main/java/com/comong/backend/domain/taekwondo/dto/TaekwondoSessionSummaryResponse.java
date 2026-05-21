package com.comong.backend.domain.taekwondo.dto;

import java.time.LocalDateTime;

import com.comong.backend.domain.taekwondo.entity.Poomsae;
import com.comong.backend.domain.taekwondo.entity.TaekwondoSession;

public record TaekwondoSessionSummaryResponse(
        Long id,
        Long patientProfileId,
        Poomsae poomsae,
        int durationSec,
        double averageAccuracy,
        int completedMotionCount,
        int monstersDefeated,
        LocalDateTime createdAt) {

    public static TaekwondoSessionSummaryResponse from(TaekwondoSession session) {
        return new TaekwondoSessionSummaryResponse(
                session.getId(),
                session.getPatientProfile().getId(),
                session.getPoomsae(),
                session.getDurationSec(),
                session.getAverageAccuracy(),
                session.getCompletedMotionCount(),
                session.getMonstersDefeated(),
                session.getCreatedAt());
    }
}
