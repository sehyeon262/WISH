package com.comong.backend.domain.realtime.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.usage.repository.LoginSessionRepository;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.support.IntegrationTestSupport;

import tools.jackson.databind.ObjectMapper;

@AutoConfigureMockMvc
class LiveMonitorPresenceControllerIntegrationTest extends IntegrationTestSupport {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private LoginSessionRepository loginSessionRepository;
    @Autowired private PatientProfileRepository patientProfileRepository;
    @Autowired private UserRepository userRepository;

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
    void watching_requiresAuthentication() throws Exception {
        mockMvc.perform(get("/realtime/login-sessions/{loginSessionId}/watching", 1L))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void gamePresence_requiresAuthentication() throws Exception {
        mockMvc.perform(get("/realtime/login-sessions/{loginSessionId}/game-presence", 1L))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void watching_authenticatedOwner_startsSseStream() throws Exception {
        String token = setupUserWithProfile("watching@example.com", "watching");
        long sessionId = startSession(token);

        MvcResult result =
                mockMvc.perform(
                                get("/realtime/login-sessions/{loginSessionId}/watching", sessionId)
                                        .header("Authorization", "Bearer " + token)
                                        .accept(MediaType.TEXT_EVENT_STREAM))
                        .andExpect(request().asyncStarted())
                        .andReturn();

        assertThat(result.getRequest().isAsyncStarted()).isTrue();
        assertThat(result.getRequest().getAsyncContext()).isNotNull();
    }

    @Test
    void gamePresence_authenticatedOwner_startsSseStream() throws Exception {
        String token = setupUserWithProfile("game-presence@example.com", "game-presence");
        long sessionId = startSession(token);

        MvcResult result =
                mockMvc.perform(
                                get(
                                                "/realtime/login-sessions/{loginSessionId}/game-presence",
                                                sessionId)
                                        .header("Authorization", "Bearer " + token)
                                        .accept(MediaType.TEXT_EVENT_STREAM))
                        .andExpect(request().asyncStarted())
                        .andReturn();

        assertThat(result.getRequest().isAsyncStarted()).isTrue();
        assertThat(result.getRequest().getAsyncContext()).isNotNull();
    }

    @Test
    void watching_otherUsersSession_returns404WithUs001() throws Exception {
        String ownerToken = setupUserWithProfile("watch-owner@example.com", "watch-owner");
        long sessionId = startSession(ownerToken);
        String otherToken = setupUserWithProfile("watch-other@example.com", "watch-other");

        mockMvc.perform(
                        get("/realtime/login-sessions/{loginSessionId}/watching", sessionId)
                                .header("Authorization", "Bearer " + otherToken)
                                .accept(MediaType.TEXT_EVENT_STREAM))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("US-001"));
    }

    @Test
    void gamePresence_endedSession_returns409WithRt002() throws Exception {
        String token = setupUserWithProfile("presence-ended@example.com", "presence-ended");
        long sessionId = startSession(token);

        mockMvc.perform(
                        patch("/login-sessions/{id}/end", sessionId)
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        mockMvc.perform(
                        get("/realtime/login-sessions/{loginSessionId}/game-presence", sessionId)
                                .header("Authorization", "Bearer " + token)
                                .accept(MediaType.TEXT_EVENT_STREAM))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RT-002"));
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
