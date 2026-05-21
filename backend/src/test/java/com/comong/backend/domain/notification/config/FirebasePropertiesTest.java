package com.comong.backend.domain.notification.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import org.junit.jupiter.api.Test;

class FirebasePropertiesTest {

    @Test
    void validateConfigured_pushDisabled_allowsEmptyCredentials() {
        FirebaseProperties properties =
                new FirebaseProperties(
                        new FirebaseProperties.Push(false),
                        new FirebaseProperties.Admin(null, null));

        assertThatNoException().isThrownBy(properties::validateConfigured);
    }

    @Test
    void validateConfigured_pushEnabledWithoutProjectId_throwsIllegalStateException() {
        FirebaseProperties properties =
                new FirebaseProperties(
                        new FirebaseProperties.Push(true),
                        new FirebaseProperties.Admin("", validBase64()));

        assertThatThrownBy(properties::validateConfigured)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("FIREBASE_PROJECT_ID");
    }

    @Test
    void validateConfigured_pushEnabledWithoutCredentials_throwsIllegalStateException() {
        FirebaseProperties properties =
                new FirebaseProperties(
                        new FirebaseProperties.Push(true),
                        new FirebaseProperties.Admin("wish-e103-dev", ""));

        assertThatThrownBy(properties::validateConfigured)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("FIREBASE_CREDENTIALS_BASE64");
    }

    @Test
    void validateConfigured_placeholderValue_throwsIllegalStateException() {
        FirebaseProperties properties =
                new FirebaseProperties(
                        new FirebaseProperties.Push(true),
                        new FirebaseProperties.Admin(
                                "change-me-firebase-project-id", validBase64()));

        assertThatThrownBy(properties::validateConfigured)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("placeholder");
    }

    @Test
    void decodedCredentials_validBase64_returnsDecodedBytes() {
        FirebaseProperties properties =
                new FirebaseProperties(
                        new FirebaseProperties.Push(true),
                        new FirebaseProperties.Admin("wish-e103-dev", validBase64()));

        assertThat(new String(properties.decodedCredentials(), StandardCharsets.UTF_8))
                .isEqualTo("{\"type\":\"service_account\"}");
    }

    @Test
    void decodedCredentials_invalidBase64_throwsIllegalStateException() {
        FirebaseProperties properties =
                new FirebaseProperties(
                        new FirebaseProperties.Push(true),
                        new FirebaseProperties.Admin("wish-e103-dev", "not-base64!!"));

        assertThatThrownBy(properties::decodedCredentials)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("FIREBASE_CREDENTIALS_BASE64");
    }

    private String validBase64() {
        return Base64.getEncoder()
                .encodeToString("{\"type\":\"service_account\"}".getBytes(StandardCharsets.UTF_8));
    }
}
