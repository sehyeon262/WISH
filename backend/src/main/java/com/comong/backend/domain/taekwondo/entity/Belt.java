package com.comong.backend.domain.taekwondo.entity;

import java.util.Optional;

/**
 * 태권도 띠 등급. 누적 처치 몬스터 수가 다음 등급의 {@link #requiredMonstersDefeated} 이상이면 승급 가능.
 *
 * <p>임계값은 페이싱 자리표시값이다 (대략 1.5배 등비). 실제 게임 운영 데이터를 보면서 조정한다. {@link #BLACK} 은 종착점으로 {@link #next()}
 * 가 {@link Optional#empty()} 를 돌려준다.
 */
public enum Belt {
    WHITE(0),
    YELLOW(30),
    ORANGE(70),
    GREEN(130),
    BLUE(220),
    PURPLE(360),
    BROWN(580),
    RED(920),
    BLACK(1450);

    private final int requiredMonstersDefeated;

    Belt(int requiredMonstersDefeated) {
        this.requiredMonstersDefeated = requiredMonstersDefeated;
    }

    public int getRequiredMonstersDefeated() {
        return requiredMonstersDefeated;
    }

    /** 다음 단계 띠. {@link #BLACK} 이면 {@link Optional#empty()}. */
    public Optional<Belt> next() {
        Belt[] values = values();
        int nextOrdinal = ordinal() + 1;
        if (nextOrdinal >= values.length) {
            return Optional.empty();
        }
        return Optional.of(values[nextOrdinal]);
    }

    /** 현재 누적 처치수로 다음 단계 띠로 승급 가능한지. */
    public boolean canPromoteWith(int totalMonstersDefeated) {
        return next().filter(b -> totalMonstersDefeated >= b.requiredMonstersDefeated).isPresent();
    }
}
