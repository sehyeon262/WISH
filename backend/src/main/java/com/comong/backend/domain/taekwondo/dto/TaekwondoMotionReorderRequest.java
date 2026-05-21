package com.comong.backend.domain.taekwondo.dto;

import java.util.List;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import com.comong.backend.domain.taekwondo.entity.Poomsae;

public record TaekwondoMotionReorderRequest(
        @NotNull Poomsae poomsae, @NotEmpty List<@NotNull Long> motionIds) {}
