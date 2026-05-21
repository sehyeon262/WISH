package com.comong.backend.domain.village.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.Type;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.messaging.converter.MappingJackson2MessageConverter;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

import com.comong.backend.domain.patient.entity.Gender;
import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.user.entity.User;
import com.comong.backend.domain.user.entity.UserRole;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.domain.village.realtime.service.VillagePresenceService;
import com.comong.backend.global.security.JwtTokenProvider;
import com.comong.backend.support.IntegrationTestSupport;

/**
 * 마을 광장 WS 인프라 + relay 라운드트립 통합 테스트.
 *
 * <p>커버:
 *
 * <ul>
 *   <li>S14P31E103-714: CONNECT 인증 (토큰 누락/위조 거부)
 *   <li>S14P31E103-717: presence 등록/제거 (no-profile 거부, disconnect → 정리)
 *   <li>S14P31E103-718: ready → snapshot + join, position → move broadcast, disconnect → leave
 *       broadcast
 * </ul>
 *
 * <p>이 테스트 클래스는 Spring 컨텍스트를 비용 절감 차원에서 공유한다. 케이스마다 user/profile/presence 를 초기화.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = "app.realtime.village.enabled=true")
class VillageStompIntegrationTest extends IntegrationTestSupport {

    private static final String CONTEXT_PATH = "/api/v1";
    private static final long CONNECT_TIMEOUT_SECONDS = 5;
    private static final long RECEIVE_TIMEOUT_SECONDS = 5;

    /** SimpleBroker 는 SUBSCRIBE 에 RECEIPT 를 보내지 않아 등록 확정 신호가 없다. 짧은 sleep 으로 충분 — 동일 JVM 환경. */
    private static final long SUBSCRIBE_GRACE_MS = 200;

    @LocalServerPort private int port;
    @Autowired private JwtTokenProvider jwtTokenProvider;
    @Autowired private UserRepository userRepository;
    @Autowired private PatientProfileRepository patientProfileRepository;
    @Autowired private VillagePresenceService presenceService;

    private WebSocketStompClient stompClient;
    private final List<StompSession> openSessions = new ArrayList<>();
    private User userA;

    @BeforeEach
    void setUp() {
        patientProfileRepository.deleteAll();
        userRepository.deleteAll();
        userA = createUserWithProfile("village-tester@example.com", "guardianA", "꼬마곰");

        stompClient = new WebSocketStompClient(new StandardWebSocketClient());
        stompClient.setMessageConverter(new MappingJackson2MessageConverter());
    }

    @AfterEach
    void tearDown() {
        for (StompSession session : openSessions) {
            if (session.isConnected()) {
                session.disconnect();
            }
        }
        openSessions.clear();
        if (stompClient != null) {
            stompClient.stop();
        }
        patientProfileRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void connectIsRejectedWhenAuthorizationHeaderMissing() {
        assertThatThrownBy(() -> connect(new StompHeaders()))
                .isInstanceOf(ExecutionException.class);
    }

    @Test
    void connectIsRejectedWhenJwtIsInvalid() {
        StompHeaders headers = new StompHeaders();
        headers.add("Authorization", "Bearer not-a-real-jwt");
        assertThatThrownBy(() -> connect(headers)).isInstanceOf(ExecutionException.class);
    }

    @Test
    void connectIsRejectedWhenUserHasNoPatientProfile() {
        patientProfileRepository.deleteAll();

        StompHeaders headers = new StompHeaders();
        headers.add("Authorization", "Bearer " + tokenFor(userA));

        assertThatThrownBy(() -> connect(headers)).isInstanceOf(ExecutionException.class);
        assertThat(presenceService.size("village.default")).isZero();
    }

    @Test
    void disconnectRemovesPresence() throws Exception {
        StompSession session = connectAsUser(userA);
        waitUntilPresenceSizeEquals(1);

        session.disconnect();
        waitUntilPresenceSizeEquals(0);
    }

    @Test
    void readySendsSnapshotAndBroadcastsJoin() throws Exception {
        // 첫 입장자라 토픽 구독자는 자기 자신뿐 — 자기 join broadcast 도 수신한다 (FE 가 localUserId 필터링).
        StompSession session = connectAsUser(userA);

        LinkedBlockingQueue<Map<String, Object>> topicEvents = subscribeTopic(session);
        LinkedBlockingQueue<Map<String, Object>> snapshots = subscribeSnapshot(session);
        Thread.sleep(SUBSCRIBE_GRACE_MS);

        session.send("/app/village.default/ready", new byte[0]);

        Map<String, Object> snapshot = snapshots.poll(RECEIVE_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        assertThat(snapshot).isNotNull();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> members = (List<Map<String, Object>>) snapshot.get("members");
        assertThat(members).hasSize(1);
        assertThat(members.get(0).get("userId")).isEqualTo(userA.getId().intValue());
        assertThat(members.get(0).get("nickname")).isEqualTo("꼬마곰");

        Map<String, Object> joinEvent = topicEvents.poll(RECEIVE_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        assertThat(joinEvent).isNotNull();
        assertThat(joinEvent.get("type")).isEqualTo("join");
        assertThat(joinEvent.get("userId")).isEqualTo(userA.getId().intValue());
        assertThat(joinEvent.get("nickname")).isEqualTo("꼬마곰");
    }

    @Test
    void positionPublishBroadcastsMoveEventToOtherMembers() throws Exception {
        // 두 명 입장. A 가 position 발행 → B 가 move 이벤트 수신.
        User userB = createUserWithProfile("villager-b@example.com", "guardianB", "구름");

        StompSession sessionA = connectAsUser(userA);
        StompSession sessionB = connectAsUser(userB);

        LinkedBlockingQueue<Map<String, Object>> eventsForB = subscribeTopic(sessionB);
        Thread.sleep(SUBSCRIBE_GRACE_MS);

        // A 가 위치 발행
        sessionA.send(
                "/app/village.default/position",
                Map.of("x", 0.42, "y", 0.78, "dir", "left", "moving", true));

        Map<String, Object> moveEvent = pollUntilType(eventsForB, "move", RECEIVE_TIMEOUT_SECONDS);
        assertThat(moveEvent).isNotNull();
        assertThat(moveEvent.get("userId")).isEqualTo(userA.getId().intValue());
        assertThat(moveEvent.get("x")).isEqualTo(0.42);
        assertThat(moveEvent.get("y")).isEqualTo(0.78);
        assertThat(moveEvent.get("dir")).isEqualTo("left");
        assertThat(moveEvent.get("moving")).isEqualTo(true);
    }

    @Test
    void disconnectBroadcastsLeaveEventToOtherMembers() throws Exception {
        User userB = createUserWithProfile("villager-leave@example.com", "guardianB", "구름");

        StompSession sessionA = connectAsUser(userA);
        StompSession sessionB = connectAsUser(userB);

        LinkedBlockingQueue<Map<String, Object>> eventsForB = subscribeTopic(sessionB);
        Thread.sleep(SUBSCRIBE_GRACE_MS);

        // disconnect 는 WS close → async SessionDisconnectEvent → listener → broadcast 의 다단계 비동기.
        // 위 sleep 만으로 SimpleBroker 의 구독 등록 완료가 보장되지 않아 느린 CI 에선 leave broadcast 가
        // 미등록 구독으로 빠지면 유실된다. A 가 먼저 position 을 쏴 B 가 move 를 받으면 구독이 결정적으로 활성.
        sessionA.send(
                "/app/village.default/position",
                Map.of("x", 0.5, "y", 0.5, "dir", "down", "moving", false));
        Map<String, Object> subscriptionWarmup =
                pollUntilType(eventsForB, "move", RECEIVE_TIMEOUT_SECONDS);
        assertThat(subscriptionWarmup).isNotNull();

        sessionA.disconnect();

        Map<String, Object> leaveEvent =
                pollUntilType(eventsForB, "leave", RECEIVE_TIMEOUT_SECONDS);
        assertThat(leaveEvent).isNotNull();
        assertThat(leaveEvent.get("userId")).isEqualTo(userA.getId().intValue());
    }

    @Test
    void readyBroadcastsJoinToExistingMembers() throws Exception {
        // 기존 A 가 ready 한 상태에서 B 가 입장 → B 의 ready 시 A 가 B 의 join 을 토픽에서 수신.
        User userB = createUserWithProfile("villager-join@example.com", "guardianB", "구름");

        StompSession sessionA = connectAsUser(userA);
        LinkedBlockingQueue<Map<String, Object>> eventsForA = subscribeTopic(sessionA);
        Thread.sleep(SUBSCRIBE_GRACE_MS);
        sessionA.send("/app/village.default/ready", new byte[0]);
        // A 자신의 join 이벤트를 한 번 소비
        pollUntilType(eventsForA, "join", RECEIVE_TIMEOUT_SECONDS);

        StompSession sessionB = connectAsUser(userB);
        subscribeSnapshot(sessionB); // 받지 않더라도 클라가 구독해야 서버가 보낼 destination 생긴다
        Thread.sleep(SUBSCRIBE_GRACE_MS);
        sessionB.send("/app/village.default/ready", new byte[0]);

        Map<String, Object> bJoin =
                pollUntilUserId(eventsForA, "join", userB.getId(), RECEIVE_TIMEOUT_SECONDS);
        assertThat(bJoin).isNotNull();
        assertThat(bJoin.get("nickname")).isEqualTo("구름");
    }

    @Test
    void emotePublishBroadcastsEmoteEventToOtherMembers() throws Exception {
        // S14P31E103-728: 화이트리스트 이모지가 다른 멤버 토픽으로 정상 broadcast 되는지.
        User userB = createUserWithProfile("villager-emote@example.com", "guardianB", "구름");

        StompSession sessionA = connectAsUser(userA);
        StompSession sessionB = connectAsUser(userB);

        LinkedBlockingQueue<Map<String, Object>> eventsForB = subscribeTopic(sessionB);
        Thread.sleep(SUBSCRIBE_GRACE_MS);

        sessionA.send("/app/village.default/emote", Map.of("emoji", "😄"));

        Map<String, Object> emoteEvent =
                pollUntilType(eventsForB, "emote", RECEIVE_TIMEOUT_SECONDS);
        assertThat(emoteEvent).isNotNull();
        assertThat(emoteEvent.get("userId")).isEqualTo(userA.getId().intValue());
        assertThat(emoteEvent.get("emoji")).isEqualTo("😄");
    }

    @Test
    void emoteOutsideWhitelistIsSilentlyDropped() throws Exception {
        // 화이트리스트 밖 이모지를 보내면 서버가 조용히 drop — 토픽에 broadcast 되지 않는다.
        User userB = createUserWithProfile("villager-bad-emote@example.com", "guardianB", "구름");

        StompSession sessionA = connectAsUser(userA);
        StompSession sessionB = connectAsUser(userB);

        LinkedBlockingQueue<Map<String, Object>> eventsForB = subscribeTopic(sessionB);
        Thread.sleep(SUBSCRIBE_GRACE_MS);

        sessionA.send("/app/village.default/emote", Map.of("emoji", "💀"));

        // 짧은 시간 안에 emote 이벤트가 도착하지 않아야 한다.
        Map<String, Object> emoteEvent = pollUntilType(eventsForB, "emote", 1);
        assertThat(emoteEvent).isNull();
    }

    // ---------- helpers ----------

    private User createUserWithProfile(
            String email, String guardianNickname, String patientNickname) {
        User user =
                userRepository.save(
                        User.builder()
                                .email(email)
                                .nickname(guardianNickname)
                                .password("encoded-password")
                                .role(UserRole.USER)
                                .build());
        patientProfileRepository.save(
                PatientProfile.builder()
                        .user(user)
                        .name(patientNickname)
                        .nickname(patientNickname)
                        .birthDate(LocalDate.of(2020, 1, 1))
                        .gender(Gender.MALE)
                        .build());
        return user;
    }

    private String tokenFor(User user) {
        return jwtTokenProvider.createAccessToken(user.getId(), user.getEmail(), UserRole.USER);
    }

    private StompSession connectAsUser(User user) throws Exception {
        StompHeaders headers = new StompHeaders();
        headers.add("Authorization", "Bearer " + tokenFor(user));
        StompSession session = connect(headers);
        openSessions.add(session);
        return session;
    }

    private StompSession connect(StompHeaders connectHeaders) throws Exception {
        return stompClient
                .connectAsync(
                        "ws://localhost:" + port + CONTEXT_PATH + "/ws/village",
                        new WebSocketHttpHeaders(),
                        connectHeaders,
                        new StompSessionHandlerAdapter() {})
                .get(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS);
    }

    @SuppressWarnings("unchecked")
    private LinkedBlockingQueue<Map<String, Object>> subscribeTopic(StompSession session) {
        LinkedBlockingQueue<Map<String, Object>> queue = new LinkedBlockingQueue<>();
        session.subscribe(
                "/topic/village.default",
                new StompFrameHandler() {
                    @Override
                    public Type getPayloadType(StompHeaders headers) {
                        return Map.class;
                    }

                    @Override
                    public void handleFrame(StompHeaders headers, Object payload) {
                        queue.add((Map<String, Object>) payload);
                    }
                });
        return queue;
    }

    @SuppressWarnings("unchecked")
    private LinkedBlockingQueue<Map<String, Object>> subscribeSnapshot(StompSession session) {
        LinkedBlockingQueue<Map<String, Object>> queue = new LinkedBlockingQueue<>();
        session.subscribe(
                "/user/queue/village.snapshot",
                new StompFrameHandler() {
                    @Override
                    public Type getPayloadType(StompHeaders headers) {
                        return Map.class;
                    }

                    @Override
                    public void handleFrame(StompHeaders headers, Object payload) {
                        queue.add((Map<String, Object>) payload);
                    }
                });
        return queue;
    }

    private Map<String, Object> pollUntilType(
            LinkedBlockingQueue<Map<String, Object>> queue, String type, long timeoutSeconds)
            throws InterruptedException {
        long deadline = System.currentTimeMillis() + timeoutSeconds * 1_000L;
        while (System.currentTimeMillis() < deadline) {
            long remaining = Math.max(50L, deadline - System.currentTimeMillis());
            Map<String, Object> event = queue.poll(remaining, TimeUnit.MILLISECONDS);
            if (event == null) {
                return null;
            }
            if (type.equals(event.get("type"))) {
                return event;
            }
        }
        return null;
    }

    private Map<String, Object> pollUntilUserId(
            LinkedBlockingQueue<Map<String, Object>> queue,
            String type,
            Long userId,
            long timeoutSeconds)
            throws InterruptedException {
        long deadline = System.currentTimeMillis() + timeoutSeconds * 1_000L;
        while (System.currentTimeMillis() < deadline) {
            long remaining = Math.max(50L, deadline - System.currentTimeMillis());
            Map<String, Object> event = queue.poll(remaining, TimeUnit.MILLISECONDS);
            if (event == null) {
                return null;
            }
            if (type.equals(event.get("type"))
                    && userId.intValue() == ((Number) event.get("userId")).intValue()) {
                return event;
            }
        }
        return null;
    }

    private void waitUntilPresenceSizeEquals(int expected) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 3_000L;
        while (presenceService.size("village.default") != expected
                && System.currentTimeMillis() < deadline) {
            Thread.sleep(50);
        }
        assertThat(presenceService.size("village.default")).isEqualTo(expected);
    }
}
