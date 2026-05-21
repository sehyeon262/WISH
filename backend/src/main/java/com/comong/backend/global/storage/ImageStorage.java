package com.comong.backend.global.storage;

import org.springframework.web.multipart.MultipartFile;

/**
 * 이미지 저장소 추상화. 로컬 디스크 / S3 등 다양한 백엔드를 갈아끼울 수 있도록 인터페이스만 노출한다.
 *
 * <p>구현체는 다음을 책임진다:
 *
 * <ul>
 *   <li>업로드 파일이 image/* MIME 타입인지 검증
 *   <li>파일명 충돌 방지 (UUID 등)
 *   <li>외부에 영구히 저장할 식별자 ({@link StoredImage#url}) 생성 — DB {@code image_url} 컬럼에 저장됨
 *   <li>저장된 식별자로 외부 노출 URL 생성 ({@link #toPublicUrl}) — 응답 직렬화 시점마다 호출
 *   <li>주어진 식별자로 저장된 파일 제거
 * </ul>
 *
 * <p><b>저장 식별자 vs 노출 URL 의 분리 (S14P31E103-491)</b>: 로컬 구현은 두 값이 동일하지만, S3 구현은 DB 엔 영구 객체 URL 을 저장하고
 * 응답마다 짧은 TTL 의 presigned URL 로 변환해야 한다. 그래서 호출자는 반드시 {@code upload} 결과의 {@code url} 을 DB 에 저장한 뒤,
 * 응답 만들 때 {@link #toPublicUrl} 을 거쳐 외부에 노출해야 한다 — 그렇지 않으면 만료된 presigned URL 을 영구 저장하게 된다.
 */
public interface ImageStorage {

    /**
     * 이미지를 저장하고 외부 노출용 영구 식별자를 담은 결과를 반환한다. 반환된 {@link StoredImage#url} 은 DB 에 그대로 저장 가능.
     *
     * @throws com.comong.backend.global.exception.BusinessException 빈 파일이거나 image/* MIME 가 아니면
     *     {@code G-001 INVALID_INPUT}, IO 실패 시 {@code G-999 INTERNAL_SERVER_ERROR}
     */
    StoredImage upload(MultipartFile file);

    /**
     * DB 에 저장된 식별자를 클라이언트에 노출 가능한 URL 로 변환한다. 응답 직렬화 시점마다 호출 — presigned URL 은 매 호출마다 새로 발급될 수 있다.
     *
     * <p>기본 구현은 identity (로컬 디스크 저장소처럼 식별자 자체가 이미 외부 노출 URL 인 경우). S3 구현체는 presigner 로 짧은 TTL GET
     * URL 발급.
     *
     * <p><b>graceful fallback (S14P31E103-511)</b>: 구현체가 자기 형식이 아닌 stored 를 만나면 (다른 백엔드 시절 옛 데이터,
     * DB 변조, 적대 입력 등) 예외 대신 {@code null} 을 반환한다. 호출자 (응답 매핑) 는 결과를 그대로 응답에 넣고, 결과가 null 이면 응답의 url
     * 필드도 null 로 내려간다. 운영자는 구현체 로그(WARN) 양으로 stale 데이터 / 변조 가능성을 모니터링한다.
     *
     * @param stored {@link #upload} 가 반환했던, 그리고 DB 에 저장된 식별자
     * @return 클라이언트가 그대로 GET 할 수 있는 URL, 또는 stored 가 구현체 형식이 아닐 때 {@code null}
     */
    default String toPublicUrl(String stored) {
        return stored;
    }

    /**
     * 저장된 이미지를 제거한다. 파일이 존재하지 않으면 조용히 무시한다.
     *
     * @param stored {@link #upload} 가 반환했던 식별자
     */
    void delete(String stored);
}
