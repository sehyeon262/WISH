package com.comong.backend.domain.taekwondo.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.taekwondo.entity.Belt;
import com.comong.backend.domain.taekwondo.entity.Poomsae;
import com.comong.backend.domain.taekwondo.entity.TaekwondoBeltHistory;
import com.comong.backend.domain.taekwondo.entity.TaekwondoSession;
import com.comong.backend.domain.taekwondo.repository.TaekwondoBeltHistoryRepository;
import com.comong.backend.domain.taekwondo.repository.TaekwondoSessionRepository;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.support.IntegrationTestSupport;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@AutoConfigureMockMvc
class TaekwondoBeltHistoryControllerIntegrationTest extends IntegrationTestSupport {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private TaekwondoBeltHistoryRepository taekwondoBeltHistoryRepository;
    @Autowired private TaekwondoSessionRepository taekwondoSessionRepository;
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
        taekwondoBeltHistoryRepository.deleteAll();
        taekwondoSessionRepository.deleteAll();
        patientProfileRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void findHistory_returnsHistoryOrderedByPromotedAtDesc() throws Exception {
        TestUser user = setupUserWithProfile("history@example.com", "history-user");
        PatientProfile profile = findProfile(user);
        TaekwondoSession session = taekwondoSessionRepository.save(session(profile));

        TaekwondoBeltHistory firstEntry =
                taekwondoBeltHistoryRepository.save(
                        TaekwondoBeltHistory.firstEntry(profile, session));
        Thread.sleep(5);
        TaekwondoBeltHistory promotion =
                taekwondoBeltHistoryRepository.save(
                        TaekwondoBeltHistory.promotion(profile, Belt.WHITE, Belt.YELLOW, session));

        mockMvc.perform(
                        get("/taekwondo-belt-history")
                                .header("Authorization", "Bearer " + user.token())
                                .param("patientProfileId", user.patientProfileId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].id").value(promotion.getId()))
                .andExpect(jsonPath("$.data[0].fromBelt").value("WHITE"))
                .andExpect(jsonPath("$.data[0].toBelt").value("YELLOW"))
                .andExpect(jsonPath("$.data[1].id").value(firstEntry.getId()))
                .andExpect(jsonPath("$.data[1].fromBelt").doesNotExist())
                .andExpect(jsonPath("$.data[1].toBelt").value("WHITE"))
                .andExpect(jsonPath("$.data[1].triggerSessionId").value(session.getId()));
    }

    @Test
    void findHistory_returnsEmptyListWhenNoHistory() throws Exception {
        TestUser user = setupUserWithProfile("empty@example.com", "empty-user");

        mockMvc.perform(
                        get("/taekwondo-belt-history")
                                .header("Authorization", "Bearer " + user.token())
                                .param("patientProfileId", user.patientProfileId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.length()").value(0));
    }

    @Test
    void findHistory_rejectsOtherUsersPatientProfile() throws Exception {
        TestUser owner = setupUserWithProfile("h-owner@example.com", "h-owner-user");
        TestUser other = setupUserWithProfile("h-other@example.com", "h-other-user");

        mockMvc.perform(
                        get("/taekwondo-belt-history")
                                .header("Authorization", "Bearer " + other.token())
                                .param("patientProfileId", owner.patientProfileId().toString()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("P-001"));
    }

    @Test
    void findHistory_requiresAuthentication() throws Exception {
        mockMvc.perform(get("/taekwondo-belt-history").param("patientProfileId", "1"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("G-003"));
    }

    private TaekwondoSession session(PatientProfile profile) {
        return TaekwondoSession.builder()
                .patientProfile(profile)
                .poomsae(Poomsae.TAEGEUK_1)
                .durationSec(120)
                .averageAccuracy(0.85)
                .completedMotionCount(1)
                .monstersDefeated(0)
                .build();
    }

    private PatientProfile findProfile(TestUser user) {
        return patientProfileRepository.findById(user.patientProfileId()).orElseThrow();
    }

    private TestUser setupUserWithProfile(String email, String nickname) throws Exception {
        String token = setupUser(email, nickname);
        String body =
                mockMvc.perform(
                                post("/patient-profiles")
                                        .header("Authorization", "Bearer " + token)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(
                                                "{\"name\":\"Patient\",\"nickname\":\"patient\","
                                                        + "\"birthDate\":\"2020-01-01\","
                                                        + "\"gender\":\"MALE\"}"))
                        .andExpect(status().isCreated())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        JsonNode response = objectMapper.readTree(body);
        return new TestUser(token, response.get("data").get("id").asLong());
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

    private record TestUser(String token, Long patientProfileId) {}
}
