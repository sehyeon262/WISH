package com.comong.backend.domain.realtime.service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

import jakarta.annotation.PreDestroy;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.comong.backend.domain.realtime.dto.GamePresenceEventResponse;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
public class LiveMonitorPresenceService {

    private static final String GAME_PRESENCE_EVENT_NAME = "game-presence";

    private final RealtimeLoginSessionAccessService sessionAccessService;
    private final long sseTimeoutMillis;
    private final long lastWatcherDebounceMillis;
    private final DelayScheduler delayScheduler;

    private final ConcurrentHashMap<Long, Set<GameEmitterRegistration>> gameEmittersBySessionId =
            new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Long, Set<WatcherKey>> watchersBySessionId =
            new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Long, CancellableTask> zeroWatcherDebounceBySessionId =
            new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Long, Integer> lastPublishedWatcherCountBySessionId =
            new ConcurrentHashMap<>();

    @Autowired
    public LiveMonitorPresenceService(
            RealtimeLoginSessionAccessService sessionAccessService,
            @Value("${realtime.live-monitor.sse.timeout-millis:1800000}") long sseTimeoutMillis,
            @Value("${realtime.live-monitor.last-watcher-debounce-millis:7000}")
                    long lastWatcherDebounceMillis) {
        this(
                sessionAccessService,
                sseTimeoutMillis,
                lastWatcherDebounceMillis,
                new ExecutorDelayScheduler());
    }

    LiveMonitorPresenceService(
            RealtimeLoginSessionAccessService sessionAccessService,
            long sseTimeoutMillis,
            long lastWatcherDebounceMillis,
            DelayScheduler delayScheduler) {
        this.sessionAccessService = sessionAccessService;
        this.sseTimeoutMillis = sseTimeoutMillis;
        this.lastWatcherDebounceMillis = lastWatcherDebounceMillis;
        this.delayScheduler = delayScheduler;
    }

    public SseEmitter subscribeWatching(Long userId, Long loginSessionId) {
        sessionAccessService.findActiveOwnedSession(userId, loginSessionId);

        SseEmitter emitter = createEmitter();
        WatcherKey watcherKey =
                new WatcherKey(loginSessionId, userId, UUID.randomUUID().toString());
        emitter.onCompletion(() -> removeWatcher(watcherKey));
        emitter.onTimeout(() -> removeWatcher(watcherKey));
        emitter.onError(error -> removeWatcher(watcherKey));
        WatcherRegistrationResult registrationResult = registerWatcher(watcherKey);
        try {
            sendWatchingOpenEvent(emitter);
        } catch (IOException | RuntimeException e) {
            log.debug("Watching SSE initial send failed. loginSessionId={}", loginSessionId, e);
            removeWatcher(watcherKey);
            completeWithErrorSafely(emitter, e);
            throw new IllegalStateException("Watching SSE initial send failed.", e);
        }
        publishIfPresent(loginSessionId, watcherRegistrationEvent(registrationResult));
        return emitter;
    }

    public SseEmitter subscribeGamePresence(Long userId, Long loginSessionId) {
        sessionAccessService.findActiveOwnedSession(userId, loginSessionId);

        SseEmitter emitter = createEmitter();
        GameEmitterRegistration registration = new GameEmitterRegistration(loginSessionId, emitter);
        registerGameEmitter(registration);
        sendOrRemove(registration, currentWatcherCountSnapshot(loginSessionId));
        return emitter;
    }

    @PreDestroy
    public void shutdown() {
        cancelAllZeroWatcherDebounces();
        if (delayScheduler instanceof AutoCloseable closeable) {
            try {
                closeable.close();
            } catch (Exception e) {
                log.warn("Live monitor presence scheduler shutdown failed.", e);
            }
        }
    }

    SseEmitter createEmitter() {
        return new SseEmitter(sseTimeoutMillis);
    }

    synchronized int watcherCount(Long loginSessionId) {
        Set<WatcherKey> watchers = watchersBySessionId.get(loginSessionId);
        return watchers == null ? 0 : watchers.size();
    }

    synchronized int activeGameEmitterCount(Long loginSessionId) {
        Set<GameEmitterRegistration> emitters = gameEmittersBySessionId.get(loginSessionId);
        return emitters == null ? 0 : emitters.size();
    }

