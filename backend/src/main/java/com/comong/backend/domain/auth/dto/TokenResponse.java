package com.comong.backend.domain.auth.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 로그인/리프레시 응답. access + refresh 토큰을 한 번에 돌려준다 (S14P31E103-780). FE 는 둘 다 보관하고 access 401 발생 시
 * refresh 로 자동 갱신한다.
 */
public record TokenResponse(
        @Schema(description = "Access 토큰 (JWT)") String accessToken,
        @Schema(description = "Refresh 토큰 (opaque)") String refreshToken,
        @Schema(description = "토큰 타입", example = "Bearer") String tokenType,
        @Schema(description = "Access 만료까지 남은 시간 (초)", example = "3600") long expiresIn,
        @Schema(description = "Refresh 만료까지 남은 시간 (초)", example = "2592000")
                long refreshExpiresIn) {

    public static TokenResponse of(
            String accessToken, String refreshToken, long expiresIn, long refreshExpiresIn) {
        return new TokenResponse(accessToken, refreshToken, "Bearer", expiresIn, refreshExpiresIn);
    }
}
