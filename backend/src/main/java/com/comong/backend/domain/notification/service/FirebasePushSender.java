package com.comong.backend.domain.notification.service;

public interface FirebasePushSender {

    FirebasePushResult send(FirebasePushMessage message);
}