    void sendGamePresenceEvent(SseEmitter emitter, GamePresenceEventResponse event)
            throws IOException {
        emitter.send(SseEmitter.event().name(GAME_PRESENCE_EVENT_NAME).data(event));
    }

    void sendWatchingOpenEvent(SseEmitter emitter) throws IOException {
        emitter.send(SseEmitter.event().comment("connected"));
    }

    private WatcherRegistrationResult registerWatcher(WatcherKey watcherKey) {
        synchronized (this) {
            Long loginSessionId = watcherKey.loginSessionId();
            int previousCount = watcherCount(loginSessionId);
            watchersBySessionId.compute(
                    loginSessionId,
                    (ignored, current) -> {
                        Set<WatcherKey> watchers =
                                current == null ? ConcurrentHashMap.newKeySet() : current;
                        watchers.add(watcherKey);
                        return watchers;
                    });
            cancelZeroWatcherDebounce(loginSessionId);

            int currentCount = watcherCount(loginSessionId);
            return new WatcherRegistrationResult(
                    loginSessionId, currentCount != previousCount, currentCount);
        }
    }

    private void removeWatcher(WatcherKey watcherKey) {
        Long loginSessionId = watcherKey.loginSessionId();
        GamePresenceEventResponse event = null;
        synchronized (this) {
            int previousCount = watcherCount(loginSessionId);
            watchersBySessionId.computeIfPresent(
                    loginSessionId,
                    (ignored, current) -> {
                        current.remove(watcherKey);
                        return current.isEmpty() ? null : current;
                    });

            int currentCount = watcherCount(loginSessionId);
            if (currentCount == previousCount) {
                return;
            }
            if (currentCount > 0) {
                event = watcherCountChangedEvent(loginSessionId, currentCount);
            } else {
                scheduleZeroWatcherDebounce(loginSessionId);
            }
        }
        publishIfPresent(loginSessionId, event);
    }

    private void registerGameEmitter(GameEmitterRegistration registration) {
        registration.emitter().onCompletion(() -> removeGameEmitter(registration));
        registration.emitter().onTimeout(() -> removeGameEmitter(registration));
        registration.emitter().onError(error -> removeGameEmitter(registration));
        synchronized (this) {
            gameEmittersBySessionId.compute(
                    registration.loginSessionId(),
                    (ignored, current) -> {
                        Set<GameEmitterRegistration> emitters =
                                current == null ? ConcurrentHashMap.newKeySet() : current;
                        emitters.add(registration);
                        return emitters;
                    });
        }
    }

    private synchronized void removeGameEmitter(GameEmitterRegistration registration) {
        gameEmittersBySessionId.computeIfPresent(
                registration.loginSessionId(),
                (ignored, current) -> {
                    current.remove(registration);
                    return current.isEmpty() ? null : current;
                });
    }

    private synchronized GamePresenceEventResponse currentWatcherCountSnapshot(
            Long loginSessionId) {
        int currentWatcherCount = watcherCount(loginSessionId);
        lastPublishedWatcherCountBySessionId.put(loginSessionId, currentWatcherCount);
        return GamePresenceEventResponse.watcherCountChanged(loginSessionId, currentWatcherCount);
    }

    private GamePresenceEventResponse watcherCountChangedEvent(
            Long loginSessionId, int watcherCount) {
        Integer previous = lastPublishedWatcherCountBySessionId.put(loginSessionId, watcherCount);
        if (previous != null && previous.intValue() == watcherCount) {
            return null;
        }
        return GamePresenceEventResponse.watcherCountChanged(loginSessionId, watcherCount);
    }

    private void publishIfPresent(Long loginSessionId, GamePresenceEventResponse event) {
        if (event != null) {
            publish(loginSessionId, event);
        }
    }

    private GamePresenceEventResponse watcherRegistrationEvent(WatcherRegistrationResult result) {
        if (!result.countChanged()) {
            return null;
        }
        return watcherCountChangedEvent(result.loginSessionId(), result.watcherCount());
    }

    private void publish(Long loginSessionId, GamePresenceEventResponse event) {
        Set<GameEmitterRegistration> emitters = gameEmittersBySessionId.get(loginSessionId);
        if (emitters == null || emitters.isEmpty()) {
            return;
        }
        List<GameEmitterRegistration> snapshot = new ArrayList<>(emitters);
        for (GameEmitterRegistration registration : snapshot) {
            sendOrRemove(registration, event);
        }
    }

