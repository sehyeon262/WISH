package com.comong.backend.domain.taekwondo.controller;

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

import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.taekwondo.entity.Poomsae;
import com.comong.backend.domain.taekwondo.entity.TaekwondoMotion;
import com.comong.backend.domain.taekwondo.entity.TaekwondoSession;
import com.comong.backend.domain.taekwondo.entity.TaekwondoSessionMotion;
import com.comong.backend.domain.taekwondo.repository.TaekwondoMotionRepository;
import com.comong.backend.domain.taekwondo.repository.TaekwondoSessionMotionRepository;
import com.comong.backend.domain.taekwondo.repository.TaekwondoSessionRepository;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.global.storage.StorageProperties;
import com.comong.backend.support.IntegrationTestSupport;

import tools.jackson.databind.ObjectMapper;

@AutoConfigureMockMvc
class TaekwondoMotionControllerIntegrationTest extends IntegrationTestSupport {

    /** PNG signature 8 byte + 4 byte filler = 12 byte (LocalImageStorage MAGIC_HEAD_SIZE). */
    private static final byte[] PNG_BYTES = {
        (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0
    };

    /** MP4 ftyp box at offset 4: "ftyp" + 4 byte filler + 4 byte filler = 12 byte total. */
    private static final byte[] MP4_BYTES = {0, 0, 0, 0x20, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm'};

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private TaekwondoMotionRepository taekwondoMotionRepository;
    @Autowired private TaekwondoSessionRepository taekwondoSessionRepository;
    @Autowired private TaekwondoSessionMotionRepository taekwondoSessionMotionRepository;
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
        taekwondoSessionMotionRepository.deleteAll();
        taekwondoSessionRepository.deleteAll();
        taekwondoMotionRepository.deleteAll();
        patientProfileRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void listTaekwondoMotions_returnsPoomsaeMotionsOrderedByRoutineOrder() throws Exception {
        String token = setupUser("list@example.com", "list-user");
        taekwondoMotionRepository.save(motion(Poomsae.TAEGEUK_1, "앞서고 아래막기", 2));
        taekwondoMotionRepository.save(motion(Poomsae.TAEGEUK_1, "기본준비", 1));
        taekwondoMotionRepository.save(motion(Poomsae.TAEGEUK_2, "태극2장 동작", 1));

        mockMvc.perform(
                        get("/taekwondo-motions")
                                .param("poomsae", "TAEGEUK_1")
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].name").value("기본준비"))
                .andExpect(jsonPath("$.data[0].routineOrder").value(1))
                .andExpect(jsonPath("$.data[1].name").value("앞서고 아래막기"))
                .andExpect(jsonPath("$.data[1].routineOrder").value(2));
    }

    @Test
    void getTaekwondoMotionDetail_returnsMotion() throws Exception {
        String token = setupUser("detail@example.com", "detail-user");
        TaekwondoMotion saved =
                taekwondoMotionRepository.save(motion(Poomsae.TAEGEUK_1, "기본준비", 1));

        mockMvc.perform(
                        get("/taekwondo-motions/{id}", saved.getId())
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.id").value(saved.getId()))
                .andExpect(jsonPath("$.data.name").value("기본준비"));
    }

    @Test
    void createTaekwondoMotion_byAdminPersistsAndReturnsLocation() throws Exception {
        String requestJson =
                "{\"poomsae\":\"TAEGEUK_1\",\"name\":\"기본준비\",\"routineOrder\":1,"
                        + "\"targetReps\":1,\"description\":\"기본 준비 자세를 잡는다.\"}";

        mockMvc.perform(applyAdmin(createMultipart(requestJson, null, null)))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", startsWith("/taekwondo-motions/")))
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.id").isNumber())
                .andExpect(jsonPath("$.data.poomsae").value("TAEGEUK_1"))
                .andExpect(jsonPath("$.data.name").value("기본준비"))
                .andExpect(jsonPath("$.data.routineOrder").value(1))
                .andExpect(jsonPath("$.data.targetReps").value(1))
                .andExpect(jsonPath("$.data.thumbnailUrl").doesNotExist())
                .andExpect(jsonPath("$.data.demoVideoUrl").doesNotExist());

        assertThat(taekwondoMotionRepository.count()).isEqualTo(1);
    }

    @Test
    void createTaekwondoMotion_acceptsThumbnailAndVideoAndStoresFiles() throws Exception {
        String requestJson =
                "{\"poomsae\":\"TAEGEUK_1\",\"name\":\"기본준비\",\"routineOrder\":2,"
                        + "\"targetReps\":1,\"description\":\"기본 준비 자세.\"}";
        MockMultipartFile thumbnail =
                new MockMultipartFile("thumbnail", "ready.png", "image/png", PNG_BYTES);
        MockMultipartFile demoVideo =
                new MockMultipartFile("demoVideo", "ready.mp4", "video/mp4", MP4_BYTES);

        mockMvc.perform(applyAdmin(createMultipart(requestJson, thumbnail, demoVideo)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.thumbnailUrl").isString())
                .andExpect(jsonPath("$.data.demoVideoUrl").isString());

        TaekwondoMotion saved =
                taekwondoMotionRepository
                        .findAllByPoomsaeOrderByRoutineOrderAsc(Poomsae.TAEGEUK_1)
                        .get(0);
        assertThat(saved.getThumbnailUrl()).isNotNull();
        assertThat(saved.getDemoVideoUrl()).isNotNull();
        assertThat(Files.exists(localPath(saved.getThumbnailUrl()))).isTrue();
        assertThat(Files.exists(localPath(saved.getDemoVideoUrl()))).isTrue();
    }

    @Test
    void createTaekwondoMotion_byUserIsForbidden() throws Exception {
        String requestJson =
                "{\"poomsae\":\"TAEGEUK_1\",\"name\":\"기본준비\",\"routineOrder\":1,"
                        + "\"targetReps\":1,\"description\":\"기본 준비.\"}";

        mockMvc.perform(createMultipart(requestJson, null, null).with(user("user").roles("USER")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("G-004"));

        assertThat(taekwondoMotionRepository.count()).isZero();
    }

    @Test
    void createTaekwondoMotion_rejectsDuplicatedRoutineOrderInSamePoomsae() throws Exception {
        taekwondoMotionRepository.save(motion(Poomsae.TAEGEUK_1, "기본준비", 1));

        String requestJson =
                "{\"poomsae\":\"TAEGEUK_1\",\"name\":\"앞서고 아래막기\",\"routineOrder\":1,"
                        + "\"targetReps\":1,\"description\":\"아래막기.\"}";

        mockMvc.perform(applyAdmin(createMultipart(requestJson, null, null)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TK-002"));
    }

    @Test
    void createTaekwondoMotion_rejectsDuplicatedNameInSamePoomsae() throws Exception {
        taekwondoMotionRepository.save(motion(Poomsae.TAEGEUK_1, "기본준비", 1));

        String requestJson =
                "{\"poomsae\":\"TAEGEUK_1\",\"name\":\"기본준비\",\"routineOrder\":2,"
                        + "\"targetReps\":1,\"description\":\"중복 이름.\"}";

        mockMvc.perform(applyAdmin(createMultipart(requestJson, null, null)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TK-007"));
    }

    @Test
    void updateTaekwondoMotion_byAdminUpdatesAllowedFields() throws Exception {
        TaekwondoMotion saved =
                taekwondoMotionRepository.save(motion(Poomsae.TAEGEUK_1, "기본준비", 1));

        String requestJson = "{\"name\":\"기본준비 수정\",\"targetReps\":2,\"description\":\"갱신된 설명.\"}";

        mockMvc.perform(applyAdmin(updateMultipart(saved.getId(), requestJson, null, null)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.id").value(saved.getId()))
                .andExpect(jsonPath("$.data.poomsae").value("TAEGEUK_1"))
                .andExpect(jsonPath("$.data.routineOrder").value(1))
                .andExpect(jsonPath("$.data.name").value("기본준비 수정"))
                .andExpect(jsonPath("$.data.targetReps").value(2))
                .andExpect(jsonPath("$.data.description").value("갱신된 설명."));

        TaekwondoMotion updated = taekwondoMotionRepository.findById(saved.getId()).orElseThrow();
        assertThat(updated.getName()).isEqualTo("기본준비 수정");
        assertThat(updated.getTargetReps()).isEqualTo(2);
    }

    @Test
    void updateTaekwondoMotion_acceptsDescriptionWithTrailingNewline() throws Exception {
        TaekwondoMotion saved =
                taekwondoMotionRepository.save(motion(Poomsae.TAEGEUK_1, "Ready", 1));
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

        TaekwondoMotion updated = taekwondoMotionRepository.findById(saved.getId()).orElseThrow();
        assertThat(updated.getDescription()).isEqualTo(expectedDescription);
    }

    @Test
    void updateTaekwondoMotion_byAdminUpdatesRoutineOrder() throws Exception {
        TaekwondoMotion ready =
                taekwondoMotionRepository.save(motion(Poomsae.TAEGEUK_1, "기본준비", 1));
        taekwondoMotionRepository.save(motion(Poomsae.TAEGEUK_1, "앞서고 아래막기", 2));

        mockMvc.perform(
                        applyAdmin(
                                updateMultipart(ready.getId(), "{\"routineOrder\":3}", null, null)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.routineOrder").value(3));

        TaekwondoMotion updated = taekwondoMotionRepository.findById(ready.getId()).orElseThrow();
        assertThat(updated.getRoutineOrder()).isEqualTo(3);
    }

    @Test
    void updateTaekwondoMotion_rejectsDuplicatedRoutineOrderInSamePoomsae() throws Exception {
        TaekwondoMotion ready =
                taekwondoMotionRepository.save(motion(Poomsae.TAEGEUK_1, "기본준비", 1));
        taekwondoMotionRepository.save(motion(Poomsae.TAEGEUK_1, "앞서고 아래막기", 2));

        mockMvc.perform(
                        applyAdmin(
                                updateMultipart(ready.getId(), "{\"routineOrder\":2}", null, null)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TK-002"));

        TaekwondoMotion unchanged = taekwondoMotionRepository.findById(ready.getId()).orElseThrow();
        assertThat(unchanged.getRoutineOrder()).isEqualTo(1);
    }

    @Test
    void updateTaekwondoMotion_rejectsDuplicatedNameInSamePoomsae() throws Exception {
        TaekwondoMotion ready =
                taekwondoMotionRepository.save(motion(Poomsae.TAEGEUK_1, "기본준비", 1));
        taekwondoMotionRepository.save(motion(Poomsae.TAEGEUK_1, "앞서고 아래막기", 2));

        mockMvc.perform(
                        applyAdmin(
                                updateMultipart(
                                        ready.getId(), "{\"name\":\"앞서고 아래막기\"}", null, null)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TK-007"));
    }

    @Test
    void reorderTaekwondoMotions_byAdminReassignsRoutineOrder() throws Exception {
        TaekwondoMotion ready =
                taekwondoMotionRepository.save(motion(Poomsae.TAEGEUK_1, "기본준비", 1));
        TaekwondoMotion lowBlock =
                taekwondoMotionRepository.save(motion(Poomsae.TAEGEUK_1, "앞서고 아래막기", 2));
        TaekwondoMotion punch =
                taekwondoMotionRepository.save(motion(Poomsae.TAEGEUK_1, "앞서고 지르기", 3));
        taekwondoMotionRepository.save(motion(Poomsae.TAEGEUK_2, "태극2장 동작", 1));

        String requestJson =
                """
                {"poomsae":"TAEGEUK_1","motionIds":[%d,%d,%d]}
                """
                        .formatted(lowBlock.getId(), punch.getId(), ready.getId());

        mockMvc.perform(
                        patch("/taekwondo-motions/reorder")
                                .with(user("admin").roles("ADMIN"))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(requestJson))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data[0].id").value(lowBlock.getId()))
                .andExpect(jsonPath("$.data[0].routineOrder").value(1))
                .andExpect(jsonPath("$.data[1].id").value(punch.getId()))
                .andExpect(jsonPath("$.data[1].routineOrder").value(2))
                .andExpect(jsonPath("$.data[2].id").value(ready.getId()))
                .andExpect(jsonPath("$.data[2].routineOrder").value(3));

        assertThat(
                        taekwondoMotionRepository
                                .findAllByPoomsaeOrderByRoutineOrderAsc(Poomsae.TAEGEUK_1)
                                .stream()
                                .map(TaekwondoMotion::getName)
                                .toList())
                .containsExactly("앞서고 아래막기", "앞서고 지르기", "기본준비");
    }

    @Test
    void reorderTaekwondoMotions_rejectsMismatchedMotionIds() throws Exception {
        TaekwondoMotion ready =
                taekwondoMotionRepository.save(motion(Poomsae.TAEGEUK_1, "기본준비", 1));
        taekwondoMotionRepository.save(motion(Poomsae.TAEGEUK_1, "앞서고 아래막기", 2));

        String requestJson =
                """
                {"poomsae":"TAEGEUK_1","motionIds":[%d]}
                """
                        .formatted(ready.getId());

        mockMvc.perform(
                        patch("/taekwondo-motions/reorder")
                                .with(user("admin").roles("ADMIN"))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(requestJson))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("TK-008"));
    }

    @Test
    void updateTaekwondoMotion_replacesThumbnailAndDeletesOldFile() throws Exception {
        String createJson =
                "{\"poomsae\":\"TAEGEUK_1\",\"name\":\"기본준비\",\"routineOrder\":1,"
                        + "\"targetReps\":1,\"description\":\"기본 준비.\"}";
        MockMultipartFile firstThumb =
                new MockMultipartFile("thumbnail", "first.png", "image/png", PNG_BYTES);
        mockMvc.perform(applyAdmin(createMultipart(createJson, firstThumb, null)))
                .andExpect(status().isCreated());
        TaekwondoMotion saved =
                taekwondoMotionRepository
                        .findAllByPoomsaeOrderByRoutineOrderAsc(Poomsae.TAEGEUK_1)
                        .get(0);
        Path firstFile = localPath(saved.getThumbnailUrl());
        assertThat(Files.exists(firstFile)).isTrue();

        MockMultipartFile secondThumb =
                new MockMultipartFile("thumbnail", "second.png", "image/png", PNG_BYTES);
        mockMvc.perform(applyAdmin(updateMultipart(saved.getId(), "{}", secondThumb, null)))
                .andExpect(status().isOk());

        TaekwondoMotion updated = taekwondoMotionRepository.findById(saved.getId()).orElseThrow();
        assertThat(updated.getThumbnailUrl()).isNotEqualTo(saved.getThumbnailUrl());
        assertThat(Files.exists(localPath(updated.getThumbnailUrl()))).isTrue();
        assertThat(Files.exists(firstFile)).isFalse();
    }

    @Test
    void updateTaekwondoMotion_clearThumbnailRemovesUrlAndFile() throws Exception {
        String createJson =
                "{\"poomsae\":\"TAEGEUK_1\",\"name\":\"기본준비\",\"routineOrder\":1,"
                        + "\"targetReps\":1,\"description\":\"기본 준비.\"}";
        MockMultipartFile thumb =
                new MockMultipartFile("thumbnail", "ready.png", "image/png", PNG_BYTES);
        mockMvc.perform(applyAdmin(createMultipart(createJson, thumb, null)))
                .andExpect(status().isCreated());
        TaekwondoMotion saved =
                taekwondoMotionRepository
                        .findAllByPoomsaeOrderByRoutineOrderAsc(Poomsae.TAEGEUK_1)
                        .get(0);
        Path file = localPath(saved.getThumbnailUrl());
        assertThat(Files.exists(file)).isTrue();

        mockMvc.perform(
                        applyAdmin(
                                updateMultipart(
                                        saved.getId(), "{\"clearThumbnail\":true}", null, null)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.thumbnailUrl").doesNotExist());

        TaekwondoMotion updated = taekwondoMotionRepository.findById(saved.getId()).orElseThrow();
        assertThat(updated.getThumbnailUrl()).isNull();
        assertThat(Files.exists(file)).isFalse();
    }

    @Test
    void updateTaekwondoMotion_byUserIsForbidden() throws Exception {
        TaekwondoMotion saved =
                taekwondoMotionRepository.save(motion(Poomsae.TAEGEUK_1, "기본준비", 1));

        mockMvc.perform(
                        updateMultipart(saved.getId(), "{\"name\":\"수정\"}", null, null)
                                .with(user("user").roles("USER")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("G-004"));

        assertThat(taekwondoMotionRepository.findById(saved.getId()).orElseThrow().getName())
                .isEqualTo("기본준비");
    }

    @Test
    void updateTaekwondoMotion_rejectsUnknownMotion() throws Exception {
        mockMvc.perform(applyAdmin(updateMultipart(999_999L, "{\"name\":\"수정\"}", null, null)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("TK-001"));
    }

    @Test
    void updateTaekwondoMotion_rejectsInvalidInput() throws Exception {
        TaekwondoMotion saved =
                taekwondoMotionRepository.save(motion(Poomsae.TAEGEUK_1, "기본준비", 1));

        mockMvc.perform(
                        applyAdmin(
                                updateMultipart(
                                        saved.getId(),
                                        "{\"name\":\"   \",\"targetReps\":0}",
                                        null,
                                        null)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("G-001"));

        TaekwondoMotion unchanged = taekwondoMotionRepository.findById(saved.getId()).orElseThrow();
        assertThat(unchanged.getName()).isEqualTo("기본준비");
        assertThat(unchanged.getTargetReps()).isEqualTo(1);
    }

    @Test
    void updateTaekwondoMotion_rejectsBlankLineOnlyDescription() throws Exception {
        TaekwondoMotion saved =
                taekwondoMotionRepository.save(motion(Poomsae.TAEGEUK_1, "Ready", 1));
        String originalDescription = saved.getDescription();

        mockMvc.perform(
                        applyAdmin(
                                updateMultipart(
                                        saved.getId(), "{\"description\":\"\\n\\n\"}", null, null)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("G-001"));

        TaekwondoMotion unchanged = taekwondoMotionRepository.findById(saved.getId()).orElseThrow();
        assertThat(unchanged.getDescription()).isEqualTo(originalDescription);
    }

    @Test
    void deleteTaekwondoMotion_byAdminRemovesMotion() throws Exception {
        TaekwondoMotion saved =
                taekwondoMotionRepository.save(motion(Poomsae.TAEGEUK_1, "기본준비", 1));

        mockMvc.perform(
                        delete("/taekwondo-motions/{id}", saved.getId())
                                .with(user("admin").roles("ADMIN")))
                .andExpect(status().isNoContent());

        assertThat(taekwondoMotionRepository.existsById(saved.getId())).isFalse();
    }

    @Test
    void deleteTaekwondoMotion_byUserIsForbidden() throws Exception {
        TaekwondoMotion saved =
                taekwondoMotionRepository.save(motion(Poomsae.TAEGEUK_1, "기본준비", 1));

        mockMvc.perform(
                        delete("/taekwondo-motions/{id}", saved.getId())
                                .with(user("user").roles("USER")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("G-004"));

        assertThat(taekwondoMotionRepository.existsById(saved.getId())).isTrue();
    }

    @Test
    void deleteTaekwondoMotion_rejectsMotionUsedBySessionResult() throws Exception {
        String token = setupUserWithProfile("inuse@example.com", "inuse-user");
        PatientProfile patientProfile = patientProfileRepository.findAll().get(0);
        TaekwondoMotion saved =
                taekwondoMotionRepository.save(motion(Poomsae.TAEGEUK_1, "기본준비", 1));
        TaekwondoSession session =
                taekwondoSessionRepository.save(
                        TaekwondoSession.builder()
                                .patientProfile(patientProfile)
                                .poomsae(Poomsae.TAEGEUK_1)
                                .durationSec(120)
                                .averageAccuracy(0.85)
                                .completedMotionCount(1)
                                .monstersDefeated(0)
                                .build());
        taekwondoSessionMotionRepository.save(
                TaekwondoSessionMotion.builder()
                        .session(session)
                        .motion(saved)
                        .durationSec(8)
                        .accuracy(0.9)
                        .completedReps(1)
                        .feedback("Good")
                        .build());

        mockMvc.perform(
                        delete("/taekwondo-motions/{id}", saved.getId())
                                .with(user("admin").roles("ADMIN")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TK-003"));

        assertThat(taekwondoMotionRepository.existsById(saved.getId())).isTrue();
        assertThat(token).isNotNull();
    }

    @Test
    void deleteTaekwondoMotion_removesAssociatedFiles() throws Exception {
        String createJson =
                "{\"poomsae\":\"TAEGEUK_1\",\"name\":\"기본준비\",\"routineOrder\":1,"
                        + "\"targetReps\":1,\"description\":\"기본 준비.\"}";
        MockMultipartFile thumb =
                new MockMultipartFile("thumbnail", "ready.png", "image/png", PNG_BYTES);
        MockMultipartFile video =
                new MockMultipartFile("demoVideo", "ready.mp4", "video/mp4", MP4_BYTES);
        mockMvc.perform(applyAdmin(createMultipart(createJson, thumb, video)))
                .andExpect(status().isCreated());
        TaekwondoMotion saved =
                taekwondoMotionRepository
                        .findAllByPoomsaeOrderByRoutineOrderAsc(Poomsae.TAEGEUK_1)
                        .get(0);
        Path thumbPath = localPath(saved.getThumbnailUrl());
        Path videoPath = localPath(saved.getDemoVideoUrl());
        assertThat(Files.exists(thumbPath)).isTrue();
        assertThat(Files.exists(videoPath)).isTrue();

        mockMvc.perform(
                        delete("/taekwondo-motions/{id}", saved.getId())
                                .with(user("admin").roles("ADMIN")))
                .andExpect(status().isNoContent());

        assertThat(Files.exists(thumbPath)).isFalse();
        assertThat(Files.exists(videoPath)).isFalse();
    }

    @Test
    void listTaekwondoMotions_requiresAuthentication() throws Exception {
        mockMvc.perform(get("/taekwondo-motions").param("poomsae", "TAEGEUK_1"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("G-003"));
    }

    @Test
    void listTaekwondoMotions_rejectsMissingPoomsae() throws Exception {
        String token = setupUser("missing@example.com", "missing-user");

        mockMvc.perform(get("/taekwondo-motions").header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("G-001"));
    }

    /* ------------- Helpers ------------- */

    private MockMultipartHttpServletRequestBuilder createMultipart(
            String requestJson, MockMultipartFile thumbnail, MockMultipartFile demoVideo) {
        MockMultipartHttpServletRequestBuilder builder =
                multipart("/taekwondo-motions").file(jsonPart("request", requestJson));
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
                multipart(HttpMethod.PATCH, "/taekwondo-motions/{id}", id)
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

    private TaekwondoMotion motion(Poomsae poomsae, String name, int routineOrder) {
        return TaekwondoMotion.builder()
                .poomsae(poomsae)
                .name(name)
                .routineOrder(routineOrder)
                .targetReps(1)
                .description(name + " 동작 설명.")
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
