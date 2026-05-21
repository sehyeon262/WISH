package com.comong.backend.global.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Spring 의 {@code @Scheduled} 빈 처리를 활성화. 첫 도입은 {@link
 * com.comong.backend.domain.usage.scheduler.DailyUsageStatScheduler} (S14P31E103-542). 이후 다른 도메인이
 * {@code @Scheduled} 를 추가하면 별도 활성화 없이 같이 동작한다.
 *
 * <p>local / dev / prod 모든 프로파일에서 켜진다 — 테스트 프로파일도 포함되지만, 통합 테스트 동안 cron 발화 시점이 들어맞을 가능성은 거의 없으므로 실해
 * 부작용은 없다. 필요해지면 {@code @Profile} 로 분리.
 */
@Configuration
@EnableScheduling
public class SchedulingConfig {}
