package com.comong.backend.domain.quiz.service;

import java.text.Normalizer;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

import jakarta.annotation.PreDestroy;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.service.PatientProfileService;
import com.comong.backend.domain.quiz.dto.PromptAssignment;
import com.comong.backend.domain.quiz.dto.QuizGameStartedResponse;
import com.comong.backend.domain.quiz.dto.QuizMemberDto;
import com.comong.backend.domain.quiz.dto.QuizRoomEvent;
import com.comong.backend.domain.quiz.dto.QuizRoomListItem;
import com.comong.backend.domain.quiz.dto.QuizRoomSnapshot;
import com.comong.backend.domain.quiz.dto.QuizStrokeMessage;
import com.comong.backend.domain.quiz.exception.QuizNotRoomHostException;
import com.comong.backend.domain.quiz.exception.QuizPatientProfileMissingException;
import com.comong.backend.domain.quiz.exception.QuizRoomNotFoundException;
import com.comong.backend.domain.quiz.service.QuizRoomRegistry.LeaveResult;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** Application service for multiplayer drawing quiz rooms and rounds. */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class QuizRoomService {

    private static final long NEXT_ROUND_DELAY_MILLIS = 2_000L;

    private final QuizRoomRegistry roomRegistry;
    private final QuizBroadcastService broadcastService;
    private final PatientProfileService patientProfileService;
    private final QuizPromptCatalog promptCatalog;

    private final ScheduledExecutorService roundScheduler =
            Executors.newSingleThreadScheduledExecutor(
                    runnable -> {
                        Thread thread = new Thread(runnable, "quiz-round-scheduler");
                        thread.setDaemon(true);
                        return thread;
                    });

    private final Map<String, ScheduledFuture<?>> roundTimers = new ConcurrentHashMap<>();
    private final Map<String, ScheduledFuture<?>> advanceTimers = new ConcurrentHashMap<>();

    public QuizRoomSnapshot createRoom(long userId) {
        PatientProfile profile = requireProfile(userId);
        QuizRoom room = roomRegistry.createRoom(userId, profile.getId(), profile.getNickname());
        return QuizRoomSnapshot.of(room);
    }

    public QuizRoomSnapshot joinByCode(long userId, String code) {
        PatientProfile profile = requireProfile(userId);
        QuizRoom room =
                roomRegistry.joinByCode(code, userId, profile.getId(), profile.getNickname());
        QuizMember joined =
                room.findMember(userId)
                        .orElseThrow(() -> new IllegalStateException("joined member missing"));
        boolean isHost = room.hostUserId() == userId;
        broadcastService.broadcastEvent(room.roomId(), QuizRoomEvent.memberJoined(joined, isHost));
        return QuizRoomSnapshot.of(room);
    }

    public void leave(long userId) {
        roomRegistry.leave(userId).ifPresent(this::handleLeaveResult);
    }

    public void leaveBySession(String sessionId) {
        roomRegistry.leaveBySession(sessionId).ifPresent(this::handleLeaveResult);
    }

    private void handleLeaveResult(LeaveResult result) {
        String roomId = result.room().roomId();
        long leftUserId = result.member().userId();
        if (result.closed()) {
            cancelRoomTasks(roomId);
        }
        broadcastService.broadcastEvent(roomId, QuizRoomEvent.memberLeft(leftUserId));
        if (result.closed()) {
            return;
        }
        if (result.room().hostUserId() != 0L) {
            broadcastService.broadcastEvent(
                    roomId, QuizRoomEvent.hostChanged(result.room().hostUserId()));
        }
        RoomReset reset = resetPlayingRoomIfInterrupted(roomId);
        if (reset != null) {
            cancelRoomTasks(roomId);
            broadcastService.broadcastEvent(
                    roomId,
                    QuizRoomEvent.roomReset(reset.hostUserId(), reset.message(), reset.members()));
        }
    }

    private RoomReset resetPlayingRoomIfInterrupted(String roomId) {
        return roomRegistry.withRoom(
                roomId,
                room -> {
                    if (room.status() != QuizRoomStatus.PLAYING) {
                        return null;
                    }
                    boolean drawerLeft = !room.hasMember(room.currentDrawerUserId());
                    boolean belowMinimum = room.memberCount() < room.minPlayers();
                    if (!drawerLeft && !belowMinimum) {
                        return null;
                    }
                    String message = drawerLeft ? "출제자가 나가서 로비로 돌아왔어요." : "인원이 부족해서 로비로 돌아왔어요.";
                    room.resetToWaiting();
                    return new RoomReset(room.hostUserId(), message, membersOf(room));
                });
    }

    public List<QuizRoomListItem> findWaitingRooms() {
        return roomRegistry.findJoinableRooms().stream().map(QuizRoomListItem::of).toList();
    }

    public QuizRoomSnapshot snapshot(String roomId) {
        return roomRegistry
                .findById(roomId)
                .map(QuizRoomSnapshot::of)
                .orElseThrow(QuizRoomNotFoundException::new);
    }

    public QuizGameStartedResponse startGame(long userId, String roomId) {
        return startGame(userId, roomId, null);
    }

    public QuizGameStartedResponse startGame(long userId, String roomId, Integer totalRounds) {
        QuizRoom roomSnapshot =
                roomRegistry.findById(roomId).orElseThrow(QuizRoomNotFoundException::new);
        if (roomSnapshot.hostUserId() != userId) {
            throw new QuizNotRoomHostException();
        }

        RoundStart start = startNextRound(roomId, totalRounds);
        return new QuizGameStartedResponse(
                QuizRoomSnapshot.of(start.room()),
                new PromptAssignment(start.room().roundNumber(), start.prompt().word()));
    }

    public void relayStroke(long userId, String roomId, QuizStrokeMessage stroke) {
        Boolean accepted =
                roomRegistry.withRoom(
                        roomId,
                        room -> {
                            room.requireMember(userId);
                            return room.status() == QuizRoomStatus.PLAYING
                                    && !room.roundResolved()
                                    && room.currentDrawerUserId() == userId;
                        });
        if (Boolean.TRUE.equals(accepted)) {
            broadcastService.broadcastEvent(roomId, QuizRoomEvent.stroke(userId, stroke));
        }
    }

    public void submitGuess(long userId, String roomId, String text) {
        GuessResult result =
                roomRegistry.withRoom(
                        roomId,
                        room -> {
                            QuizMember member = room.requireMember(userId);
                            boolean canGuess =
                                    room.status() == QuizRoomStatus.PLAYING
                                            && !room.roundResolved()
                                            && room.currentDrawerUserId() != userId
                                            && room.currentPrompt() != null;
                            if (!canGuess) {
                                return new GuessResult(
                                        member.nickname(), text, false, false, null, null, 0);
                            }
                            boolean correct =
                                    normalize(text).equals(normalize(room.currentPrompt().word()));
                            if (correct) {
                                room.resolveRound(userId);
                            }
                            return new GuessResult(
                                    member.nickname(),
                                    text,
                                    true,
                                    correct,
                                    correct ? room.currentPrompt().word() : null,
                                    correct ? membersOf(room) : null,
                                    correct ? room.roundNumber() : 0);
                        });

        if (!result.accepted()) {
            return;
        }
        broadcastService.broadcastEvent(
                roomId,
                QuizRoomEvent.guessSubmitted(
                        userId, result.nickname(), result.message(), result.correct()));

        if (result.correct()) {
            cancelRoundTimer(roomId);
            broadcastService.broadcastEvent(
                    roomId,
                    QuizRoomEvent.roundEnded(
                            result.roundNumber(), userId, result.word(), result.members()));
            scheduleAdvance(roomId, result.roundNumber());
        }
    }

    private RoundStart startNextRound(String roomId) {
        return startNextRound(roomId, null);
    }

    private RoundStart startNextRound(String roomId, Integer totalRounds) {
        QuizRoom before = roomRegistry.findById(roomId).orElseThrow(QuizRoomNotFoundException::new);
        String previousWord = before.currentPrompt() == null ? null : before.currentPrompt().word();
        DrawingPrompt prompt = promptCatalog.pickRandom(previousWord);
        QuizRoom updated = roomRegistry.startNextRound(roomId, prompt, Instant.now(), totalRounds);
        PromptAssignment assignment = new PromptAssignment(updated.roundNumber(), prompt.word());

        broadcastService.broadcastEvent(
                roomId,
                QuizRoomEvent.roundStarted(
                        updated.roundNumber(),
                        updated.currentDrawerUserId(),
                        prompt.word().length(),
                        updated.roundEndsAt().toEpochMilli(),
                        updated.totalRounds()));
        broadcastService.sendPromptToUser(
                String.valueOf(updated.currentDrawerUserId()), roomId, assignment);
        scheduleRoundTimeout(roomId, updated.roundNumber(), updated.roundEndsAt());
        return new RoundStart(updated, prompt);
    }

    private void handleRoundTimeout(String roomId, int roundNumber) {
        log.info("quiz round timeout fired room={} round={}", roomId, roundNumber);
        TimeoutResult result =
                roomRegistry.withRoom(
                        roomId,
                        room -> {
                            if (room.status() != QuizRoomStatus.PLAYING
                                    || room.roundNumber() != roundNumber
                                    || room.roundResolved()
                                    || room.currentPrompt() == null) {
                                log.info(
                                        "quiz round timeout no-op room={} round={} status={} stored={} resolved={}",
                                        roomId,
                                        roundNumber,
                                        room.status(),
                                        room.roundNumber(),
                                        room.roundResolved());
                                return null;
                            }
                            String word = room.currentPrompt().word();
                            room.resolveRound(null);
                            return new TimeoutResult(room.roundNumber(), word, membersOf(room));
                        });
        if (result == null) {
            return;
        }
        broadcastService.broadcastEvent(
                roomId,
                QuizRoomEvent.roundEnded(
                        result.roundNumber(), null, result.word(), result.members()));
        log.info(
                "quiz round timeout resolved room={} round={} word={}",
                roomId,
                result.roundNumber(),
                result.word());
        scheduleAdvance(roomId, result.roundNumber());
    }

    private void scheduleRoundTimeout(String roomId, int roundNumber, Instant endsAt) {
        cancelRoundTimer(roomId);
        long delay = Math.max(0L, Duration.between(Instant.now(), endsAt).toMillis());
        log.info(
                "quiz schedule round timeout room={} round={} delayMs={}",
                roomId,
                roundNumber,
                delay);
        // 스케줄된 task 에서 발생한 RuntimeException 은 ScheduledExecutorService 가
        // 조용히 삼키므로 (Future.get 안 부르면 영영 못 봄), try/catch 로 감싸 로깅.
        // 이걸 안 하면 라운드 자동 종료 자체가 silent fail 해 FE 가 무한 대기 상태로 굳는다.
        roundTimers.put(
                roomId,
                roundScheduler.schedule(
                        () -> {
                            try {
                                handleRoundTimeout(roomId, roundNumber);
                            } catch (Exception ex) {
                                log.error(
                                        "quiz round timeout handler crashed room={} round={}",
                                        roomId,
                                        roundNumber,
                                        ex);
                            }
                        },
                        delay,
                        TimeUnit.MILLISECONDS));
    }

    private void scheduleAdvance(String roomId, int endedRoundNumber) {
        cancelAdvance(roomId);
        advanceTimers.put(
                roomId,
                roundScheduler.schedule(
                        () -> {
                            try {
                                advanceAfterRound(roomId, endedRoundNumber);
                            } catch (Exception ex) {
                                log.error(
                                        "quiz round advance handler crashed room={} endedRound={}",
                                        roomId,
                                        endedRoundNumber,
                                        ex);
                            }
                        },
                        NEXT_ROUND_DELAY_MILLIS,
                        TimeUnit.MILLISECONDS));
    }

    private void advanceAfterRound(String roomId, int endedRoundNumber) {
        RoundAdvance advance =
                roomRegistry.withRoom(
                        roomId,
                        room -> {
                            if (room.status() != QuizRoomStatus.PLAYING
                                    || room.roundNumber() != endedRoundNumber
                                    || !room.roundResolved()) {
                                return null;
                            }
                            if (room.roundNumber() >= room.totalRounds()) {
                                List<QuizMemberDto> finalMembers = membersOf(room);
                                room.resetToWaiting();
                                return new RoundAdvance(true, finalMembers);
                            }
                            return new RoundAdvance(false, null);
                        });
        if (advance == null) {
            return;
        }
        if (advance.shouldFinish()) {
            cancelRoomTasks(roomId);
            broadcastService.broadcastEvent(roomId, QuizRoomEvent.gameFinished(advance.members()));
            return;
        }
        startNextRound(roomId);
    }

    private void cancelRoundTimer(String roomId) {
        ScheduledFuture<?> timer = roundTimers.remove(roomId);
        if (timer != null) {
            timer.cancel(false);
        }
    }

    private void cancelAdvance(String roomId) {
        ScheduledFuture<?> timer = advanceTimers.remove(roomId);
        if (timer != null) {
            timer.cancel(false);
        }
    }

    private void cancelRoomTasks(String roomId) {
        cancelRoundTimer(roomId);
        cancelAdvance(roomId);
    }

    private static List<QuizMemberDto> membersOf(QuizRoom room) {
        long host = room.hostUserId();
        return room.members().stream()
                .map(member -> QuizMemberDto.of(member, member.userId() == host))
                .toList();
    }

    private static String normalize(String value) {
        if (value == null) {
            return "";
        }
        return Normalizer.normalize(value, Normalizer.Form.NFKC)
                .replaceAll("\\s+", "")
                .toLowerCase();
    }

    private PatientProfile requireProfile(long userId) {
        return patientProfileService
                .findEntityByUserId(userId)
                .orElseThrow(QuizPatientProfileMissingException::new);
    }

    @PreDestroy
    void shutdownScheduler() {
        roundScheduler.shutdownNow();
    }

    private record RoundStart(QuizRoom room, DrawingPrompt prompt) {}

    private record GuessResult(
            String nickname,
            String message,
            boolean accepted,
            boolean correct,
            String word,
            List<QuizMemberDto> members,
            int roundNumber) {}

    private record TimeoutResult(int roundNumber, String word, List<QuizMemberDto> members) {}

    private record RoomReset(long hostUserId, String message, List<QuizMemberDto> members) {}

    private record RoundAdvance(boolean shouldFinish, List<QuizMemberDto> members) {}
}
