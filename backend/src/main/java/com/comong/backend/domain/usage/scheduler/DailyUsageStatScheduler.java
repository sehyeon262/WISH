package com.comong.backend.domain.usage.scheduler;

import java.time.LocalDate;
import java.time.ZoneId;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.comong.backend.domain.usage.service.DailyUsageStatBatchService;

import lombok.RequiredArgsConstructor;

/**
 * 일별 사용량 집계 배치 트리거. KST 기준 매일 01:00 에 전일치를 한 번 처리한다.
 *
 * <p>00:30 / 03:00 가 아닌 01:00 인 이유: 자정 직후 활동 중 세션이 정리될 시간을 30분 정도 두면서, 보호자가 너무 늦게 통계 갱신을 보지 않도록 둘
 * 사이의 절충 (S14P31E103-540 에픽 결정).
 *
 * <p>실행 실패는 SLF4J 로 기록만 하고 다음 발화에 맡긴다 — 통계 조회 API (S14P31E103-543) 가 fallback 으로 source 즉석 SUM 을
 * 사용하므로, 한 번의 배치 누락이 즉시 사용자 노출 데이터 손실로 이어지지는 않는다.
 */
@Component
@RequiredArgsConstructor
public class DailyUsageStatScheduler {

    private static final Logger log = LoggerFactory.getLogger(DailyUsageStatScheduler.class);

    private static final ZoneId BATCH_ZONE = ZoneId.of("Asia/Seoul");

    private final DailyUsageStatBatchService dailyUsageStatBatchService;

    @Scheduled(cron = "0 0 1 * * *", zone = "Asia/Seoul")
    public void runDailyAggregation() {
        LocalDate yesterday = LocalDate.now(BATCH_ZONE).minusDays(1);
        try {
            dailyUsageStatBatchService.aggregateForDate(yesterday);
        } catch (RuntimeException e) {
            // 다음 발화 또는 수동 재실행으로 복구. 통계 조회 API 의 fallback 이 한 번의 누락은 메꿔준다.
            log.error("Daily usage stat batch failed for {}", yesterday, e);
        }
    }
}
