package com.comong.backend.domain.gomoku.dto;

import java.time.LocalDateTime;

import com.comong.backend.domain.gomoku.entity.GomokuChatMessage;

public record GomokuChatMessageResponse(
        Long id,
        Long senderPatientProfileId,
        String senderNickname,
        GomokuViewerRole senderRole,
        String content,
        LocalDateTime createdAt) {

    public static GomokuChatMessageResponse from(GomokuChatMessage message, GomokuViewerRole role) {
        return new GomokuChatMessageResponse(
                message.getId(),
                message.getSenderPatientProfile().getId(),
                message.getSenderPatientProfile().getNickname(),
                role,
                message.getContent(),
                message.getCreatedAt());
    }
}
