package com.comong.backend.domain.realtime.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;

import com.comong.backend.domain.usage.entity.ContentType;

class RealtimeContentStateServiceTest {

    @Test
    void start_firstContent_marksChangedAndStoresState() {
        RealtimeContentStateService service = new RealtimeContentStateService();

        RealtimeContentStateService.ContentChange change = service.start(1L, ContentType.MUSIC);

        assertThat(change.previousContentType()).isNull();
        assertThat(change.currentContentType()).isEqualTo(ContentType.MUSIC);
        assertThat(change.changed()).isTrue();
        RealtimeContentStateService.ContentState state = service.find(1L);
        assertThat(state.active()).isTrue();
        assertThat(state.contentType()).isEqualTo(ContentType.MUSIC);
        assertThat(state.contentTypeName()).isEqualTo("MUSIC");
    }

    @Test
    void start_sameContentType_marksUnchanged() {
        RealtimeContentStateService service = new RealtimeContentStateService();
        service.start(1L, ContentType.ART);

        RealtimeContentStateService.ContentChange change = service.start(1L, ContentType.ART);

        assertThat(change.previousContentType()).isEqualTo(ContentType.ART);
        assertThat(change.currentContentType()).isEqualTo(ContentType.ART);
        assertThat(change.changed()).isFalse();
    }

    @Test
    void start_differentContentType_marksChangedAndReplacesState() {
        RealtimeContentStateService service = new RealtimeContentStateService();
        service.start(1L, ContentType.MUSIC);

        RealtimeContentStateService.ContentChange change = service.start(1L, ContentType.TAEKWONDO);

        assertThat(change.previousContentType()).isEqualTo(ContentType.MUSIC);
        assertThat(change.currentContentType()).isEqualTo(ContentType.TAEKWONDO);
        assertThat(change.changed()).isTrue();
        assertThat(service.find(1L).contentType()).isEqualTo(ContentType.TAEKWONDO);
    }

    @Test
    void start_sameContentTypeConcurrent_allowsOnlyOneChangedResult() throws Exception {
        RealtimeContentStateService service = new RealtimeContentStateService();
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(12);
        AtomicInteger changedCount = new AtomicInteger();
        AtomicReference<Throwable> failure = new AtomicReference<>();
        ExecutorService executor = Executors.newFixedThreadPool(12);
        List<Runnable> tasks = new ArrayList<>();
        for (int i = 0; i < 12; i++) {
            tasks.add(
                    () -> {
                        try {
                            start.await();
                            if (service.start(1L, ContentType.GYMNASTICS).changed()) {
                                changedCount.incrementAndGet();
                            }
                        } catch (Throwable t) {
                            failure.compareAndSet(null, t);
                        } finally {
                            done.countDown();
                        }
                    });
        }

        try {
            tasks.forEach(executor::submit);
            start.countDown();
            assertThat(done.await(10, TimeUnit.SECONDS)).isTrue();
        } finally {
            executor.shutdownNow();
        }

        if (failure.get() != null) {
            throw new AssertionError("concurrent content start failed", failure.get());
        }
        assertThat(changedCount.get()).isEqualTo(1);
        assertThat(service.find(1L).contentType()).isEqualTo(ContentType.GYMNASTICS);
    }

    @Test
    void end_removesActiveContent() {
        RealtimeContentStateService service = new RealtimeContentStateService();
        service.start(1L, ContentType.MUSIC);

        assertThat(service.end(1L)).contains(ContentType.MUSIC);

        RealtimeContentStateService.ContentState state = service.find(1L);
        assertThat(state.active()).isFalse();
        assertThat(state.contentType()).isNull();
        assertThat(state.contentTypeName()).isNull();
    }

    @Test
    void clear_removesActiveContent() {
        RealtimeContentStateService service = new RealtimeContentStateService();
        service.start(1L, ContentType.ART);

        service.clear(1L);

        assertThat(service.find(1L).active()).isFalse();
    }
}
