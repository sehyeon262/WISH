package com.comong.backend.domain.quiz.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.service.PatientProfileService;
import com.comong.backend.domain.quiz.config.QuizRealtimeProperties;
import com.comong.backend.domain.quiz.dto.QuizRoomEvent;
import com.comong.backend.domain.quiz.dto.QuizRoomSnapshot;
import com.comong.backend.domain.quiz.exception.QuizAlreadyInRoomException;
import com.comong.backend.domain.quiz.exception.QuizPatientProfileMissingException;
import com.comong.backend.domain.quiz.exception.QuizRoomFullException;
import com.comong.backend.domain.quiz.exception.QuizRoomNotFoundException;

/** {@link QuizRoomService} 핵심 경로 (생성/입장/퇴장/호스트 승계/정원) 검증. */
class QuizRoomServiceTest {

    private static final int MIN = 2;
    private static final int MAX = 6;

    private PatientProfileService patientProfileService;
    private QuizBroadcastService broadcastService;
    private QuizRoomRegistry registry;
    private QuizPromptCatalog promptCatalog;
    private QuizRoomService service;

    @BeforeEach
    void setUp() {
        patientProfileService = mock(PatientProfileService.class);
        broadcastService = mock(QuizBroadcastService.class);
        promptCatalog = new QuizPromptCatalog();
        QuizRealtimeProperties properties = new QuizRealtimeProperties(true, MIN, MAX, 60, 60);
        registry = new QuizRoomRegistry(properties);
        service =
                new QuizRoomService(
                        registry, broadcastService, patientProfileService, promptCatalog);
    }

    @Test
    void createRoomMakesCallerHostAndDoesNotBroadcast() {
        stubProfile(1L, 100L, "꼬마곰");

        QuizRoomSnapshot snapshot = service.createRoom(1L);

        assertThat(snapshot.hostUserId()).isEqualTo(1L);
        assertThat(snapshot.members()).hasSize(1);
        assertThat(snapshot.members().get(0).isHost()).isTrue();
        assertThat(snapshot.code()).hasSize(6);
        // 호스트만 있는 시점엔 구독자가 없으므로 broadcast 안 함.
        verify(broadcastService, never()).broadcastEvent(anyString(), any());
    }

