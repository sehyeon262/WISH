package com.comong.backend.domain.quiz.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 코드로 방 입장 — 코드 길이 6 고정. */
public record JoinRoomRequest(@NotBlank @Size(min = 6, max = 6) String code) {}
