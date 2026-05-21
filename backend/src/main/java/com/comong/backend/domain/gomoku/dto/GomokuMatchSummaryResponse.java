package com.comong.backend.domain.gomoku.dto;

import java.time.LocalDateTime;

import com.comong.backend.domain.gomoku.entity.GomokuEndReason;
import com.comong.backend.domain.gomoku.entity.GomokuMatch;
import com.comong.backend.domain.gomoku.entity.GomokuMatchResult;
import com.comong.backend.domain.gomoku.entity.GomokuMatchStatus;
import com.comong.backend.domain.gomoku.entity.GomokuRuleSet;
import com.comong.backend.domain.gomoku.entity.GomokuStone;

public record GomokuMatchSummaryResponse(
        Long id,
        GomokuMatchStatus status,
        GomokuRuleSet ruleSet,
        GomokuStone myStone,
        String opponentNickname,
        GomokuMatchResult result,
        GomokuEndReason endReason,
        int moveCount,
        boolean ranked,
        LocalDateTime playedAt) {
    public static GomokuMatchSummaryResponse of(GomokuMatch match, Long myPatientProfileId) {
        GomokuStone myStone = match.stoneOf(myPatientProfileId);
        String opponentNickname =
                myStone == GomokuStone.BLACK
                        ? match.getWhitePatientProfile() == null
                                ? null
                                : match.getWhitePatientProfile().getNickname()
                        : match.getBlackPatientProfile().getNickname();
        return new GomokuMatchSummaryResponse(
                match.getId(),
                match.getStatus(),
                match.getRuleSet(),
                myStone,
                opponentNickname,
                match.getResult(),
                match.getEndReason(),
                match.getMoveCount(),
                match.isRanked(),
                match.getFinishedAt() != null ? match.getFinishedAt() : match.getCreatedAt());
    }
}
