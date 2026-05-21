package com.comong.backend.domain.exercise.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

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
import com.comong.backend.global.storage.StorageProperties;
import com.comong.backend.support.IntegrationTestSupport;

import tools.jackson.databind.ObjectMapper;

@AutoConfigureMockMvc
class ExerciseMotionControllerIntegrationTest extends IntegrationTestSupport {

    /** PNG signature 8 byte + 4 byte filler = 12 byte (LocalImageStorage MAGIC_HEAD_SIZE). */
    private static final byte[] PNG_BYTES = {
        (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0
    };

    /** MP4 ftyp box at offset 4: "ftyp" + 4 byte filler + 4 byte filler = 12 byte total. */
    private static final byte[] MP4_BYTES = {0, 0, 0, 0x20, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm'};

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private ExerciseMotionRepository exerciseMotionRepository;
    @Autowired private ExerciseSessionRepository exerciseSessionRepository;
    @Autowired private ExerciseSessionMotionRepository exerciseSessionMotionRepository;
    @Autowired private PatientProfileRepository patientProfileRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private StorageProperties storageProperties;

    @Value("${server.servlet.context-path:}")
    private String contextPath;

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
    void listExerciseMotions_returnsExerciseTypeMotionsOrderedByRoutineOrder() throws Exception {
        String token = setupUser("list@example.com", "list-user");
        exerciseMotionRepository.save(exerciseMotion(ExerciseType.TOP, "Side step", 2));
        exerciseMotionRepository.save(exerciseMotion(ExerciseType.TOP, "March", 1));
        exerciseMotionRepository.save(exerciseMotion(ExerciseType.DANIEL, "Stretch", 1));

        mockMvc.perform(
                        get("/exercise-motions")
                                .param("exerciseType", "TOP")
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].name").value("March"))
                .andExpect(jsonPath("$.data[0].routineOrder").value(1))
                .andExpect(jsonPath("$.data[1].name").value("Side step"))
                .andExpect(jsonPath("$.data[1].routineOrder").value(2));
    }

    @Test
    void getExerciseMotionDetail_returnsMotion() throws Exception {
        String token = setupUser("detail@example.com", "detail-user");
        ExerciseMotion motion =
                exerciseMotionRepository.save(exerciseMotion(ExerciseType.TOP, "March", 1));

        mockMvc.perform(
                        get("/exercise-motions/{id}", motion.getId())
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.id").value(motion.getId()))
                .andExpect(jsonPath("$.data.name").value("March"));
    }

    @Test
    void createExerciseMotion_byAdminPersistsAndReturnsLocation() throws Exception {
        String requestJson =
                "{\"exerciseType\":\"TOP\",\"name\":\"March\",\"routineOrder\":1,"
                        + "\"targetReps\":8,\"description\":\"Walk in place.\"}";

        mockMvc.perform(
                        applyAdmin(
                                createMultipart(requestJson, /* thumb */ null, /* video */ null)))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", startsWith("/exercise-motions/")))
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.id").isNumber())
                .andExpect(jsonPath("$.data.exerciseType").value("TOP"))
                .andExpect(jsonPath("$.data.name").value("March"))
                .andExpect(jsonPath("$.data.routineOrder").value(1))
                .andExpect(jsonPath("$.data.targetReps").value(8))
                .andExpect(jsonPath("$.data.thumbnailUrl").doesNotExist())
                .andExpect(jsonPath("$.data.demoVideoUrl").doesNotExist());

        assertThat(exerciseMotionRepository.count()).isEqualTo(1);
    }

    @Test
    void createExerciseMotion_acceptsThumbnailAndVideoAndStoresFiles() throws Exception {
        String requestJson =
                "{\"exerciseType\":\"TOP\",\"name\":\"March\",\"routineOrder\":2,"
                        + "\"targetReps\":8,\"description\":\"Walk in place.\"}";
        MockMultipartFile thumbnail =
                new MockMultipartFile("thumbnail", "march.png", "image/png", PNG_BYTES);
        MockMultipartFile demoVideo =
                new MockMultipartFile("demoVideo", "march.mp4", "video/mp4", MP4_BYTES);

        mockMvc.perform(applyAdmin(createMultipart(requestJson, thumbnail, demoVideo)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.thumbnailUrl").isString())
                .andExpect(jsonPath("$.data.demoVideoUrl").isString());

        ExerciseMotion saved =
                exerciseMotionRepository
                        .findAllByExerciseTypeOrderByRoutineOrderAsc(ExerciseType.TOP)
                        .get(0);
        assertThat(saved.getThumbnailUrl()).isNotNull();
        assertThat(saved.getDemoVideoUrl()).isNotNull();
        assertThat(Files.exists(localPath(saved.getThumbnailUrl()))).isTrue();
        assertThat(Files.exists(localPath(saved.getDemoVideoUrl()))).isTrue();
    }

    @Test
    void createExerciseMotion_byUserIsForbidden() throws Exception {
        String requestJson =
                "{\"exerciseType\":\"TOP\",\"name\":\"March\",\"routineOrder\":1,"
                        + "\"targetReps\":8,\"description\":\"Walk in place.\"}";

        mockMvc.perform(createMultipart(requestJson, null, null).with(user("user").roles("USER")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("G-004"));

        assertThat(exerciseMotionRepository.count()).isZero();
    }

    @Test
    void createExerciseMotion_rejectsDuplicatedRoutineOrderInSameExerciseType() throws Exception {
        exerciseMotionRepository.save(exerciseMotion(ExerciseType.TOP, "March", 1));

        String requestJson =
                "{\"exerciseType\":\"TOP\",\"name\":\"Side step\",\"routineOrder\":1,"
                        + "\"targetReps\":8,\"description\":\"Move side to side.\"}";

        mockMvc.perform(applyAdmin(createMultipart(requestJson, null, null)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EX-002"));
    }

    @Test
    void updateExerciseMotion_byAdminUpdatesAllowedFields() throws Exception {
        ExerciseMotion saved =
                exerciseMotionRepository.save(exerciseMotion(ExerciseType.TOP, "March", 1));

        String requestJson =
                "{\"name\":\"March updated\",\"targetReps\":10,"
                        + "\"description\":\"Updated description.\"}";

        mockMvc.perform(applyAdmin(updateMultipart(saved.getId(), requestJson, null, null)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.id").value(saved.getId()))
                .andExpect(jsonPath("$.data.exerciseType").value("TOP"))
                .andExpect(jsonPath("$.data.routineOrder").value(1))
                .andExpect(jsonPath("$.data.name").value("March updated"))
                .andExpect(jsonPath("$.data.targetReps").value(10))
                .andExpect(jsonPath("$.data.description").value("Updated description."));

        ExerciseMotion updated = exerciseMotionRepository.findById(saved.getId()).orElseThrow();
        assertThat(updated.getName()).isEqualTo("March updated");
        assertThat(updated.getTargetReps()).isEqualTo(10);
    }

    @Test
    void updateExerciseMotion_acceptsDescriptionWithTrailingNewline() throws Exception {
        ExerciseMotion saved =
                exerciseMotionRepository.save(exerciseMotion(ExerciseType.TOP, "March", 1));
        String expectedDescription = "Updated description.\n";

        mockMvc.perform(
                        applyAdmin(
                                updateMultipart(
                                        saved.getId(),
                                        "{\"description\":\"Updated description.\\n\"}",
                                        null,
                                        null)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.description").value(expectedDescription));

        ExerciseMotion updated = exerciseMotionRepository.findById(saved.getId()).orElseThrow();
        assertThat(updated.getDescription()).isEqualTo(expectedDescription);
    }

    @Test
    void updateExerciseMotion_byAdminUpdatesRoutineOrder() throws Exception {
        ExerciseMotion march =
                exerciseMotionRepository.save(exerciseMotion(ExerciseType.TOP, "March", 1));
        exerciseMotionRepository.save(exerciseMotion(ExerciseType.TOP, "Side step", 2));

        mockMvc.perform(
                        applyAdmin(
                                updateMultipart(march.getId(), "{\"routineOrder\":3}", null, null)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.routineOrder").value(3));

        ExerciseMotion updated = exerciseMotionRepository.findById(march.getId()).orElseThrow();
        assertThat(updated.getRoutineOrder()).isEqualTo(3);
    }

    @Test
    void updateExerciseMotion_rejectsDuplicatedRoutineOrderInSameExerciseType() throws Exception {
        ExerciseMotion march =
                exerciseMotionRepository.save(exerciseMotion(ExerciseType.TOP, "March", 1));
        exerciseMotionRepository.save(exerciseMotion(ExerciseType.TOP, "Side step", 2));

        mockMvc.perform(
                        applyAdmin(
                                updateMultipart(march.getId(), "{\"routineOrder\":2}", null, null)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EX-002"));

        ExerciseMotion unchanged = exerciseMotionRepository.findById(march.getId()).orElseThrow();
        assertThat(unchanged.getRoutineOrder()).isEqualTo(1);
    }

    @Test
    void reorderExerciseMotions_byAdminReassignsRoutineOrder() throws Exception {
        ExerciseMotion march =
                exerciseMotionRepository.save(exerciseMotion(ExerciseType.TOP, "March", 1));
        ExerciseMotion sideStep =
                exerciseMotionRepository.save(exerciseMotion(ExerciseType.TOP, "Side step", 2));
        ExerciseMotion stretch =
                exerciseMotionRepository.save(exerciseMotion(ExerciseType.TOP, "Stretch", 3));
        exerciseMotionRepository.save(exerciseMotion(ExerciseType.DANIEL, "Daniel stretch", 1));

        String requestJson =
                """
                {"exerciseType":"TOP","motionIds":[%d,%d,%d]}
                """
                        .formatted(sideStep.getId(), stretch.getId(), march.getId());

        mockMvc.perform(
                        patch("/exercise-motions/reorder")
                                .with(user("admin").roles("ADMIN"))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(requestJson))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data[0].id").value(sideStep.getId()))
                .andExpect(jsonPath("$.data[0].routineOrder").value(1))
                .andExpect(jsonPath("$.data[1].id").value(stretch.getId()))
                .andExpect(jsonPath("$.data[1].routineOrder").value(2))
                .andExpect(jsonPath("$.data[2].id").value(march.getId()))
                .andExpect(jsonPath("$.data[2].routineOrder").value(3));

        assertThat(
                        exerciseMotionRepository
                                .findAllByExerciseTypeOrderByRoutineOrderAsc(ExerciseType.TOP)
                                .stream()
                                .map(ExerciseMotion::getName)
                                .toList())
                .containsExactly("Side step", "Stretch", "March");
    }

    @Test
    void reorderExerciseMotions_rejectsMismatchedMotionIds() throws Exception {
        ExerciseMotion march =
                exerciseMotionRepository.save(exerciseMotion(ExerciseType.TOP, "March", 1));
        exerciseMotionRepository.save(exerciseMotion(ExerciseType.TOP, "Side step", 2));

        String requestJson =
                """
                {"exerciseType":"TOP","motionIds":[%d]}
                """
                        .formatted(march.getId());

        mockMvc.perform(
                        patch("/exercise-motions/reorder")
                                .with(user("admin").roles("ADMIN"))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(requestJson))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("EX-006"));
    }

    @Test
    void updateExerciseMotion_replacesThumbnailAndDeletesOldFile() throws Exception {
        // 1. 기존 썸네일 업로드 + 동작 생성
        String createJson =
                "{\"exerciseType\":\"TOP\",\"name\":\"March\",\"routineOrder\":1,"
                        + "\"targetReps\":8,\"description\":\"Walk in place.\"}";
        MockMultipartFile firstThumb =
                new MockMultipartFile("thumbnail", "first.png", "image/png", PNG_BYTES);
        mockMvc.perform(applyAdmin(createMultipart(createJson, firstThumb, null)))
                .andExpect(status().isCreated());
        ExerciseMotion saved =
                exerciseMotionRepository
                        .findAllByExerciseTypeOrderByRoutineOrderAsc(ExerciseType.TOP)
                        .get(0);
        Path firstFile = localPath(saved.getThumbnailUrl());
        assertThat(Files.exists(firstFile)).isTrue();

        // 2. 다른 썸네일로 교체
        MockMultipartFile secondThumb =
                new MockMultipartFile("thumbnail", "second.png", "image/png", PNG_BYTES);
        mockMvc.perform(applyAdmin(updateMultipart(saved.getId(), "{}", secondThumb, null)))
                .andExpect(status().isOk());

        ExerciseMotion updated = exerciseMotionRepository.findById(saved.getId()).orElseThrow();
        assertThat(updated.getThumbnailUrl()).isNotEqualTo(saved.getThumbnailUrl());
        assertThat(Files.exists(localPath(updated.getThumbnailUrl()))).isTrue();
        // 이전 파일은 afterCommit 훅으로 삭제됨
        assertThat(Files.exists(firstFile)).isFalse();
    }

    @Test
    void updateExerciseMotion_clearThumbnailRemovesUrlAndFile() throws Exception {
        String createJson =
                "{\"exerciseType\":\"TOP\",\"name\":\"March\",\"routineOrder\":1,"
                        + "\"targetReps\":8,\"description\":\"Walk in place.\"}";
        MockMultipartFile thumb =
                new MockMultipartFile("thumbnail", "march.png", "image/png", PNG_BYTES);
        mockMvc.perform(applyAdmin(createMultipart(createJson, thumb, null)))
                .andExpect(status().isCreated());
        ExerciseMotion saved =
                exerciseMotionRepository
                        .findAllByExerciseTypeOrderByRoutineOrderAsc(ExerciseType.TOP)
                        .get(0);
        Path file = localPath(saved.getThumbnailUrl());
        assertThat(Files.exists(file)).isTrue();

        mockMvc.perform(
                        applyAdmin(
                                updateMultipart(
                                        saved.getId(), "{\"clearThumbnail\":true}", null, null)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.thumbnailUrl").doesNotExist());

        ExerciseMotion updated = exerciseMotionRepository.findById(saved.getId()).orElseThrow();
        assertThat(updated.getThumbnailUrl()).isNull();
        assertThat(Files.exists(file)).isFalse();
    }

    @Test
    void updateExerciseMotion_byUserIsForbidden() throws Exception {
        ExerciseMotion saved =
                exerciseMotionRepository.save(exerciseMotion(ExerciseType.TOP, "March", 1));

        mockMvc.perform(
                        updateMultipart(saved.getId(), "{\"name\":\"March updated\"}", null, null)
                                .with(user("user").roles("USER")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("G-004"));

        assertThat(exerciseMotionRepository.findById(saved.getId()).orElseThrow().getName())
                .isEqualTo("March");
    }

    @Test
    void updateExerciseMotion_rejectsUnknownMotion() throws Exception {
        mockMvc.perform(
                        applyAdmin(
                                updateMultipart(
                                        999_999L, "{\"name\":\"March updated\"}", null, null)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("EX-001"));
    }

    @Test
    void updateExerciseMotion_rejectsInvalidInput() throws Exception {
        ExerciseMotion saved =
                exerciseMotionRepository.save(exerciseMotion(ExerciseType.TOP, "March", 1));

        mockMvc.perform(
                        applyAdmin(
                                updateMultipart(
                                        saved.getId(),
                                        "{\"name\":\"   \",\"targetReps\":0}",
                                        null,
                                        null)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("G-001"));

        ExerciseMotion unchanged = exerciseMotionRepository.findById(saved.getId()).orElseThrow();
        assertThat(unchanged.getName()).isEqualTo("March");
        assertThat(unchanged.getTargetReps()).isEqualTo(8);
    }

    @Test
    void updateExerciseMotion_rejectsBlankLineOnlyDescription() throws Exception {
        ExerciseMotion saved =
                exerciseMotionRepository.save(exerciseMotion(ExerciseType.TOP, "March", 1));
        String originalDescription = saved.getDescription();

        mockMvc.perform(
                        applyAdmin(
                                updateMultipart(
                                        saved.getId(), "{\"description\":\"\\n\\n\"}", null, null)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("G-001"));

        ExerciseMotion unchanged = exerciseMotionRepository.findById(saved.getId()).orElseThrow();
        assertThat(unchanged.getDescription()).isEqualTo(originalDescription);
    }

    @Test
    void deleteExerciseMotion_byAdminRemovesMotion() throws Exception {
        ExerciseMotion saved =
                exerciseMotionRepository.save(exerciseMotion(ExerciseType.TOP, "March", 1));

        mockMvc.perform(
                        delete("/exercise-motions/{id}", saved.getId())
                                .with(user("admin").roles("ADMIN")))
                .andExpect(status().isNoContent());

        assertThat(exerciseMotionRepository.existsById(saved.getId())).isFalse();
    }

    @Test
    void deleteExerciseMotion_byUserIsForbidden() throws Exception {
        ExerciseMotion saved =
                exerciseMotionRepository.save(exerciseMotion(ExerciseType.TOP, "March", 1));

        mockMvc.perform(
                        delete("/exercise-motions/{id}", saved.getId())
                                .with(user("user").roles("USER")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("G-004"));

        assertThat(exerciseMotionRepository.existsById(saved.getId())).isTrue();
    }

    @Test
    void deleteExerciseMotion_rejectsMotionUsedBySessionResult() throws Exception {
        String token = setupUserWithProfile("inuse@example.com", "inuse-user");
        PatientProfile patientProfile = patientProfileRepository.findAll().get(0);
        ExerciseMotion motion =
                exerciseMotionRepository.save(exerciseMotion(ExerciseType.TOP, "March", 1));
        ExerciseSession session =
                exerciseSessionRepository.save(
                        ExerciseSession.builder()
                                .patientProfile(patientProfile)
                                .exerciseType(ExerciseType.TOP)
                                .durationSec(78)
                                .averageAccuracy(0.87)
                                .completedMotionCount(1)
                                .build());
        exerciseSessionMotionRepository.save(
                ExerciseSessionMotion.builder()
                        .session(session)
                        .exerciseMotion(motion)
                        .durationSec(12)
                        .accuracy(0.91)
                        .completedReps(8)
                        .feedback("Good")
                        .build());

        mockMvc.perform(
                        delete("/exercise-motions/{id}", motion.getId())
                                .with(user("admin").roles("ADMIN")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EX-003"));

        assertThat(exerciseMotionRepository.existsById(motion.getId())).isTrue();

        // 인증 위해 만든 token 미사용 변수 컴파일러 경고 회피
        assertThat(token).isNotNull();
    }

    @Test
    void deleteExerciseMotion_removesAssociatedFiles() throws Exception {
        String createJson =
                "{\"exerciseType\":\"TOP\",\"name\":\"March\",\"routineOrder\":1,"
                        + "\"targetReps\":8,\"description\":\"Walk in place.\"}";
        MockMultipartFile thumb =
                new MockMultipartFile("thumbnail", "march.png", "image/png", PNG_BYTES);
        MockMultipartFile video =
                new MockMultipartFile("demoVideo", "march.mp4", "video/mp4", MP4_BYTES);
        mockMvc.perform(applyAdmin(createMultipart(createJson, thumb, video)))
                .andExpect(status().isCreated());
        ExerciseMotion saved =
                exerciseMotionRepository
                        .findAllByExerciseTypeOrderByRoutineOrderAsc(ExerciseType.TOP)
                        .get(0);
        Path thumbPath = localPath(saved.getThumbnailUrl());
        Path videoPath = localPath(saved.getDemoVideoUrl());
        assertThat(Files.exists(thumbPath)).isTrue();
        assertThat(Files.exists(videoPath)).isTrue();

        mockMvc.perform(
                        delete("/exercise-motions/{id}", saved.getId())
                                .with(user("admin").roles("ADMIN")))
                .andExpect(status().isNoContent());

        assertThat(Files.exists(thumbPath)).isFalse();
        assertThat(Files.exists(videoPath)).isFalse();
    }

    @Test
    void listExerciseMotions_requiresAuthentication() throws Exception {
        mockMvc.perform(get("/exercise-motions").param("exerciseType", "TOP"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("G-003"));
    }

    @Test
    void listExerciseMotions_rejectsMissingExerciseType() throws Exception {
        String token = setupUser("missing@example.com", "missing-user");

        mockMvc.perform(get("/exercise-motions").header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("G-001"));
    }

    /* ------------- Helpers ------------- */

    private MockMultipartHttpServletRequestBuilder createMultipart(
            String requestJson, MockMultipartFile thumbnail, MockMultipartFile demoVideo) {
        MockMultipartHttpServletRequestBuilder builder =
                multipart("/exercise-motions").file(jsonPart("request", requestJson));
        if (thumbnail != null) {
            builder.file(thumbnail);
        }
        if (demoVideo != null) {
            builder.file(demoVideo);
        }
        return builder;
    }

    private MockMultipartHttpServletRequestBuilder updateMultipart(
            Long id, String requestJson, MockMultipartFile thumbnail, MockMultipartFile demoVideo) {
        MockMultipartHttpServletRequestBuilder builder =
                multipart(HttpMethod.PATCH, "/exercise-motions/{id}", id)
                        .file(jsonPart("request", requestJson));
        if (thumbnail != null) {
            builder.file(thumbnail);
        }
        if (demoVideo != null) {
            builder.file(demoVideo);
        }
        return builder;
    }

    private MockMultipartFile jsonPart(String name, String json) {
        return new MockMultipartFile(
                name,
                /* originalFilename */ null,
                MediaType.APPLICATION_JSON_VALUE,
                json.getBytes(StandardCharsets.UTF_8));
    }

    private MockMultipartHttpServletRequestBuilder applyAdmin(
            MockMultipartHttpServletRequestBuilder builder) {
        builder.with(user("admin").roles("ADMIN"));
        return builder;
    }

    /**
     * URL 에서 local 디스크의 절대 경로를 복원한다 ({@code <upload-dir>/...} 또는 {@code <upload-dir>/videos/...}).
     */
    private Path localPath(String url) {
        String publicPrefix = contextPath + storageProperties.local().publicUrlPrefix();
        if (!url.startsWith(publicPrefix)) {
            throw new IllegalStateException("Unexpected URL prefix: " + url);
        }
        String relative = url.substring(publicPrefix.length());
        if (relative.startsWith("/")) {
            relative = relative.substring(1);
        }
        return Path.of(storageProperties.local().uploadDir()).toAbsolutePath().resolve(relative);
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

    private String setupUser(String email, String nickname) throws Exception {
        signup(email, nickname, "P@ssw0rd!");
        return login(email, "P@ssw0rd!");
    }

    private String setupUserWithProfile(String email, String nickname) throws Exception {
        String token = setupUser(email, nickname);
        mockMvc.perform(
                        post("/patient-profiles")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"name\":\"Patient\",\"nickname\":\"patient\","
                                                + "\"birthDate\":\"2020-01-01\",\"gender\":\"MALE\"}"))
                .andExpect(status().isCreated());
        return token;
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
