package com.comong.backend.domain.village.realtime.dto;

import com.comong.backend.domain.village.realtime.service.PlayerState;
import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * 마을 광장 토픽 ({@code /topic/village.default}) 으로 브로드캐스트되는 이벤트.
 *
 * <p>4 종류: {@code join} / {@code move} / {@code leave} / {@code emote}. 타입별로 채워지는 필드가 달라 단일 record
 * + {@code @JsonInclude(NON_NULL)} 로 처리한다 (sealed + Jackson 다형성보다 단순).
 *
 * <ul>
 *   <li>{@code join}: type, userId, nickname, textureKey, x, y, dir
 *   <li>{@code move}: type, userId, x, y, dir, moving
 *   <li>{@code leave}: type, userId
 *   <li>{@code emote}: type, userId, emoji
 * </ul>
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record VillageEvent(
        String type,
        long userId,
        String nickname,
        String textureKey,
        Double x,
        Double y,
        String dir,
        Boolean moving,
        String emoji) {

    public static VillageEvent join(PlayerState member) {
        return new VillageEvent(
                "join",
                member.userId(),
                member.nickname(),
                member.textureKey(),
                member.x(),
                member.y(),
                member.dir(),
                null,
                null);
    }

    public static VillageEvent move(PlayerState member, boolean moving) {
        return new VillageEvent(
                "move",
                member.userId(),
                null,
                member.textureKey(),
                member.x(),
                member.y(),
                member.dir(),
                moving,
                null);
    }

    public static VillageEvent leave(long userId) {
        return new VillageEvent("leave", userId, null, null, null, null, null, null, null);
    }

    public static VillageEvent emote(long userId, String emoji) {
        return new VillageEvent("emote", userId, null, null, null, null, null, null, emoji);
    }
}
