package com.comong.backend.domain.artwork.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;

import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.user.entity.User;

/**
 * {@link Artwork#isOwnedBy(Long)} 의 실제 navigation 로직을 검증한다 — {@link
 * com.comong.backend.domain.artwork.service.ArtworkAccessCheckerTest} 가 mock 으로 isOwnedBy 반환만 stub
 * 하므로, 본 테스트가 patientProfile→user→id 체인 탐색 자체를 커버한다.
 */
class ArtworkTest {

    @Test
    void isOwnedBy_matchesByPatientProfileUserId() {
        Artwork artwork = artworkOwnedByUserId(1L);

        assertThat(artwork.isOwnedBy(1L)).isTrue();
        assertThat(artwork.isOwnedBy(2L)).isFalse();
    }

    @Test
    void isOwnedBy_returnsFalseForNullUserId() {
        Artwork artwork = artworkOwnedByUserId(1L);

        assertThat(artwork.isOwnedBy(null)).isFalse();
    }

    @Test
    void builder_rejectsNullPatientProfile() {
        // 225 후속: 빌더에서 fail-fast — JPA save 까지 가기 전에 NPE.
        assertThatThrownBy(
                        () ->
                                Artwork.builder()
                                        .patientProfile(null)
                                        .sketchCode(1)
                                        .imageUrl("/api/v1/uploads/x.png")
                                        .playDurationSeconds(0)
                                        .isPublic(false)
                                        .build())
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining("patientProfile");
    }

    @Test
    void builder_acceptsNullSketchCode() {
        // V5 (231) 후속: 자유 그리기 (밑그림 없는 작품) 케이스 지원 위해 sketchCode 는 nullable.
        // 225 의 fail-fast 대상에서 제외되었으므로 null 빌드가 정상 통과해야 함.
        PatientProfile profile = mock(PatientProfile.class);
        Artwork artwork =
                Artwork.builder()
                        .patientProfile(profile)
                        .sketchCode(null)
                        .imageUrl("/api/v1/uploads/x.png")
                        .playDurationSeconds(0)
                        .isPublic(false)
                        .build();

        assertThat(artwork.getSketchCode()).isNull();
    }

    @Test
    void builder_rejectsNullImageUrl() {
        PatientProfile profile = mock(PatientProfile.class);
        assertThatThrownBy(
                        () ->
                                Artwork.builder()
                                        .patientProfile(profile)
                                        .sketchCode(1)
                                        .imageUrl(null)
                                        .playDurationSeconds(0)
                                        .isPublic(false)
                                        .build())
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining("imageUrl");
    }

    @Test
    void builder_rejectsNegativePlayDuration() {
        PatientProfile profile = mock(PatientProfile.class);
        assertThatThrownBy(
                        () ->
                                Artwork.builder()
                                        .patientProfile(profile)
                                        .sketchCode(1)
                                        .imageUrl("/api/v1/uploads/x.png")
                                        .playDurationSeconds(-1)
                                        .colorCount(0)
                                        .isPublic(false)
                                        .build())
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void builder_rejectsNegativeColorCount() {
        // 615: 도안 팔레트 크기에 따라 상한이 달라 음수만 차단.
        PatientProfile profile = mock(PatientProfile.class);
        assertThatThrownBy(
                        () ->
                                Artwork.builder()
                                        .patientProfile(profile)
                                        .sketchCode(1)
                                        .imageUrl("/api/v1/uploads/x.png")
                                        .playDurationSeconds(0)
                                        .colorCount(-1)
                                        .isPublic(false)
                                        .build())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("색 개수");
    }

    @Test
    void update_replacesColorCountAbsoluteValue() {
        // 615: colorCount 는 누적이 아닌 절대값 교체 (FE 가 캔버스 전체 스캔해서 보냄).
        PatientProfile profile = mock(PatientProfile.class);
        Artwork artwork =
                Artwork.builder()
                        .patientProfile(profile)
                        .sketchCode(1)
                        .imageUrl("/api/v1/uploads/x.png")
                        .playDurationSeconds(0)
                        .colorCount(3)
                        .isPublic(false)
                        .build();

        artwork.update(null, 7);

        assertThat(artwork.getColorCount()).isEqualTo(7);
    }

    @Test
    void update_keepsColorCountWhenNull() {
        // PATCH 시맨틱 — null 이면 변경 없음.
        PatientProfile profile = mock(PatientProfile.class);
        Artwork artwork =
                Artwork.builder()
                        .patientProfile(profile)
                        .sketchCode(1)
                        .imageUrl("/api/v1/uploads/x.png")
                        .playDurationSeconds(0)
                        .colorCount(3)
                        .isPublic(false)
                        .build();

        artwork.update(true, null);

        assertThat(artwork.getColorCount()).isEqualTo(3);
        assertThat(artwork.isPublic()).isTrue();
    }

    @Test
    void update_rejectsNegativeColorCount() {
        PatientProfile profile = mock(PatientProfile.class);
        Artwork artwork =
                Artwork.builder()
                        .patientProfile(profile)
                        .sketchCode(1)
                        .imageUrl("/api/v1/uploads/x.png")
                        .playDurationSeconds(0)
                        .colorCount(0)
                        .isPublic(false)
                        .build();

        assertThatThrownBy(() -> artwork.update(null, -1))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("색 개수");
    }

    @Test
    void isOwnedBy_returnsFalseWhenPatientProfileUserMissing() {
        PatientProfile profileWithoutUser = mock(PatientProfile.class);
        when(profileWithoutUser.getUser()).thenReturn(null);

        Artwork artwork =
                Artwork.builder()
                        .patientProfile(profileWithoutUser)
                        .sketchCode(1)
                        .imageUrl("/api/v1/uploads/x.png")
                        .playDurationSeconds(0)
                        .isPublic(false)
                        .build();

        assertThat(artwork.isOwnedBy(1L)).isFalse();
    }

    private Artwork artworkOwnedByUserId(long userId) {
        User user = mock(User.class);
        when(user.getId()).thenReturn(userId);
        PatientProfile profile = mock(PatientProfile.class);
        when(profile.getUser()).thenReturn(user);

        return Artwork.builder()
                .patientProfile(profile)
                .sketchCode(1)
                .imageUrl("/api/v1/uploads/x.png")
                .playDurationSeconds(0)
                .isPublic(false)
                .build();
    }
}
