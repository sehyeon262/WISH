package com.comong.backend.domain.user.entity;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/** 빌더 필수 필드 검증 (S14P31E103-225). JPA save 까지 가지 않고 build 시점에 fail-fast 하는지 확인. 컨벤션 §5 참고. */
class UserTest {

    @Test
    void builder_rejectsNullEmail() {
        assertThatThrownBy(
                        () ->
                                User.builder()
                                        .email(null)
                                        .nickname("nick")
                                        .password("hashed")
                                        .build())
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining("email");
    }

    @Test
    void builder_rejectsNullNickname() {
        assertThatThrownBy(
                        () ->
                                User.builder()
                                        .email("a@b.com")
                                        .nickname(null)
                                        .password("hashed")
                                        .build())
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining("nickname");
    }

    @Test
    void builder_rejectsNullPassword() {
        assertThatThrownBy(
                        () ->
                                User.builder()
                                        .email("a@b.com")
                                        .nickname("nick")
                                        .password(null)
                                        .build())
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining("password");
    }
}
