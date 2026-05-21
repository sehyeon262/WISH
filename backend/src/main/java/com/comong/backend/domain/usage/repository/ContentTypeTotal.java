package com.comong.backend.domain.usage.repository;

import com.comong.backend.domain.usage.entity.ContentType;

/** JPQL projection record — content_type 별 누적 합 결과. {@link DailyUsageStatRepository} 가 사용. */
public record ContentTypeTotal(ContentType contentType, long totalSeconds) {}
