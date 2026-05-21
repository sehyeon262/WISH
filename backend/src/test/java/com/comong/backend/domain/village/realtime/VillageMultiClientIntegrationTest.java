package com.comong.backend.domain.village.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.Type;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
import com.comong.backend.global.security.JwtTokenProvider;
import com.comong.backend.support.IntegrationTestSupport;

/**
 * S14P31E103-722: 마을 광장 다중 클라이언트 시나리오 통합 검증.
 *
 * <p>단일 클라 라운드트립은 {@link VillageStompIntegrationTest} 가 커버한다. 본 클래스는 3명 이상 동시 접속 / 룸 정원 초과 거부 등
 * 멀티플레이 특유의 결합도가 높은 시나리오에 집중. 캡 검증을 위해 room-capacity 를 2로 override.
 *
 * <p>수동 검증 (브라우저 멀티 탭, 모바일 동시 접속, FPS, VillageScene ↔ ThemeScene 전환 cleanup 등) 은 {@code
 * backend/docs/village-realtime.md} 12절 체크리스트 참고.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(
        properties = {"app.realtime.village.enabled=true", "app.realtime.village.room-capacity=2"})
class VillageMultiClientIntegrationTest extends IntegrationTestSupport {

    private static final String CONTEXT_PATH = "/api/v1";
    private static final long CONNECT_TIMEOUT_SECONDS = 5;
    private static final long RECEIVE_TIMEOUT_SECONDS = 5;
    private static final long SUBSCRIBE_GRACE_MS = 200;

    @LocalServerPort private int port;
    @Autowired private JwtTokenProvider jwtTokenProvider;
    @Autowired private UserRepository userRepository;
    @Autowired private PatientProfileRepository patientProfileRepository;

    private WebSocketStompClient stompClient;
    private final List<StompSession> openSessions = new ArrayList<>();

    @BeforeEach
    void setUp() {
        patientProfileRepository.deleteAll();
        userRepository.deleteAll();
        stompClient = new WebSocketStompClient(new StandardWebSocketClient());
        stompClient.setMessageConverter(new MappingJackson2MessageConverter());
    }

    @AfterEach
    void tearDown() {
        for (StompSession s : openSessions) {
            if (s.isConnected()) {
                s.disconnect();
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
    void thirdClientReceivesSnapshotContainingBothExistingMembers() throws Exception {
        // 캡=2 인 환경에서 의도적으로 3번째 입장이 실패하는 분기와 분리하기 위해, 본 시나리오는 2명만 사용해
        // 마지막 입장자가 기존 입장자 전원을 스냅샷으로 받는지 검증한다.
        User userA = createUserWithProfile("multi-a@example.com", "guardianA", "꼬마곰");
        User userB = createUserWithProfile("multi-b@example.com", "guardianB", "구름");

        StompSession sessionA = connectAndReady(userA);
        StompSession sessionB = connectAsUser(userB);
        LinkedBlockingQueue<Map<String, Object>> snapshotsForB = subscribeSnapshot(sessionB);
        Thread.sleep(SUBSCRIBE_GRACE_MS);
        sessionB.send("/app/village.default/ready", new byte[0]);

        Map<String, Object> snapshot =
                snapshotsForB.poll(RECEIVE_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        assertThat(snapshot).isNotNull();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> members = (List<Map<String, Object>>) snapshot.get("members");
        Set<Integer> userIds = new HashSet<>();
        for (Map<String, Object> member : members) {
            userIds.add(((Number) member.get("userId")).intValue());
        }
        assertThat(userIds).contains(userA.getId().intValue(), userB.getId().intValue());

        // 사용 안 하지만 lint 에 안 걸리도록 명시적 종료
        sessionA.disconnect();
    }

    @Test
    void connectIsRejectedWhenRoomCapacityIsExceeded() {
        // 캡=2. 3번째 사용자는 connect 자체가 거부된다.
        User userA = createUserWithProfile("cap-a@example.com", "ga", "a");
        User userB = createUserWithProfile("cap-b@example.com", "gb", "b");
        User userC = createUserWithProfile("cap-c@example.com", "gc", "c");

        assertThatNoException()
                .isThrownBy(
                        () -> {
                            connectAsUser(userA);
                            connectAsUser(userB);
                        });

        assertThatThrownBy(() -> connectAsUser(userC)).isInstanceOf(ExecutionException.class);
    }

    @Test
    void cleanupAfterDisconnectRestoresCapacity() throws Exception {
        // 캡=2. A 입장 → B 입장 → A 떠나면 다시 한 자리 비어 C 가 입장 가능.
        User userA = createUserWithProfile("cap-rotate-a@example.com", "ga", "a");
        User userB = createUserWithProfile("cap-rotate-b@example.com", "gb", "b");
        User userC = createUserWithProfile("cap-rotate-c@example.com", "gc", "c");

        StompSession sessionA = connectAsUser(userA);
        StompSession sessionB = connectAsUser(userB);

        // C 가 들어오려 하면 캡 초과로 거부
        assertThatThrownBy(() -> connectAsUser(userC)).isInstanceOf(ExecutionException.class);

        // A 가 떠난다 — disconnect 이벤트가 presence 에서 A 를 제거할 때까지 잠시 기다린다.
        sessionA.disconnect();
        waitMs(SUBSCRIBE_GRACE_MS);

        // 이제 C 가 입장 가능
        StompSession sessionC = connectAsUser(userC);
        assertThat(sessionC.isConnected()).isTrue();
        sessionB.disconnect();
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

    private StompSession connectAsUser(User user) throws Exception {
        StompHeaders headers = new StompHeaders();
        headers.add(
                "Authorization",
                "Bearer "
                        + jwtTokenProvider.createAccessToken(
                                user.getId(), user.getEmail(), UserRole.USER));
        StompSession session =
                stompClient
                        .connectAsync(
                                "ws://localhost:" + port + CONTEXT_PATH + "/ws/village",
                                new WebSocketHttpHeaders(),
                                headers,
                                new StompSessionHandlerAdapter() {})
                        .get(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        openSessions.add(session);
        return session;
    }

    private StompSession connectAndReady(User user) throws Exception {
        StompSession session = connectAsUser(user);
        waitMs(SUBSCRIBE_GRACE_MS);
        session.send("/app/village.default/ready", new byte[0]);
        return session;
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

    private static void waitMs(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
