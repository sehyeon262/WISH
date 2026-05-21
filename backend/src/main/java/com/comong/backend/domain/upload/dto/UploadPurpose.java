package com.comong.backend.domain.upload.dto;

public enum UploadPurpose {
    MUSIC_RESULT("music/results"),
    GYMNASTICS_PERFORMANCE("performance/gymnastics"),
    TAEKWONDO_PERFORMANCE("performance/taekwondo");

    private final String storagePath;

    UploadPurpose(String storagePath) {
        this.storagePath = storagePath;
    }

    public String storagePath() {
        return storagePath;
    }
}
