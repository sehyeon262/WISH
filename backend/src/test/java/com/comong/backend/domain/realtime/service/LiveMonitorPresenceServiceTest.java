package com.comong.backend.domain.realtime.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.comong.backend.domain.realtime.dto.GamePresenceEventResponse;

class LiveMonitorPresenceServiceTest {

    private static final long TEST_SSE_TIMEOUT_MILLIS = 30 * 60 * 1000L;
    private static final long TEST_DEBOUNCE_MILLIS = 7_000L;

    @Test
    void gamePresenceSubscribe_sendsCurrentWatcherCountSnapshot() {
        ManualDelayScheduler scheduler = new ManualDelayScheduler();
        TestLiveMonitorPresenceService service = new TestLiveMonitorPresenceService(scheduler);
        service.subscribeWatching(1L, 10L);

        service.subscribeGamePresence(1L, 10L);

        TestSseEmitter gameEmitter = service.createdEmitters().get(1);
        assertThat(gameEmitter.events())
                .extracting(GamePresenceEventResponse::watcherCount)
                .containsExactly(1);
    }

    @Test
    void watchingSubscribe_sendsInitialOpenSignal() {
        ManualDelayScheduler scheduler = new ManualDelayScheduler();
        TestLiveMonitorPresenceService service = new TestLiveMonitorPresenceService(scheduler);

        service.subscribeWatching(1L, 10L);

        TestSseEmitter watchingEmitter = service.createdEmitters().get(0);
        assertThat(watchingEmitter.openSignalCount()).isEqualTo(1);
    }

    @Test
    void firstWatcherJoin_pushesWatcherCountImmediately() {
        ManualDelayScheduler scheduler = new ManualDelayScheduler();
        TestLiveMonitorPresenceService service = new TestLiveMonitorPresenceService(scheduler);
        service.subscribeGamePresence(1L, 10L);
        TestSseEmitter gameEmitter = service.createdEmitters().get(0);

        service.subscribeWatching(1L, 10L);

        assertThat(gameEmitter.events())
                .extracting(GamePresenceEventResponse::watcherCount)
                .containsExactly(0, 1);
    }

    @Test
    void lastWatcherLeave_pushesZeroAfterDebounce() {
        ManualDelayScheduler scheduler = new ManualDelayScheduler();
        TestLiveMonitorPresenceService service = new TestLiveMonitorPresenceService(scheduler);
        service.subscribeGamePresence(1L, 10L);
        TestSseEmitter gameEmitter = service.createdEmitters().get(0);
        service.subscribeWatching(1L, 10L);
        TestSseEmitter watchingEmitter = service.createdEmitters().get(1);

        watchingEmitter.completeFromClient();

        assertThat(gameEmitter.events())
                .extracting(GamePresenceEventResponse::watcherCount)
                .containsExactly(0, 1);

        scheduler.runPending();

        assertThat(gameEmitter.events())
                .extracting(GamePresenceEventResponse::watcherCount)
                .containsExactly(0, 1, 0);
    }

    @Test
    void newWatcherBeforeDebounce_cancelsZeroPush() {
        ManualDelayScheduler scheduler = new ManualDelayScheduler();
        TestLiveMonitorPresenceService service = new TestLiveMonitorPresenceService(scheduler);
        service.subscribeGamePresence(1L, 10L);
        TestSseEmitter gameEmitter = service.createdEmitters().get(0);
        service.subscribeWatching(1L, 10L);
        TestSseEmitter firstWatchingEmitter = service.createdEmitters().get(1);

        firstWatchingEmitter.completeFromClient();
        service.subscribeWatching(1L, 10L);
        scheduler.runPending();

        assertThat(gameEmitter.events())
                .extracting(GamePresenceEventResponse::watcherCount)
                .containsExactly(0, 1);
    }

