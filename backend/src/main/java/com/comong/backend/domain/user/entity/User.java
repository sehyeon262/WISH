package com.comong.backend.domain.user.entity;

import java.time.LocalDateTime;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 로그인 주체인 보호자 계정. MVP 에서는 User ≡ Guardian 이며, 실제 게임 플레이 대상자(아동)는 {@code PatientProfile} 로 분리해
 * {@code patient_profiles.user_id} 로 참조한다. 의료진/관리자 역할이 추후 추가되면 role 컬럼을 도입하거나 별도 테이블로 확장한다.
 */
@Entity
@Getter
@Table(
        name = "users",
        uniqueConstraints = {
            // 제약 이름을 명시적으로 부여한다. 회원가입 race 로 unique 위반이 발생했을 때
            // DataIntegrityViolationException 의 cause 에서 constraint name 을 꺼내
            // 어느 컬럼 제약인지 식별하는 데 사용된다 (UserService.create 참고).
            @UniqueConstraint(name = "uk_users_email", columnNames = "email"),
            @UniqueConstraint(name = "uk_users_nickname", columnNames = "nickname")
        })
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String email;

    @Column(nullable = false, length = 30)
    private String nickname;

    /** BCrypt 해시된 비밀번호. 평문은 절대 저장하지 않는다. */
    @Column(nullable = false, length = 100)
    private String password;

    /**
     * 사용자 역할. 회원가입은 항상 {@link UserRole#USER} 로 생성되고, ADMIN 부여는 운영자가 환경별 DB 에 직접 SQL 을 실행하는 방식만 인정한다
     * ({@code backend/docs/admin-bootstrap.md} 참고). 도메인 메서드 {@link #promoteToAdmin()} 은 향후 admin UI
     * 또는 테스트 fixture 에서만 사용된다.
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private UserRole role;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private User(String email, String nickname, String password, UserRole role) {
        // 빌더 단계 invariant: @Column(nullable = false) 만으로는 build() 시점에 null 이 차단되지 않고
        // JPA save 단계의 PropertyValueException 으로 늦게 발견된다. 도메인 객체는 항상 유효한 상태로 만들어지도록
        // fail-fast.
        this.email = Objects.requireNonNull(email, "email must not be null");
        this.nickname = Objects.requireNonNull(nickname, "nickname must not be null");
        this.password = Objects.requireNonNull(password, "password must not be null");
        // role 은 빌더에서 생략 가능 — 기본 USER. 호출자가 명시하면 그 값을 따른다.
        this.role = role != null ? role : UserRole.USER;
    }

    @PrePersist
    void prePersist() {
        this.createdAt = LocalDateTime.now();
    }

    /**
     * 사용자를 ADMIN 으로 승격한다. 운영 콘솔(WISH Admin)의 권한 변경 화면 또는 테스트 fixture 에서 사용한다. 이미 ADMIN 이면 호출자가 미리
     * 걸러내는 것이 일반적. 본인 강등 / 마지막 ADMIN 강등 가드는 {@code UserService.changeRole} 에서 수행한다.
     */
    public void promoteToAdmin() {
        this.role = UserRole.ADMIN;
    }

    /**
     * ADMIN 사용자를 일반 USER 로 강등한다. 본 메서드는 도메인 invariant 만 다루며, "본인 강등 금지", "마지막 ADMIN 강등 금지" 같은 정책은
     * 호출 측({@code UserService.changeRole})이 책임진다.
     */
    public void demoteToUser() {
        this.role = UserRole.USER;
    }
}