    @Test
    void createRoomWithoutPatientProfileIsRejected() {
        when(patientProfileService.findEntityByUserId(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.createRoom(99L))
                .isInstanceOf(QuizPatientProfileMissingException.class);
    }

    @Test
    void joinByCodeAddsMemberAndBroadcastsMemberJoined() {
        stubProfile(1L, 100L, "host");
        stubProfile(2L, 101L, "guest");

        QuizRoomSnapshot host = service.createRoom(1L);
        QuizRoomSnapshot joined = service.joinByCode(2L, host.code());

        assertThat(joined.members()).hasSize(2);
        assertThat(joined.hostUserId()).isEqualTo(1L);
        verify(broadcastService, times(1))
                .broadcastEvent(eq(host.roomId()), any(QuizRoomEvent.class));
    }

    @Test
    void joinByCodeRejectsUnknownCode() {
        stubProfile(1L, 100L, "x");

        assertThatThrownBy(() -> service.joinByCode(1L, "ABCDEF"))
                .isInstanceOf(QuizRoomNotFoundException.class);
    }

    @Test
    void joinByCodeRejectsWhenRoomFull() {
        stubProfile(1L, 100L, "h");
        stubProfile(2L, 101L, "a");
        stubProfile(3L, 102L, "b");
        stubProfile(4L, 103L, "c");
        stubProfile(5L, 104L, "d");
        stubProfile(6L, 105L, "e");
        stubProfile(7L, 106L, "overflow");

        QuizRoomSnapshot host = service.createRoom(1L);
        service.joinByCode(2L, host.code());
        service.joinByCode(3L, host.code());
        service.joinByCode(4L, host.code());
        service.joinByCode(5L, host.code());
        service.joinByCode(6L, host.code());

        assertThatThrownBy(() -> service.joinByCode(7L, host.code()))
                .isInstanceOf(QuizRoomFullException.class);
    }

    @Test
    void userCannotCreateOrJoinWhileAlreadyInRoom() {
        stubProfile(1L, 100L, "h");

        QuizRoomSnapshot first = service.createRoom(1L);

        assertThatThrownBy(() -> service.createRoom(1L))
                .isInstanceOf(QuizAlreadyInRoomException.class);
        assertThatThrownBy(() -> service.joinByCode(1L, first.code()))
                .isInstanceOf(QuizAlreadyInRoomException.class);
    }

    @Test
    void leaveByGuestBroadcastsMemberLeftButNotHostChanged() {
        stubProfile(1L, 100L, "h");
        stubProfile(2L, 101L, "g");

        QuizRoomSnapshot host = service.createRoom(1L);
        service.joinByCode(2L, host.code());
        service.leave(2L);

        verify(broadcastService, atLeastOnce())
                .broadcastEvent(eq(host.roomId()), any(QuizRoomEvent.class));
        assertThat(registry.findById(host.roomId())).isPresent();
        assertThat(registry.findById(host.roomId()).get().memberCount()).isEqualTo(1);
        assertThat(registry.findById(host.roomId()).get().hostUserId()).isEqualTo(1L);
    }

    @Test
    void leaveByHostPromotesNextEarliestMember() {
        stubProfile(1L, 100L, "h");
        stubProfile(2L, 101L, "g1");
        stubProfile(3L, 102L, "g2");

        QuizRoomSnapshot host = service.createRoom(1L);
        service.joinByCode(2L, host.code());
        service.joinByCode(3L, host.code());
        service.leave(1L);

        assertThat(registry.findById(host.roomId()).orElseThrow().hostUserId()).isEqualTo(2L);
    }

    @Test
    void leaveByLastMemberClosesRoom() {
        stubProfile(1L, 100L, "h");

        QuizRoomSnapshot host = service.createRoom(1L);
        service.leave(1L);

        assertThat(registry.findById(host.roomId())).isEmpty();
        assertThat(registry.roomCount()).isZero();
    }

    @Test
    void drawerLeavingDuringGameReturnsRoomToWaiting() {
        stubProfile(1L, 100L, "h");
        stubProfile(2L, 101L, "g1");
        stubProfile(3L, 102L, "g2");

        QuizRoomSnapshot host = service.createRoom(1L);
        service.joinByCode(2L, host.code());
        service.joinByCode(3L, host.code());
        service.startGame(1L, host.roomId());

        service.leave(1L);

        QuizRoom room = registry.findById(host.roomId()).orElseThrow();
        assertThat(room.status()).isEqualTo(QuizRoomStatus.WAITING);
        assertThat(room.roundNumber()).isZero();
        assertThat(room.currentDrawerUserId()).isZero();
        assertThat(room.roundEndsAt()).isNull();
        assertThat(room.hostUserId()).isEqualTo(2L);
        assertThat(room.members()).allMatch(member -> member.score() == 0);
        verify(broadcastService, atLeastOnce())
                .broadcastEvent(
                        eq(host.roomId()),
                        org.mockito.ArgumentMatchers.argThat(
                                ev ->
                                        ev != null
                                                && "room_reset".equals(ev.type())
                                                && ev.status() == QuizRoomStatus.WAITING
                                                && ev.hostUserId() == 2L));
    }

    @Test
    void guestLeavingBelowMinimumDuringGameReturnsRoomToWaiting() {
        stubProfile(1L, 100L, "h");
        stubProfile(2L, 101L, "g");

        QuizRoomSnapshot host = service.createRoom(1L);
        service.joinByCode(2L, host.code());
        service.startGame(1L, host.roomId());

        service.leave(2L);

        QuizRoom room = registry.findById(host.roomId()).orElseThrow();
        assertThat(room.status()).isEqualTo(QuizRoomStatus.WAITING);
        assertThat(room.roundNumber()).isZero();
        assertThat(room.currentDrawerUserId()).isZero();
        assertThat(room.roundEndsAt()).isNull();
        verify(broadcastService, atLeastOnce())
                .broadcastEvent(
                        eq(host.roomId()),
                        org.mockito.ArgumentMatchers.argThat(
                                ev ->
                                        ev != null
                                                && "room_reset".equals(ev.type())
                                                && "인원이 부족해서 로비로 돌아왔어요.".equals(ev.message())));
    }

    @Test
    void nonDrawerLeavingWithEnoughPlayersKeepsRoundPlaying() {
        stubProfile(1L, 100L, "h");
        stubProfile(2L, 101L, "g1");
        stubProfile(3L, 102L, "g2");

        QuizRoomSnapshot host = service.createRoom(1L);
        service.joinByCode(2L, host.code());
        service.joinByCode(3L, host.code());
        service.startGame(1L, host.roomId());

        service.leave(2L);

        QuizRoom room = registry.findById(host.roomId()).orElseThrow();
        assertThat(room.status()).isEqualTo(QuizRoomStatus.PLAYING);
        assertThat(room.roundNumber()).isEqualTo(1);
        assertThat(room.currentDrawerUserId()).isEqualTo(1L);
        verify(broadcastService, never())
                .broadcastEvent(
                        eq(host.roomId()),
                        org.mockito.ArgumentMatchers.argThat(
                                ev -> ev != null && "room_reset".equals(ev.type())));
    }

    @Test
    void leaveWithoutRoomIsNoop() {
        // 멤버 아닌 사용자가 호출해도 예외/broadcast 없이 조용히 지나간다.
        service.leave(999L);
        verify(broadcastService, never()).broadcastEvent(anyString(), any());
    }

    @Test
    void startGameByHostTransitionsToPlayingAndBroadcastsAndReturnsPrompt() {
        stubProfile(1L, 100L, "h");
        stubProfile(2L, 101L, "g");
        QuizRoomSnapshot host = service.createRoom(1L);
        service.joinByCode(2L, host.code());

        com.comong.backend.domain.quiz.dto.QuizGameStartedResponse response =
                service.startGame(1L, host.roomId());

        assertThat(response.snapshot().status())
                .isEqualTo(com.comong.backend.domain.quiz.service.QuizRoomStatus.PLAYING);
        assertThat(response.snapshot().roundNumber()).isEqualTo(1);
        // 출제자는 joinOrder 0 인 host (= round 1 → index 0).
        assertThat(response.snapshot().currentDrawerUserId()).isEqualTo(1L);
        // 호출자가 호스트이므로 제시어 동봉.
        assertThat(response.prompt()).isNotNull();
        assertThat(response.prompt().roundNumber()).isEqualTo(1);
        assertThat(response.prompt().word()).isNotBlank();

        // round_started 토픽 broadcast 1회 (제시어는 비포함).
        verify(broadcastService, times(1))
                .broadcastEvent(
                        eq(host.roomId()),
                        org.mockito.ArgumentMatchers.argThat(
                                ev ->
                                        ev != null
                                                && "round_started".equals(ev.type())
                                                && ev.roundNumber() == 1
                                                && ev.currentDrawerUserId() == 1L));
        // user queue 로 제시어를 push 하지 않음 — REST 응답에 동봉되므로.
        verify(broadcastService, times(1)).sendPromptToUser(eq("1"), eq(host.roomId()), any());
    }

    @Test
    void startGameUsesSelectedTotalRounds() {
        stubProfile(1L, 100L, "h");
        stubProfile(2L, 101L, "g");
        QuizRoomSnapshot host = service.createRoom(1L);
        service.joinByCode(2L, host.code());

        com.comong.backend.domain.quiz.dto.QuizGameStartedResponse response =
                service.startGame(1L, host.roomId(), 15);

        assertThat(response.snapshot().totalRounds()).isEqualTo(15);
        assertThat(registry.findById(host.roomId()).orElseThrow().totalRounds()).isEqualTo(15);
    }

    @Test
    void startGameRejectsUnsupportedTotalRounds() {
        stubProfile(1L, 100L, "h");
        stubProfile(2L, 101L, "g");
        QuizRoomSnapshot host = service.createRoom(1L);
        service.joinByCode(2L, host.code());

        assertThatThrownBy(() -> service.startGame(1L, host.roomId(), 4))
                .isInstanceOf(
                        com.comong.backend.domain.quiz.exception.QuizRoomNotReadyToStartException
                                .class);
    }

    @Test
    void startGameByNonHostIsRejected() {
        stubProfile(1L, 100L, "h");
        stubProfile(2L, 101L, "g");
        QuizRoomSnapshot host = service.createRoom(1L);
        service.joinByCode(2L, host.code());

        assertThatThrownBy(() -> service.startGame(2L, host.roomId()))
                .isInstanceOf(
                        com.comong.backend.domain.quiz.exception.QuizNotRoomHostException.class);
    }

    @Test
    void startGameWithBelowMinPlayersIsRejected() {
        stubProfile(1L, 100L, "h");
        QuizRoomSnapshot host = service.createRoom(1L);

        assertThatThrownBy(() -> service.startGame(1L, host.roomId()))
                .isInstanceOf(
                        com.comong.backend.domain.quiz.exception.QuizRoomNotReadyToStartException
                                .class);
    }

    @Test
    void startGameAdvancesDrawerOnSubsequentRounds() {
        stubProfile(1L, 100L, "h");
        stubProfile(2L, 101L, "g");
        QuizRoomSnapshot host = service.createRoom(1L);
        service.joinByCode(2L, host.code());

        com.comong.backend.domain.quiz.dto.QuizGameStartedResponse r1 =
                service.startGame(1L, host.roomId());
        registry.findById(host.roomId()).orElseThrow().resolveRound(2L);
        com.comong.backend.domain.quiz.dto.QuizGameStartedResponse r2 =
                service.startGame(1L, host.roomId());

        assertThat(r1.snapshot().currentDrawerUserId()).isEqualTo(1L);
        assertThat(r2.snapshot().currentDrawerUserId()).isEqualTo(2L);
        assertThat(r2.snapshot().roundNumber()).isEqualTo(2);
    }

    @Test
    void startGameWhileRoundIsInProgressIsRejected() {
        stubProfile(1L, 100L, "h");
        stubProfile(2L, 101L, "g");
        QuizRoomSnapshot host = service.createRoom(1L);
        service.joinByCode(2L, host.code());

        service.startGame(1L, host.roomId());

        assertThatThrownBy(() -> service.startGame(1L, host.roomId()))
                .isInstanceOf(
                        com.comong.backend.domain.quiz.exception.QuizRoomNotReadyToStartException
                                .class);
    }

    @Test
    void gameFinishBroadcastsFinalScoresAndReturnsRoomToWaiting() throws InterruptedException {
        stubProfile(1L, 100L, "h");
        stubProfile(2L, 101L, "g");
        QuizRoomSnapshot host = service.createRoom(1L);
        service.joinByCode(2L, host.code());

        service.startGame(1L, host.roomId(), 3);
        for (int i = 0; i < 3; i++) {
            QuizRoom current = registry.findById(host.roomId()).orElseThrow();
            long guesser = current.currentDrawerUserId() == 1L ? 2L : 1L;
            service.submitGuess(guesser, host.roomId(), current.currentPrompt().word());
            Thread.sleep(2_700L);
        }

        QuizRoom room = registry.findById(host.roomId()).orElseThrow();
        assertThat(room.status()).isEqualTo(QuizRoomStatus.WAITING);
        assertThat(room.roundNumber()).isZero();
        assertThat(room.currentDrawerUserId()).isZero();
        assertThat(room.roundEndsAt()).isNull();
        assertThat(room.members()).allMatch(member -> member.score() == 0);
        verify(broadcastService, atLeastOnce())
                .broadcastEvent(
                        eq(host.roomId()),
                        org.mockito.ArgumentMatchers.argThat(
                                ev ->
                                        ev != null
                                                && "game_finished".equals(ev.type())
                                                && ev.members() != null
                                                && ev.members().stream()
                                                        .anyMatch(
                                                                member ->
                                                                        member.userId() == 2L
                                                                                && member.score()
                                                                                        == 4)));
    }

    @Test
    void roundTimeoutAutomaticallyStartsNextRound() throws InterruptedException {
        QuizRealtimeProperties fastProperties = new QuizRealtimeProperties(true, MIN, MAX, 1, 60);
        QuizRoomRegistry fastRegistry = new QuizRoomRegistry(fastProperties);
        QuizRoomService fastService =
                new QuizRoomService(
                        fastRegistry, broadcastService, patientProfileService, promptCatalog);
        stubProfile(1L, 100L, "h");
        stubProfile(2L, 101L, "g");

        try {
            QuizRoomSnapshot host = fastService.createRoom(1L);
            fastService.joinByCode(2L, host.code());
            fastService.startGame(1L, host.roomId());

            Thread.sleep(3_700L);

            QuizRoom room = fastRegistry.findById(host.roomId()).orElseThrow();
            assertThat(room.roundNumber()).isEqualTo(2);
            assertThat(room.roundResolved()).isFalse();
            verify(broadcastService, times(2))
                    .broadcastEvent(
                            eq(host.roomId()),
                            org.mockito.ArgumentMatchers.argThat(
                                    ev -> ev != null && "round_started".equals(ev.type())));
            verify(broadcastService, times(1))
                    .broadcastEvent(
                            eq(host.roomId()),
                            org.mockito.ArgumentMatchers.argThat(
                                    ev -> ev != null && "round_ended".equals(ev.type())));
        } finally {
            fastService.shutdownScheduler();
        }
    }

    private void stubProfile(long userId, long profileId, String nickname) {
        PatientProfile profile = mock(PatientProfile.class);
        when(profile.getId()).thenReturn(profileId);
        when(profile.getNickname()).thenReturn(nickname);
        when(patientProfileService.findEntityByUserId(userId)).thenReturn(Optional.of(profile));
    }
}
