package com.comong.backend.domain.dialogue.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;

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

/**
 * 보호자 대화 이력 조회 컨트롤러 통합 테스트. {@link GuardianDialogueController} 의 list/detail 필터·인가·페이징을 검증한다.
 *
 * <p>아이 화면의 turn flow (시작/턴/종료) 는 {@link DialogueControllerIntegrationTest} 가 담당하므로 본 테스트는 조회 측면만
 * 다룬다. 세팅은 turn flow API 를 통해 세션을 만들고 종료하는 식으로 진행 — repository 를 직접 찌르는 것보다 실 호출 경로와 일치.
 */
@AutoConfigureMockMvc
class GuardianDialogueControllerIntegrationTest extends IntegrationTestSupport {

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

    // ===== list =====

    @Test
    @DisplayName("전체 조회 — 모든 NPC, 무필터, 최신순")
    void list_noFilter_returnsAllSessionsDesc() throws Exception {
        TestUser user = setupUserWithProfile("list-all@example.com", "list-all");
        long s1 = startSession(user, "YEONGCHEOL");
        long s2 = startSession(user, "SEORIN");
        long s3 = startSession(user, "YEONGCHEOL");

        mockMvc.perform(
                        get("/guardian/patients/{pid}/dialogue/sessions", user.patientProfileId())
                                .header("Authorization", "Bearer " + user.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.content.length()").value(3))
                .andExpect(jsonPath("$.data.content[0].sessionId").value(s3))
                .andExpect(jsonPath("$.data.content[1].sessionId").value(s2))
                .andExpect(jsonPath("$.data.content[2].sessionId").value(s1))
                .andExpect(jsonPath("$.data.content[0].turns").doesNotExist());
    }

    @Test
    @DisplayName("NPC 필터 — 단일 NPC 만 반환")
    void list_npcFilter_returnsOnlyMatching() throws Exception {
        TestUser user = setupUserWithProfile("list-npc@example.com", "list-npc");
        startSession(user, "YEONGCHEOL");
        long seorinSession = startSession(user, "SEORIN");
        startSession(user, "YEONGCHEOL");

        mockMvc.perform(
                        get("/guardian/patients/{pid}/dialogue/sessions", user.patientProfileId())
                                .header("Authorization", "Bearer " + user.token())
                                .param("npc", "SEORIN"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].sessionId").value(seorinSession))
                .andExpect(jsonPath("$.data.content[0].npcName").value("SEORIN"));
    }

    @Test
    @DisplayName("from > to 이면 G-001 (400)")
    void list_invalidDateRange_returnsBadRequest() throws Exception {
        TestUser user = setupUserWithProfile("list-bad-range@example.com", "list-bad-range");

        mockMvc.perform(
                        get("/guardian/patients/{pid}/dialogue/sessions", user.patientProfileId())
                                .header("Authorization", "Bearer " + user.token())
                                .param("from", "2026-06-01")
                                .param("to", "2026-05-01"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("G-001"));
    }

    @Test
    @DisplayName("미래 from 이면 결과 빈 페이지 (필터만 적용)")
    void list_futureFrom_returnsEmpty() throws Exception {
        TestUser user = setupUserWithProfile("list-future@example.com", "list-future");
        startSession(user, "YEONGCHEOL");
        LocalDate tomorrow = LocalDate.now().plusDays(1);

        mockMvc.perform(
                        get("/guardian/patients/{pid}/dialogue/sessions", user.patientProfileId())
                                .header("Authorization", "Bearer " + user.token())
                                .param("from", tomorrow.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(0));
    }

    @Test
    @DisplayName("다른 사람 환자 프로필 ID 로 조회 — P-001 (404, enumeration 방지)")
    void list_foreignPatient_returnsNotFound() throws Exception {
        TestUser owner = setupUserWithProfile("list-owner@example.com", "list-owner");
        TestUser stranger = setupUserWithProfile("list-stranger@example.com", "list-stranger");

        mockMvc.perform(
                        get("/guardian/patients/{pid}/dialogue/sessions", owner.patientProfileId())
                                .header("Authorization", "Bearer " + stranger.token()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("P-001"));
    }

    @Test
    @DisplayName("페이지 사이즈가 상한(50)을 넘어도 50 으로 clamp")
    void list_oversizedPage_clampedTo50() throws Exception {
        TestUser user = setupUserWithProfile("list-clamp@example.com", "list-clamp");
        // 데이터 없음 — size 만 검증
        mockMvc.perform(
                        get("/guardian/patients/{pid}/dialogue/sessions", user.patientProfileId())
                                .header("Authorization", "Bearer " + user.token())
                                .param("size", "9999"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.size").value(50));
    }

    @Test
    @DisplayName("인증 없으면 401 (G-003)")
    void list_unauthenticated_returnsUnauthorized() throws Exception {
        mockMvc.perform(get("/guardian/patients/{pid}/dialogue/sessions", 1L))
                .andExpect(status().isUnauthorized());
    }

    // ===== detail =====

    @Test
    @DisplayName("detail — 메타 + turn stepIndex 오름차순 + generatedBy")
    void detail_returnsSessionAndTurns() throws Exception {
        TestUser user = setupUserWithProfile("detail@example.com", "detail-user");
        long sessionId = startSession(user, "YEONGCHEOL");
        submitTurn(user, sessionId, "오늘 기분은 어떠니?", "mood_worried", "걱정돼요", 2);
        submitTurn(user, sessionId, "무엇이 가장 걱정되니?", "worry_pain", "아픈 게 걱정돼요", 3);
        finishSession(user, sessionId, "COMPLETED");

        mockMvc.perform(
                        get(
                                        "/guardian/patients/{pid}/dialogue/sessions/{sid}",
                                        user.patientProfileId(),
                                        sessionId)
                                .header("Authorization", "Bearer " + user.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sessionId").value(sessionId))
                .andExpect(jsonPath("$.data.npcName").value("YEONGCHEOL"))
                .andExpect(jsonPath("$.data.status").value("FINISHED"))
                .andExpect(jsonPath("$.data.finishReason").value("COMPLETED"))
                .andExpect(jsonPath("$.data.turns.length()").value(2))
                .andExpect(jsonPath("$.data.turns[0].stepIndex").value(0))
                .andExpect(jsonPath("$.data.turns[0].choiceIntentId").value("mood_worried"))
                .andExpect(jsonPath("$.data.turns[0].generatedBy").value("FALLBACK"))
                .andExpect(jsonPath("$.data.turns[1].stepIndex").value(1));

        assertThat(dialogueTurnRepository.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("detail — 다른 환자의 세션 ID 로 접근 시 DL-001 (404)")
    void detail_foreignSession_returnsNotFound() throws Exception {
        TestUser owner = setupUserWithProfile("d-owner@example.com", "d-owner");
        TestUser stranger = setupUserWithProfile("d-stranger@example.com", "d-stranger");
        long ownerSessionId = startSession(owner, "YEONGCHEOL");

        // stranger 가 본인 환자 path 로 owner 의 sessionId 를 끼워 조회 — DL-001 (세션은 본인 환자 소유 아님)
        mockMvc.perform(
                        get(
                                        "/guardian/patients/{pid}/dialogue/sessions/{sid}",
                                        stranger.patientProfileId(),
                                        ownerSessionId)
                                .header("Authorization", "Bearer " + stranger.token()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("DL-001"));
    }

    @Test
    @DisplayName("detail — 비소유 환자 프로필 ID 로 접근 시 P-001 (404)")
    void detail_foreignPatient_returnsNotFound() throws Exception {
        TestUser owner = setupUserWithProfile("d-owner2@example.com", "d-owner2");
        TestUser stranger = setupUserWithProfile("d-stranger2@example.com", "d-stranger2");
        long ownerSessionId = startSession(owner, "YEONGCHEOL");

        mockMvc.perform(
                        get(
                                        "/guardian/patients/{pid}/dialogue/sessions/{sid}",
                                        owner.patientProfileId(),
                                        ownerSessionId)
                                .header("Authorization", "Bearer " + stranger.token()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("P-001"));
    }

    @Test
    @DisplayName("detail — 인증 없으면 401")
    void detail_unauthenticated_returnsUnauthorized() throws Exception {
        mockMvc.perform(get("/guardian/patients/{pid}/dialogue/sessions/{sid}", 1L, 1L))
                .andExpect(status().isUnauthorized());
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
            TestUser user,
            long sessionId,
            String questionText,
            String choiceIntentId,
            String text,
            int intensity)
            throws Exception {
        mockMvc.perform(
                        post("/dialogue/sessions/{id}/turns", sessionId)
                                .header("Authorization", "Bearer " + user.token())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(turnBody(questionText, choiceIntentId, text, intensity)))
                .andExpect(status().isOk());
    }

    private void finishSession(TestUser user, long sessionId, String finishReason)
            throws Exception {
        mockMvc.perform(
                        post("/dialogue/sessions/{id}/finish", sessionId)
                                .header("Authorization", "Bearer " + user.token())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"finishReason\":\"" + finishReason + "\"}"))
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

    private String turnBody(
            String questionText, String choiceIntentId, String text, int intensity) {
        return """
                {
                  "questionText": "%s",
                  "selectedChoice": {
                    "choiceIntentId": "%s",
                    "text": "%s",
                    "intensity": %d,
                    "concernFlags": [],
                    "protectiveFactors": []
                  }
                }
                """
                .formatted(questionText, choiceIntentId, text, intensity);
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
