package com.comong.backend.domain.quiz.service;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Function;

import org.springframework.stereotype.Component;

import com.comong.backend.domain.quiz.config.QuizRealtimeProperties;

/**
 * 그림 퀴즈 방 인메모리 저장소 (S14P31E103-820).
 *
 * <p>단일 인스턴스 + ConcurrentHashMap 기반. 룸별 {@link ReentrantLock} 으로 입장/퇴장/시작 의 원자성 보장.
 *
 * <p>외부 호출 흐름:
 *
 * <ol>
 *   <li>{@link #createRoom} — 호스트가 방 생성, 본인은 첫 멤버로 등록되며 호스트가 됨.
 *   <li>{@link #joinByCode} — 다른 환자가 코드로 입장.
 *   <li>{@link #leave} — 명시적 퇴장 또는 WS disconnect.
 *   <li>{@link #withRoom} — 핸들러가 룸 lock 안에서 안전하게 상태를 변경.
 * </ol>
 *
 * <p>운영 가정: 단일 BE 인스턴스. 멀티 인스턴스 시 Redis 등 외부 store 로 교체 필요.
 */
@Component
public class QuizRoomRegistry {

    /** 코드 문자 집합 — 헷갈리는 0/O/1/I 제외. 6자리 = 32^6 ≈ 10억 종, 충돌률 무시 가능. */
    private static final char[] CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();

    private static final int CODE_LENGTH = 6;

    private static final int CODE_GENERATION_MAX_RETRY = 20;

    private final SecureRandom random = new SecureRandom();

    private final QuizRealtimeProperties properties;

    /** roomId → RoomEntry. roomId 는 입장 코드와 동일 — 외부 노출 식별자가 하나로 통합되어 다루기 쉬움. */
    private final Map<String, RoomEntry> rooms = new ConcurrentHashMap<>();

    /** userId → roomId. 한 사용자 = 한 방 invariant 보장. */
    private final Map<Long, String> userIndex = new ConcurrentHashMap<>();

    /** STOMP sessionId → userId. WS disconnect 시 사용자 추적용 (M2-2 보강). */
    private final Map<String, Long> sessionToUser = new ConcurrentHashMap<>();

    /** userId → 현재 활성 sessionId. latest-wins 위해 매핑. */
    private final Map<Long, String> userToSession = new ConcurrentHashMap<>();

    public QuizRoomRegistry(QuizRealtimeProperties properties) {
        this.properties = properties;
    }

    /** roomId 로 직접 조회 (lock 미보호 — 읽기 전용 스냅샷 용도). */
    public Optional<QuizRoom> findById(String roomId) {
        RoomEntry entry = rooms.get(roomId);
        return entry == null ? Optional.empty() : Optional.of(entry.room);
    }

    public Optional<String> currentRoomIdOf(long userId) {
        return Optional.ofNullable(userIndex.get(userId));
    }

    /**
     * 새 방을 생성하고 호스트를 첫 멤버로 등록한다.
     *
     * @return 생성된 방 스냅샷
     */
    public QuizRoom createRoom(long hostUserId, long patientProfileId, String nickname) {
        if (userIndex.containsKey(hostUserId)) {
            throw new com.comong.backend.domain.quiz.exception.QuizAlreadyInRoomException();
        }
        String code = generateUniqueCode();
        QuizRoom room =
                new QuizRoom(
                        code,
                        code,
                        properties.minPlayers(),
                        properties.maxPlayers(),
                        Instant.now());
        RoomEntry entry = new RoomEntry(room, new ReentrantLock());
        rooms.put(code, entry);

        entry.lock.lock();
        try {
            room.addMember(hostUserId, patientProfileId, nickname);
            userIndex.put(hostUserId, code);
        } finally {
            entry.lock.unlock();
        }
        return room;
    }

    /** 코드 (== roomId) 로 입장. 호출자 컨텍스트가 lock 안에서 안전하게 멤버를 추가. */
    public QuizRoom joinByCode(String code, long userId, long patientProfileId, String nickname) {
        if (userIndex.containsKey(userId)) {
            throw new com.comong.backend.domain.quiz.exception.QuizAlreadyInRoomException();
        }
        RoomEntry entry = rooms.get(code);
        if (entry == null) {
            throw new com.comong.backend.domain.quiz.exception.QuizRoomNotFoundException();
        }
        entry.lock.lock();
        try {
            entry.room.addMember(userId, patientProfileId, nickname);
            userIndex.put(userId, code);
            return entry.room;
        } finally {
            entry.lock.unlock();
        }
    }

    /**
     * 유저 퇴장. 빈 방이 되면 즉시 폐기 — M1 단계에서는 grace 없이 단순 처리.
     *
     * @return 퇴장 결과. 방이 없거나 유저가 멤버가 아닐 경우 Optional.empty.
     */
    public Optional<LeaveResult> leave(long userId) {
        String roomId = userIndex.remove(userId);
        // 세션 매핑도 같이 정리 — REST leave 후 WS disconnect 가 와도 중복 leave 안 일어남.
        String boundSession = userToSession.remove(userId);
        if (boundSession != null) {
            sessionToUser.remove(boundSession);
        }
        if (roomId == null) {
            return Optional.empty();
        }
        RoomEntry entry = rooms.get(roomId);
        if (entry == null) {
            return Optional.empty();
        }
        entry.lock.lock();
        try {
            return entry.room
                    .removeMember(userId)
                    .map(
                            member -> {
                                boolean closed = false;
                                if (entry.room.isEmpty()) {
                                    rooms.remove(roomId);
                                    closed = true;
                                }
                                return new LeaveResult(entry.room, member, closed);
                            });
        } finally {
            entry.lock.unlock();
        }
    }

