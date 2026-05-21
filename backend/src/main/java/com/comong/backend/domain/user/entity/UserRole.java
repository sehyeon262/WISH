package com.comong.backend.domain.user.entity;

/**
 * 사용자 역할.
 *
 * <p>{@code @PreAuthorize("hasRole('ADMIN')")} 와 매칭되는 권한 명칭은 Spring Security 관례에 따라 {@code
 * ROLE_<enum_name>} 으로 부여된다 ({@link com.comong.backend.global.security.JwtAuthenticationFilter}
 * 참고).
 *
 * <p>의료진 등 새로운 역할이 추가되면 enum 에 항목을 더하고, 다중 role 이 필요해지면 별도 매핑 테이블 도입을 검토한다 ({@code
 * backend/docs/guardian-patient.md} 6.2 참고).
 */
public enum UserRole {
    USER,
    ADMIN
}
