package com.comong.backend.domain.realtime.service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.function.LongSupplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.comong.backend.domain.realtime.dto.RealtimeEventResponse;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
public class RealtimeEventService {

    private static final String EVENT_NAME = "realtime";

    private final ConcurrentHashMap<Long, Set<EmitterRegistration>> emittersByUserId =
            new ConcurrentHashMap<>();
    private final LongSupplier nowMillis;
    private final long sseTimeoutMillis;

    @Autowired
    public RealtimeEventService(
            @Value("${realtime.sse.timeout-millis:1800000}") long sseTimeoutMillis) {
        this(System::currentTimeMillis, sseTimeoutMillis);
    }

    RealtimeEventService(LongSupplier nowMillis, long sseTimeoutMillis) {
        this.nowMillis = nowMillis;
        this.sseTimeoutMillis = sseTimeoutMillis;
    }

    public SseEmitter subscribe(Long userId) {
        SseEmitter emitter = createEmitter();
        EmitterRegistration registration = new EmitterRegistration(emitter, nowMillis.getAsLong());
        register(userId, registration);
        sendOrRemove(userId, registration, RealtimeEventResponse.connected());
        return emitter;
    }

    public void publish(Long userId, RealtimeEventResponse event) {
        Set<EmitterRegistration> emitters = emittersByUserId.get(userId);
        if (emitters == null || emitters.isEmpty()) {
            return;
        }
        for (EmitterRegistration registration : emitters) {
            sendOrRemove(userId, registration, event);
        }
    }

    @Scheduled(fixedDelayString = "${realtime.sse.cleanup-interval-millis:60000}")
    public void cleanupExpiredEmitters() {
        long now = nowMillis.getAsLong();
        List<ExpiredEmitter> expiredEmitters = new ArrayList<>();
        emittersByUserId.forEach(
                (userId, registrations) ->
                        registrations.forEach(
                                registration -> {
                                    if (now - registration.registeredAtMillis()
                                            >= sseTimeoutMillis) {
                                        expiredEmitters.add(
                                                new ExpiredEmitter(userId, registration));
                                    }
                                }));
        expiredEmitters.stream()
                .filter(expired -> remove(expired.userId(), expired.registration()))
                .forEach(this::completeExpiredEmitter);
    }

    int activeEmitterCount(Long userId) {
        Set<EmitterRegistration> emitters = emittersByUserId.get(userId);
        return emitters == null ? 0 : emitters.size();
    }

    SseEmitter createEmitter() {
        return new SseEmitter(sseTimeoutMillis);
    }

    private void register(Long userId, EmitterRegistration registration) {
        registration.emitter().onCompletion(() -> remove(userId, registration));
        registration.emitter().onTimeout(() -> remove(userId, registration));
        registration.emitter().onError(error -> remove(userId, registration));
        emittersByUserId.compute(
                userId,
                (ignored, current) -> {
                    Set<EmitterRegistration> registrations =
                            current == null ? new CopyOnWriteArraySet<>() : current;
                    registrations.add(registration);
                    return registrations;
                });
    }

    private void sendOrRemove(
            Long userId, EmitterRegistration registration, RealtimeEventResponse event) {
        try {
            registration.emitter().send(SseEmitter.event().name(EVENT_NAME).data(event));
        } catch (IOException e) {
            log.debug("SSE send failed. userId={}, eventType={}", userId, event.type(), e);
            remove(userId, registration);
        } catch (RuntimeException e) {
            log.warn(
                    "Unexpected SSE send failure. userId={}, eventType={}",
                    userId,
                    event.type(),
                    e);
            remove(userId, registration);
        }
    }

    private boolean remove(Long userId, EmitterRegistration registration) {
        boolean[] removed = {false};
        emittersByUserId.computeIfPresent(
                userId,
                (ignored, current) -> {
                    removed[0] = current.remove(registration);
                    return current.isEmpty() ? null : current;
                });
        return removed[0];
    }

    private void completeExpiredEmitter(ExpiredEmitter expired) {
        try {
            expired.registration().emitter().complete();
        } catch (RuntimeException e) {
            log.warn("SSE cleanup complete failed. userId={}", expired.userId(), e);
        }
    }

    private record ExpiredEmitter(Long userId, EmitterRegistration registration) {}

    private record EmitterRegistration(SseEmitter emitter, long registeredAtMillis) {

        private EmitterRegistration {
            Objects.requireNonNull(emitter, "emitter must not be null");
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) {
                return true;
            }
            if (!(o instanceof EmitterRegistration other)) {
                return false;
            }
            return emitter == other.emitter;
        }

        @Override
        public int hashCode() {
            return System.identityHashCode(emitter);
        }
    }
}
