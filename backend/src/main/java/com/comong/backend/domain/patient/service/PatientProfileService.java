package com.comong.backend.domain.patient.service;

import java.util.List;
import java.util.Optional;

import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.patient.dto.PatientProfileCreateRequest;
import com.comong.backend.domain.patient.dto.PatientProfileResponse;
import com.comong.backend.domain.patient.dto.PatientProfileUpdateRequest;
import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.exception.PatientErrorCode;
import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.user.entity.User;
import com.comong.backend.domain.user.exception.UserErrorCode;
import com.comong.backend.domain.user.service.UserService;
import com.comong.backend.global.exception.BusinessException;

import lombok.RequiredArgsConstructor;

/**
 * 환자 프로필 유스케이스 (등록/조회/수정).
 *
 * <p>소유 관계: 모든 조회/등록/수정은 인증된 보호자 계정(User) 기준으로 필터링한다. URL 네스팅 대신 principal 로 소유자를 결정한다.
 *
 * <p>MVP 제약: 보호자 당 환자 프로필은 1개로 제한한다. {@code existsByUserId} 선검사는 빠른 실패용 UX 이고, 최종 invariant 는 DB
 * unique 제약({@code uk_patient_profiles_user_id}) 이 보장한다. 정책이 1:N 으로 열리는 시점에 unique 드랍 + 응답 DTO/UX
 * 변경을 같이 진행한다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PatientProfileService {

    /** PatientProfile 의 unique 제약 이름. {@code @UniqueConstraint} 와 반드시 일치해야 한다. */
    private static final String UK_PATIENT_PROFILES_USER_ID = "uk_patient_profiles_user_id";

    private final PatientProfileRepository patientProfileRepository;
    private final UserService userService;

    /**
     * 환자 프로필 생성.
     *
     * <p>동시성 race 대응: pre-check({@code existsByUserId}) 와 {@code save} 사이에는 race 가 존재한다 (같은 보호자의 두
     * 번 POST 더블탭 등). 최종 방어는 DB unique 제약({@code uk_patient_profiles_user_id}) 이 담당하며, 두 번째 요청이 받게
     * 되는 {@link DataIntegrityViolationException} 의 cause 에서 constraint name 을 꺼내 {@link
     * PatientErrorCode#PATIENT_PROFILE_ALREADY_EXISTS} 로 매핑한다. 119/121 회원가입 race 와 동일 패턴.
     */
    @Transactional
    public PatientProfileResponse create(Long userId, PatientProfileCreateRequest request) {
        if (patientProfileRepository.existsByUserId(userId)) {
            throw new BusinessException(PatientErrorCode.PATIENT_PROFILE_ALREADY_EXISTS);
        }
        User user =
                userService
                        .findEntityById(userId)
                        .orElseThrow(() -> new BusinessException(UserErrorCode.USER_NOT_FOUND));
        try {
            PatientProfile saved =
                    patientProfileRepository.save(
                            PatientProfile.builder()
                                    .user(user)
                                    .name(request.name())
                                    .nickname(request.nickname())
                                    .birthDate(request.birthDate())
                                    .gender(request.gender())
                                    .build());
            return PatientProfileResponse.from(saved);
        } catch (DataIntegrityViolationException e) {
            throw mapConstraintViolation(e);
        }
    }

    /**
     * unique 제약 위반을 에러코드로 매핑.
     *
     * <p>{@link DataIntegrityViolationException} 은 Spring 이 감싼 상위 타입이고, 실제 constraint 정보는 Hibernate
     * 의 {@link ConstraintViolationException} cause 에 담겨 있다. 우리가 정의한 제약이 아니면 원본 예외를 그대로 던져 500 으로
     * 로깅·추적되게 한다.
     */
    private RuntimeException mapConstraintViolation(DataIntegrityViolationException e) {
        for (Throwable cause = e.getCause(); cause != null; cause = cause.getCause()) {
            if (cause instanceof ConstraintViolationException cve
                    && UK_PATIENT_PROFILES_USER_ID.equalsIgnoreCase(cve.getConstraintName())) {
                return new BusinessException(PatientErrorCode.PATIENT_PROFILE_ALREADY_EXISTS);
            }
        }
        return e;
    }

    public List<PatientProfileResponse> findMine(Long userId) {
        return patientProfileRepository.findAllByUserId(userId).stream()
                .map(PatientProfileResponse::from)
                .toList();
    }

    /**
     * 보호자 user 의 환자 프로필 entity 직접 반환 — artwork 등 다른 도메인 service 가 PatientProfile 을 외래키 대상으로 필요할 때
     * 사용.
     *
     * <p>현재 1:1 정책이므로 첫 번째 결과를 반환. 1:N 으로 정책 변경 시 호출 측이 patientProfileId 를 직접 받도록 흐름이 바뀌어야 한다.
     */
    public Optional<PatientProfile> findEntityByUserId(Long userId) {
        return patientProfileRepository.findAllByUserId(userId).stream().findFirst();
    }

    public PatientProfileResponse findOne(Long userId, Long profileId) {
        return PatientProfileResponse.from(findOwnedOrThrow(userId, profileId));
    }

    /**
     * 부분 수정. 존재하지 않거나 본인 소유가 아닌 경우 모두 404. 요청 필드가 {@code null} 이면 해당 필드는 기존 값을 유지한다 (PATCH 시맨틱). 변경
     * 감지로 flush.
     */
    @Transactional
    public PatientProfileResponse update(
            Long userId, Long profileId, PatientProfileUpdateRequest request) {
        PatientProfile profile = findOwnedOrThrow(userId, profileId);
        profile.update(request.name(), request.nickname(), request.birthDate(), request.gender());
        return PatientProfileResponse.from(profile);
    }

    /**
     * 존재하지 않거나 본인 소유가 아닌 경우 모두 404. 403 을 반환하면 "ID 는 존재한다" 는 사실이 유출되어 순차 PK 를 enumerate 하는 공격자에게 ID
     * 공간 밀도를 알려줄 수 있기 때문.
     */
    public PatientProfile findOwnedOrThrow(Long userId, Long profileId) {
        return patientProfileRepository
                .findById(profileId)
                .filter(p -> p.getUser().getId().equals(userId))
                .orElseThrow(
                        () -> new BusinessException(PatientErrorCode.PATIENT_PROFILE_NOT_FOUND));
    }
}
