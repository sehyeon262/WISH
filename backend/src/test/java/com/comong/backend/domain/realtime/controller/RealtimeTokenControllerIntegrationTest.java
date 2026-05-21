package com.comong.backend.domain.realtime.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.realtime.service.RealtimeContentStateService;
import com.comong.backend.domain.usage.entity.ContentType;
import com.comong.backend.domain.usage.repository.LoginSessionRepository;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.support.IntegrationTestSupport;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@AutoConfigureMockMvc
class RealtimeTokenControllerIntegrationTest extends IntegrationTestSupport {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private LoginSessionRepository loginSessionRepository;
    @Autowired private PatientProfileRepository patientProfileRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private RealtimeContentStateService realtimeContentStateService;

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
    void issueGameToken_returnsPublishableLiveKitToken() throws Exception {
        String token = setupUserWithProfile("rt-game@example.com", "rt-game");
        long sessionId = startSession(token);
        long patientProfileId = ownProfileId(token);

        String body =
                mockMvc.perform(
                                post(
                                                "/realtime/login-sessions/{loginSessionId}/game-token",
                                                sessionId)
                                        .header("Authorization", "Bearer " + token))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.code").value("SUCCESS"))
                        .andExpect(jsonPath("$.data.loginSessionId").value(sessionId))
                        .andExpect(jsonPath("$.data.patientProfileId").value(patientProfileId))
                        .andExpect(jsonPath("$.data.livekitUrl").value("wss://test.livekit.cloud"))
                        .andExpect(
                                jsonPath("$.data.roomName")
                                        .value(
                                                "patient-"
                                                        + patientProfileId
                                                        + "-login-"
                                                        + sessionId))
                        .andExpect(
                                jsonPath("$.data.participantIdentity")
                                        .value(
                                                "game-patient-"
                                                        + patientProfileId
                                                        + "-login-"
                                                        + sessionId))
                        .andExpect(jsonPath("$.data.participantName").value("game"))
                        .andExpect(jsonPath("$.data.token").isString())
                        .andExpect(jsonPath("$.data.expiresInSeconds").value(3600))
                        .andExpect(jsonPath("$.data.contentActive").value(false))
                        .andExpect(jsonPath("$.data.contentType").value(nullValue()))
                        .andReturn()
                        .getResponse()
                        .getContentAsString();

        JsonNode payload = decodeTokenPayload(responseToken(body));
        assertThat(payload.get("sub").asString())
                .isEqualTo("game-patient-" + patientProfileId + "-login-" + sessionId);
        assertThat(payload.get("name").asString()).isEqualTo("game");
        JsonNode video = payload.get("video");
        assertThat(video.get("room").asString())
                .isEqualTo("patient-" + patientProfileId + "-login-" + sessionId);
        assertThat(video.get("roomJoin").asBoolean()).isTrue();
        assertThat(video.get("canPublish").asBoolean()).isTrue();
        assertThat(video.get("canSubscribe").asBoolean()).isTrue();
        assertThat(video.get("canPublishData").asBoolean()).isTrue();
    }

