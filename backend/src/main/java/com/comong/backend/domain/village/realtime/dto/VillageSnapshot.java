package com.comong.backend.domain.village.realtime.dto;

import java.util.Collection;
import java.util.List;

import com.comong.backend.domain.village.realtime.service.PlayerState;

/**
 * 신규 입장 클라이언트에게 {@code /user/queue/village.snapshot} 으로 1회 전송되는 현재 룸 멤버 전원의 상태.
 *
 * <p>자기 자신도 포함하지만 FE 가 {@code localUserId} 기준으로 필터링한다 — 서버측 필터는 두지 않는다 (스냅샷 송수신자가 자기 자신이라는 사실이 메시지
 * dispatch 단계에서 보장되지 않을 수 있고, 단일 source of truth 를 유지하기 위함).
 */
public record VillageSnapshot(List<SnapshotMember> members) {

    public record SnapshotMember(
            long userId, String nickname, String textureKey, double x, double y, String dir) {

        static SnapshotMember from(PlayerState state) {
            return new SnapshotMember(
                    state.userId(),
                    state.nickname(),
                    state.textureKey(),
                    state.x(),
                    state.y(),
                    state.dir());
        }
    }

    public static VillageSnapshot of(Collection<PlayerState> states) {
        return new VillageSnapshot(states.stream().map(SnapshotMember::from).toList());
    }
}
