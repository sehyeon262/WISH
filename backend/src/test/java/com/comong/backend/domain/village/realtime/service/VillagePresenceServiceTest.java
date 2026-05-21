package com.comong.backend.domain.village.realtime.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.service.PatientProfileService;
import com.comong.backend.domain.village.realtime.config.VillageRealtimeProperties;
import com.comong.backend.domain.village.realtime.exception.VillagePatientProfileMissingException;
import com.comong.backend.domain.village.realtime.exception.VillageRoomFullException;

/**
 * VillagePresenceService 의 핵심 동작 단위 검증. Spring 컨텍스트 없이 mock 만으로 빠르게 돈다.
 *
 * <p>S14P31E103-793 멀티룸 이후: 기존 동작은 단일 룸 ({@link #ROOM}) 으로 검증 + 멀티룸 격리도 별도 케이스.
 */
class VillagePresenceServiceTest {

    private static final int CAPACITY = 3;
    private static final int IDLE_SECONDS = 30;

    /** 기존 단일-룸 케이스에서 사용할 기본 룸 ID. */
    private static final String ROOM = "village.default";

    private PatientProfileService patientProfileService;
    private VillagePresenceService presenceService;

    @BeforeEach
    void setUp() {
        VillageRealtimeProperties properties =
                new VillageRealtimeProperties(true, 5, CAPACITY, IDLE_SECONDS);
        patientProfileService = mock(PatientProfileService.class);
        presenceService = new VillagePresenceService(properties, patientProfileService);
    }

    @Test
    void joinAddsMemberWithProfileNickname() {
        stubProfile(1L, 100L, "꼬마곰");

        VillagePresenceService.JoinResult result = presenceService.join("session-a", 1L, ROOM);

        assertThat(result.outcome()).isEqualTo(VillagePresenceService.JoinOutcome.JOINED);
        assertThat(result.roomId()).isEqualTo(ROOM);
        assertThat(result.member().nickname()).isEqualTo("꼬마곰");
        assertThat(result.member().patientProfileId()).isEqualTo(100L);
        assertThat(result.member().sessionId()).isEqualTo("session-a");
        assertThat(result.evicted()).isEmpty();
        assertThat(presenceService.size(ROOM)).isEqualTo(1);
    }

