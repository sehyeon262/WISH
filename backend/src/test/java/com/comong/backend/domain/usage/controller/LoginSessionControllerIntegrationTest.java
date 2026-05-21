package com.comong.backend.domain.usage.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.comong.backend.domain.notification.service.GuardianPushNotificationService;
import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.realtime.dto.RealtimeEventResponse;
import com.comong.backend.domain.realtime.dto.RealtimeEventType;
import com.comong.backend.domain.realtime.service.RealtimeEventService;
import com.comong.backend.domain.usage.entity.LoginSession;
import com.comong.backend.domain.usage.repository.LoginSessionRepository;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.support.IntegrationTestSupport;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Login session API 동작 검증. duration_seconds 값 정확성은 시계 의존이라 {@link
 * com.comong.backend.domain.usage.entity.LoginSessionTest} 가 결정적으로 검증하고, 본 테스트는 엔드포인트 응답·상태 전이만 본다.
 */
@AutoConfigureMockMvc
class LoginSessionControllerIntegrationTest extends IntegrationTestSupport {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private LoginSessionRepository loginSessionRepository;
    @Autowired private PatientProfileRepository patientProfileRepository;
    @Autowired private UserRepository userRepository;
    @MockitoBean private RealtimeEventService realtimeEventService;
    @MockitoBean private GuardianPushNotificationService guardianPushNotificationService;

    @BeforeEach
    void cleanDb() {
        cleanAll();
    }

    @AfterEach
    void cleanDbAfter() {
        cleanAll();
    }

    private void cleanAll() {
        loginSessionRepository.deleteAll();
        patientProfileRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void start_persistsSessionAndReturns201() throws Exception {
        String token = setupUserWithProfile("login-start@example.com", "login-start");
        long patientProfileId = ownProfileId(token);

        mockMvc.perform(
                        post("/login-sessions")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"patientProfileId\":" + patientProfileId + "}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.id").isNumber())
                .andExpect(jsonPath("$.data.patientProfileId").value(patientProfileId))
                .andExpect(jsonPath("$.data.startedAt").exists())
                .andExpect(jsonPath("$.data.lastHeartbeatAt").exists())
                .andExpect(jsonPath("$.data.endedAt").doesNotExist())
                .andExpect(jsonPath("$.data.durationSeconds").value(0));

        assertThat(loginSessionRepository.count()).isEqualTo(1);
    }

    @Test
    void start_publishesGameStartedRealtimeEvent() throws Exception {
        String token = setupUserWithProfile("login-start-sse@example.com", "login-start-sse");
        long userId = userIdFromToken(token);
        long patientProfileId = ownProfileId(token);

        String body =
                mockMvc.perform(
                                post("/login-sessions")
                                        .header("Authorization", "Bearer " + token)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content("{\"patientProfileId\":" + patientProfileId + "}"))
                        .andExpect(status().isCreated())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        long sessionId = objectMapper.readTree(body).get("data").get("id").asLong();

        ArgumentCaptor<RealtimeEventResponse> eventCaptor =
                ArgumentCaptor.forClass(RealtimeEventResponse.class);
        verify(realtimeEventService).publish(eq(userId), eventCaptor.capture());

        RealtimeEventResponse event = eventCaptor.getValue();
        assertThat(event.type()).isEqualTo(RealtimeEventType.GAME_STARTED);
        assertThat(event.loginSessionId()).isEqualTo(sessionId);
        assertThat(event.patientProfileId()).isEqualTo(patientProfileId);
        assertThat(event.patientName()).isEqualTo("Patient");
        assertThat(event.contentType()).isNull();
    }

    @Test
    void start_sendsGameStartedPushNotification() throws Exception {
        String token = setupUserWithProfile("login-start-push@example.com", "login-start-push");
        long userId = userIdFromToken(token);
        long patientProfileId = ownProfileId(token);

        String body =
                mockMvc.perform(
                                post("/login-sessions")
                                        .header("Authorization", "Bearer " + token)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content("{\"patientProfileId\":" + patientProfileId + "}"))
                        .andExpect(status().isCreated())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        long sessionId = objectMapper.readTree(body).get("data").get("id").asLong();

        verify(guardianPushNotificationService)
                .sendGameStarted(userId, sessionId, patientProfileId, "Patient");
    }

