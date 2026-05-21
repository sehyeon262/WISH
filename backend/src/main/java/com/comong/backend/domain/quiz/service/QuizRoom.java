package com.comong.backend.domain.quiz.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Optional;

import com.comong.backend.domain.quiz.exception.QuizAlreadyInRoomException;
import com.comong.backend.domain.quiz.exception.QuizNotInRoomException;
import com.comong.backend.domain.quiz.exception.QuizRoomFullException;
import com.comong.backend.domain.quiz.exception.QuizRoomNotJoinableException;
import com.comong.backend.domain.quiz.exception.QuizRoomNotReadyToStartException;

/** In-memory room state for the multiplayer drawing quiz. */
public class QuizRoom {

    static final int DEFAULT_TOTAL_ROUNDS = 3;
    static final int MIN_TOTAL_ROUNDS = 3;
    static final int MAX_TOTAL_ROUNDS = 15;

    private final String roomId;
    private final String code;
    private final int maxPlayers;
    private final int minPlayers;
    private final Instant createdAt;

    private QuizRoomStatus status = QuizRoomStatus.WAITING;
    private long hostUserId;
    private final LinkedHashMap<Long, QuizMember> members = new LinkedHashMap<>();
    private int joinCounter = 0;

    private int roundNumber = 0;
    private int totalRounds = DEFAULT_TOTAL_ROUNDS;
    private long currentDrawerUserId = 0L;
    private DrawingPrompt currentPrompt = null;
    private Instant roundStartedAt = null;
    private Instant roundEndsAt = null;
    private boolean roundResolved = false;

    QuizRoom(String roomId, String code, int minPlayers, int maxPlayers, Instant createdAt) {
        this.roomId = roomId;
        this.code = code;
        this.minPlayers = minPlayers;
        this.maxPlayers = maxPlayers;
        this.createdAt = createdAt;
    }

    public String roomId() {
        return roomId;
    }

    public String code() {
        return code;
    }

    public int maxPlayers() {
        return maxPlayers;
    }

    public int minPlayers() {
        return minPlayers;
    }

    public int totalRounds() {
        return totalRounds;
    }

    public Instant createdAt() {
        return createdAt;
    }

    public QuizRoomStatus status() {
        return status;
    }

    public long hostUserId() {
        return hostUserId;
    }

    public List<QuizMember> members() {
        return new ArrayList<>(members.values());
    }

    public int memberCount() {
        return members.size();
    }

    public boolean hasMember(long userId) {
        return members.containsKey(userId);
    }

    public Optional<QuizMember> findMember(long userId) {
        return Optional.ofNullable(members.get(userId));
    }

    QuizMember addMember(long userId, long patientProfileId, String nickname) {
        if (status != QuizRoomStatus.WAITING) {
            throw new QuizRoomNotJoinableException();
        }
        if (members.containsKey(userId)) {
            throw new QuizAlreadyInRoomException();
        }
        if (members.size() >= maxPlayers) {
            throw new QuizRoomFullException();
        }
        QuizMember member = new QuizMember(userId, patientProfileId, nickname, joinCounter++, 0);
        members.put(userId, member);
        if (members.size() == 1) {
            hostUserId = userId;
        }
        return member;
    }

    Optional<QuizMember> removeMember(long userId) {
        QuizMember removed = members.remove(userId);
        if (removed == null) {
            return Optional.empty();
        }
        if (hostUserId == userId && !members.isEmpty()) {
            hostUserId =
                    members.values().stream()
                            .min(Comparator.comparingInt(QuizMember::joinOrder))
                            .orElseThrow()
                            .userId();
        }
        return Optional.of(removed);
    }

    boolean isEmpty() {
        return members.isEmpty();
    }

    void startNextRound(
            DrawingPrompt prompt,
            Instant startedAt,
            int roundDurationSeconds,
            Integer requestedTotalRounds) {
        if (status == QuizRoomStatus.FINISHED || roundNumber >= totalRounds) {
            throw new QuizRoomNotReadyToStartException();
        }
        if (status == QuizRoomStatus.PLAYING && !roundResolved) {
            throw new QuizRoomNotReadyToStartException();
        }
        if (members.size() < minPlayers) {
            throw new QuizRoomNotReadyToStartException();
        }
        if (status == QuizRoomStatus.WAITING) {
            totalRounds = normalizeTotalRounds(requestedTotalRounds);
            members.replaceAll((userId, member) -> member.withScore(0));
        }
        status = QuizRoomStatus.PLAYING;
        roundNumber += 1;
        currentPrompt = prompt;
        currentDrawerUserId = pickDrawerForRound(roundNumber);
        roundStartedAt = startedAt;
        roundEndsAt = startedAt.plusSeconds(roundDurationSeconds);
        roundResolved = false;
    }

    private int normalizeTotalRounds(Integer requestedTotalRounds) {
        if (requestedTotalRounds == null) {
            return DEFAULT_TOTAL_ROUNDS;
        }
        if (requestedTotalRounds != 3
                && requestedTotalRounds != 6
                && requestedTotalRounds != 9
                && requestedTotalRounds != 12
                && requestedTotalRounds != 15) {
            throw new QuizRoomNotReadyToStartException();
        }
        return requestedTotalRounds;
    }

    private long pickDrawerForRound(int round) {
        List<QuizMember> sorted =
                members.values().stream()
                        .sorted(Comparator.comparingInt(QuizMember::joinOrder))
                        .toList();
        int index = (round - 1) % sorted.size();
        return sorted.get(index).userId();
    }

    public int roundNumber() {
        return roundNumber;
    }

    public long currentDrawerUserId() {
        return currentDrawerUserId;
    }

    public DrawingPrompt currentPrompt() {
        return currentPrompt;
    }

    public Instant roundStartedAt() {
        return roundStartedAt;
    }

    public Instant roundEndsAt() {
        return roundEndsAt;
    }

    public boolean roundResolved() {
        return roundResolved;
    }

    void resolveRound(Long correctUserId) {
        if (status != QuizRoomStatus.PLAYING || roundResolved) {
            return;
        }
        roundResolved = true;
        if (correctUserId != null) {
            // 정답자만 점수. 이전엔 출제자도 +1 을 줬는데, 정답자만 보상하는 쪽이
            // 룰이 단순하고 정답자 보상 체감이 커진다.
            addScore(correctUserId, 2);
        }
    }

    private void addScore(long userId, int delta) {
        QuizMember member = members.get(userId);
        if (member != null) {
            members.put(userId, member.withScore(member.score() + delta));
        }
    }

    void finish() {
        status = QuizRoomStatus.FINISHED;
        currentPrompt = null;
        currentDrawerUserId = 0L;
        roundStartedAt = null;
        roundEndsAt = null;
        roundResolved = true;
    }

    void resetToWaiting() {
        status = QuizRoomStatus.WAITING;
        roundNumber = 0;
        currentPrompt = null;
        currentDrawerUserId = 0L;
        roundStartedAt = null;
        roundEndsAt = null;
        roundResolved = false;
        members.replaceAll((userId, member) -> member.withScore(0));
    }

    public QuizMember requireMember(long userId) {
        QuizMember member = members.get(userId);
        if (member == null) {
            throw new QuizNotInRoomException();
        }
        return member;
    }

    public boolean isStartable() {
        return status == QuizRoomStatus.WAITING && members.size() >= minPlayers;
    }

    public String stompRoomKey() {
        return "quiz." + roomId;
    }
}
