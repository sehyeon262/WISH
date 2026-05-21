package com.comong.backend.domain.realtime.controller;

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

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.realtime.dto.RealtimeEventResponse;
import com.comong.backend.domain.realtime.dto.RealtimeEventType;
import com.comong.backend.domain.realtime.service.RealtimeEventService;
import com.comong.backend.domain.realtime.service.RealtimeLiveKitPermissionService;
import com.comong.backend.domain.usage.repository.LoginSessionRepository;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.support.IntegrationTestSupport;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@AutoConfigureMockMvc
class RealtimeContentControllerIntegrationTest extends IntegrationTestSupport {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private LoginSessionRepository loginSessionRepository;
    @Autowired private PatientProfileRepository patientProfileRepository;
    @Autowired private UserRepository userRepository;
    @MockitoBean private RealtimeEventService realtimeEventService;
    @MockitoBean private RealtimeLiveKitPermissionService realtimeLiveKitPermissionService;

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
    void startContent_publishesContentStartedEvent() throws Exception {
        String token = setupUserWithProfile("content-start@example.com", "content-start");
        long userId = userIdFromToken(token);
        long sessionId = startSession(token);
        long patientProfileId = ownProfileId(token);
        clearInvocations(realtimeEventService);

        mockMvc.perform(
                        post("/realtime/login-sessions/{loginSessionId}/content/start", sessionId)
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"contentType\":\"MUSIC\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"));

        ArgumentCaptor<RealtimeEventResponse> eventCaptor =
                ArgumentCaptor.forClass(RealtimeEventResponse.class);
        verify(realtimeEventService).publish(eq(userId), eventCaptor.capture());
        verify(realtimeLiveKitPermissionService)
                .setGuardianMicrophonePermission(userId, sessionId, patientProfileId, true);

        RealtimeEventResponse event = eventCaptor.getValue();
        assertThat(event.type()).isEqualTo(RealtimeEventType.CONTENT_STARTED);
        assertThat(event.loginSessionId()).isEqualTo(sessionId);
        assertThat(event.patientProfileId()).isEqualTo(patientProfileId);
        assertThat(event.contentType()).isEqualTo("MUSIC");
    }

    @Test
    void startContent_sameContentTypeTwice_doesNotPublishDuplicateEvent() throws Exception {
        String token = setupUserWithProfile("content-start-once@example.com", "content-start-once");
        long sessionId = startSession(token);
        clearInvocations(realtimeEventService);

        startContent(token, sessionId, "ART");
        clearInvocations(realtimeEventService);
        clearInvocations(realtimeLiveKitPermissionService);
        startContent(token, sessionId, "ART");

        verifyNoInteractions(realtimeEventService);
        verifyNoInteractions(realtimeLiveKitPermissionService);
    }

    @Test
    void endContent_publishesContentEndedEvent() throws Exception {
        String token = setupUserWithProfile("content-end@example.com", "content-end");
        long userId = userIdFromToken(token);
        long sessionId = startSession(token);
        long patientProfileId = ownProfileId(token);
        startContent(token, sessionId, "TAEKWONDO");
        clearInvocations(realtimeEventService);

        mockMvc.perform(
                        post("/realtime/login-sessions/{loginSessionId}/content/end", sessionId)
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"));

        ArgumentCaptor<RealtimeEventResponse> eventCaptor =
                ArgumentCaptor.forClass(RealtimeEventResponse.class);
        verify(realtimeEventService).publish(eq(userId), eventCaptor.capture());
        verify(realtimeLiveKitPermissionService)
                .setGuardianMicrophonePermission(userId, sessionId, patientProfileId, false);

        RealtimeEventResponse event = eventCaptor.getValue();
        assertThat(event.type()).isEqualTo(RealtimeEventType.CONTENT_ENDED);
        assertThat(event.loginSessionId()).isEqualTo(sessionId);
        assertThat(event.patientProfileId()).isEqualTo(patientProfileId);
        assertThat(event.contentType()).isEqualTo("TAEKWONDO");
    }

    @Test
    void endContent_withoutActiveContent_isNoOp() throws Exception {
        String token = setupUserWithProfile("content-end-noop@example.com", "content-end-noop");
        long sessionId = startSession(token);
        clearInvocations(realtimeEventService);

        mockMvc.perform(
                        post("/realtime/login-sessions/{loginSessionId}/content/end", sessionId)
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"));

        verifyNoInteractions(realtimeEventService);
        verifyNoInteractions(realtimeLiveKitPermissionService);
    }

    @Test
    void startContent_rejectsLoginContentType() throws Exception {
        String token = setupUserWithProfile("content-login@example.com", "content-login");
        long sessionId = startSession(token);
        clearInvocations(realtimeEventService);

        mockMvc.perform(
                        post("/realtime/login-sessions/{loginSessionId}/content/start", sessionId)
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"contentType\":\"LOGIN\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RT-004"));

        verifyNoInteractions(realtimeEventService);
    }

    @Test
    void startContent_endedSession_returns409WithRt002() throws Exception {
        String token = setupUserWithProfile("content-ended@example.com", "content-ended");
        long sessionId = startSession(token);

        mockMvc.perform(
                        patch("/login-sessions/{id}/end", sessionId)
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        mockMvc.perform(
                        post("/realtime/login-sessions/{loginSessionId}/content/start", sessionId)
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"contentType\":\"GYMNASTICS\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RT-002"));
    }

    @Test
    void startContent_otherUsersSession_returns404WithUs001() throws Exception {
        String ownerToken = setupUserWithProfile("content-owner@example.com", "content-owner");
        long sessionId = startSession(ownerToken);
        String otherToken = setupUserWithProfile("content-other@example.com", "content-other");

        mockMvc.perform(
                        post("/realtime/login-sessions/{loginSessionId}/content/start", sessionId)
                                .header("Authorization", "Bearer " + otherToken)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"contentType\":\"MUSIC\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("US-001"));
    }

    @Test
    void startContent_requiresAuthentication() throws Exception {
        mockMvc.perform(
                        post("/realtime/login-sessions/{loginSessionId}/content/start", 1L)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"contentType\":\"MUSIC\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("G-003"));
    }

    private void startContent(String token, long sessionId, String contentType) throws Exception {
        mockMvc.perform(
                        post("/realtime/login-sessions/{loginSessionId}/content/start", sessionId)
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"contentType\":\"" + contentType + "\"}"))
                .andExpect(status().isOk());
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