    @Test
    void heartbeat_returnsActiveSession() throws Exception {
        String token = setupUserWithProfile("login-hb@example.com", "login-hb");
        long sessionId = startSession(token);

        mockMvc.perform(
                        patch("/login-sessions/{id}/heartbeat", sessionId)
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.id").value(sessionId))
                .andExpect(jsonPath("$.data.endedAt").doesNotExist())
                .andExpect(jsonPath("$.data.durationSeconds").isNumber());

        LoginSession session = loginSessionRepository.findById(sessionId).orElseThrow();
        assertThat(session.getEndedAt()).isNull();
    }

    @Test
    void end_finalizesSession() throws Exception {
        String token = setupUserWithProfile("login-end@example.com", "login-end");
        long sessionId = startSession(token);

        mockMvc.perform(
                        patch("/login-sessions/{id}/end", sessionId)
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.endedAt").exists());

        LoginSession session = loginSessionRepository.findById(sessionId).orElseThrow();
        assertThat(session.getEndedAt()).isNotNull();
    }

    @Test
    void end_publishesGameEndedRealtimeEvent() throws Exception {
        String token = setupUserWithProfile("login-end-sse@example.com", "login-end-sse");
        long userId = userIdFromToken(token);
        long sessionId = startSession(token);
        long patientProfileId = ownProfileId(token);
        clearInvocations(realtimeEventService);

        mockMvc.perform(
                        patch("/login-sessions/{id}/end", sessionId)
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        ArgumentCaptor<RealtimeEventResponse> eventCaptor =
                ArgumentCaptor.forClass(RealtimeEventResponse.class);
        verify(realtimeEventService).publish(eq(userId), eventCaptor.capture());

        RealtimeEventResponse event = eventCaptor.getValue();
        assertThat(event.type()).isEqualTo(RealtimeEventType.GAME_ENDED);
        assertThat(event.loginSessionId()).isEqualTo(sessionId);
        assertThat(event.patientProfileId()).isEqualTo(patientProfileId);
        assertThat(event.patientName()).isNull();
        assertThat(event.contentType()).isNull();
    }

    @Test
    void end_alreadyEndedSession_doesNotPublishDuplicateGameEndedEvent() throws Exception {
        String token = setupUserWithProfile("login-end-once@example.com", "login-end-once");
        long sessionId = startSession(token);

        mockMvc.perform(
                        patch("/login-sessions/{id}/end", sessionId)
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        clearInvocations(realtimeEventService);

        mockMvc.perform(
                        patch("/login-sessions/{id}/end", sessionId)
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        verifyNoInteractions(realtimeEventService);
    }

    @Test
    void heartbeatAfterEnd_isNoOp() throws Exception {
        String token = setupUserWithProfile("login-hbafterend@example.com", "login-hbafterend");
        long sessionId = startSession(token);

        mockMvc.perform(
                        patch("/login-sessions/{id}/end", sessionId)
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        LoginSession ended = loginSessionRepository.findById(sessionId).orElseThrow();
        java.time.LocalDateTime endedAt = ended.getEndedAt();
        int durationAtEnd = ended.getDurationSeconds();

        mockMvc.perform(
                        patch("/login-sessions/{id}/heartbeat", sessionId)
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        LoginSession after = loginSessionRepository.findById(sessionId).orElseThrow();
        assertThat(after.getEndedAt()).isEqualTo(endedAt);
        assertThat(after.getDurationSeconds()).isEqualTo(durationAtEnd);
    }

    @Test
    void heartbeat_otherUsersSession_returns404WithUs001() throws Exception {
        String ownerToken = setupUserWithProfile("login-owner@example.com", "login-owner");
        long sessionId = startSession(ownerToken);

        String otherToken = setupUserWithProfile("login-other@example.com", "login-other");

        mockMvc.perform(
                        patch("/login-sessions/{id}/heartbeat", sessionId)
                                .header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("US-001"));
    }

    @Test
    void start_requiresAuthentication() throws Exception {
        mockMvc.perform(
                        post("/login-sessions")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"patientProfileId\":1}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("G-003"));
    }

    /**
     * heartbeat 와 end 가 동시에 들어와도 종료 상태가 유실되지 않아야 한다 (lost update 방지). PESSIMISTIC_WRITE 락이 두 요청을
     * 직렬화해 어느 쪽이 먼저 와도 결과는 ended=true 로 수렴.
     */
    @Test
    void heartbeatAndEndConcurrent_endStatePersists() throws Exception {
        String token = setupUserWithProfile("login-race@example.com", "login-race");
        long sessionId = startSession(token);

        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(2);
        AtomicReference<Throwable> failure = new AtomicReference<>();
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            executor.submit(
                    () -> {
                        try {
                            start.await();
                            mockMvc.perform(
                                            patch("/login-sessions/{id}/heartbeat", sessionId)
                                                    .header("Authorization", "Bearer " + token))
                                    .andExpect(status().isOk());
                        } catch (Throwable t) {
                            failure.compareAndSet(null, t);
                        } finally {
                            done.countDown();
                        }
                    });
            executor.submit(
                    () -> {
                        try {
                            start.await();
                            mockMvc.perform(
                                            patch("/login-sessions/{id}/end", sessionId)
                                                    .header("Authorization", "Bearer " + token))
                                    .andExpect(status().isOk());
                        } catch (Throwable t) {
                            failure.compareAndSet(null, t);
                        } finally {
                            done.countDown();
                        }
                    });

            start.countDown();
            assertThat(done.await(10, TimeUnit.SECONDS)).isTrue();
        } finally {
            executor.shutdownNow();
        }

        if (failure.get() != null) {
            throw new AssertionError("concurrent request failed", failure.get());
        }

        LoginSession session = loginSessionRepository.findById(sessionId).orElseThrow();
        assertThat(session.getEndedAt()).isNotNull();
        assertThat(session.isEnded()).isTrue();
    }

    @Test
    void start_otherUsersPatientProfile_returns404WithP001() throws Exception {
        String ownerToken = setupUserWithProfile("login-pown@example.com", "login-pown");
        long ownerPatientId = ownProfileId(ownerToken);

        String otherToken = setupUserWithProfile("login-pother@example.com", "login-pother");

        mockMvc.perform(
                        post("/login-sessions")
                                .header("Authorization", "Bearer " + otherToken)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"patientProfileId\":" + ownerPatientId + "}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("P-001"));
    }

    private long startSession(String token) throws Exception {
        long patientProfileId = ownProfileId(token);
        String body =
                mockMvc.perform(
                                post("/login-sessions")
                                        .header("Authorization", "Bearer " + token)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content("{\"patientProfileId\":" + patientProfileId + "}"))
                        .andExpect(status().isCreated())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        return objectMapper.readTree(body).get("data").get("id").asLong();
    }

    private long ownProfileId(String token) throws Exception {
        String body =
                mockMvc.perform(get("/patient-profiles").header("Authorization", "Bearer " + token))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        return objectMapper.readTree(body).get("data").get(0).get("id").asLong();
    }

    private long userIdFromToken(String token) throws Exception {
        JsonNode payload = decodeTokenPayload(token);
        return payload.get("sub").asLong();
    }

    private JsonNode decodeTokenPayload(String token) throws Exception {
        String[] parts = token.split("\\.");
        byte[] payload = Base64.getUrlDecoder().decode(parts[1]);
        return objectMapper.readTree(new String(payload, StandardCharsets.UTF_8));
    }

    private String setupUserWithProfile(String email, String nickname) throws Exception {
        String token = setupUser(email, nickname);
        mockMvc.perform(
                        post("/patient-profiles")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"name\":\"Patient\",\"nickname\":\"patient\","
                                                + "\"birthDate\":\"2020-01-01\","
                                                + "\"gender\":\"MALE\"}"))
                .andExpect(status().isCreated());
        return token;
    }

    private String setupUser(String email, String nickname) throws Exception {
        signup(email, nickname, "P@ssw0rd!");
        return login(email, "P@ssw0rd!");
    }

    private void signup(String email, String nickname, String password) throws Exception {
        mockMvc.perform(
                        post("/auth/signup")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"email\":\""
                                                + email
                                                + "\",\"nickname\":\""
                                                + nickname
                                                + "\",\"password\":\""
                                                + password
                                                + "\"}"))
                .andExpect(status().isCreated());
    }

    private String login(String email, String password) throws Exception {
        String body =
                mockMvc.perform(
                                post("/auth/login")
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(
                                                "{\"email\":\""
                                                        + email
                                                        + "\",\"password\":\""
                                                        + password
                                                        + "\"}"))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        return objectMapper.readTree(body).get("data").get("accessToken").asString();
    }
}
