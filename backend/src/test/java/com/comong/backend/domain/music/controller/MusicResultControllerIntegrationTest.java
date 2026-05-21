package com.comong.backend.domain.music.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.hamcrest.Matchers.closeTo;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Timestamp;
import java.time.LocalDateTime;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import com.comong.backend.domain.music.repository.MusicResultRepository;
import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.support.IntegrationTestSupport;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@AutoConfigureMockMvc
class MusicResultControllerIntegrationTest extends IntegrationTestSupport {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private MusicResultRepository musicResultRepository;
    @Autowired private PatientProfileRepository patientProfileRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private JdbcTemplate jdbc;

    @BeforeEach
    void cleanDb() {
        cleanAll();
    }

    @AfterEach
    void cleanDbAfter() {
        cleanAll();
    }

    private void cleanAll() {
        musicResultRepository.deleteAll();
        patientProfileRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void createMusicResult_persistsAndReturnsCalculatedFields() throws Exception {
        String token = setupUserWithProfile("music-create@example.com", "music-create-user");

        String body =
                mockMvc.perform(
                                post("/music/results")
                                        .header("Authorization", "Bearer " + token)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(
                                                saveRequest(
                                                        "baby-shark",
                                                        24830,
                                                        87,
                                                        142,
                                                        10,
                                                        13,
                                                        10,
                                                        175,
                                                        96196)))
                        .andExpect(status().isCreated())
                        .andExpect(jsonPath("$.code").value("SUCCESS"))
                        .andExpect(jsonPath("$.data.id").isNumber())
                        .andExpect(jsonPath("$.data.chartId").value("baby-shark"))
                        .andExpect(jsonPath("$.data.score").value(24830))
                        .andExpect(jsonPath("$.data.maxCombo").value(87))
                        .andExpect(jsonPath("$.data.perfectCount").value(142))
                        .andExpect(jsonPath("$.data.greatCount").value(10))
                        .andExpect(jsonPath("$.data.goodCount").value(13))
                        .andExpect(jsonPath("$.data.missCount").value(10))
                        .andExpect(jsonPath("$.data.totalNotes").value(175))
                        .andExpect(
                                jsonPath("$.data.accuracy")
                                        .value(
                                                closeTo(
                                                        expectedAccuracy(142, 10, 13, 175),
                                                        0.000001)))
                        .andExpect(jsonPath("$.data.rank").value("A"))
                        .andExpect(jsonPath("$.data.playedDurationMs").value(96196))
                        .andExpect(jsonPath("$.data.isNewBest").value(true))
                        .andReturn()
                        .getResponse()
                        .getContentAsString();

        JsonNode response = objectMapper.readTree(body);
        assertThat(response.get("data").get("previousBestScore").isNull()).isTrue();
        assertThat(musicResultRepository.count()).isEqualTo(1);
    }

    @Test
    void createMusicResult_persistsMediaKeys() throws Exception {
        String token = setupUserWithProfile("music-media@example.com", "music-media-user");
        String videoKey = "local/music/results/1/test-upload/video.webm";
        String thumbKey = "local/music/results/1/test-upload/thumb.jpg";

        mockMvc.perform(
                        post("/music/results")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        saveRequest(
                                                "baby-shark",
                                                24830,
                                                87,
                                                142,
                                                23,
                                                10,
                                                175,
                                                96196,
                                                videoKey,
                                                thumbKey)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.videoKey").value(videoKey))
                .andExpect(jsonPath("$.data.thumbKey").value(thumbKey));
    }

    @Test
    void findById_returnsNullMediaUrlsWhenMediaKeysAreMissing() throws Exception {
        String token = setupUserWithProfile("music-detail-empty@example.com", "music-detail-empty");
        long resultId = saveMusicResultReturningId(token, validSaveRequest(24830));

        String detailBody =
                mockMvc.perform(
                                get("/music/results/{id}", resultId)
                                        .header("Authorization", "Bearer " + token))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.code").value("SUCCESS"))
                        .andExpect(jsonPath("$.data.id").value(resultId))
                        .andExpect(jsonPath("$.data.chartId").value("baby-shark"))
                        .andExpect(jsonPath("$.data.score").value(24830))
                        .andExpect(jsonPath("$.data.greatCount").value(10))
                        .andReturn()
                        .getResponse()
                        .getContentAsString();

        JsonNode detail = objectMapper.readTree(detailBody).get("data");
        assertThat(detail.path("videoUrl").isMissingNode() || detail.path("videoUrl").isNull())
                .isTrue();
        assertThat(detail.path("thumbUrl").isMissingNode() || detail.path("thumbUrl").isNull())
                .isTrue();
    }

    @Test
    void findById_failsWhenMediaKeysExistButS3IsDisabled() throws Exception {
        String token = setupUserWithProfile("music-detail-s3@example.com", "music-detail-s3");
        String videoKey = "local/music/results/1/test-upload/video.webm";
        String thumbKey = "local/music/results/1/test-upload/thumb.jpg";

        String createBody =
                mockMvc.perform(
                                post("/music/results")
                                        .header("Authorization", "Bearer " + token)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(
                                                saveRequest(
                                                        "baby-shark",
                                                        24830,
                                                        87,
                                                        142,
                                                        23,
                                                        10,
                                                        175,
                                                        96196,
                                                        videoKey,
                                                        thumbKey)))
                        .andExpect(status().isCreated())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();

        long resultId = objectMapper.readTree(createBody).get("data").get("id").asLong();

        mockMvc.perform(
                        get("/music/results/{id}", resultId)
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("S-002"));
    }

    @Test
    void createMusicResult_higherScoreReturnsNewBest() throws Exception {
        String token = setupUserWithProfile("music-high@example.com", "music-high-user");
        saveMusicResult(token, 21000);

        mockMvc.perform(
                        post("/music/results")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(validSaveRequest(24830)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.score").value(24830))
                .andExpect(jsonPath("$.data.isNewBest").value(true))
                .andExpect(jsonPath("$.data.previousBestScore").value(21000));

        assertThat(musicResultRepository.count()).isEqualTo(2);
    }

    @Test
    void createMusicResult_sameScoreDoesNotReturnNewBest() throws Exception {
        String token = setupUserWithProfile("music-same@example.com", "music-same-user");
        saveMusicResult(token, 24830);

        mockMvc.perform(
                        post("/music/results")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(validSaveRequest(24830)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.score").value(24830))
                .andExpect(jsonPath("$.data.isNewBest").value(false))
                .andExpect(jsonPath("$.data.previousBestScore").value(24830));

        assertThat(musicResultRepository.count()).isEqualTo(2);
    }

    @Test
    void createMusicResult_rejectsUnknownChart() throws Exception {
        String token = setupUserWithProfile("music-chart@example.com", "music-chart-user");

        mockMvc.perform(
                        post("/music/results")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        saveRequest(
                                                "unknown-chart",
                                                24830,
                                                87,
                                                142,
                                                23,
                                                10,
                                                175,
                                                96196)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("MU-001"));

        assertThat(musicResultRepository.count()).isZero();
    }

    @Test
    void createMusicResult_rejectsJudgementCountMismatch() throws Exception {
        String token = setupUserWithProfile("music-count@example.com", "music-count-user");

        mockMvc.perform(
                        post("/music/results")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        saveRequest(
                                                "baby-shark", 24830, 87, 100, 10, 10, 175, 96196)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MU-002"));

        assertThat(musicResultRepository.count()).isZero();
    }

    @Test
    void createMusicResult_rejectsChartTotalNotesMismatch() throws Exception {
        String token = setupUserWithProfile("music-notes@example.com", "music-notes-user");

        mockMvc.perform(
                        post("/music/results")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        saveRequest(
                                                "baby-shark", 24830, 87, 141, 23, 10, 174, 96196)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MU-003"));

        assertThat(musicResultRepository.count()).isZero();
    }

    @Test
    void createMusicResult_requiresAuthentication() throws Exception {
        mockMvc.perform(
                        post("/music/results")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(validSaveRequest(24830)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("G-003"));
    }

    @Test
    void findMine_returnsPagedResultsOrderedByPlayedAtDesc() throws Exception {
        String token = setupUserWithProfile("music-list@example.com", "music-list-user");
        long olderId =
                saveMusicResultReturningId(
                        token, saveRequest("baby-shark", 10000, 50, 100, 50, 25, 175, 96196));
        long newerId = saveMusicResultReturningId(token, validSaveRequest(24830));
        updatePlayedAt(olderId, LocalDateTime.of(2026, 1, 1, 10, 0));
        updatePlayedAt(newerId, LocalDateTime.of(2026, 1, 2, 10, 0));

        String body =
                mockMvc.perform(
                                get("/music/results/me?page=0&size=1")
                                        .header("Authorization", "Bearer " + token))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.code").value("SUCCESS"))
                        .andExpect(jsonPath("$.data.content.length()").value(1))
                        .andExpect(jsonPath("$.data.totalElements").value(2))
                        .andReturn()
                        .getResponse()
                        .getContentAsString();

        JsonNode first = objectMapper.readTree(body).get("data").get("content").get(0);
        assertThat(first.get("id").asLong()).isEqualTo(newerId);
        assertThat(first.get("chartId").asString()).isEqualTo("baby-shark");
        assertThat(first.get("chartTitle").isTextual()).isTrue();
        assertThat(first.get("chartCoverUrl").asString())
                .isEqualTo("images/themes/music/ui/babyshark_thum.png");
        assertThat(first.get("score").asInt()).isEqualTo(24830);
        assertThat(first.get("maxCombo").asInt()).isEqualTo(87);
        assertThat(first.get("perfectCount").asInt()).isEqualTo(142);
        assertThat(first.get("greatCount").asInt()).isEqualTo(10);
        assertThat(first.get("goodCount").asInt()).isEqualTo(13);
        assertThat(first.get("missCount").asInt()).isEqualTo(10);
        assertThat(first.get("totalNotes").asInt()).isEqualTo(175);
        assertThat(first.get("accuracy").asDouble())
                .isCloseTo(expectedAccuracy(142, 10, 13, 175), within(0.000001));
        assertThat(first.get("rank").asString()).isEqualTo("A");
        assertThat(first.get("playedDurationMs").asInt()).isEqualTo(96196);
        assertThat(first.get("playedAt").isTextual()).isTrue();
        assertThat(first.has("videoKey")).isTrue();
        assertThat(first.get("videoKey").isNull()).isTrue();
        assertThat(first.has("thumbKey")).isTrue();
        assertThat(first.get("thumbKey").isNull()).isTrue();
    }

    @Test
    void findMine_excludesOtherUsersResults() throws Exception {
        String ownerToken =
                setupUserWithProfile("music-list-owner@example.com", "music-list-owner");
        String otherToken =
                setupUserWithProfile("music-list-other@example.com", "music-list-other");
        saveMusicResult(ownerToken, validSaveRequest(12000));
        saveMusicResult(otherToken, validSaveRequest(50000));

        mockMvc.perform(get("/music/results/me").header("Authorization", "Bearer " + ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].score").value(12000));
    }

    @Test
    void findMine_requiresAuthentication() throws Exception {
        mockMvc.perform(get("/music/results/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("G-003"));
    }

    @Test
    void findMyBest_returnsBestResultsGroupedByChart() throws Exception {
        String token = setupUserWithProfile("music-best@example.com", "music-best-user");
        saveMusicResult(token, saveRequest("baby-shark", 10000, 50, 100, 50, 25, 175, 96196));
        saveMusicResult(token, validSaveRequest(24830));
        saveMusicResult(token, saveRequest("twinkle-star", 9000, 42, 40, 2, 0, 42, 27000));

        mockMvc.perform(get("/music/results/me/best").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].chartId").value("baby-shark"))
                .andExpect(jsonPath("$.data[0].bestScore").value(24830))
                .andExpect(jsonPath("$.data[0].bestRank").value("A"))
                .andExpect(
                        jsonPath("$.data[0].bestAccuracy")
                                .value(closeTo(expectedAccuracy(142, 10, 13, 175), 0.000001)))
                .andExpect(jsonPath("$.data[0].playCount").value(2))
                .andExpect(jsonPath("$.data[0].lastPlayedAt").exists())
                .andExpect(jsonPath("$.data[1].chartId").value("twinkle-star"))
                .andExpect(jsonPath("$.data[1].bestScore").value(9000))
                .andExpect(jsonPath("$.data[1].bestRank").value("S"))
                .andExpect(
                        jsonPath("$.data[1].bestAccuracy")
                                .value(closeTo(expectedAccuracy(40, 2, 42), 0.000001)))
                .andExpect(jsonPath("$.data[1].playCount").value(1))
                .andExpect(jsonPath("$.data[1].lastPlayedAt").exists());
    }

    @Test
    void findMyBest_selectsHigherAccuracyWhenScoresTie() throws Exception {
        String token =
                setupUserWithProfile("music-best-accuracy@example.com", "music-best-accuracy-user");
        saveMusicResult(token, saveRequest("baby-shark", 10000, 50, 100, 50, 25, 175, 96196));
        saveMusicResult(token, saveRequest("baby-shark", 10000, 87, 142, 23, 10, 175, 96196));

        mockMvc.perform(get("/music/results/me/best").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].chartId").value("baby-shark"))
                .andExpect(jsonPath("$.data[0].bestScore").value(10000))
                .andExpect(jsonPath("$.data[0].bestRank").value("A"))
                .andExpect(
                        jsonPath("$.data[0].bestAccuracy")
                                .value(closeTo(expectedAccuracy(142, 23, 175), 0.000001)))
                .andExpect(jsonPath("$.data[0].playCount").value(2));
    }

    @Test
    void findMyBest_excludesOtherUsersResults() throws Exception {
        String ownerToken = setupUserWithProfile("music-owner@example.com", "music-owner-user");
        String otherToken = setupUserWithProfile("music-other@example.com", "music-other-user");
        saveMusicResult(ownerToken, validSaveRequest(12000));
        saveMusicResult(otherToken, validSaveRequest(50000));

        mockMvc.perform(
                        get("/music/results/me/best")
                                .header("Authorization", "Bearer " + ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].chartId").value("baby-shark"))
                .andExpect(jsonPath("$.data[0].bestScore").value(12000))
                .andExpect(jsonPath("$.data[0].playCount").value(1));
    }

    @Test
    void findById_hidesOtherUsersResult() throws Exception {
        String ownerToken =
                setupUserWithProfile("music-detail-owner@example.com", "music-detail-owner-user");
        String otherToken =
                setupUserWithProfile("music-detail-other@example.com", "music-detail-other-user");
        long resultId = saveMusicResultReturningId(ownerToken, validSaveRequest(12000));

        mockMvc.perform(
                        get("/music/results/{id}", resultId)
                                .header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("MU-004"));
    }

    @Test
    void findMyBest_requiresAuthentication() throws Exception {
        mockMvc.perform(get("/music/results/me/best"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("G-003"));
    }

    private void saveMusicResult(String token, int score) throws Exception {
        saveMusicResult(token, validSaveRequest(score));
    }

    private void saveMusicResult(String token, String requestBody) throws Exception {
        saveMusicResultReturningId(token, requestBody);
    }

    private void updatePlayedAt(long resultId, LocalDateTime playedAt) {
        jdbc.update(
                "UPDATE music_result SET played_at = ? WHERE id = ?",
                Timestamp.valueOf(playedAt),
                resultId);
    }

    private long saveMusicResultReturningId(String token, String requestBody) throws Exception {
        String body =
                mockMvc.perform(
                                post("/music/results")
                                        .header("Authorization", "Bearer " + token)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(requestBody))
                        .andExpect(status().isCreated())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        return objectMapper.readTree(body).get("data").get("id").asLong();
    }

    private String validSaveRequest(int score) {
        return saveRequest("baby-shark", score, 87, 142, 10, 13, 10, 175, 96196);
    }

    private String saveRequest(
            String chartId,
            int score,
            int maxCombo,
            int perfectCount,
            int goodCount,
            int missCount,
            int totalNotes,
            int playedDurationMs) {
        return saveRequest(
                chartId,
                score,
                maxCombo,
                perfectCount,
                0,
                goodCount,
                missCount,
                totalNotes,
                playedDurationMs);
    }

    private String saveRequest(
            String chartId,
            int score,
            int maxCombo,
            int perfectCount,
            int greatCount,
            int goodCount,
            int missCount,
            int totalNotes,
            int playedDurationMs) {
        return """
                {
                  "chartId": "%s",
                  "score": %d,
                  "maxCombo": %d,
                  "perfectCount": %d,
                  "greatCount": %d,
                  "goodCount": %d,
                  "missCount": %d,
                  "totalNotes": %d,
                  "playedDurationMs": %d
                }
                """
                .formatted(
                        chartId,
                        score,
                        maxCombo,
                        perfectCount,
                        greatCount,
                        goodCount,
                        missCount,
                        totalNotes,
                        playedDurationMs);
    }

    private String saveRequest(
            String chartId,
            int score,
            int maxCombo,
            int perfectCount,
            int goodCount,
            int missCount,
            int totalNotes,
            int playedDurationMs,
            String videoKey,
            String thumbKey) {
        return """
                {
                  "chartId": "%s",
                  "score": %d,
                  "maxCombo": %d,
                  "perfectCount": %d,
                  "goodCount": %d,
                  "missCount": %d,
                  "totalNotes": %d,
                  "playedDurationMs": %d,
                  "videoKey": "%s",
                  "thumbKey": "%s"
                }
                """
                .formatted(
                        chartId,
                        score,
                        maxCombo,
                        perfectCount,
                        goodCount,
                        missCount,
                        totalNotes,
                        playedDurationMs,
                        videoKey,
                        thumbKey);
    }

    private double expectedAccuracy(int perfectCount, int goodCount, int totalNotes) {
        return expectedAccuracy(perfectCount, 0, goodCount, totalNotes);
    }

    private double expectedAccuracy(
            int perfectCount, int greatCount, int goodCount, int totalNotes) {
        return (perfectCount + greatCount * 0.85 + goodCount * 0.6) / totalNotes;
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
