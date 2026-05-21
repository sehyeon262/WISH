package com.comong.backend.domain.realtime.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.comong.backend.domain.notification.service.GuardianPushNotificationService;
import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.realtime.service.RealtimeContentStateService;
import com.comong.backend.domain.realtime.service.RealtimeEventService;
import com.comong.backend.domain.usage.entity.ContentType;
import com.comong.backend.domain.usage.repository.LoginSessionRepository;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.support.IntegrationTestSupport;

import tools.jackson.databind.ObjectMapper;

@AutoConfigureMockMvc
class RealtimeActiveSessionControllerIntegrationTest extends IntegrationTestSupport {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private LoginSessionRepository loginSessionRepository;
    @Autowired private PatientProfileRepository patientProfileRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private RealtimeContentStateService realtimeContentStateService;
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
    void findActiveSession_requiresAuthentication() throws Exception {
        mockMvc.perform(get("/realtime/active-login-session")).andExpect(status().isUnauthorized());
    }

    @Test
    void findActiveSession_withoutActiveSession_returnsEmptyData() throws Exception {
        String token = setupUserWithProfile("active-empty@example.com", "active-empty");

        mockMvc.perform(
                        get("/realtime/active-login-session")
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data").doesNotExist());
    }

    @Test
    void findActiveSession_withActiveSession_returnsSessionSnapshot() throws Exception {
        String token = setupUserWithProfile("active-session@example.com", "active-session");
        long patientProfileId = ownProfileId(token);
        long sessionId = startSession(token, patientProfileId);

        mockMvc.perform(
                        get("/realtime/active-login-session")
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.loginSessionId").value(sessionId))
                .andExpect(jsonPath("$.data.patientProfileId").value(patientProfileId))
                .andExpect(jsonPath("$.data.patientName").value("Patient"))
                .andExpect(jsonPath("$.data.contentActive").value(false))
                .andExpect(jsonPath("$.data.contentType").doesNotExist());
    }

    @Test
    void findActiveSession_withActiveContent_returnsContentSnapshot() throws Exception {
        String token = setupUserWithProfile("active-content@example.com", "active-content");
        long patientProfileId = ownProfileId(token);
        long sessionId = startSession(token, patientProfileId);
        realtimeContentStateService.start(sessionId, ContentType.MUSIC);

        mockMvc.perform(
                        get("/realtime/active-login-session")
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.loginSessionId").value(sessionId))
                .andExpect(jsonPath("$.data.contentActive").value(true))
                .andExpect(jsonPath("$.data.contentType").value("MUSIC"));
    }

    @Test
    void findActiveSession_afterEnd_returnsEmptyData() throws Exception {
        String token = setupUserWithProfile("active-ended@example.com", "active-ended");
        long patientProfileId = ownProfileId(token);
        long sessionId = startSession(token, patientProfileId);

        mockMvc.perform(
                        patch("/login-sessions/{id}/end", sessionId)
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        mockMvc.perform(
                        get("/realtime/active-login-session")
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").doesNotExist());
    }

    private long startSession(String token, long patientProfileId) throws Exception {
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
