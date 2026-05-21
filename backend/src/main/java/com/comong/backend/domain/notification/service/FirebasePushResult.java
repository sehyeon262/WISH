package com.comong.backend.domain.notification.service;

public record FirebasePushResult(boolean successful, boolean invalidToken, String failureCode) {

    public static FirebasePushResult success() {
        return new FirebasePushResult(true, false, null);
    }

    public static FirebasePushResult skipped(String reason) {
        return new FirebasePushResult(false, false, reason);
    }

    public static FirebasePushResult failed(String failureCode, boolean invalidToken) {
        return new FirebasePushResult(false, invalidToken, failureCode);
    }
}
