package com.comong.backend.domain.notification.config;

import java.util.Base64;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "firebase")
public record FirebaseProperties(Push push, Admin admin) {

    private static final String PLACEHOLDER_PREFIX = "change-me";

    public boolean pushEnabled() {
        return push != null && push.enabled();
    }

    public String projectId() {
        return admin == null ? null : admin.projectId();
    }

    public byte[] decodedCredentials() {
        validateConfigured();
        try {
            return Base64.getDecoder().decode(admin.credentialsBase64().replaceAll("\\s", ""));
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("Invalid FIREBASE_CREDENTIALS_BASE64 format", e);
        }
    }

    public void validateConfigured() {
        if (!pushEnabled()) {
            return;
        }
        if (isBlank(projectId())) {
            throw new IllegalStateException(
                    "Firebase push is enabled but FIREBASE_PROJECT_ID is missing");
        }
        if (admin == null || isBlank(admin.credentialsBase64())) {
            throw new IllegalStateException(
                    "Firebase push is enabled but FIREBASE_CREDENTIALS_BASE64 is missing");
        }
        if (isPlaceholder(projectId()) || isPlaceholder(admin.credentialsBase64())) {
            throw new IllegalStateException("Firebase push is enabled with placeholder values");
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static boolean isPlaceholder(String value) {
        return value.contains(PLACEHOLDER_PREFIX);
    }

    public record Push(boolean enabled) {}

    public record Admin(String projectId, String credentialsBase64) {}
}
