package com.comong.backend.domain.notification.service;

import java.util.Map;
import java.util.Objects;

public record FirebasePushMessage(
        String deviceToken, String title, String body, Map<String, String> data) {

    public FirebasePushMessage {
        deviceToken = Objects.requireNonNull(deviceToken, "deviceToken must not be null");
        title = Objects.requireNonNull(title, "title must not be null");
        body = Objects.requireNonNull(body, "body must not be null");
        data = data == null ? Map.of() : Map.copyOf(data);
    }
}
