package com.comong.backend.global.storage;

import org.springframework.web.multipart.MultipartFile;

/**
 * 영상 저장소 추상화. {@link LocalVideoStorage} (디폴트) / {@code S3VideoStorage} (S14P31E103-492 예정) 가 동일
 * 인터페이스로 갈아끼움 ({@link ImageStorage} 와 대칭).
 *
 * <p>구현체는 다음을 책임진다:
 *
 * <ul>
 *   <li>업로드 파일이 {@code video/*} MIME 와 알려진 영상 시그니처(MP4 / WebM) 를 충족하는지 검증
 *   <li>파일명 충돌 방지 (UUID 등)
 *   <li>외부에 영구히 저장할 식별자 ({@link StoredVideo#url}) 생성 — DB {@code demo_video_url} 컬럼에 저장됨
 *   <li>저장된 식별자로 외부 노출 URL 생성 ({@link #toPublicUrl}) — 응답 직렬화 시점마다 호출
 *   <li>주어진 식별자로 저장된 파일 제거
 * </ul>
 *
 * <p>저장 식별자와 노출 URL 의 분리 의도는 {@link ImageStorage} javadoc 참조.
 */
public interface VideoStorage {

    /**
     * 영상을 저장하고 외부 노출용 영구 식별자를 담은 결과를 반환한다. 반환된 {@link StoredVideo#url} 은 DB 에 그대로 저장 가능.
     *
     * @throws com.comong.backend.global.exception.BusinessException 빈 파일이거나 영상 검증 실패 시 {@code S-004
     *     INVALID_VIDEO}, 한도 초과 시 {@code S-003 PAYLOAD_TOO_LARGE}, IO 실패 시 {@code S-002
     *     STORAGE_FAILURE}
     */
    StoredVideo upload(MultipartFile file);

    /**
     * DB 에 저장된 식별자를 클라이언트에 노출 가능한 URL 로 변환한다. 기본 구현은 identity. S3 구현체는 presigner 로 짧은 TTL GET URL
     * 발급. graceful fallback (자기 형식 아닌 stored → null) 등 자세한 의도는 {@link ImageStorage#toPublicUrl}
     * javadoc 참조.
     */
    default String toPublicUrl(String stored) {
        return stored;
    }

    /**
     * 저장된 영상을 제거한다. 파일이 존재하지 않으면 조용히 무시한다 (idempotent).
     *
     * @param stored {@link #upload} 가 반환했던 식별자
     */
    void delete(String stored);
}
