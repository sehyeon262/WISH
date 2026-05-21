package com.comong.backend.global.storage;

/**
 * {@link VideoStorage#upload} 의 반환 타입. DB 의 영상 URL 컬럼에 저장된다. {@link StoredImage} 와 동일한 구조의 별도 타입 —
 * 이미지/영상 의도가 시그니처에서 명확하도록 분리.
 */
public record StoredVideo(String url) {}
