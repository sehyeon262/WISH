package com.comong.backend.domain.patient.dto;

import java.time.LocalDate;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Size;

import com.comong.backend.domain.patient.entity.Gender;

public record PatientProfileCreateRequest(
        @NotBlank @Size(max = 50) String name,
        @NotBlank @Size(max = 30) String nickname,
        @NotNull @Past LocalDate birthDate,
        @NotNull Gender gender) {}
