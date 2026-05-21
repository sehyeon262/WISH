package com.comong.backend.domain.artwork.service;

import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;

import com.comong.backend.domain.artwork.entity.Artwork;
import com.comong.backend.domain.artwork.exception.ArtworkErrorCode;
import com.comong.backend.global.exception.BusinessException;

class ArtworkAccessCheckerTest {

    private final ArtworkAccessChecker checker = new ArtworkAccessChecker();

    @Test
    void publicArtworkIsReadableByAnyone() {
        Artwork artwork = publicArtwork();

        assertThatNoException().isThrownBy(() -> checker.verifyReadable(artwork, 1L));
        assertThatNoException().isThrownBy(() -> checker.verifyReadable(artwork, 999L));
        assertThatNoException().isThrownBy(() -> checker.verifyReadable(artwork, null));
    }

    @Test
    void privateArtworkIsReadableOnlyByOwner() {
        Artwork artwork = privateArtworkOwnedBy(1L);

        assertThatNoException().isThrownBy(() -> checker.verifyReadable(artwork, 1L));

        // 권한 없을 때 ID 존재 노출 안 하려고 NOT_FOUND (404)
        assertThatThrownBy(() -> checker.verifyReadable(artwork, 2L))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ArtworkErrorCode.ARTWORK_NOT_FOUND);
        assertThatThrownBy(() -> checker.verifyReadable(artwork, null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ArtworkErrorCode.ARTWORK_NOT_FOUND);
    }

    @Test
    void rejectsNullArtwork() {
        // 호출자가 NOT_FOUND 처리하지 않고 null 을 넘긴 경우 — 빠른 실패
        assertThatThrownBy(() -> checker.verifyReadable(null, 1L))
                .isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> checker.verifyOwner(null, 1L))
                .isInstanceOf(NullPointerException.class);
    }

    @Test
    void onlyOwnerCanModifyOrDelete() {
        // 공개 작품이라도 수정/삭제는 작성자만
        Artwork artwork = publicArtworkOwnedBy(1L);

        assertThatNoException().isThrownBy(() -> checker.verifyOwner(artwork, 1L));

        assertThatThrownBy(() -> checker.verifyOwner(artwork, 2L))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ArtworkErrorCode.ARTWORK_ACCESS_DENIED);
        assertThatThrownBy(() -> checker.verifyOwner(artwork, null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ArtworkErrorCode.ARTWORK_ACCESS_DENIED);
    }

    private Artwork publicArtwork() {
        Artwork artwork = mock(Artwork.class);
        when(artwork.isPublic()).thenReturn(true);
        return artwork;
    }

    private Artwork privateArtworkOwnedBy(long ownerId) {
        Artwork artwork = mock(Artwork.class);
        when(artwork.isPublic()).thenReturn(false);
        when(artwork.isOwnedBy(ownerId)).thenReturn(true);
        // null/다른 id 는 default false
        return artwork;
    }

    private Artwork publicArtworkOwnedBy(long ownerId) {
        Artwork artwork = mock(Artwork.class);
        // verifyOwner 는 isPublic 을 보지 않지만, 테스트 시그널 명확화를 위해 stub
        lenient().when(artwork.isPublic()).thenReturn(true);
        when(artwork.isOwnedBy(ownerId)).thenReturn(true);
        return artwork;
    }
}
