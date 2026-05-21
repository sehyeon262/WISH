package com.comong.backend.domain.notification.service;

import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.Message;
import com.google.firebase.messaging.MessagingErrorCode;
import com.google.firebase.messaging.Notification;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@RequiredArgsConstructor
public class FirebaseAdminPushSender implements FirebasePushSender {

    private final FirebaseMessaging firebaseMessaging;

    @Override
    public FirebasePushResult send(FirebasePushMessage message) {
        Message firebaseMessage =
                Message.builder()
                        .setToken(message.deviceToken())
                        .setNotification(
                                Notification.builder()
                                        .setTitle(message.title())
                                        .setBody(message.body())
                                        .build())
                        .putAllData(message.data())
                        .build();
        try {
            firebaseMessaging.send(firebaseMessage);
            return FirebasePushResult.success();
        } catch (FirebaseMessagingException e) {
            MessagingErrorCode code = e.getMessagingErrorCode();
            boolean invalidToken = isInvalidToken(code);
            String failureCode = code == null ? "UNKNOWN" : code.name();
            log.warn(
                    "FCM send failed. failureCode={}, invalidToken={}",
                    failureCode,
                    invalidToken,
                    e);
            return FirebasePushResult.failed(failureCode, invalidToken);
        } catch (RuntimeException e) {
            log.warn("Unexpected FCM send failure.", e);
            return FirebasePushResult.failed("UNEXPECTED", false);
        }
    }

    private boolean isInvalidToken(MessagingErrorCode code) {
        return code == MessagingErrorCode.UNREGISTERED
                || code == MessagingErrorCode.INVALID_ARGUMENT;
    }
}
