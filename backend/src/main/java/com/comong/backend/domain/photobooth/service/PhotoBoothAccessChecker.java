package com.comong.backend.domain.photobooth.service;

import java.util.Objects;

import org.springframework.stereotype.Component;

import com.comong.backend.domain.photobooth.entity.PhotoBoothPhoto;
import com.comong.backend.domain.photobooth.exception.PhotoBoothErrorCode;
import com.comong.backend.global.exception.BusinessException;

/**
 * PhotoBooth 도메인의 접근 권한 체크 컴포넌트.
 *
 * <p>권한 규칙:
 *
 * <ul>
 *   <li><b>읽기</b> (단건 조회 등): 공개 사진은 누구나(비로그인 포함), 비공개 사진은 작성자({@code photo.patientProfile.user}) 만
 *   <li><b>쓰기</b> (수정/삭제): 공개 여부와 무관하게 작성자만
 * </ul>
 *
 * <p>현재 사용자 식별은 호출자가 책임지고 {@code currentUserId} 인자로 전달 (비로그인은 {@code null}). artwork AccessChecker
 * 와 동일한 패턴 — 비공개 사진을 비소유자가 조회 시 NOT_FOUND (enumeration 방지).
 */
@Component
public class PhotoBoothAccessChecker {

    /**
     * 사진 조회 권한 체크. 권한 없을 때 ID 존재 사실 자체를 노출하지 않으려고 NOT_FOUND 로 응답 (artwork 와 동일 보안 패턴).
     *
     * @param photo 대상 사진, null 이면 NullPointerException — 호출자가 사전에 NOT_FOUND 처리하고 와야 함
     * @param currentUserId 인증 사용자 id, 비로그인이면 {@code null}
     * @throws BusinessException PHOTO_BOOTH_NOT_FOUND — 비공개 사진을 작성자가 아닌 사람이 조회하려 할 때
     */
    public void verifyReadable(PhotoBoothPhoto photo, Long currentUserId) {
        Objects.requireNonNull(photo, "photo must not be null");
        if (photo.isPublic()) {
            return;
        }
        if (!photo.isOwnedBy(currentUserId)) {
            throw new BusinessException(PhotoBoothErrorCode.PHOTO_BOOTH_NOT_FOUND);
        }
    }

    /**
     * 사진 수정/삭제 권한 체크. 공개 여부와 무관하게 작성자만 허용.
     *
     * @throws BusinessException PHOTO_BOOTH_ACCESS_DENIED — 작성자가 아니거나 비로그인 상태
     */
    public void verifyOwner(PhotoBoothPhoto photo, Long currentUserId) {
        Objects.requireNonNull(photo, "photo must not be null");
        if (!photo.isOwnedBy(currentUserId)) {
            throw new BusinessException(PhotoBoothErrorCode.PHOTO_BOOTH_ACCESS_DENIED);
        }
    }
}
