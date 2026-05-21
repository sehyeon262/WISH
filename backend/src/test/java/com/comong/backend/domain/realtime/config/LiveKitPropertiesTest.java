package com.comong.backend.domain.realtime.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

import com.comong.backend.domain.realtime.exception.RealtimeErrorCode;
import com.comong.backend.global.exception.BusinessException;

class LiveKitPropertiesTest {

    @Test
    void validateConfigured_allowsConfiguredValues() {
        LiveKitProperties properties =
                new LiveKitProperties(
                        "wss://test.livekit.cloud",
                        "test-livekit-api-key",
                        "test-livekit-api-secret");

        properties.validateConfigured();
    }

    @Test
    void validateConfigured_blankValue_throwsRt001() {
        LiveKitProperties properties =
                new LiveKitProperties("wss://test.livekit.cloud", "", "test-livekit-api-secret");

        assertThatThrownBy(properties::validateConfigured)
                .isInstanceOfSatisfying(
                        BusinessException.class,
                        e ->
                                assertThat(e.getErrorCode())
                                        .isEqualTo(RealtimeErrorCode.LIVEKIT_NOT_CONFIGURED));
    }

    @Test
    void validateConfigured_placeholderValue_throwsRt001() {
        LiveKitProperties properties =
                new LiveKitProperties(
                        "wss://change-me.livekit.cloud",
                        "test-livekit-api-key",
                        "test-livekit-api-secret");

        assertThatThrownBy(properties::validateConfigured)
                .isInstanceOfSatisfying(
                        BusinessException.class,
                        e ->
                                assertThat(e.getErrorCode())
                                        .isEqualTo(RealtimeErrorCode.LIVEKIT_NOT_CONFIGURED));
    }
}