    @Test
    void multipleWatchers_pushesAbsoluteCount() {
        ManualDelayScheduler scheduler = new ManualDelayScheduler();
        TestLiveMonitorPresenceService service = new TestLiveMonitorPresenceService(scheduler);
        service.subscribeGamePresence(1L, 10L);
        TestSseEmitter gameEmitter = service.createdEmitters().get(0);
        service.subscribeWatching(1L, 10L);
        TestSseEmitter firstWatchingEmitter = service.createdEmitters().get(1);
        service.subscribeWatching(2L, 10L);
        TestSseEmitter secondWatchingEmitter = service.createdEmitters().get(2);

        firstWatchingEmitter.completeFromClient();
        secondWatchingEmitter.completeFromClient();
        scheduler.runPending();

        assertThat(gameEmitter.events())
                .extracting(GamePresenceEventResponse::watcherCount)
                .containsExactly(0, 1, 2, 1, 0);
    }

    private static final class TestLiveMonitorPresenceService extends LiveMonitorPresenceService {

        private final List<TestSseEmitter> createdEmitters = new ArrayList<>();

        private TestLiveMonitorPresenceService(ManualDelayScheduler delayScheduler) {
            super(
                    mock(RealtimeLoginSessionAccessService.class),
                    TEST_SSE_TIMEOUT_MILLIS,
                    TEST_DEBOUNCE_MILLIS,
                    delayScheduler);
        }

        @Override
        SseEmitter createEmitter() {
            TestSseEmitter emitter = new TestSseEmitter();
            createdEmitters.add(emitter);
            return emitter;
        }

        @Override
        void sendGamePresenceEvent(SseEmitter emitter, GamePresenceEventResponse event)
                throws IOException {
            ((TestSseEmitter) emitter).record(event);
        }

        @Override
        void sendWatchingOpenEvent(SseEmitter emitter) {
            ((TestSseEmitter) emitter).recordOpenSignal();
        }

        private List<TestSseEmitter> createdEmitters() {
            return createdEmitters;
        }
    }

    private static final class TestSseEmitter extends SseEmitter {

        private final List<GamePresenceEventResponse> events = new ArrayList<>();
        private int openSignalCount;
        private Runnable completionCallback;
        private Runnable timeoutCallback;
        private Consumer<Throwable> errorCallback;

        private TestSseEmitter() {
            super(TEST_SSE_TIMEOUT_MILLIS);
        }

        @Override
        public void onCompletion(Runnable callback) {
            this.completionCallback = callback;
        }

        @Override
        public void onTimeout(Runnable callback) {
            this.timeoutCallback = callback;
        }

        @Override
        public void onError(Consumer<Throwable> callback) {
            this.errorCallback = callback;
        }

        private void record(GamePresenceEventResponse event) {
            events.add(event);
        }

        private List<GamePresenceEventResponse> events() {
            return events;
        }

        private void recordOpenSignal() {
            openSignalCount++;
        }

        private int openSignalCount() {
            return openSignalCount;
        }

        private void completeFromClient() {
            if (completionCallback != null) {
                completionCallback.run();
            }
        }

        @SuppressWarnings("unused")
        private void timeoutFromClient() {
            if (timeoutCallback != null) {
                timeoutCallback.run();
            }
        }

        @SuppressWarnings("unused")
        private void errorFromClient(Throwable error) {
            if (errorCallback != null) {
                errorCallback.accept(error);
            }
        }
    }

    private static final class ManualDelayScheduler
            implements LiveMonitorPresenceService.DelayScheduler {

        private final List<ManualTask> tasks = new ArrayList<>();

        @Override
        public LiveMonitorPresenceService.CancellableTask schedule(
                Runnable task, long delayMillis) {
            ManualTask manualTask = new ManualTask(task);
            tasks.add(manualTask);
            return manualTask;
        }

        private void runPending() {
            List<ManualTask> snapshot = new ArrayList<>(tasks);
            tasks.clear();
            snapshot.stream().filter(task -> !task.cancelled()).forEach(ManualTask::run);
        }
    }

    private static final class ManualTask implements LiveMonitorPresenceService.CancellableTask {

        private final Runnable task;
        private boolean cancelled;

        private ManualTask(Runnable task) {
            this.task = task;
        }

        @Override
        public boolean cancel() {
            cancelled = true;
            return true;
        }

        private boolean cancelled() {
            return cancelled;
        }

        private void run() {
            task.run();
        }
    }
}
