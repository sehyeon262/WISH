package com.comong.backend.domain.village.realtime.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

/**
 * 클라이언트가 {@code /app/village/position} 으로 보내는 위치 패킷.
 *
 * <p>{@code x}, {@code y} 는 ratio 좌표 ({@code [0, 1]}) — 해상도 독립. {@code dir} 는 4방향 walk anim 키
 * ({@code up/down/left/right}). {@code moving} 은 정지/이동 전환 신호로, FE 의 walk anim 재생 여부를 결정한다.
 */
public record PositionPacket(
        @NotNull @DecimalMin("0.0") @DecimalMax("1.0") Double x,
        @NotNull @DecimalMin("0.0") @DecimalMax("1.0") Double y,
        @NotNull String dir,
        @NotNull Boolean moving,
        String textureKey) {}
