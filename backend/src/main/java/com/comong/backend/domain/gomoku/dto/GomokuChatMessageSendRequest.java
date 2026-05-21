package com.comong.backend.domain.gomoku.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record GomokuChatMessageSendRequest(
        @NotBlank @Size(max = 200, message = "메시지 길이는 200자 이하여야 합니다.") String content) {}
