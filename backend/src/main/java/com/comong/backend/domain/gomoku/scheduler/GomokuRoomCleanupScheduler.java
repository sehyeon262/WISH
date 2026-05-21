package com.comong.backend.domain.gomoku.scheduler;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.comong.backend.domain.gomoku.service.GomokuService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
@RequiredArgsConstructor
public class GomokuRoomCleanupScheduler {

    private final GomokuService gomokuService;

    @Scheduled(fixedDelayString = "${gomoku.rooms.cleanup-delay:PT30S}")
    public void cleanupStaleRooms() {
        int cleaned = gomokuService.cleanupStaleRooms();
        if (cleaned > 0) {
            log.info("gomoku stale room cleanup completed. cleaned={}", cleaned);
        }
    }
}
