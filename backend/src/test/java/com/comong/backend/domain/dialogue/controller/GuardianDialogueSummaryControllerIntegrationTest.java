package com.comong.backend.domain.dialogue.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.comong.backend.domain.dialogue.repository.DialogueSessionRepository;
import com.comong.backend.domain.dialogue.repository.DialogueTurnRepository;
import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.support.IntegrationTestSupport;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** 보호자 페이지 일별/주별 요약 API 통합 테스트. */
@AutoConfigureMockMvc
class GuardianDialogueSummaryControllerIntegrationTest extends IntegrationTestSupport {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private DialogueTurnRepository dialogueTurnRepository;
    @Autowired private DialogueSessionRepository dialogueSessionRepository;
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
        dialogueTurnRepository.deleteAll();
        dialogueSessionRepository.deleteAll();
        patientProfileRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    @DisplayName("daily — 세션 없으면 빈 상태 응답 (placeholder 문구 + 0 분포)")
    void daily_noSessions_returnsEmptyState() throws Exception {
        TestUser user = setupUserWithProfile("daily-empty@example.com", "daily-empty");

        mockMvc.perform(
                        get(
                                        "/guardian/patients/{pid}/dialogue/summary/daily",
                                        user.patientProfileId())
                                .header("Authorization", "Bearer " + user.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.summaryText").value("오늘 마을에 들르지 않았어요."))
                .andExpect(jsonPath("$.data.valenceDistribution.positive").value(0))
                .andExpect(jsonPath("$.data.valenceDistribution.neutral").value(0))
                .andExpect(jsonPath("$.data.valenceDistribution.negative").value(0))
                .andExpect(jsonPath("$.data.sessionCount").value(0));
    }

    @Test
    @DisplayName("daily — 마을 NPC 세션 + 턴 진행 후 summaryText/valence/signals/topics/npcsVisited 채워짐")
    void daily_withSession_returnsAggregatedSummary() throws Exception {
        TestUser user = setupUserWithProfile("daily-fill@example.com", "daily-fill");
        long sessionId = startSession(user, "SEORIN");
        submitTurn(user, sessionId, "오늘 좀 무서운 거 있어?", "mky_inj_fear", "주사가 무서워요");

        mockMvc.perform(
                        get(
                                        "/guardian/patients/{pid}/dialogue/summary/daily",
                                        user.patientProfileId())
                                .header("Authorization", "Bearer " + user.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sessionCount").value(1))
                // mky_inj_fear: valence NEGATIVE
                .andExpect(jsonPath("$.data.valenceDistribution.negative").value(1))
                .andExpect(jsonPath("$.data.valenceDistribution.positive").value(0))
                .andExpect(
                        jsonPath("$.data.signals.length()")
                                .value(org.hamcrest.Matchers.greaterThan(0)))
                .andExpect(jsonPath("$.data.topics[0]").exists())
                .andExpect(jsonPath("$.data.npcsVisited[0].npcName").value("SEORIN"))
                .andExpect(jsonPath("$.data.npcsVisited[0].displayName").value("코몽"))
                .andExpect(jsonPath("$.data.npcsVisited[0].scriptTitle").value("시술 무서움"));
    }

    @Test
    @DisplayName("weekly — 7개 포인트, 세션 없는 날은 percent null + sessionCount 0")
    void weekly_returnsSevenPoints() throws Exception {
        TestUser user = setupUserWithProfile("weekly@example.com", "weekly");

        mockMvc.perform(
                        get(
                                        "/guardian/patients/{pid}/dialogue/summary/weekly",
                                        user.patientProfileId())
                                .header("Authorization", "Bearer " + user.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.points.length()").value(7))
                .andExpect(jsonPath("$.data.points[0].sessionCount").value(0))
                .andExpect(jsonPath("$.data.points[0].positiveNeutralPercent").doesNotExist());
    }

    @Test
    @DisplayName("daily — 다른 사람 환자 프로필 ID 로 시도하면 P-001 (404)")
    void daily_foreignProfile_returnsNotFound() throws Exception {
        TestUser owner = setupUserWithProfile("owner-d@example.com", "owner-d");
        TestUser stranger = setupUserWithProfile("stranger-d@example.com", "stranger-d");

        mockMvc.perform(
                        get(
                                        "/guardian/patients/{pid}/dialogue/summary/daily",
                                        owner.patientProfileId())
                                .header("Authorization", "Bearer " + stranger.token()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("P-001"));
    }

    // ===== helpers =====

    private long startSession(TestUser user, String npcName) throws Exception {
        String body =
                mockMvc.perform(
                                post("/dialogue/sessions")
                                        .header("Authorization", "Bearer " + user.token())
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(startBody(user.patientProfileId(), npcName)))
                        .andExpect(status().isCreated())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        return objectMapper.readTree(body).get("data").get("sessionId").asLong();
    }

    private void submitTurn(
            TestUser user, long sessionId, String questionText, String choiceIntentId, String text)
            throws Exception {
        mockMvc.perform(
                        post("/dialogue/sessions/{id}/turns", sessionId)
                                .header("Authorization", "Bearer " + user.token())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(turnBody(questionText, choiceIntentId, text)))
                .andExpect(status().isOk());
    }

    private String startBody(Long patientProfileId, String npcName) {
        return """
                {
                  "patientProfileId": %d,
                  "npcName": "%s"
                }
                """
                .formatted(patientProfileId, npcName);
    }

    private String turnBody(String questionText, String choiceIntentId, String text) {
        return """
                {
                  "questionText": "%s",
                  "selectedChoice": {
                    "choiceIntentId": "%s",
                    "text": "%s",
                    "intensity": 0,
                    "concernFlags": [],
                    "protectiveFactors": []
                  }
                }
                """
                .formatted(questionText, choiceIntentId, text);
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
        return objectMapper.readTree(body).get("data").get("accessToken").asText();
    }

    private record TestUser(String token, Long patientProfileId) {}
}
