package com.comong.backend.domain.dialogue.config;

import java.util.concurrent.Executor;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * Dialogue 임베딩 트리거용 비동기 실행기 ({@code aiDialogueTaskExecutor}).
 *
 * <p>세션 종료 응답을 사용자에게 즉시 돌려주기 위해 AI 서버 호출을 fire-and-forget 으로 분리한다. 풀 크기는 시연 환경 동시 종료 수를 작게 가정하여
 * core 2 / max 4. 풀 만석이면 호출자(요청 스레드) 가 직접 실행 ({@code CallerRunsPolicy}) — 메시지 손실보다 약간의 지연을 택한다.
 */
@Configuration
@EnableAsync
public class AiDialogueAsyncConfig {

    @Bean("aiDialogueTaskExecutor")
    public Executor aiDialogueTaskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(32);
        executor.setThreadNamePrefix("ai-dialogue-");
        executor.setRejectedExecutionHandler(
                new java.util.concurrent.ThreadPoolExecutor.CallerRunsPolicy());
        executor.initialize();
        return executor;
    }
}
