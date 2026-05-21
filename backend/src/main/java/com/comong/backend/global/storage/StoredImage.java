package com.comong.backend.global.storage;

/**
 * {@link ImageStorage#upload} 의 결과. DB {@code image_url} 컬럼에 그대로 저장하는 영구 식별자를 담는다.
 *
 * <p>형식은 구현체별로 다르다 — 로컬은 servlet 상대 경로 ({@code /uploads/{uuid}.png}), S3 는 영구 객체 URL ({@code
 * https://<bucket>.s3.<region>.amazonaws.com/<prefix>/{uuid}.png}). 외부 노출 시점에는 {@link
 * ImageStorage#toPublicUrl} 을 거쳐야 한다 (S3 는 짧은 TTL presigned URL 로 변환).
 */
public record StoredImage(String url) {}
