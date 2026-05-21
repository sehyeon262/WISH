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
import com.comong.backend.domain.taekwondo.entity.Poomsae;
import com.comong.backend.domain.taekwondo.entity.TaekwondoProgress;
import com.comong.backend.domain.taekwondo.entity.TaekwondoSession;
import com.comong.backend.domain.taekwondo.repository.TaekwondoBeltHistoryRepository;
import com.comong.backend.domain.taekwondo.repository.TaekwondoProgressRepository;
import com.comong.backend.domain.taekwondo.repository.TaekwondoSessionRepository;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.support.IntegrationTestSupport;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@AutoConfigureMockMvc
class TaekwondoProgressControllerIntegrationTest extends IntegrationTestSupport {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private TaekwondoProgressRepository taekwondoProgressRepository;
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
        taekwondoProgressRepository.deleteAll();
        taekwondoSessionRepository.deleteAll();
        patientProfileRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void findOne_returnsCurrentBeltAndStatsWithAverageAccuracy() throws Exception {
        TestUser user = setupUserWithProfile("progress@example.com", "progress-user");
        PatientProfile profile = findProfile(user);

        // 누적 처치수 25 (YELLOW 임계 30 미달) — currentBelt 는 WHITE 유지.
        // 두 세션의 첫 동작 저장 시점으로 모사 (firstMotionOfSession=true 두 번 → sessionCount=2).
        TaekwondoProgress progress = TaekwondoProgress.firstSession(profile);
        progress.applyMotion(15, true);
        progress.applyMotion(10, true);
        taekwondoProgressRepository.save(progress);

        // 두 세션 모두 0.5 — 평균 0.5 (binary 정확 표현, double 부동소수점 오차 회피)
        taekwondoSessionRepository.save(session(profile, 0.5));
        taekwondoSessionRepository.save(session(profile, 0.5));

        mockMvc.perform(
                        get("/taekwondo-progress")
                                .header("Authorization", "Bearer " + user.token())
                                .param("patientProfileId", user.patientProfileId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.currentBelt").value("WHITE"))
                .andExpect(jsonPath("$.data.totalMonstersDefeated").value(25))
                .andExpect(jsonPath("$.data.sessionCount").value(2))
                .andExpect(jsonPath("$.data.averageAccuracy").value(0.5))
                .andExpect(jsonPath("$.data.nextBelt").value("YELLOW"))
                .andExpect(jsonPath("$.data.monstersUntilNextPromotion").value(5));
    }

    @Test
    void findOne_returnsNotFoundWhenProgressDoesNotExist() throws Exception {
        TestUser user = setupUserWithProfile("none@example.com", "none-user");

        mockMvc.perform(
                        get("/taekwondo-progress")
                                .header("Authorization", "Bearer " + user.token())
                                .param("patientProfileId", user.patientProfileId().toString()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("TK-006"));
    }

    @Test
    void findOne_rejectsOtherUsersPatientProfile() throws Exception {
        TestUser owner = setupUserWithProfile("p-owner@example.com", "p-owner-user");
        TestUser other = setupUserWithProfile("p-other@example.com", "p-other-user");
        taekwondoProgressRepository.save(TaekwondoProgress.firstSession(findProfile(owner)));

        mockMvc.perform(
                        get("/taekwondo-progress")
                                .header("Authorization", "Bearer " + other.token())
                                .param("patientProfileId", owner.patientProfileId().toString()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("P-001"));
    }

    @Test
    void findOne_requiresAuthentication() throws Exception {
        mockMvc.perform(get("/taekwondo-progress").param("patientProfileId", "1"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("G-003"));
    }

    private TaekwondoSession session(PatientProfile profile, double averageAccuracy) {
        return TaekwondoSession.builder()
                .patientProfile(profile)
                .poomsae(Poomsae.TAEGEUK_1)
                .durationSec(120)
                .averageAccuracy(averageAccuracy)
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
