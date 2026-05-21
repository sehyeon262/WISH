package com.comong.backend.domain.taekwondo.dto;

import java.time.LocalDateTime;
import java.util.Optional;

import com.comong.backend.domain.taekwondo.entity.Belt;
import com.comong.backend.domain.taekwondo.entity.TaekwondoProgress;

public record TaekwondoProgressResponse(
        Belt currentBelt,
        int totalMonstersDefeated,
        int sessionCount,
        double averageAccuracy,
        Belt nextBelt,
        Integer monstersUntilNextPromotion,
        LocalDateTime lastPromotedAt) {

    public static TaekwondoProgressResponse of(TaekwondoProgress progress, double averageAccuracy) {
        Optional<Belt> next = progress.getCurrentBelt().next();
        Belt nextBelt = next.orElse(null);
        Integer monstersUntilNextPromotion =
                next.map(
                                belt ->
                                        Math.max(
                                                0,
                                                belt.getRequiredMonstersDefeated()
                                                        - progress.getTotalMonstersDefeated()))
                        .orElse(null);
        return new TaekwondoProgressResponse(
                progress.getCurrentBelt(),
                progress.getTotalMonstersDefeated(),
                progress.getSessionCount(),
                averageAccuracy,
                nextBelt,
                monstersUntilNextPromotion,
                progress.getLastPromotedAt().orElse(null));
    }
}