    @Test
    void issueGuardianToken_returnsSubscribeOnlyLiveKitToken() throws Exception {
        String token = setupUserWithProfile("rt-guardian@example.com", "rt-guardian");
        long sessionId = startSession(token);
        long patientProfileId = ownProfileId(token);

        String body =
                mockMvc.perform(
                                post(
                                                "/realtime/login-sessions/{loginSessionId}/guardian-token",
                                                sessionId)
                                        .header("Authorization", "Bearer " + token))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.code").value("SUCCESS"))
                        .andExpect(jsonPath("$.data.loginSessionId").value(sessionId))
                        .andExpect(jsonPath("$.data.patientProfileId").value(patientProfileId))
                        .andExpect(jsonPath("$.data.livekitUrl").value("wss://test.livekit.cloud"))
                        .andExpect(
                                jsonPath("$.data.roomName")
                                        .value(
                                                "patient-"
                                                        + patientProfileId
                                                        + "-login-"
                                                        + sessionId))
                        .andExpect(
                                jsonPath("$.data.participantIdentity")
                                        .value(
                                                "guardian-user-"
                                                        + userIdFromToken(token)
                                                        + "-login-"
                                                        + sessionId))
                        .andExpect(jsonPath("$.data.participantName").value("guardian"))
                        .andExpect(jsonPath("$.data.token").isString())
                        .andExpect(jsonPath("$.data.expiresInSeconds").value(3600))
                        .andExpect(jsonPath("$.data.contentActive").value(false))
                        .andExpect(jsonPath("$.data.contentType").value(nullValue()))
                        .andReturn()
                        .getResponse()
                        .getContentAsString();

        JsonNode payload = decodeTokenPayload(responseToken(body));
        JsonNode video = payload.get("video");
        assertThat(video.get("roomJoin").asBoolean()).isTrue();
        assertThat(video.get("canPublish").asBoolean()).isFalse();
        assertThat(video.get("canSubscribe").asBoolean()).isTrue();
        assertThat(video.get("canPublishData").asBoolean()).isFalse();
        assertThat(video.has("canPublishSources")).isFalse();
    }

    @Test
    void issueGuardianToken_activeContent_returnsContentStateAndMicrophonePublishGrant()
            throws Exception {
        String token = setupUserWithProfile("rt-content@example.com", "rt-content");
        long sessionId = startSession(token);
        realtimeContentStateService.start(sessionId, ContentType.MUSIC);

        String body =
                mockMvc.perform(
                                post(
                                                "/realtime/login-sessions/{loginSessionId}/guardian-token",
                                                sessionId)
                                        .header("Authorization", "Bearer " + token))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.code").value("SUCCESS"))
                        .andExpect(jsonPath("$.data.contentActive").value(true))
                        .andExpect(jsonPath("$.data.contentType").value("MUSIC"))
                        .andReturn()
                        .getResponse()
                        .getContentAsString();

        JsonNode payload = decodeTokenPayload(responseToken(body));
        JsonNode video = payload.get("video");
        assertThat(video.get("canPublish").asBoolean()).isTrue();
        assertThat(video.get("canPublishData").asBoolean()).isFalse();
        assertThat(video.get("canPublishSources").get(0).asString()).isEqualTo("microphone");
    }

    @Test
    void issueGameToken_requiresAuthentication() throws Exception {
        mockMvc.perform(post("/realtime/login-sessions/{loginSessionId}/game-token", 1L))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("G-003"));
    }

    @Test
    void issueGuardianToken_otherUsersSession_returns404WithUs001() throws Exception {
        String ownerToken = setupUserWithProfile("rt-owner@example.com", "rt-owner");
        long sessionId = startSession(ownerToken);
        String otherToken = setupUserWithProfile("rt-other@example.com", "rt-other");

        mockMvc.perform(
                        post("/realtime/login-sessions/{loginSessionId}/guardian-token", sessionId)
                                .header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("US-001"));
    }

    @Test
    void issueGameToken_endedSession_returns409WithRt002() throws Exception {
        String token = setupUserWithProfile("rt-ended@example.com", "rt-ended");
        long sessionId = startSession(token);

        mockMvc.perform(
                        patch("/login-sessions/{id}/end", sessionId)
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        mockMvc.perform(
                        post("/realtime/login-sessions/{loginSessionId}/game-token", sessionId)
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RT-002"));
    }

    private String responseToken(String body) throws Exception {
        return objectMapper.readTree(body).get("data").get("token").asString();
    }

    private JsonNode decodeTokenPayload(String token) throws Exception {
        String[] parts = token.split("\\.");
        byte[] payload = Base64.getUrlDecoder().decode(parts[1]);
        return objectMapper.readTree(new String(payload, StandardCharsets.UTF_8));
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
