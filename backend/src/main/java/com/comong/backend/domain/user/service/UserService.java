package com.comong.backend.domain.user.service;

import java.util.List;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.user.dto.AdminUserResponse;
import com.comong.backend.domain.user.dto.UserResponse;
import com.comong.backend.domain.user.entity.User;
import com.comong.backend.domain.user.entity.UserRole;
import com.comong.backend.domain.user.exception.UserErrorCode;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.global.exception.BusinessException;

import lombok.RequiredArgsConstructor;

/**
 * User 도메인 유스케이스.
 *
 * <p>User 의 생명주기 중 '조회/수정/삭제' 를 담당한다. 계정 생성(회원가입)은 인증 영역이므로 {@code AuthService} 가 본 서비스의 {@link
 * #create(String, String, String)} 을 호출해 수행한다. 비밀번호 암호화는 호출 측 책임.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class UserService {

    private final UserRepository userRepository;
    private final PatientProfileRepository patientProfileRepository;

    /** User 엔티티의 unique 제약 이름. {@code User} 의 {@code @UniqueConstraint} 와 반드시 일치해야 한다. */
    private static final String UK_USERS_EMAIL = "uk_users_email";

    private static final String UK_USERS_NICKNAME = "uk_users_nickname";

    /**
     * 새 User 생성. 이메일/닉네임 중복 검사 후 저장. 비밀번호는 이미 암호화된 값이어야 한다 (평문 금지).
     *
     * <p>동시성 race 대응: pre-check({@code existsByEmail/Nickname}) 와 {@code save} 사이에는 race 가 존재한다. 최종
     * 방어는 DB unique 제약이 담당하며, 두 번째 요청이 받게 되는 {@link DataIntegrityViolationException} 의 cause 에서
     * constraint name 을 꺼내 중복 에러코드로 매핑한다.
     *
     * <p>왜 catch 안에서 재조회(existsByEmail 등)를 하지 않나: PostgreSQL 은 트랜잭션 내 statement 가 실패하면 해당 트랜잭션 전체가
     * aborted 상태가 되어, 이후 같은 트랜잭션에서 던지는 모든 쿼리가 실패한다. 따라서 재조회는 작동하지 않는다. 대신 예외의 metadata (constraint
     * name) 로 판별한다.
     *
     * <p>pre-check 는 흔한 중복 케이스를 DB 제약 위반 없이 빠르게 차단하는 UX 용으로 유지.
     *
     * @throws BusinessException {@link UserErrorCode#EMAIL_DUPLICATED} / {@link
     *     UserErrorCode#NICKNAME_DUPLICATED}
     */
    @Transactional
    public UserResponse create(String email, String nickname, String encodedPassword) {
        if (userRepository.existsByEmail(email)) {
            throw new BusinessException(UserErrorCode.EMAIL_DUPLICATED);
        }
        if (userRepository.existsByNickname(nickname)) {
            throw new BusinessException(UserErrorCode.NICKNAME_DUPLICATED);
        }
        try {
            User saved =
                    userRepository.save(
                            User.builder()
                                    .email(email)
                                    .nickname(nickname)
                                    .password(encodedPassword)
                                    .build());
            return UserResponse.from(saved);
        } catch (DataIntegrityViolationException e) {
            throw mapConstraintViolation(e);
        }
    }

    /**
     * unique 제약 위반을 에러코드로 매핑.
     *
     * <p>{@link DataIntegrityViolationException} 은 Spring 이 감싼 상위 타입이고, 실제 constraint 정보는 Hibernate
     * 의 {@link ConstraintViolationException} cause 에 담겨 있다. constraint name 이 추출되지 않거나 우리가 정의한 제약이
     * 아니면 원본 예외를 그대로 던져 500 으로 로깅·추적되게 한다.
     */
    private RuntimeException mapConstraintViolation(DataIntegrityViolationException e) {
        String constraintName = null;
        for (Throwable cause = e.getCause(); cause != null; cause = cause.getCause()) {
            if (cause instanceof ConstraintViolationException cve) {
                constraintName = cve.getConstraintName();
                break;
            }
        }
        if (constraintName != null) {
            if (UK_USERS_EMAIL.equalsIgnoreCase(constraintName)) {
                return new BusinessException(UserErrorCode.EMAIL_DUPLICATED);
            }
            if (UK_USERS_NICKNAME.equalsIgnoreCase(constraintName)) {
                return new BusinessException(UserErrorCode.NICKNAME_DUPLICATED);
            }
        }
        return e;
    }

    public UserResponse getUser(Long id) {
        User user =
                userRepository
                        .findById(id)
                        .orElseThrow(() -> new BusinessException(UserErrorCode.USER_NOT_FOUND));
        return UserResponse.from(user);
    }

    public List<AdminUserResponse> findAllUsers() {
        var patientProfilesByUserId =
                patientProfileRepository.findAllWithUser().stream()
                        .collect(
                                Collectors.toMap(
                                        profile -> profile.getUser().getId(), Function.identity()));
        return userRepository.findAll(Sort.by(Sort.Direction.DESC, "createdAt")).stream()
                .map(
                        user ->
                                AdminUserResponse.from(
                                        user, patientProfilesByUserId.get(user.getId())))
                .toList();
    }

    /**
     * 이메일로 User 엔티티 조회 (존재하지 않으면 빈 Optional). 로그인 등 "존재 여부 자체가 민감한" 흐름에서 호출 측이 자체 에러코드로 변환하기 위함. 일반
     * 조회는 {@link #getUser(Long)} 사용.
     */
    public Optional<User> findEntityByEmail(String email) {
        return userRepository.findByEmail(email);
    }

    /**
     * ID 로 User 엔티티 조회. 다른 도메인(PatientProfile 등)에서 FK 연관관계를 맺기 위해 엔티티 레퍼런스가 필요할 때 사용한다. DTO 반환이 필요한
     * 일반 조회는 {@link #getUser(Long)} 을 쓴다.
     */
    public Optional<User> findEntityById(Long id) {
        return userRepository.findById(id);
    }

    /**
     * 사용자 권한을 ADMIN ↔ USER 로 변경한다. 운영 콘솔의 권한 토글 화면에서 호출.
     *
     * <p>가드:
     *
     * <ul>
     *   <li>본인 강등/승격 금지 — 자기 자신을 잘못 강등해 콘솔에서 잠겨버리는 사고 방지.
     *   <li>마지막 ADMIN 강등 금지 — 시스템 전체에 ADMIN 이 0 명이 되는 상황 방지.
     * </ul>
     *
     * 같은 role 로의 변경은 no-op 으로 통과시키되, DTO 는 최신 상태로 돌려준다. 트랜잭션 경계 내에서 dirty checking 으로 반영된다.
     */
    @Transactional
    public UserResponse changeRole(Long actorUserId, Long targetUserId, UserRole nextRole) {
        if (actorUserId != null && actorUserId.equals(targetUserId)) {
            throw new BusinessException(UserErrorCode.CANNOT_CHANGE_OWN_ROLE);
        }
        User target =
                userRepository
                        .findById(targetUserId)
                        .orElseThrow(() -> new BusinessException(UserErrorCode.USER_NOT_FOUND));
        if (target.getRole() == nextRole) {
            return UserResponse.from(target);
        }
        if (nextRole == UserRole.USER && target.getRole() == UserRole.ADMIN) {
            long adminCount = userRepository.countByRole(UserRole.ADMIN);
            if (adminCount <= 1) {
                throw new BusinessException(UserErrorCode.LAST_ADMIN_DEMOTION_FORBIDDEN);
            }
            target.demoteToUser();
        } else if (nextRole == UserRole.ADMIN) {
            target.promoteToAdmin();
        }
        return UserResponse.from(target);
    }
}
