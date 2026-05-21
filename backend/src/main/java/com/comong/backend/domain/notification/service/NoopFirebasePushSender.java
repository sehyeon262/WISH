package com.comong.backend.domain.notification.service;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class NoopFirebasePushSender implements FirebasePushSender {

    @Override
    public FirebasePushResult send(FirebasePushMessage message) {
        log.debug("Firebase push is disabled. Skipping FCM send.");
        return FirebasePushResult.skipped("FIREBASE_PUSH_DISABLED");
    }
}
