package com.comong.backend.domain.patient.dto;

import java.time.LocalDate;

import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Size;

import com.comong.backend.domain.patient.entity.Gender;

/**
 * 환자 프로필 부분 수정 요청. PATCH 시맨틱에 따라 모든 필드는 optional 이며, {@code null} 은 "변경 없음" 을 의미한다. 필드가 제시되었을 때만 값
 * 제약을 검증한다 (빈 문자열로 덮어쓰는 것을 막기 위해 {@code @Size} 의 min=1 을 둔다).
 */
public record PatientProfileUpdateRequest(
        @Size(min = 1, max = 50) String name,
        @Size(min = 1, max = 30) String nickname,
        @Past LocalDate birthDate,
        Gender gender) {}
