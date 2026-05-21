package com.comong.backend.domain.village.realtime.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class VillageEmojisTest {

    @Test
    void allowedContainsShiftedPaletteAndBeltBoasts() {
        assertThat(VillageEmojis.ALLOWED)
                .contains(
                        "안녕",
                        "따라와",
                        "좋아",
                        "고마워",
                        "😄",
                        "😢",
                        "👍",
                        "❤️",
                        "❓",
                        "taekwondo-belt:WHITE",
                        "taekwondo-belt:YELLOW",
                        "taekwondo-belt:ORANGE",
                        "taekwondo-belt:GREEN",
                        "taekwondo-belt:BLUE",
                        "taekwondo-belt:PURPLE",
                        "taekwondo-belt:BROWN",
                        "taekwondo-belt:RED",
                        "taekwondo-belt:BLACK");
    }

    @Test
    void removedCheerUpMessageIsDropped() {
        assertThat(VillageEmojis.isAllowed("힘내")).isFalse();
    }
}
