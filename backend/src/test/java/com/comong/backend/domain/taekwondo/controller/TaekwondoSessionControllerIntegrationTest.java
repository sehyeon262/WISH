package com.comong.backend.domain.taekwondo.controller;

import static org.assertj.core.api.Assertions.assertThat;
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
import com.comong.backend.domain.taekwondo.entity.TaekwondoMotion;
import com.comong.backend.domain.taekwondo.entity.TaekwondoSession;
import com.comong.backend.domain.taekwondo.entity.TaekwondoSessionMotion;
import com.comong.backend.domain.taekwondo.repository.TaekwondoBeltHistoryRepository;
import com.comong.backend.domain.taekwondo.repository.TaekwondoMotionRepository;
import com.comong.backend.domain.taekwondo.repository.TaekwondoProgressRepository;
import com.comong.backend.domain.taekwondo.repository.TaekwondoSessionMotionRepository;
import com.comong.backend.domain.taekwondo.repository.TaekwondoSessionRepository;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.support.IntegrationTestSupport;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@AutoConfigureMockMvc
class TaekwondoSessionControllerIntegrationTest extends IntegrationTestSupport {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private TaekwondoMotionRepository taekwondoMotionRepository;
    @Autowired private TaekwondoSessionRepository taekwondoSessionRepository;
    @Autowired private TaekwondoSessionMotionRepository taekwondoSessionMotionRepository;
    @Autowired private TaekwondoProgressRepository taekwondoProgressRepository;
    @Autowired private TaekwondoBeltHistoryRepository taekwondoBeltHistoryRepository;
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
        taekwondoSessionMotionRepository.deleteAll();
        taekwondoSessionRepository.deleteAll();
        taekwondoMotionRepository.deleteAll();
        patientProfileRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void createTaekwondoSession_persistsSessionAndMotionResults() throws Exception {
        TestUser user = setupUserWithProfile("session@example.com", "session-user");
        TaekwondoMotion ready = taekwondoMotionRepository.save(taekwondoMotion("기본준비", 1));
        TaekwondoMotion lowBlock = taekwondoMotionRepository.save(taekwondoMotion("앞서고 아래막기", 2));

        long sessionId =
                createEmptyTaekwondoSession(user.token(), user.patientProfileId(), "TAEGEUK_1");

        mockMvc.perform(
                        post("/taekwondo-sessions/{id}/motions", sessionId)
                                .header("Authorization", "Bearer " + user.token())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(motionBody(ready.getId(), 8, 0.9, 1, "좋아요", 3)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.sessionId").value(sessionId))
                .andExpect(jsonPath("$.data.sessionDurationSec").value(8))
                .andExpect(jsonPath("$.data.sessionCompletedMotionCount").value(1))
                .andExpect(jsonPath("$.data.sessionMonstersDefeated").value(3))
                .andExpect(jsonPath("$.data.savedMotion.taekwondoMotionId").value(ready.getId()))
                .andExpect(jsonPath("$.data.savedMotion.motionName").value("기본준비"));

        mockMvc.perform(
                        post("/taekwondo-sessions/{id}/motions", sessionId)
                                .header("Authorization", "Bearer " + user.token())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(motionBody(lowBlock.getId(), 14, 0.82, 1, "팔을 더 내려요", 9)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.sessionDurationSec").value(22))
                .andExpect(jsonPath("$.data.sessionCompletedMotionCount").value(2))
                .andExpect(jsonPath("$.data.sessionMonstersDefeated").value(12));

        mockMvc.perform(
                        get("/taekwondo-sessions/{id}", sessionId)
                                .header("Authorization", "Bearer " + user.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.id").value(sessionId))
                .andExpect(jsonPath("$.data.patientProfileId").value(user.patientProfileId()))
                .andExpect(jsonPath("$.data.poomsae").value("TAEGEUK_1"))
                .andExpect(jsonPath("$.data.completedMotionCount").value(2))
                .andExpect(jsonPath("$.data.monstersDefeated").value(12))
                .andExpect(jsonPath("$.data.motions.length()").value(2))
                .andExpect(jsonPath("$.data.motions[0].taekwondoMotionId").value(ready.getId()))
                .andExpect(jsonPath("$.data.motions[0].routineOrder").value(1));

        assertThat(taekwondoSessionRepository.count()).isEqualTo(1);
        assertThat(taekwondoSessionMotionRepository.count()).isEqualTo(2);
    }

    @Test
    void listTaekwondoSessions_returnsOwnedPatientSessionsOrderedByCreatedAtDesc()
            throws Exception {
        TestUser user = setupUserWithProfile("list-session@example.com", "list-session-user");
        PatientProfile profile = findProfile(user);
        TaekwondoSession older =
                taekwondoSessionRepository.save(taekwondoSession(profile, 60, 0.8, 1, 5));
        Thread.sleep(5);
        TaekwondoSession newer =
                taekwondoSessionRepository.save(taekwondoSession(profile, 120, 0.85, 2, 12));

        mockMvc.perform(
                        get("/taekwondo-sessions")
                                .header("Authorization", "Bearer " + user.token())
                                .param("patientProfileId", user.patientProfileId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].id").value(newer.getId()))
                .andExpect(jsonPath("$.data[0].durationSec").value(120))
                .andExpect(jsonPath("$.data[0].monstersDefeated").value(12))
                .andExpect(jsonPath("$.data[1].id").value(older.getId()))
                .andExpect(jsonPath("$.data[1].durationSec").value(60))
                .andExpect(jsonPath("$.data[1].monstersDefeated").value(5));
    }

    @Test
    void listTaekwondoSessions_rejectsOtherUsersPatientProfile() throws Exception {
        TestUser owner = setupUserWithProfile("list-owner@example.com", "list-owner-user");
        TestUser other = setupUserWithProfile("list-other@example.com", "list-other-user");

        mockMvc.perform(
                        get("/taekwondo-sessions")
                                .header("Authorization", "Bearer " + other.token())
                                .param("patientProfileId", owner.patientProfileId().toString()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("P-001"));
    }

    @Test
    void getTaekwondoSessionDetail_returnsOwnedSessionWithMotionsOrderedByRoutineOrder()
            throws Exception {
        TestUser user = setupUserWithProfile("detail-session@example.com", "detail-session-user");
        PatientProfile profile = findProfile(user);
        TaekwondoMotion ready = taekwondoMotionRepository.save(taekwondoMotion("기본준비", 1));
        TaekwondoMotion lowBlock = taekwondoMotionRepository.save(taekwondoMotion("앞서고 아래막기", 2));
        TaekwondoSession session =
                taekwondoSessionRepository.save(taekwondoSession(profile, 120, 0.85, 2, 12));
        taekwondoSessionMotionRepository.save(sessionMotion(session, lowBlock, 14, 0.82));
        taekwondoSessionMotionRepository.save(sessionMotion(session, ready, 8, 0.9));

        mockMvc.perform(
                        get("/taekwondo-sessions/{id}", session.getId())
                                .header("Authorization", "Bearer " + user.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.id").value(session.getId()))
                .andExpect(jsonPath("$.data.patientProfileId").value(user.patientProfileId()))
                .andExpect(jsonPath("$.data.monstersDefeated").value(12))
                .andExpect(jsonPath("$.data.motions.length()").value(2))
                .andExpect(jsonPath("$.data.motions[0].taekwondoMotionId").value(ready.getId()))
                .andExpect(jsonPath("$.data.motions[0].routineOrder").value(1))
                .andExpect(jsonPath("$.data.motions[1].taekwondoMotionId").value(lowBlock.getId()))
                .andExpect(jsonPath("$.data.motions[1].routineOrder").value(2));
    }

    @Test
    void getTaekwondoSessionDetail_rejectsOtherUsersSession() throws Exception {
        TestUser owner = setupUserWithProfile("detail-owner@example.com", "detail-owner-user");
        TestUser other = setupUserWithProfile("detail-other@example.com", "detail-other-user");
        TaekwondoSession session =
                taekwondoSessionRepository.save(
                        taekwondoSession(findProfile(owner), 120, 0.85, 1, 8));

        mockMvc.perform(
                        get("/taekwondo-sessions/{id}", session.getId())
                                .header("Authorization", "Bearer " + other.token()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("TK-005"));
    }

    @Test
    void createTaekwondoSession_rejectsOtherUsersPatientProfile() throws Exception {
        TestUser owner = setupUserWithProfile("owner@example.com", "owner-user");
        TestUser other = setupUserWithProfile("other@example.com", "other-user");

        mockMvc.perform(
                        post("/taekwondo-sessions")
                                .header("Authorization", "Bearer " + other.token())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(createSessionBody(owner.patientProfileId(), "TAEGEUK_1")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("P-001"));

        assertThat(taekwondoSessionRepository.count()).isZero();
        assertThat(taekwondoSessionMotionRepository.count()).isZero();
    }

    @Test
    void saveTaekwondoMotion_rejectsUnknownMotion() throws Exception {
        TestUser user = setupUserWithProfile("unknown@example.com", "unknown-user");
        long sessionId =
                createEmptyTaekwondoSession(user.token(), user.patientProfileId(), "TAEGEUK_1");

        mockMvc.perform(
                        post("/taekwondo-sessions/{id}/motions", sessionId)
                                .header("Authorization", "Bearer " + user.token())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(motionBody(999_999L, 8, 0.9, 1, "좋아요", 0)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("TK-001"));

        assertThat(taekwondoSessionMotionRepository.count()).isZero();
    }

    @Test
    void saveTaekwondoMotion_rejectsMotionPoomsaeMismatch() throws Exception {
        TestUser user = setupUserWithProfile("mismatch@example.com", "mismatch-user");
        TaekwondoMotion motion =
                taekwondoMotionRepository.save(taekwondoMotion(Poomsae.TAEGEUK_2, "태극2장 동작", 1));
        long sessionId =
                createEmptyTaekwondoSession(user.token(), user.patientProfileId(), "TAEGEUK_1");

        mockMvc.perform(
                        post("/taekwondo-sessions/{id}/motions", sessionId)
                                .header("Authorization", "Bearer " + user.token())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(motionBody(motion.getId(), 8, 0.9, 1, "좋아요", 0)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("TK-004"));

        assertThat(taekwondoSessionMotionRepository.count()).isZero();
    }

    @Test
    void saveTaekwondoMotion_rejectsAccuracyOutOfRange() throws Exception {
        TestUser user = setupUserWithProfile("range@example.com", "range-user");
        TaekwondoMotion motion = taekwondoMotionRepository.save(taekwondoMotion("기본준비", 1));
        long sessionId =
                createEmptyTaekwondoSession(user.token(), user.patientProfileId(), "TAEGEUK_1");

        mockMvc.perform(
                        post("/taekwondo-sessions/{id}/motions", sessionId)
                                .header("Authorization", "Bearer " + user.token())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(motionBody(motion.getId(), 8, 1.5, 1, "ok", 0)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("G-001"));

        assertThat(taekwondoSessionMotionRepository.count()).isZero();
    }

    @Test
    void createTaekwondoSession_requiresAuthentication() throws Exception {
        mockMvc.perform(
                        post("/taekwondo-sessions")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(createSessionBody(1L, "TAEGEUK_1")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("G-003"));
    }

    @Test
    void listTaekwondoSessions_requiresAuthentication() throws Exception {
        mockMvc.perform(get("/taekwondo-sessions").param("patientProfileId", "1"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("G-003"));
    }

    @Test
    void getTaekwondoSessionDetail_requiresAuthentication() throws Exception {
        mockMvc.perform(get("/taekwondo-sessions/{id}", 1L))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("G-003"));
    }

    @Test
    void saveTaekwondoMotion_promotesBeltWhenThresholdReached() throws Exception {
        TestUser user = setupUserWithProfile("promote@example.com", "promote-user");
        TaekwondoMotion ready = taekwondoMotionRepository.save(taekwondoMotion("기본준비", 1));
        long sessionId =
                createEmptyTaekwondoSession(user.token(), user.patientProfileId(), "TAEGEUK_1");

        mockMvc.perform(
                        post("/taekwondo-sessions/{id}/motions", sessionId)
                                .header("Authorization", "Bearer " + user.token())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(motionBody(ready.getId(), 8, 0.9, 1, "좋아요", 30)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.beltPromotion.fromBelt").value("WHITE"))
                .andExpect(jsonPath("$.data.beltPromotion.toBelt").value("YELLOW"));

        assertThat(taekwondoProgressRepository.count()).isEqualTo(1);
        // firstEntry (NULL→WHITE) + promotion (WHITE→YELLOW) = 2건
        assertThat(taekwondoBeltHistoryRepository.count()).isEqualTo(2);
    }

    @Test
    void saveTaekwondoMotion_supportsMultiBeltJumpInSingleMotion() throws Exception {
        TestUser user = setupUserWithProfile("jump@example.com", "jump-user");
        TaekwondoMotion ready = taekwondoMotionRepository.save(taekwondoMotion("기본준비", 1));
        long sessionId =
                createEmptyTaekwondoSession(user.token(), user.patientProfileId(), "TAEGEUK_1");

        mockMvc.perform(
                        post("/taekwondo-sessions/{id}/motions", sessionId)
                                .header("Authorization", "Bearer " + user.token())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(motionBody(ready.getId(), 8, 0.9, 1, "좋아요", 70)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.beltPromotion.fromBelt").value("WHITE"))
                .andExpect(jsonPath("$.data.beltPromotion.toBelt").value("ORANGE"));

        // firstEntry + promotion(WHITE→YELLOW) + promotion(YELLOW→ORANGE) = 3건
        assertThat(taekwondoBeltHistoryRepository.count()).isEqualTo(3);
    }

    private long createEmptyTaekwondoSession(String token, Long patientProfileId, String poomsae)
            throws Exception {
        String body =
                mockMvc.perform(
                                post("/taekwondo-sessions")
                                        .header("Authorization", "Bearer " + token)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(createSessionBody(patientProfileId, poomsae)))
                        .andExpect(status().isCreated())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        return objectMapper.readTree(body).get("data").get("id").asLong();
    }

    private String createSessionBody(Long patientProfileId, String poomsae) {
        return """
                {
                  "patientProfileId": %d,
                  "poomsae": "%s"
                }
                """
                .formatted(patientProfileId, poomsae);
    }

    private String motionBody(
            Long taekwondoMotionId,
            int durationSec,
            double accuracy,
            int completedReps,
            String feedback,
            int monstersDefeated) {
        return """
                {
                  "taekwondoMotionId": %d,
                  "durationSec": %d,
                  "accuracy": %s,
                  "completedReps": %d,
                  "feedback": "%s",
                  "monstersDefeated": %d
                }
                """
                .formatted(
                        taekwondoMotionId,
                        durationSec,
                        accuracy,
                        completedReps,
                        feedback,
                        monstersDefeated);
    }

    private TaekwondoMotion taekwondoMotion(String name, int routineOrder) {
        return taekwondoMotion(Poomsae.TAEGEUK_1, name, routineOrder);
    }

    private TaekwondoMotion taekwondoMotion(Poomsae poomsae, String name, int routineOrder) {
        return TaekwondoMotion.builder()
                .poomsae(poomsae)
                .name(name)
                .routineOrder(routineOrder)
                .targetReps(1)
                .description(name + " 동작 설명.")
                .build();
    }

    private TaekwondoSession taekwondoSession(
            PatientProfile patientProfile,
            int durationSec,
            double averageAccuracy,
            int completedMotionCount,
            int monstersDefeated) {
        return TaekwondoSession.builder()
                .patientProfile(patientProfile)
                .poomsae(Poomsae.TAEGEUK_1)
                .durationSec(durationSec)
                .averageAccuracy(averageAccuracy)
                .completedMotionCount(completedMotionCount)
                .monstersDefeated(monstersDefeated)
                .build();
    }

    private TaekwondoSessionMotion sessionMotion(
            TaekwondoSession session, TaekwondoMotion motion, int durationSec, double accuracy) {
        return TaekwondoSessionMotion.builder()
                .session(session)
                .motion(motion)
                .durationSec(durationSec)
                .accuracy(accuracy)
                .completedReps(1)
                .feedback("Good")
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