    @Test
    void joinRejectsWhenPatientProfileMissing() {
        when(patientProfileService.findEntityByUserId(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> presenceService.join("session-x", 99L, ROOM))
                .isInstanceOf(VillagePatientProfileMissingException.class);
        assertThat(presenceService.size(ROOM)).isZero();
    }

    @Test
    void joinRejectsWhenRoomFull() {
        stubProfile(1L, 100L, "n1");
        stubProfile(2L, 101L, "n2");
        stubProfile(3L, 102L, "n3");
        stubProfile(4L, 103L, "n4");

        presenceService.join("s1", 1L, ROOM);
        presenceService.join("s2", 2L, ROOM);
        presenceService.join("s3", 3L, ROOM);

        assertThatThrownBy(() -> presenceService.join("s4", 4L, ROOM))
                .isInstanceOf(VillageRoomFullException.class);
        assertThat(presenceService.size(ROOM)).isEqualTo(CAPACITY);
    }

    @Test
    void rejoinByExistingUserIdIsLatestWinsAndDoesNotConsumeCapacity() {
        stubProfile(1L, 100L, "n1");
        stubProfile(2L, 101L, "n2");
        stubProfile(3L, 102L, "n3");

        presenceService.join("s1", 1L, ROOM);
        presenceService.join("s2", 2L, ROOM);
        presenceService.join("s3", 3L, ROOM);

        VillagePresenceService.JoinResult replaced = presenceService.join("s2-new", 2L, ROOM);

        assertThat(replaced.outcome()).isEqualTo(VillagePresenceService.JoinOutcome.REPLACED);
        assertThat(replaced.member().sessionId()).isEqualTo("s2-new");
        assertThat(replaced.evicted()).isPresent();
        assertThat(replaced.evicted().get().sessionId()).isEqualTo("s2");
        assertThat(presenceService.size(ROOM)).isEqualTo(CAPACITY);
        assertThat(presenceService.findBySessionId("s2")).isEmpty();
        assertThat(presenceService.findBySessionId("s2-new")).isPresent();
    }

    @Test
    void leaveBySessionRemovesMember() {
        stubProfile(1L, 100L, "n1");
        presenceService.join("s1", 1L, ROOM);

        Optional<VillagePresenceService.LeaveOutcome> left = presenceService.leaveBySession("s1");

        assertThat(left).isPresent();
        assertThat(left.get().roomId()).isEqualTo(ROOM);
        assertThat(left.get().member().userId()).isEqualTo(1L);
        assertThat(presenceService.size(ROOM)).isZero();
    }

    @Test
    void leaveByEvictedSessionDoesNotRemoveNewMember() {
        // latest-wins 후 옛 세션의 늦은 disconnect 이벤트가 새 세션의 presence 를 지우면 안 된다.
        stubProfile(1L, 100L, "n1");
        presenceService.join("s1-old", 1L, ROOM);
        presenceService.join("s1-new", 1L, ROOM); // replaced

        Optional<VillagePresenceService.LeaveOutcome> stale =
                presenceService.leaveBySession("s1-old");

        assertThat(stale).isEmpty();
        assertThat(presenceService.findByUserId(ROOM, 1L)).isPresent();
        assertThat(presenceService.findByUserId(ROOM, 1L).get().sessionId()).isEqualTo("s1-new");
    }

    @Test
    void evictIdleRemovesMembersIdleBeyondThreshold() {
        stubProfile(1L, 100L, "n1");
        stubProfile(2L, 101L, "n2");
        presenceService.join("s1", 1L, ROOM);
        presenceService.join("s2", 2L, ROOM);

        Instant farFuture = Instant.now().plusSeconds(IDLE_SECONDS + 10);
        var evicted = presenceService.evictIdle(farFuture);

        assertThat(evicted).hasSize(2);
        assertThat(evicted).allMatch(o -> ROOM.equals(o.roomId()));
        assertThat(presenceService.size(ROOM)).isZero();
        assertThat(presenceService.findBySessionId("s1")).isEmpty();
        assertThat(presenceService.findBySessionId("s2")).isEmpty();
    }

    @Test
    void updatePositionAppliesNewCoordinates() {
        stubProfile(1L, 100L, "n1");
        presenceService.join("s1", 1L, ROOM);

        Optional<PlayerState> updated =
                presenceService.updatePosition(ROOM, 1L, "s1", 0.42, 0.78, "left", null);

        assertThat(updated).isPresent();
        assertThat(updated.get().x()).isEqualTo(0.42);
        assertThat(updated.get().y()).isEqualTo(0.78);
        assertThat(updated.get().dir()).isEqualTo("left");
        assertThat(presenceService.findByUserId(ROOM, 1L).get().x()).isEqualTo(0.42);
    }

    @Test
    void updatePositionAppliesTextureKeyWhenProvided() {
        stubProfile(1L, 100L, "n1");
        presenceService.join("s1", 1L, ROOM);

        Optional<PlayerState> updated =
                presenceService.updatePosition(
                        ROOM, 1L, "s1", 0.42, 0.78, "left", "character-outfit-girl1");

        assertThat(updated).isPresent();
        assertThat(updated.get().textureKey()).isEqualTo("character-outfit-girl1");
        assertThat(presenceService.findByUserId(ROOM, 1L).get().textureKey())
                .isEqualTo("character-outfit-girl1");
    }

    @Test
    void updatePositionReturnsEmptyForUnknownUser() {
        Optional<PlayerState> updated =
                presenceService.updatePosition(ROOM, 999L, "any", 0.1, 0.1, "down", null);

        assertThat(updated).isEmpty();
    }

    @Test
    void updatePositionRejectsGhostSession() {
        // S14P31E103-763: latest-wins 후 옛 세션이 보낸 패킷이 새 세션 좌표를 덮어쓰면 안 된다.
        stubProfile(1L, 100L, "n1");
        presenceService.join("s1-old", 1L, ROOM);
        presenceService.join("s1-new", 1L, ROOM); // replaced

        Optional<PlayerState> ghost =
                presenceService.updatePosition(ROOM, 1L, "s1-old", 0.9, 0.9, "right", null);

        assertThat(ghost).isEmpty();
        assertThat(presenceService.findByUserId(ROOM, 1L).get().x()).isNotEqualTo(0.9);
        assertThat(presenceService.findByUserId(ROOM, 1L).get().sessionId()).isEqualTo("s1-new");
    }

    @Test
    void registerEmoteReturnsMemberWhenFirstCall() {
        stubProfile(1L, 100L, "n1");
        presenceService.join("s1", 1L, ROOM);

        Optional<PlayerState> result = presenceService.registerEmote(ROOM, 1L, "s1", Instant.now());

        assertThat(result).isPresent();
        assertThat(result.get().userId()).isEqualTo(1L);
    }

    @Test
    void registerEmoteThrottlesSecondCallWithinTwoSeconds() {
        stubProfile(1L, 100L, "n1");
        presenceService.join("s1", 1L, ROOM);

        Instant now = Instant.now();
        presenceService.registerEmote(ROOM, 1L, "s1", now);
        Optional<PlayerState> tooSoon =
                presenceService.registerEmote(ROOM, 1L, "s1", now.plusMillis(500));

        assertThat(tooSoon).isEmpty();
    }

    @Test
    void registerEmoteAllowsAfterThrottleWindow() {
        stubProfile(1L, 100L, "n1");
        presenceService.join("s1", 1L, ROOM);

        Instant now = Instant.now();
        presenceService.registerEmote(ROOM, 1L, "s1", now);
        Optional<PlayerState> afterWindow =
                presenceService.registerEmote(ROOM, 1L, "s1", now.plusSeconds(3));

        assertThat(afterWindow).isPresent();
    }

    @Test
    void registerEmoteReturnsEmptyForUnknownMember() {
        Optional<PlayerState> result =
                presenceService.registerEmote(ROOM, 999L, "any", Instant.now());

        assertThat(result).isEmpty();
    }

    @Test
    void registerEmoteRejectsGhostSession() {
        // S14P31E103-763: 옛 세션의 emote 가 새 세션의 throttle 상태를 갉아먹지 않아야 한다.
        stubProfile(1L, 100L, "n1");
        presenceService.join("s1-old", 1L, ROOM);
        presenceService.join("s1-new", 1L, ROOM); // replaced

        Instant now = Instant.now();
        Optional<PlayerState> ghost = presenceService.registerEmote(ROOM, 1L, "s1-old", now);
        assertThat(ghost).isEmpty();

        Optional<PlayerState> fresh =
                presenceService.registerEmote(ROOM, 1L, "s1-new", now.plusMillis(10));
        assertThat(fresh).isPresent();
    }

    @Test
    void leaveBySessionClearsEmoteThrottle() {
        stubProfile(1L, 100L, "n1");
        presenceService.join("s1", 1L, ROOM);
        Instant now = Instant.now();
        presenceService.registerEmote(ROOM, 1L, "s1", now);

        presenceService.leaveBySession("s1");
        presenceService.join("s2", 1L, ROOM);

        Optional<PlayerState> fresh =
                presenceService.registerEmote(ROOM, 1L, "s2", now.plusMillis(100));
        assertThat(fresh).isPresent();
    }

    @Test
    void evictIdleSkipsFreshMembers() {
        stubProfile(1L, 100L, "n1");
        presenceService.join("s1", 1L, ROOM);

        Instant slightlyLater = Instant.now().plusSeconds(IDLE_SECONDS - 5);
        var evicted = presenceService.evictIdle(slightlyLater);

        assertThat(evicted).isEmpty();
        assertThat(presenceService.size(ROOM)).isEqualTo(1);
    }

    @Test
    void roomsAreIsolatedFromEachOther() {
        // S14P31E103-793: 두 룸의 멤버가 서로 안 보이고, 캡은 룸별 독립.
        stubProfile(1L, 100L, "n1");
        stubProfile(2L, 101L, "n2");

        presenceService.join("s1", 1L, "village.default");
        presenceService.join("s2", 2L, "gymnastics.select");

        assertThat(presenceService.size("village.default")).isEqualTo(1);
        assertThat(presenceService.size("gymnastics.select")).isEqualTo(1);
        assertThat(presenceService.findByUserId("village.default", 2L)).isEmpty();
        assertThat(presenceService.findByUserId("gymnastics.select", 1L)).isEmpty();
        // 다른 룸 멤버는 position/emote 업데이트가 들어와도 영향 없음
        assertThat(
                        presenceService.updatePosition(
                                "village.default", 2L, "s2", 0.9, 0.9, "left", null))
                .isEmpty();
    }

    @Test
    void sameUserCanJoinTwoDifferentRoomsConcurrently() {
        // 한 사용자가 룸을 옮길 때 (마을 → 체조 select), 양쪽 룸에 동시 멤버 존재 가능. FE 가 명시적으로 leave 하지 않으면 서버는
        // 둘 다 유지한다.
        stubProfile(1L, 100L, "n1");

        presenceService.join("s1", 1L, "village.default");
        presenceService.join("s2", 1L, "gymnastics.select");

        assertThat(presenceService.findByUserId("village.default", 1L)).isPresent();
        assertThat(presenceService.findByUserId("gymnastics.select", 1L)).isPresent();
    }

    private void stubProfile(long userId, long profileId, String nickname) {
        PatientProfile profile = mock(PatientProfile.class);
        when(profile.getId()).thenReturn(profileId);
        when(profile.getNickname()).thenReturn(nickname);
        when(patientProfileService.findEntityByUserId(userId)).thenReturn(Optional.of(profile));
    }
}
