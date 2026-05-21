package com.comong.backend.domain.taekwondo.dto;

import com.comong.backend.domain.taekwondo.entity.Belt;

/**
 * 세션 저장 응답에 optional 로 포함되는 띠 승급 알림. 한 세션에 여러 단계 점프 시 fromBelt 는 진입 시점 띠, toBelt 는 최종 띠 (예: WHITE →
 * ORANGE 점프).
 */
public record BeltPromotionResponse(Belt fromBelt, Belt toBelt) {}
