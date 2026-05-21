package com.comong.backend.domain.taekwondo.dto;

import java.time.LocalDateTime;

import com.comong.backend.domain.taekwondo.entity.Belt;
import com.comong.backend.domain.taekwondo.entity.TaekwondoBeltHistory;

public record TaekwondoBeltHistoryResponse(
        Long id, Belt fromBelt, Belt toBelt, Long triggerSessionId, LocalDateTime promotedAt) {

    public static TaekwondoBeltHistoryResponse from(TaekwondoBeltHistory history) {
        return new TaekwondoBeltHistoryResponse(
                history.getId(),
                history.getFromBelt().orElse(null),
                history.getToBelt(),
                history.getTriggerSession().getId(),
                history.getPromotedAt());
    }
}
