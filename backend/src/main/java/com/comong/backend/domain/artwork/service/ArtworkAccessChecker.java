package com.comong.backend.domain.artwork.service;

import java.util.Objects;

import org.springframework.stereotype.Component;

import com.comong.backend.domain.artwork.entity.Artwork;
import com.comong.backend.domain.artwork.exception.ArtworkErrorCode;
import com.comong.backend.global.exception.BusinessException;

/**
 * Artwork 도메인의 접근 권한 체크 컴포넌트.
 *
 * <p>권한 규칙:
 *
 * <ul>
 *   <li><b>읽기</b> (단건 조회 등): 공개 작품은 누구나(비로그인 포함), 비공개 작품은 작성자({@code artwork.patientProfile.user})
 *       만
 *   <li><b>쓰기</b> (수정/삭제): 공개 여부와 무관하게 작성자만
 * </ul>
 *
 * <p>현재 사용자 식별은 호출자가 책임지고 {@code currentUserId} 인자로 전달한다 (비로그인은 {@code null}). 본 컴포넌트는 권한 위반 시
 * {@code BusinessException(ArtworkErrorCode.ARTWORK_ACCESS_DENIED)} 을 던지고, 이는
 * GlobalExceptionHandler 가 403 응답으로 매핑한다.
 *
 * <p>currentUserId 추출 방식 (SecurityContext 에서 꺼내는 헬퍼 또는 {@code @AuthenticationPrincipal} 커스텀 어노테이션)
 * 은 S14P31E103-218 작업 시 결정한다.
 */
@Component
public class ArtworkAccessChecker {

    /**
     * 작품 조회 권한 체크. 권한 없을 때 ID 존재 사실 자체를 노출하지 않으려고 NOT_FOUND (404) 로 응답 (PatientProfileService 와 같은
     * 보안 패턴).
     *
     * @param artwork 대상 작품, null 이면 NullPointerException — 호출자가 사전에 NOT_FOUND 처리하고 와야 함
     * @param currentUserId 인증 사용자 id, 비로그인이면 {@code null}
     * @throws NullPointerException artwork 가 null 일 때 — 권한 체크 단계에 도달하기 전 작품 존재 여부를 검증할 책임은 호출자에 있음
     * @throws BusinessException ARTWORK_NOT_FOUND — 비공개 작품을 작성자가 아닌 사람이 조회하려 할 때
     */
    public void verifyReadable(Artwork artwork, Long currentUserId) {
        Objects.requireNonNull(artwork, "artwork must not be null");
        if (artwork.isPublic()) {
            return;
        }
        if (!artwork.isOwnedBy(currentUserId)) {
            throw new BusinessException(ArtworkErrorCode.ARTWORK_NOT_FOUND);
        }
    }

    /**
     * 작품 수정/삭제 권한 체크. 공개 여부와 무관하게 작성자만 허용.
     *
     * @param artwork 대상 작품, null 이면 NullPointerException — 호출자가 사전에 NOT_FOUND 처리하고 와야 함
     * @param currentUserId 인증 사용자 id, 비로그인이면 {@code null}
     * @throws NullPointerException artwork 가 null 일 때
     * @throws BusinessException FORBIDDEN — 작성자가 아니거나 비로그인 상태
     */
    public void verifyOwner(Artwork artwork, Long currentUserId) {
        Objects.requireNonNull(artwork, "artwork must not be null");
        if (!artwork.isOwnedBy(currentUserId)) {
            throw new BusinessException(ArtworkErrorCode.ARTWORK_ACCESS_DENIED);
        }
    }
}
