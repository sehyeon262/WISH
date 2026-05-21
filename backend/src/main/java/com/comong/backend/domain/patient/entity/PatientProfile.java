package com.comong.backend.domain.patient.entity;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import com.comong.backend.domain.user.entity.User;

import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@Table(
        name = "patient_profiles",
        uniqueConstraints = {
            // 보호자 1명당 환자 1명 정책을 DB 레벨에서 강제. 서비스 선검사와의 race 를 차단한다.
            // 위반 시 DataIntegrityViolationException 의 cause 에서 이 이름을 꺼내 P-002 로 매핑한다
            // (PatientProfileService.create 참고).
            @UniqueConstraint(name = "uk_patient_profiles_user_id", columnNames = "user_id")
        })
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PatientProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // user_id 는 보호자 역할의 User 만 참조한다. 의료진/관리자 역할이 추후 추가되면
    // 이 컬럼을 guardian_id 로 rename 하거나 역할 제약을 서비스 계층에서 강화한다.
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 50)
    private String name;

    @Column(nullable = false, length = 30)
    private String nickname;

    @Column(name = "birth_date", nullable = false)
    private LocalDate birthDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Gender gender;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private PatientProfile(
            User user, String name, String nickname, LocalDate birthDate, Gender gender) {
        // 빌더 단계 invariant — @ManyToOne(optional=false) / @Column(nullable=false) 만으로는 build()
        // 시점에 null 차단이 안 되므로 fail-fast 로 강제.
        this.user = Objects.requireNonNull(user, "user must not be null");
        this.name = Objects.requireNonNull(name, "name must not be null");
        this.nickname = Objects.requireNonNull(nickname, "nickname must not be null");
        this.birthDate = Objects.requireNonNull(birthDate, "birthDate must not be null");
        this.gender = Objects.requireNonNull(gender, "gender must not be null");
    }

    @PrePersist
    void prePersist() {
        this.createdAt = LocalDateTime.now();
    }

    /** PATCH 시맨틱: {@code null} 인 인자는 "변경 없음" 으로 간주하고 기존 값을 유지한다. */
    public void update(String name, String nickname, LocalDate birthDate, Gender gender) {
        if (name != null) {
            this.name = name;
        }
        if (nickname != null) {
            this.nickname = nickname;
        }
        if (birthDate != null) {
            this.birthDate = birthDate;
        }
        if (gender != null) {
            this.gender = gender;
        }
    }
}
