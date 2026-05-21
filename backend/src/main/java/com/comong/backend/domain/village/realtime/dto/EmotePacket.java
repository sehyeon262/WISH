package com.comong.backend.domain.village.realtime.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 클라이언트가 {@code /app/village/emote} 로 보내는 이모티콘 발신 패킷.
 *
 * <p>{@code emoji} 는 화이트리스트 ({@link
 * com.comong.backend.domain.village.realtime.service.VillageEmojis#ALLOWED}) 매칭이 필수 — 매칭 안 되면 컨트롤러가
 * 조용히 drop. 별도 ERROR 프레임을 클라에 보내지 않는다 (도배 / 위조 시도가 사용자에게 응답으로 가지 않도록).
 */
public record EmotePacket(@NotBlank String emoji) {}
