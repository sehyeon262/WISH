package com.comong.backend.domain.patient.entity;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import com.comong.backend.domain.user.entity.User;

/** 빌더 필수 필드 검증 (S14P31E103-225). JPA save 까지 가지 않고 build 시점에 fail-fast 하는지 확인. 컨벤션 §5 참고. */
class PatientProfileTest {

    @Test
    void builder_rejectsNullUser() {
        assertThatThrownBy(
                        () ->
                                PatientProfile.builder()
                                        .user(null)
                                        .name("이름")
                                        .nickname("닉네임")
                                        .birthDate(LocalDate.of(2020, 1, 1))
                                        .gender(Gender.MALE)
                                        .build())
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining("user");
    }

    @Test
    void builder_rejectsNullBirthDate() {
        assertThatThrownBy(
                        () ->
                                PatientProfile.builder()
                                        .user(mock(User.class))
                                        .name("이름")
                                        .nickname("닉네임")
                                        .birthDate(null)
                                        .gender(Gender.MALE)
                                        .build())
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining("birthDate");
    }

    @Test
    void builder_rejectsNullGender() {
        assertThatThrownBy(
                        () ->
                                PatientProfile.builder()
                                        .user(mock(User.class))
                                        .name("이름")
                                        .nickname("닉네임")
                                        .birthDate(LocalDate.of(2020, 1, 1))
                                        .gender(null)
                                        .build())
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining("gender");
    }
}
