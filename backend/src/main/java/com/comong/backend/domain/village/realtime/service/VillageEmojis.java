package com.comong.backend.domain.village.realtime.service;

import java.util.Set;

/**
 * 마을 광장에서 사용 가능한 빠른 표현 화이트리스트 (S14P31E103-728, S14P31E103-769 에서 확장).
 *
 * <p>이모지뿐 아니라 짧은 한글 메시지도 허용해 또래 환자 사이 간단한 소통 가능 — 안녕/따라와/좋아 등. FE 팔레트가 같은 목록을 그대로 노출. 도배 차단은 {@link
 * VillagePresenceService#registerEmote} 의 throttle 이 담당하므로 본 목록은 안전·기획 화이트리스트 역할만 한다. 클래스 이름은
 * S14P31E103-728 호환 유지 차원에서 그대로 두되 의미는 "빠른 표현 (이모지 + 단축 메시지)" 로 넓혔다.
 */
public final class VillageEmojis {

    public static final Set<String> ALLOWED =
            Set.of(
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

    private VillageEmojis() {}

    public static boolean isAllowed(String emoji) {
        return emoji != null && ALLOWED.contains(emoji);
    }
}