    private void sendOrRemove(
            GameEmitterRegistration registration, GamePresenceEventResponse event) {
        try {
            sendGamePresenceEvent(registration.emitter(), event);
        } catch (IOException e) {
            log.debug(
                    "Game presence SSE send failed. loginSessionId={}, watcherCount={}",
                    registration.loginSessionId(),
                    event.watcherCount(),
                    e);
            removeGameEmitter(registration);
        } catch (RuntimeException e) {
            log.warn(
                    "Unexpected game presence SSE send failure. loginSessionId={}, watcherCount={}",
                    registration.loginSessionId(),
                    event.watcherCount(),
                    e);
            removeGameEmitter(registration);
        }
    }

    private void completeWithErrorSafely(SseEmitter emitter, Throwable error) {
        try {
            emitter.completeWithError(error);
        } catch (RuntimeException e) {
            log.debug("Watching SSE completeWithError failed.", e);
        }
    }

    private synchronized void scheduleZeroWatcherDebounce(Long loginSessionId) {
        cancelZeroWatcherDebounce(loginSessionId);
        CancellableTask task =
                delayScheduler.schedule(
                        () -> publishZeroIfStillEmpty(loginSessionId), lastWatcherDebounceMillis);
        zeroWatcherDebounceBySessionId.put(loginSessionId, task);
    }

    private synchronized void cancelZeroWatcherDebounce(Long loginSessionId) {
        CancellableTask task = zeroWatcherDebounceBySessionId.remove(loginSessionId);
        if (task != null) {
            task.cancel();
        }
    }

    private void publishZeroIfStillEmpty(Long loginSessionId) {
        GamePresenceEventResponse event = null;
        synchronized (this) {
            zeroWatcherDebounceBySessionId.remove(loginSessionId);
            if (watcherCount(loginSessionId) == 0) {
                event = watcherCountChangedEvent(loginSessionId, 0);
            }
        }
        publishIfPresent(loginSessionId, event);
    }

    private synchronized void cancelAllZeroWatcherDebounces() {
        for (CancellableTask task : zeroWatcherDebounceBySessionId.values()) {
            task.cancel();
        }
        zeroWatcherDebounceBySessionId.clear();
    }

    record WatcherKey(Long loginSessionId, Long guardianUserId, String connectionId) {

        WatcherKey {
            Objects.requireNonNull(loginSessionId, "loginSessionId must not be null");
            Objects.requireNonNull(guardianUserId, "guardianUserId must not be null");
            Objects.requireNonNull(connectionId, "connectionId must not be null");
        }
    }

    private record WatcherRegistrationResult(
            Long loginSessionId, boolean countChanged, int watcherCount) {}

    private record GameEmitterRegistration(Long loginSessionId, SseEmitter emitter) {

        private GameEmitterRegistration {
            Objects.requireNonNull(loginSessionId, "loginSessionId must not be null");
            Objects.requireNonNull(emitter, "emitter must not be null");
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) {
                return true;
            }
            if (!(o instanceof GameEmitterRegistration other)) {
                return false;
            }
            return emitter == other.emitter;
        }

        @Override
        public int hashCode() {
            return System.identityHashCode(emitter);
        }
    }

    interface DelayScheduler {
        CancellableTask schedule(Runnable task, long delayMillis);
    }

    interface CancellableTask {
        boolean cancel();
    }

    private static final class ExecutorDelayScheduler implements DelayScheduler, AutoCloseable {

        private final ScheduledExecutorService executor =
                Executors.newSingleThreadScheduledExecutor(
                        runnable -> {
                            Thread thread = new Thread(runnable, "live-monitor-presence-debounce");
                            thread.setDaemon(true);
                            return thread;
                        });

        @Override
        public CancellableTask schedule(Runnable task, long delayMillis) {
            ScheduledFuture<?> future =
                    executor.schedule(task, Math.max(0, delayMillis), TimeUnit.MILLISECONDS);
            return () -> future.cancel(false);
        }

        @Override
        public void close() {
            executor.shutdownNow();
            try {
                executor.awaitTermination(5, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }
}
