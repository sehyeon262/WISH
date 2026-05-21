package com.comong.backend.domain.village.realtime.service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;

import org.springframework.stereotype.Service;

import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.service.PatientProfileService;
import com.comong.backend.domain.village.realtime.config.VillageRealtimeProperties;
import com.comong.backend.domain.village.realtime.exception.VillagePatientProfileMissingException;
import com.comong.backend.domain.village.realtime.exception.VillageRoomFullException;

import lombok.RequiredArgsConstructor;

/**
 * 마을 광장 및 테마 select 씬 presence 인메모리 저장소 (S14P31E103-793).
 *
 * <p>{@code roomId} 별로 독립 룸을 관리한다. 예) {@code village.default}, {@code gymnastics.select}, {@code
 * taekwondo.select}. 룸은 첫 join 시 lazy 생성되고, 빈 룸도 그대로 둔다 (메모리 비용 미미, 재입장 race 회피).
 *
 * <p>운영 가정:
 *
 * <ul>
 *   <li><b>단일 인스턴스</b>: 인메모리 ConcurrentHashMap. 멀티 인스턴스 운영 시 Redis 등으로 외부 store 교체 필요.
 *   <li><b>동시성</b>: 룸별 {@link ReentrantLock} 으로 캡 검증 + add 의 원자성 보장.
 *   <li><b>latest-wins</b>: 같은 ({@code roomId}, {@code userId}) 로 새 세션이 들어오면 기존 세션 ID 무효화 후 위치/외형
 *       유지하며 세션만 교체.
 *   <li><b>idle cleanup</b>: {@link #evictIdle(Instant)} 가 모든 룸을 순회.
 *   <li><b>cap</b>: {@link VillageRealtimeProperties#roomCapacity()} 가 룸별로 적용 — 마을과 select 씬이 각각
 *       독립.
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class VillagePresenceService {

    /** 스폰 시 사용할 기본 외형 키 — FE {@code player.ts} 의 {@code PLAYER_TEXTURE_KEY} 와 동기. */
    private static final String DEFAULT_TEXTURE_KEY = "character";

    /** 기본 방향. FE {@code PlayerDirection} 의 디폴트와 동일. */
    private static final String DEFAULT_DIR = "down";

    /** 룸별 기본 스폰 좌표 — FE 의 각 씬 {@code DEFAULT_PLAYER_SPAWN} 와 동기. 마을과 select 씬이 동일 (0.5, 0.3). */
    private static final double DEFAULT_X_RATIO = 0.5;

    private static final double DEFAULT_Y_RATIO = 0.3;

    /** 이모티콘 서버측 throttle 간격. 도배 차단 — 클라가 1s throttle 을 우회해도 서버가 막는다 (S14P31E103-728). */
    private static final Duration EMOTE_THROTTLE = Duration.ofSeconds(2);

    private final VillageRealtimeProperties properties;
    private final PatientProfileService patientProfileService;

    /** roomId → RoomState. computeIfAbsent 로 lazy 생성. */
    private final Map<String, RoomState> rooms = new ConcurrentHashMap<>();

    /** sessionId → roomId. disconnect / position / emote 가 어느 룸인지 빠르게 역참조. */
    private final Map<String, String> sessionToRoom = new ConcurrentHashMap<>();

    public enum JoinOutcome {
        JOINED,
        REPLACED
    }

    public record JoinResult(
            JoinOutcome outcome,
            String roomId,
            PlayerState member,
            Optional<PlayerState> evicted) {}

    /** leave / evict 결과 — caller 가 어느 룸에 broadcast 해야 하는지 알도록 roomId 포함. */
    public record LeaveOutcome(String roomId, PlayerState member) {}

    /** 룸별 상태 묶음. 동시성은 룸별 lock 으로 직렬화. */
    private static final class RoomState {
        final Map<Long, PlayerState> members = new ConcurrentHashMap<>();
        final Map<String, Long> sessionIndex = new ConcurrentHashMap<>();
        final Map<Long, Instant> lastEmoteByUserId = new ConcurrentHashMap<>();
        final ReentrantLock lock = new ReentrantLock();
    }

    /**
     * 신규 STOMP 세션을 지정 룸에 추가.
     *
     * @throws VillagePatientProfileMissingException 보호자 단독 계정 등 환자 프로필이 없을 때
     * @throws VillageRoomFullException 캡 초과 (단, 같은 userId 재접속은 캡 검증 skip)
     */
    public JoinResult join(String sessionId, long userId, String roomId) {
        PatientProfile profile =
                patientProfileService
                        .findEntityByUserId(userId)
                        .orElseThrow(() -> new VillagePatientProfileMissingException(userId));

        Instant now = Instant.now();
        RoomState room = rooms.computeIfAbsent(roomId, k -> new RoomState());

        room.lock.lock();
        try {
            PlayerState existing = room.members.get(userId);

            if (existing == null) {
                if (room.members.size() >= properties.roomCapacity()) {
                    throw new VillageRoomFullException(properties.roomCapacity());
                }
                PlayerState newMember =
                        new PlayerState(
                                userId,
                                profile.getId(),
                                profile.getNickname(),
                                DEFAULT_TEXTURE_KEY,
                                DEFAULT_X_RATIO,
                                DEFAULT_Y_RATIO,
                                DEFAULT_DIR,
                                sessionId,
                                now);
                room.members.put(userId, newMember);
                room.sessionIndex.put(sessionId, userId);
                sessionToRoom.put(sessionId, roomId);
                return new JoinResult(JoinOutcome.JOINED, roomId, newMember, Optional.empty());
            }

            // latest-wins: 기존 세션 ID 무효화 + 위치/외형 유지하며 세션만 교체
            room.sessionIndex.remove(existing.sessionId());
            sessionToRoom.remove(existing.sessionId());
            PlayerState replaced = existing.withSession(sessionId, now);
            room.members.put(userId, replaced);
            room.sessionIndex.put(sessionId, userId);
            sessionToRoom.put(sessionId, roomId);
            return new JoinResult(JoinOutcome.REPLACED, roomId, replaced, Optional.of(existing));
        } finally {
            room.lock.unlock();
        }
    }

    /**
     * 세션 disconnect 시 호출. 해당 세션이 여전히 룸의 userId 를 점유 중이면 제거하고 roomId 와 함께 반환.
     *
     * <p>race 방지: 이미 latest-wins 로 새 세션이 점유한 멤버는 제거하지 않는다.
     */
    public Optional<LeaveOutcome> leaveBySession(String sessionId) {
        String roomId = sessionToRoom.remove(sessionId);
        if (roomId == null) {
            return Optional.empty();
        }
        RoomState room = rooms.get(roomId);
        if (room == null) {
            return Optional.empty();
        }

        room.lock.lock();
        try {
            Long userId = room.sessionIndex.remove(sessionId);
            if (userId == null) {
                return Optional.empty();
            }
            PlayerState member = room.members.get(userId);
            if (member != null && sessionId.equals(member.sessionId())) {
                room.members.remove(userId);
                room.lastEmoteByUserId.remove(userId);
                return Optional.of(new LeaveOutcome(roomId, member));
            }
            return Optional.empty();
        } finally {
            room.lock.unlock();
        }
    }

    /**
     * 이모티콘 발신 시도. throttle 통과 + 멤버 존재 + sessionId 일치 시 멤버 반환.
     *
     * <p>"sessionId 불일치" 는 latest-wins 로 evict 된 옛 세션의 늦은 emote — 새 세션 침범 안 하도록 drop
     * (S14P31E103-763).
     */
    public Optional<PlayerState> registerEmote(
            String roomId, long userId, String sessionId, Instant now) {
        RoomState room = rooms.get(roomId);
        if (room == null) {
            return Optional.empty();
        }
        room.lock.lock();
        try {
            PlayerState member = room.members.get(userId);
            if (member == null || !sessionId.equals(member.sessionId())) {
                return Optional.empty();
            }
            Instant last = room.lastEmoteByUserId.get(userId);
            if (last != null && Duration.between(last, now).compareTo(EMOTE_THROTTLE) < 0) {
                return Optional.empty();
            }
            room.lastEmoteByUserId.put(userId, now);
            return Optional.of(member);
        } finally {
            room.lock.unlock();
        }
    }

    /**
     * 위치 패킷 수신 시 호출. 멤버 + sessionId 일치 시 좌표 갱신 후 반환.
     *
     * <p>"sessionId 불일치" 는 evict 된 옛 세션의 늦은 position 패킷 — 새 세션 좌표 덮어쓰기 방지 (S14P31E103-763).
     */
    public Optional<PlayerState> updatePosition(
            String roomId,
            long userId,
            String sessionId,
            double x,
            double y,
            String dir,
            String textureKey) {
        RoomState room = rooms.get(roomId);
        if (room == null) {
            return Optional.empty();
        }
        Instant now = Instant.now();
        room.lock.lock();
        try {
            PlayerState existing = room.members.get(userId);
            if (existing == null || !sessionId.equals(existing.sessionId())) {
                return Optional.empty();
            }
            PlayerState updated = existing.withPosition(x, y, dir, textureKey, now);
            room.members.put(userId, updated);
            return Optional.of(updated);
        } finally {
            room.lock.unlock();
        }
    }

    /** 좀비 정리. 모든 룸에서 {@code idle-disconnect-seconds} 초과한 멤버 제거 후 (roomId, member) 쌍으로 반환. */
    public Collection<LeaveOutcome> evictIdle(Instant now) {
        Duration threshold = Duration.ofSeconds(properties.idleDisconnectSeconds());
        List<LeaveOutcome> evicted = new ArrayList<>();
        for (Map.Entry<String, RoomState> entry : rooms.entrySet()) {
            String roomId = entry.getKey();
            RoomState room = entry.getValue();
            room.lock.lock();
            try {
                Iterator<Map.Entry<Long, PlayerState>> it = room.members.entrySet().iterator();
                while (it.hasNext()) {
                    PlayerState member = it.next().getValue();
                    if (Duration.between(member.lastSeen(), now).compareTo(threshold) > 0) {
                        it.remove();
                        room.sessionIndex.remove(member.sessionId());
                        sessionToRoom.remove(member.sessionId());
                        evicted.add(new LeaveOutcome(roomId, member));
                    }
                }
            } finally {
                room.lock.unlock();
            }
        }
        return evicted;
    }

    public Collection<PlayerState> members(String roomId) {
        RoomState room = rooms.get(roomId);
        return room == null ? Collections.emptyList() : List.copyOf(room.members.values());
    }

    public Optional<PlayerState> findByUserId(String roomId, long userId) {
        RoomState room = rooms.get(roomId);
        return room == null ? Optional.empty() : Optional.ofNullable(room.members.get(userId));
    }

    /** 세션 ID 로 멤버 + 룸 역참조 — 테스트/디버그용. */
    public Optional<LeaveOutcome> findBySessionId(String sessionId) {
        String roomId = sessionToRoom.get(sessionId);
        if (roomId == null) {
            return Optional.empty();
        }
        RoomState room = rooms.get(roomId);
        if (room == null) {
            return Optional.empty();
        }
        Long userId = room.sessionIndex.get(sessionId);
        if (userId == null) {
            return Optional.empty();
        }
        PlayerState member = room.members.get(userId);
        return member == null ? Optional.empty() : Optional.of(new LeaveOutcome(roomId, member));
    }

    /** 룸별 size. */
    public int size(String roomId) {
        RoomState room = rooms.get(roomId);
        return room == null ? 0 : room.members.size();
    }

    /** 모든 룸의 총 size. 테스트/메트릭용. */
    public int totalSize() {
        int sum = 0;
        for (RoomState room : rooms.values()) {
            sum += room.members.size();
        }
        return sum;
    }
}
