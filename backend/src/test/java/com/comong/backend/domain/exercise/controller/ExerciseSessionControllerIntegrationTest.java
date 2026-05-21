package com.comong.backend.domain.exercise.controller;

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

import com.comong.backend.domain.exercise.entity.ExerciseMotion;
import com.comong.backend.domain.exercise.entity.ExerciseSession;
import com.comong.backend.domain.exercise.entity.ExerciseSessionMotion;
import com.comong.backend.domain.exercise.entity.ExerciseType;
import com.comong.backend.domain.exercise.repository.ExerciseMotionRepository;
import com.comong.backend.domain.exercise.repository.ExerciseSessionMotionRepository;
import com.comong.backend.domain.exercise.repository.ExerciseSessionRepository;
import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.support.IntegrationTestSupport;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@AutoConfigureMockMvc
class ExerciseSessionControllerIntegrationTest extends IntegrationTestSupport {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private ExerciseMotionRepository exerciseMotionRepository;
    @Autowired private ExerciseSessionRepository exerciseSessionRepository;
    @Autowired private ExerciseSessionMotionRepository exerciseSessionMotionRepository;
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
        exerciseSessionMotionRepository.deleteAll();
        exerciseSessionRepository.deleteAll();
        exerciseMotionRepository.deleteAll();
        patientProfileRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void createExerciseSession_persistsSessionAndMotionResults() throws Exception {
        TestUser user = setupUserWithProfile("session@example.com", "session-user");
        ExerciseMotion march = exerciseMotionRepository.save(exerciseMotion("March", 1));
        ExerciseMotion sideStep = exerciseMotionRepository.save(exerciseMotion("Side step", 2));

        long sessionId = createEmptyExerciseSession(user.token(), user.patientProfileId(), "TOP");

        mockMvc.perform(
                        post("/exercise-sessions/{id}/motions", sessionId)
                                .header("Authorization", "Bearer " + user.token())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(motionBody(march.getId(), 12, 0.91, 8, "무릎을 조금 더 올려요")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.sessionId").value(sessionId))
                .andExpect(jsonPath("$.data.sessionDurationSec").value(12))
                .andExpect(jsonPath("$.data.sessionCompletedMotionCount").value(1))
                .andExpect(jsonPath("$.data.savedMotion.exerciseMotionId").value(march.getId()))
                .andExpect(jsonPath("$.data.savedMotion.motionName").value("March"))
                .andExpect(jsonPath("$.data.savedMotion.completedReps").value(8));

        mockMvc.perform(
                        post("/exercise-sessions/{id}/motions", sessionId)
                                .header("Authorization", "Bearer " + user.token())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        motionBody(
                                                sideStep.getId(), 14, 0.88, 8, "팔꿈치를 어깨 높이까지 올려요")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.sessionDurationSec").value(26))
                .andExpect(jsonPath("$.data.sessionCompletedMotionCount").value(2));

        mockMvc.perform(
                        get("/exercise-sessions/{id}", sessionId)
                                .header("Authorization", "Bearer " + user.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.id").value(sessionId))
                .andExpect(jsonPath("$.data.patientProfileId").value(user.patientProfileId()))
                .andExpect(jsonPath("$.data.exerciseType").value("TOP"))
                .andExpect(jsonPath("$.data.completedMotionCount").value(2))
                .andExpect(jsonPath("$.data.motions.length()").value(2))
                .andExpect(jsonPath("$.data.motions[0].exerciseMotionId").value(march.getId()))
                .andExpect(jsonPath("$.data.motions[0].routineOrder").value(1))
                .andExpect(jsonPath("$.data.motions[1].exerciseMotionId").value(sideStep.getId()))
                .andExpect(jsonPath("$.data.motions[1].routineOrder").value(2));

        assertThat(exerciseSessionRepository.count()).isEqualTo(1);
        assertThat(exerciseSessionMotionRepository.count()).isEqualTo(2);
    }

    @Test
    void createExerciseSession_persistsRawAndCompactPoseReplay() throws Exception {
        TestUser user = setupUserWithProfile("replay@example.com", "replay-user");
        ExerciseMotion march = exerciseMotionRepository.save(exerciseMotion("March", 1));
        long sessionId = createEmptyExerciseSession(user.token(), user.patientProfileId(), "TOP");

        String body =
                mockMvc.perform(
                                post("/exercise-sessions/{id}/motions", sessionId)
                                        .header("Authorization", "Bearer " + user.token())
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(
                                                """
                                                {
                                                  "exerciseMotionId": %d,
                                                  "durationSec": 12,
                                                  "accuracy": 0.91,
                                                  "completedReps": 8,
                                                  "feedback": "Good",
                                                  "poseReplay": %s,
                                                  "compactPoseReplay": %s
                                                }
                                                """
                                                        .formatted(
                                                                march.getId(),
                                                                replayJson(30, 67, "raw window"),
                                                                replayJson(
                                                                        5,
                                                                        400,
                                                                        "compact count window"))))
                        .andExpect(status().isCreated())
                        .andExpect(jsonPath("$.data.savedMotion.replayAvailable").value(true))
                        .andReturn()
                        .getResponse()
                        .getContentAsString();

        Long motionResultId =
                objectMapper.readTree(body).get("data").get("savedMotion").get("id").asLong();

        ExerciseSessionMotion savedMotion =
                exerciseSessionMotionRepository.findById(motionResultId).orElseThrow();
        assertThat(savedMotion.getPoseReplay()).isNotBlank();
        assertThat(savedMotion.getCompactPoseReplay()).isNotBlank();

        mockMvc.perform(
                        get("/exercise-sessions/motions/{motionResultId}/replay", motionResultId)
                                .header("Authorization", "Bearer " + user.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.replayAvailable").value(true))
                .andExpect(jsonPath("$.data.replay.fps").value(30))
                .andExpect(jsonPath("$.data.compactReplay.fps").value(5))
                .andExpect(
                        jsonPath("$.data.compactReplay.markers[0].reason")
                                .value("compact count window"));
    }

    @Test
    void getMovementAnalysis_returnsConfidenceFilteredJointRanges() throws Exception {
        TestUser user = setupUserWithProfile("analysis@example.com", "analysis-user");
        ExerciseMotion march = exerciseMotionRepository.save(exerciseMotion("March", 1));
        long sessionId = createEmptyExerciseSession(user.token(), user.patientProfileId(), "TOP");

        String body =
                mockMvc.perform(
                                post("/exercise-sessions/{id}/motions", sessionId)
                                        .header("Authorization", "Bearer " + user.token())
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(
                                                """
                                                {
                                                  "exerciseMotionId": %d,
                                                  "durationSec": 1,
                                                  "accuracy": 0.91,
                                                  "completedReps": 1,
                                                  "feedback": "Good",
                                                  "poseReplay": %s
                                                }
                                                """
                                                        .formatted(
                                                                march.getId(),
                                                                analysisReplayJson())))
                        .andExpect(status().isCreated())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();

        Long motionResultId =
                objectMapper.readTree(body).get("data").get("savedMotion").get("id").asLong();

        mockMvc.perform(
                        get(
                                        "/exercise-sessions/motions/{motionResultId}/movement-analysis",
                                        motionResultId)
                                .header("Authorization", "Bearer " + user.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.analysisAvailable").value(true))
                .andExpect(jsonPath("$.data.replaySource").value("RAW"))
                .andExpect(jsonPath("$.data.totalFrameCount").value(3))
                .andExpect(jsonPath("$.data.analyzedFrameCount").value(2))
                .andExpect(jsonPath("$.data.excludedFrameCount").value(1))
                .andExpect(jsonPath("$.data.analyzedDurationMs").value(66))
                .andExpect(jsonPath("$.data.excludedDurationMs").value(33))
                .andExpect(jsonPath("$.data.confidenceThreshold").value(0.2))
                .andExpect(jsonPath("$.data.averageConfidence").value(0.92))
                .andExpect(jsonPath("$.data.joints[0].jointName").value("LEFT_ELBOW"))
                .andExpect(jsonPath("$.data.joints[0].validFrameCount").value(2))
                .andExpect(jsonPath("$.data.joints[0].coverageRate").value(0.667))
                .andExpect(jsonPath("$.data.joints[0].minAngleDeg").value(90.0))
                .andExpect(jsonPath("$.data.joints[0].maxAngleDeg").value(180.0))
                .andExpect(jsonPath("$.data.joints[0].rangeDeg").value(90.0))
                .andExpect(jsonPath("$.data.excludedSegments[0].startMs").value(33))
                .andExpect(jsonPath("$.data.excludedSegments[0].endMs").value(66))
                .andExpect(jsonPath("$.data.excludedSegments[0].reason").value("LOW_CONFIDENCE"))
                .andExpect(
                        jsonPath("$.data.representativeSegment.reason").value("analysis window"));
    }

    @Test
    void getMovementAnalysis_returnsUnavailableWhenReplayIsMissing() throws Exception {
        TestUser user = setupUserWithProfile("analysis-empty@example.com", "analysis-empty-user");
        PatientProfile profile = findProfile(user);
        ExerciseMotion march = exerciseMotionRepository.save(exerciseMotion("March", 1));
        ExerciseSession session =
                exerciseSessionRepository.save(exerciseSession(profile, 1, 0.8, 1));
        ExerciseSessionMotion sessionMotion =
                exerciseSessionMotionRepository.save(sessionMotion(session, march, 1, 0.8));

        mockMvc.perform(
                        get(
                                        "/exercise-sessions/motions/{motionResultId}/movement-analysis",
                                        sessionMotion.getId())
                                .header("Authorization", "Bearer " + user.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.analysisAvailable").value(false))
                .andExpect(jsonPath("$.data.replaySource").value("NONE"))
                .andExpect(jsonPath("$.data.totalFrameCount").value(0))
                .andExpect(jsonPath("$.data.joints.length()").value(0))
                .andExpect(jsonPath("$.data.excludedSegments.length()").value(0));
    }

    @Test
    void getMovementAnalysis_rejectsInvalidReplayTiming() throws Exception {
        TestUser user =
                setupUserWithProfile("analysis-invalid@example.com", "analysis-invalid-user");
        PatientProfile profile = findProfile(user);
        ExerciseMotion march = exerciseMotionRepository.save(exerciseMotion("March", 1));
        ExerciseSession session =
                exerciseSessionRepository.save(exerciseSession(profile, 1, 0.8, 1));
        ExerciseSessionMotion sessionMotion =
                exerciseSessionMotionRepository.save(
                        ExerciseSessionMotion.builder()
                                .session(session)
                                .exerciseMotion(march)
                                .durationSec(1)
                                .accuracy(0.8)
                                .completedReps(1)
                                .feedback("Good")
                                .poseReplay(invalidTimingReplayJson())
                                .build());

        mockMvc.perform(
                        get(
                                        "/exercise-sessions/motions/{motionResultId}/movement-analysis",
                                        sessionMotion.getId())
                                .header("Authorization", "Bearer " + user.token()))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("G-999"));
    }

    @Test
    void createExerciseSession_acceptsV2PoseReplay() throws Exception {
        TestUser user = setupUserWithProfile("replay-v2@example.com", "replay-v2-user");
        ExerciseMotion march = exerciseMotionRepository.save(exerciseMotion("March", 1));
        long sessionId = createEmptyExerciseSession(user.token(), user.patientProfileId(), "TOP");

        String body =
                mockMvc.perform(
                                post("/exercise-sessions/{id}/motions", sessionId)
                                        .header("Authorization", "Bearer " + user.token())
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(
                                                """
                                                {
                                                  "exerciseMotionId": %d,
                                                  "durationSec": 12,
                                                  "accuracy": 0.91,
                                                  "completedReps": 8,
                                                  "feedback": "Good",
                                                  "poseReplay": %s,
                                                  "compactPoseReplay": %s
                                                }
                                                """
                                                        .formatted(
                                                                march.getId(),
                                                                replayJsonV2(30, 67, "raw v2"),
                                                                replayJsonV2(
                                                                        5, 400, "compact v2"))))
                        .andExpect(status().isCreated())
                        .andExpect(jsonPath("$.data.savedMotion.replayAvailable").value(true))
                        .andReturn()
                        .getResponse()
                        .getContentAsString();

        Long motionResultId =
                objectMapper.readTree(body).get("data").get("savedMotion").get("id").asLong();

        mockMvc.perform(
                        get("/exercise-sessions/motions/{motionResultId}/replay", motionResultId)
                                .header("Authorization", "Bearer " + user.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.replay.version").value(2))
                .andExpect(jsonPath("$.data.replay.landmarks.length()").value(25))
                .andExpect(jsonPath("$.data.replay.frames[0].lm.length()").value(25))
                .andExpect(jsonPath("$.data.compactReplay.version").value(2))
                .andExpect(jsonPath("$.data.compactReplay.landmarks.length()").value(25))
                .andExpect(jsonPath("$.data.compactReplay.frames[0].lm.length()").value(25));
    }

    @Test
    void listExerciseSessions_returnsOwnedPatientSessionsOrderedByCreatedAtDesc() throws Exception {
        TestUser user = setupUserWithProfile("list-session@example.com", "list-session-user");
        PatientProfile profile = findProfile(user);
        ExerciseSession older =
                exerciseSessionRepository.save(exerciseSession(profile, 60, 0.8, 1));
        Thread.sleep(5);
        ExerciseSession newer =
                exerciseSessionRepository.save(exerciseSession(profile, 78, 0.87, 2));

        mockMvc.perform(
                        get("/exercise-sessions")
                                .header("Authorization", "Bearer " + user.token())
                                .param("patientProfileId", user.patientProfileId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].id").value(newer.getId()))
                .andExpect(jsonPath("$.data[0].durationSec").value(78))
                .andExpect(jsonPath("$.data[1].id").value(older.getId()))
                .andExpect(jsonPath("$.data[1].durationSec").value(60));
    }

    @Test
    void listExerciseSessions_rejectsOtherUsersPatientProfile() throws Exception {
        TestUser owner = setupUserWithProfile("list-owner@example.com", "list-owner-user");
        TestUser other = setupUserWithProfile("list-other@example.com", "list-other-user");

        mockMvc.perform(
                        get("/exercise-sessions")
                                .header("Authorization", "Bearer " + other.token())
                                .param("patientProfileId", owner.patientProfileId().toString()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("P-001"));
    }

    @Test
    void getExerciseSessionDetail_returnsOwnedSessionWithMotionsOrderedByRoutineOrder()
            throws Exception {
        TestUser user = setupUserWithProfile("detail-session@example.com", "detail-session-user");
        PatientProfile profile = findProfile(user);
        ExerciseMotion march = exerciseMotionRepository.save(exerciseMotion("March", 1));
        ExerciseMotion sideStep = exerciseMotionRepository.save(exerciseMotion("Side step", 2));
        ExerciseSession session =
                exerciseSessionRepository.save(exerciseSession(profile, 78, 0.87, 2));
        exerciseSessionMotionRepository.save(sessionMotion(session, sideStep, 14, 0.88));
        exerciseSessionMotionRepository.save(sessionMotion(session, march, 12, 0.91));

        mockMvc.perform(
                        get("/exercise-sessions/{id}", session.getId())
                                .header("Authorization", "Bearer " + user.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.id").value(session.getId()))
                .andExpect(jsonPath("$.data.patientProfileId").value(user.patientProfileId()))
                .andExpect(jsonPath("$.data.motions.length()").value(2))
                .andExpect(jsonPath("$.data.motions[0].exerciseMotionId").value(march.getId()))
                .andExpect(jsonPath("$.data.motions[0].routineOrder").value(1))
                .andExpect(jsonPath("$.data.motions[1].exerciseMotionId").value(sideStep.getId()))
                .andExpect(jsonPath("$.data.motions[1].routineOrder").value(2));
    }

    @Test
    void getExerciseSessionDetail_rejectsOtherUsersSession() throws Exception {
        TestUser owner = setupUserWithProfile("detail-owner@example.com", "detail-owner-user");
        TestUser other = setupUserWithProfile("detail-other@example.com", "detail-other-user");
        ExerciseSession session =
                exerciseSessionRepository.save(exerciseSession(findProfile(owner), 78, 0.87, 1));

        mockMvc.perform(
                        get("/exercise-sessions/{id}", session.getId())
                                .header("Authorization", "Bearer " + other.token()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("EX-005"));
    }

    @Test
    void createExerciseSession_rejectsOtherUsersPatientProfile() throws Exception {
        TestUser owner = setupUserWithProfile("owner@example.com", "owner-user");
        TestUser other = setupUserWithProfile("other@example.com", "other-user");

        mockMvc.perform(
                        post("/exercise-sessions")
                                .header("Authorization", "Bearer " + other.token())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(createSessionBody(owner.patientProfileId(), "TOP")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("P-001"));

        assertThat(exerciseSessionRepository.count()).isZero();
        assertThat(exerciseSessionMotionRepository.count()).isZero();
    }

    @Test
    void saveExerciseMotion_rejectsUnknownMotion() throws Exception {
        TestUser user = setupUserWithProfile("unknown@example.com", "unknown-user");
        long sessionId = createEmptyExerciseSession(user.token(), user.patientProfileId(), "TOP");

        mockMvc.perform(
                        post("/exercise-sessions/{id}/motions", sessionId)
                                .header("Authorization", "Bearer " + user.token())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(motionBody(999_999L, 12, 0.91, 8, "feedback")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("EX-001"));

        assertThat(exerciseSessionMotionRepository.count()).isZero();
    }

    @Test
    void saveExerciseMotion_rejectsMotionTypeMismatch() throws Exception {
        TestUser user = setupUserWithProfile("mismatch@example.com", "mismatch-user");
        ExerciseMotion motion =
                exerciseMotionRepository.save(
                        exerciseMotion(ExerciseType.DANIEL, "Daniel stretch", 1));
        long sessionId = createEmptyExerciseSession(user.token(), user.patientProfileId(), "TOP");

        mockMvc.perform(
                        post("/exercise-sessions/{id}/motions", sessionId)
                                .header("Authorization", "Bearer " + user.token())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(motionBody(motion.getId(), 12, 0.91, 8, "feedback")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("EX-004"));

        assertThat(exerciseSessionMotionRepository.count()).isZero();
    }

    @Test
    void saveExerciseMotion_rejectsMissingMotionId() throws Exception {
        TestUser user = setupUserWithProfile("invalid-motion@example.com", "invalid-motion-user");
        long sessionId = createEmptyExerciseSession(user.token(), user.patientProfileId(), "TOP");

        mockMvc.perform(
                        post("/exercise-sessions/{id}/motions", sessionId)
                                .header("Authorization", "Bearer " + user.token())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "durationSec": 12,
                                          "accuracy": 0.91,
                                          "completedReps": 8,
                                          "feedback": "feedback"
                                        }
                                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("G-001"));

        assertThat(exerciseSessionMotionRepository.count()).isZero();
    }

    @Test
    void createExerciseSession_requiresAuthentication() throws Exception {
        mockMvc.perform(
                        post("/exercise-sessions")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(createSessionBody(1L, "TOP")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("G-003"));
    }

    @Test
    void listExerciseSessions_requiresAuthentication() throws Exception {
        mockMvc.perform(get("/exercise-sessions").param("patientProfileId", "1"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("G-003"));
    }

    @Test
    void getExerciseSessionDetail_requiresAuthentication() throws Exception {
        mockMvc.perform(get("/exercise-sessions/{id}", 1L))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("G-003"));
    }

    private long createEmptyExerciseSession(
            String token, Long patientProfileId, String exerciseType) throws Exception {
        String body =
                mockMvc.perform(
                                post("/exercise-sessions")
                                        .header("Authorization", "Bearer " + token)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(createSessionBody(patientProfileId, exerciseType)))
                        .andExpect(status().isCreated())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        return objectMapper.readTree(body).get("data").get("id").asLong();
    }

    private String createSessionBody(Long patientProfileId, String exerciseType) {
        return """
                {
                  "patientProfileId": %d,
                  "exerciseType": "%s"
                }
                """
                .formatted(patientProfileId, exerciseType);
    }

    private String motionBody(
            Long exerciseMotionId,
            int durationSec,
            double accuracy,
            int completedReps,
            String feedback) {
        return """
                {
                  "exerciseMotionId": %d,
                  "durationSec": %d,
                  "accuracy": %s,
                  "completedReps": %d,
                  "feedback": "%s"
                }
                """
                .formatted(exerciseMotionId, durationSec, accuracy, completedReps, feedback);
    }

    private ExerciseMotion exerciseMotion(String name, int routineOrder) {
        return exerciseMotion(ExerciseType.TOP, name, routineOrder);
    }

    private ExerciseMotion exerciseMotion(
            ExerciseType exerciseType, String name, int routineOrder) {
        return ExerciseMotion.builder()
                .exerciseType(exerciseType)
                .name(name)
                .routineOrder(routineOrder)
                .targetReps(8)
                .description(name + " description.")
                .build();
    }

    private ExerciseSession exerciseSession(
            PatientProfile patientProfile,
            int durationSec,
            double averageAccuracy,
            int completedMotionCount) {
        return ExerciseSession.builder()
                .patientProfile(patientProfile)
                .exerciseType(ExerciseType.TOP)
                .durationSec(durationSec)
                .averageAccuracy(averageAccuracy)
                .completedMotionCount(completedMotionCount)
                .build();
    }

    private ExerciseSessionMotion sessionMotion(
            ExerciseSession session, ExerciseMotion motion, int durationSec, double accuracy) {
        return ExerciseSessionMotion.builder()
                .session(session)
                .exerciseMotion(motion)
                .durationSec(durationSec)
                .accuracy(accuracy)
                .completedReps(8)
                .feedback("Good")
                .build();
    }

    private PatientProfile findProfile(TestUser user) {
        return patientProfileRepository.findById(user.patientProfileId()).orElseThrow();
    }

    private String replayJson(int fps, int endMs, String reason) {
        return """
                {
                  "version": 1,
                  "fps": %d,
                  "durationMs": %d,
                  "landmarks": %s,
                  "frames": [
                    {"t": 0, "lm": %s},
                    {"t": %d, "lm": %s}
                  ],
                  "representativeSegment": {
                    "startMs": 0,
                    "endMs": %d,
                    "reason": "%s"
                  },
                  "markers": [
                    {
                      "startMs": 0,
                      "endMs": %d,
                      "reason": "%s"
                    }
                  ]
                }
                """
                .formatted(
                        fps,
                        endMs,
                        replayLandmarkNamesJson(),
                        replayFrameTuplesJson(),
                        endMs,
                        replayFrameTuplesJson(),
                        endMs,
                        reason,
                        endMs,
                        reason);
    }

    private String replayJsonV2(int fps, int endMs, String reason) {
        return """
                {
                  "version": 2,
                  "fps": %d,
                  "durationMs": %d,
                  "landmarks": %s,
                  "frames": [
                    {"t": 0, "lm": %s},
                    {"t": %d, "lm": %s}
                  ],
                  "representativeSegment": {
                    "startMs": 0,
                    "endMs": %d,
                    "reason": "%s"
                  },
                  "markers": [
                    {
                      "startMs": 0,
                      "endMs": %d,
                      "reason": "%s"
                    }
                  ]
                }
                """
                .formatted(
                        fps,
                        endMs,
                        replayLandmarkNamesV2Json(),
                        replayFrameTuplesV2Json(),
                        endMs,
                        replayFrameTuplesV2Json(),
                        endMs,
                        reason,
                        endMs,
                        reason);
    }

    private String replayLandmarkNamesJson() {
        return """
                [
                  "LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_ELBOW", "RIGHT_ELBOW",
                  "LEFT_WRIST", "RIGHT_WRIST", "LEFT_HIP", "RIGHT_HIP",
                  "LEFT_KNEE", "RIGHT_KNEE", "LEFT_ANKLE", "RIGHT_ANKLE"
                ]
                """;
    }

    private String replayFrameTuplesJson() {
        return """
                [
                  [0.1, 0.9, 0.0, 0.92],
                  [0.2, 0.9, 0.0, 0.92],
                  [0.1, 1.1, 0.0, 0.91],
                  [0.2, 1.1, 0.0, 0.91],
                  [0.1, 1.3, 0.0, 0.9],
                  [0.2, 1.3, 0.0, 0.9],
                  [0.1, 1.6, 0.0, 0.93],
                  [0.2, 1.6, 0.0, 0.93],
                  [0.1, 1.9, 0.0, 0.91],
                  [0.2, 1.9, 0.0, 0.91],
                  [0.1, 2.2, 0.0, 0.9],
                  [0.2, 2.2, 0.0, 0.9]
                ]
                """;
    }

    private String analysisReplayJson() {
        return """
                {
                  "version": 1,
                  "fps": 30,
                  "durationMs": 99,
                  "landmarks": %s,
                  "frames": [
                    {"t": 0, "lm": %s},
                    {"t": 33, "lm": %s},
                    {"t": 66, "lm": %s}
                  ],
                  "representativeSegment": {
                    "startMs": 0,
                    "endMs": 99,
                    "reason": "analysis window"
                  }
                }
                """
                .formatted(
                        replayLandmarkNamesJson(),
                        straightPoseFrameTuplesJson(0.92),
                        straightPoseFrameTuplesJson(0.1),
                        bentLeftElbowFrameTuplesJson(0.92));
    }

    private String invalidTimingReplayJson() {
        return """
                {
                  "version": 1,
                  "fps": 30,
                  "durationMs": 99,
                  "landmarks": %s,
                  "frames": [
                    {"t": 0, "lm": %s},
                    {"t": 120, "lm": %s}
                  ]
                }
                """
                .formatted(
                        replayLandmarkNamesJson(),
                        straightPoseFrameTuplesJson(0.92),
                        straightPoseFrameTuplesJson(0.92));
    }

    private String straightPoseFrameTuplesJson(double confidence) {
        return """
                [
                  [0.0, 0.0, 0.0, %1$.2f],
                  [1.0, 0.0, 0.0, %1$.2f],
                  [0.0, 1.0, 0.0, %1$.2f],
                  [1.0, 1.0, 0.0, %1$.2f],
                  [0.0, 2.0, 0.0, %1$.2f],
                  [1.0, 2.0, 0.0, %1$.2f],
                  [0.0, 3.0, 0.0, %1$.2f],
                  [1.0, 3.0, 0.0, %1$.2f],
                  [0.0, 4.0, 0.0, %1$.2f],
                  [1.0, 4.0, 0.0, %1$.2f],
                  [0.0, 5.0, 0.0, %1$.2f],
                  [1.0, 5.0, 0.0, %1$.2f]
                ]
                """
                .formatted(confidence);
    }

    private String bentLeftElbowFrameTuplesJson(double confidence) {
        return """
                [
                  [0.0, 0.0, 0.0, %1$.2f],
                  [1.0, 0.0, 0.0, %1$.2f],
                  [0.0, 1.0, 0.0, %1$.2f],
                  [1.0, 1.0, 0.0, %1$.2f],
                  [1.0, 1.0, 0.0, %1$.2f],
                  [1.0, 2.0, 0.0, %1$.2f],
                  [0.0, 3.0, 0.0, %1$.2f],
                  [1.0, 3.0, 0.0, %1$.2f],
                  [0.0, 4.0, 0.0, %1$.2f],
                  [1.0, 4.0, 0.0, %1$.2f],
                  [0.0, 5.0, 0.0, %1$.2f],
                  [1.0, 5.0, 0.0, %1$.2f]
                ]
                """
                .formatted(confidence);
    }

    private String replayLandmarkNamesV2Json() {
        return """
                [
                  "NOSE", "LEFT_EAR", "RIGHT_EAR", "LEFT_SHOULDER", "RIGHT_SHOULDER",
                  "LEFT_ELBOW", "RIGHT_ELBOW", "LEFT_WRIST", "RIGHT_WRIST",
                  "LEFT_PINKY", "RIGHT_PINKY", "LEFT_INDEX", "RIGHT_INDEX",
                  "LEFT_THUMB", "RIGHT_THUMB", "LEFT_HIP", "RIGHT_HIP",
                  "LEFT_KNEE", "RIGHT_KNEE", "LEFT_ANKLE", "RIGHT_ANKLE",
                  "LEFT_HEEL", "RIGHT_HEEL", "LEFT_FOOT_INDEX", "RIGHT_FOOT_INDEX"
                ]
                """;
    }

    private String replayFrameTuplesV2Json() {
        StringBuilder builder = new StringBuilder("[\n");
        for (int i = 0; i < 25; i++) {
            if (i > 0) {
                builder.append(",\n");
            }
            builder.append("                  [0.1, 0.9, 0.0, 0.92]");
        }
        return builder.append("\n                ]").toString();
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