    /**
     * 룸 lock 보호 안에서 임의 동작을 수행. 핸들러가 read-modify-write 를 안전하게 쓸 때 사용.
     *
     * @throws com.comong.backend.domain.quiz.exception.QuizRoomNotFoundException 방이 없으면
     */
    public <T> T withRoom(String roomId, Function<QuizRoom, T> action) {
        RoomEntry entry = rooms.get(roomId);
        if (entry == null) {
            throw new com.comong.backend.domain.quiz.exception.QuizRoomNotFoundException();
        }
        entry.lock.lock();
        try {
            return action.apply(entry.room);
        } finally {
            entry.lock.unlock();
        }
    }

    /**
     * STOMP CONNECT 시 호출 — userId 에 sessionId 를 묶는다. 동일 userId 가 이미 다른 세션에 묶여 있으면 그 세션 매핑은
     * 무효화(latest-wins). 무효화된 옛 세션의 disconnect 는 lookup 실패로 자동 no-op.
     */
    public void bindSession(String sessionId, long userId) {
        String previousSession = userToSession.put(userId, sessionId);
        if (previousSession != null && !previousSession.equals(sessionId)) {
            sessionToUser.remove(previousSession);
        }
        sessionToUser.put(sessionId, userId);
    }

    /**
     * WS disconnect 시 호출 — sessionId 로 userId 를 찾아 방에서 제거한다. 매핑이 없으면 no-op.
     *
     * @return 퇴장 결과. 매핑 없거나 멤버 아니면 Optional.empty.
     */
    public Optional<LeaveResult> leaveBySession(String sessionId) {
        Long userId = sessionToUser.remove(sessionId);
        if (userId == null) {
            return Optional.empty();
        }
        // 다른 세션이 이미 latest-wins 로 잡고 있다면 그 사용자는 여전히 활성 — 룸에서 빼지 않는다.
        String currentSession = userToSession.get(userId);
        if (currentSession != null && !currentSession.equals(sessionId)) {
            return Optional.empty();
        }
        userToSession.remove(userId);
        return leave(userId);
    }

    /**
     * 다음 라운드 시작 — 호스트 검증은 호출자(Service) 책임. 룸 lock 안에서 상태 전이 + 제시어 세팅.
     *
     * @param roomId 대상 룸
     * @param prompt 본 라운드 제시어
     * @return 변경 후 룸 (lock 해제 후 snapshot 용)
     */
    public QuizRoom startNextRound(
            String roomId, DrawingPrompt prompt, Instant startedAt, Integer totalRounds) {
        RoomEntry entry = rooms.get(roomId);
        if (entry == null) {
            throw new com.comong.backend.domain.quiz.exception.QuizRoomNotFoundException();
        }
        entry.lock.lock();
        try {
            entry.room.startNextRound(
                    prompt, startedAt, properties.roundDurationSeconds(), totalRounds);
            return entry.room;
        } finally {
            entry.lock.unlock();
        }
    }

    /** 등록된 방 수 — 메트릭/디버깅용. */
    public int roomCount() {
        return rooms.size();
    }

    public List<String> roomIds() {
        return List.copyOf(rooms.keySet());
    }

    /**
     * 입장 가능한 (WAITING + 정원 미만) 방을 createdAt 내림차순으로 반환. 룸 lock 미보호 — 멤버 수/상태가 호출 사이에 미세하게 흔들릴 수 있지만
     * 목록 UI 용도이므로 허용.
     */
    public List<QuizRoom> findJoinableRooms() {
        return rooms.values().stream()
                .map(RoomEntry::room)
                .filter(room -> room.status() == QuizRoomStatus.WAITING)
                .filter(room -> room.memberCount() < room.maxPlayers())
                .sorted(java.util.Comparator.comparing(QuizRoom::createdAt).reversed())
                .toList();
    }

    private String generateUniqueCode() {
        for (int attempt = 0; attempt < CODE_GENERATION_MAX_RETRY; attempt++) {
            String candidate = randomCode();
            if (!rooms.containsKey(candidate)) {
                return candidate;
            }
        }
        throw new IllegalStateException(
                "failed to generate unique quiz room code after "
                        + CODE_GENERATION_MAX_RETRY
                        + " tries");
    }

    private String randomCode() {
        char[] buf = new char[CODE_LENGTH];
        for (int i = 0; i < CODE_LENGTH; i++) {
            buf[i] = CODE_ALPHABET[random.nextInt(CODE_ALPHABET.length)];
        }
        return new String(buf);
    }

    private record RoomEntry(QuizRoom room, ReentrantLock lock) {}

    public record LeaveResult(QuizRoom room, QuizMember member, boolean closed) {}
}
