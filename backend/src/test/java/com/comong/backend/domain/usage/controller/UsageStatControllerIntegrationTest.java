package com.comong.backend.domain.usage.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.time.LocalDateTime;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.usage.entity.ContentType;
import com.comong.backend.domain.usage.entity.DailyUsageStat;
import com.comong.backend.domain.usage.repository.DailyUsageStatRepository;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.support.IntegrationTestSupport;

import tools.jackson.databind.ObjectMapper;

@AutoConfigureMockMvc
class UsageStatControllerIntegrationTest extends IntegrationTestSupport {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private DailyUsageStatRepository dailyUsageStatRepository;
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
        jdbc.update("DELETE FROM daily_usage_stat");
        jdbc.update("DELETE FROM user_login_session");
        jdbc.update("DELETE FROM music_result");
        jdbc.update("DELETE FROM taekwondo_session");
        jdbc.update("DELETE FROM exercise_session");
        jdbc.update("DELETE FROM artworks");
        patientProfileRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    @DisplayName("일별 조회 — 캐시된 daily 행을 응답하고, 행 없는 날짜는 0 으로 채움")
    void daily_returnsCachedRowsAndZerosForMissingDates() throws Exception {
        String token = setupUserWithProfile("daily-cache@example.com", "daily-cache");
        long patientId = ownProfileId(token);
        PatientProfile profile = patientProfileRepository.findById(patientId).orElseThrow();

        LocalDate yesterday = LocalDate.now().minusDays(1);
        LocalDate twoDaysAgo = yesterday.minusDays(1);

        // 어제: LOGIN 600 / MUSIC 300, 그제: ART 100 (TAEKWONDO/GYMNASTICS row 없음 → 0)
        saveDaily(profile, yesterday, ContentType.LOGIN, 600);
        saveDaily(profile, yesterday, ContentType.MUSIC, 300);
        saveDaily(profile, twoDaysAgo, ContentType.ART, 100);

        mockMvc.perform(
                        get("/patients/{id}/usage-stats/daily", patientId)
                                .param("from", twoDaysAgo.toString())
                                .param("to", yesterday.toString())
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.patientId").value(patientId))
                .andExpect(jsonPath("$.data.from").value(twoDaysAgo.toString()))
                .andExpect(jsonPath("$.data.to").value(yesterday.toString()))
                .andExpect(jsonPath("$.data.items.length()").value(2))
                .andExpect(jsonPath("$.data.items[0].date").value(twoDaysAgo.toString()))
                .andExpect(jsonPath("$.data.items[0].login").value(0))
                .andExpect(jsonPath("$.data.items[0].art").value(100))
                .andExpect(jsonPath("$.data.items[1].date").value(yesterday.toString()))
                .andExpect(jsonPath("$.data.items[1].login").value(600))
                .andExpect(jsonPath("$.data.items[1].music").value(300))
                .andExpect(jsonPath("$.data.items[1].taekwondo").value(0))
                .andExpect(jsonPath("$.data.items[1].gymnastics").value(0));
    }

    @Test
    @DisplayName("일별 조회 — 오늘이 범위에 포함되면 source 즉석 SUM 으로 fallback")
    void daily_todayIsComputedFromSourceLive() throws Exception {
        String token = setupUserWithProfile("daily-today@example.com", "daily-today");
        long patientId = ownProfileId(token);

        // 오늘 활동 — 음악만 source 에 직접 INSERT (daily row 는 아직 없음, 배치 안 돈 상태)
        LocalDate today = LocalDate.now();
        insertMusicResult(patientId, today.atTime(10, 0), 60_000);

        mockMvc.perform(
                        get("/patients/{id}/usage-stats/daily", patientId)
                                .param("from", today.toString())
                                .param("to", today.toString())
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(1))
                .andExpect(jsonPath("$.data.items[0].date").value(today.toString()))
                .andExpect(jsonPath("$.data.items[0].music").value(60));
    }

    @Test
    @DisplayName("일별 조회 — from/to 미지정 시 [오늘-7일, 오늘] 디폴트")
    void daily_defaultsToLastSevenDays() throws Exception {
        String token = setupUserWithProfile("daily-default@example.com", "daily-default");
        long patientId = ownProfileId(token);

        mockMvc.perform(
                        get("/patients/{id}/usage-stats/daily", patientId)
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.from").value(LocalDate.now().minusDays(7).toString()))
                .andExpect(jsonPath("$.data.to").value(LocalDate.now().toString()))
                .andExpect(jsonPath("$.data.items.length()").value(8));
    }

    @Test
    @DisplayName("일별 조회 — from > to 면 400 G-001")
    void daily_invalidRangeReturns400() throws Exception {
        String token = setupUserWithProfile("daily-bad@example.com", "daily-bad");
        long patientId = ownProfileId(token);

        mockMvc.perform(
                        get("/patients/{id}/usage-stats/daily", patientId)
                                .param("from", "2026-05-10")
                                .param("to", "2026-05-01")
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("G-001"));
    }

    @Test
    @DisplayName("누적 조회 — 캐시된 daily 합 + 오늘 source SUM 합산, ART 는 artworks 누적")
    void cumulative_combinesCachedAndToday() throws Exception {
        String token = setupUserWithProfile("cum@example.com", "cum");
        long patientId = ownProfileId(token);
        PatientProfile profile = patientProfileRepository.findById(patientId).orElseThrow();

        // 과거 daily: LOGIN 1000, ART 500, MUSIC 200
        LocalDate threeDaysAgo = LocalDate.now().minusDays(3);
        saveDaily(profile, threeDaysAgo, ContentType.LOGIN, 1000);
        saveDaily(profile, threeDaysAgo, ContentType.ART, 500);
        saveDaily(profile, threeDaysAgo, ContentType.MUSIC, 200);

        // 오늘: 음악 30초 + 작품 누적 700초 (ART 일별 증가분 = 700 - 500 = 200, 누적 = 700)
        LocalDate today = LocalDate.now();
        insertMusicResult(patientId, today.atTime(10, 0), 30_000);
        insertArtwork(patientId, today.atTime(11, 0), 700);

        mockMvc.perform(
                        get("/patients/{id}/usage-stats/cumulative", patientId)
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.patientId").value(patientId))
                .andExpect(jsonPath("$.data.login").value(1000))
                .andExpect(jsonPath("$.data.art").value(700))
                .andExpect(jsonPath("$.data.music").value(230))
                .andExpect(jsonPath("$.data.taekwondo").value(0))
                .andExpect(jsonPath("$.data.gymnastics").value(0));
    }

    @Test
    @DisplayName("권한 — 보호자가 다른 환자 통계 조회 시 P-001 (404)")
    void daily_otherUsersPatientReturns404WithP001() throws Exception {
        String ownerToken = setupUserWithProfile("cum-owner@example.com", "cum-owner");
        long ownerPatientId = ownProfileId(ownerToken);

        String otherToken = setupUserWithProfile("cum-other@example.com", "cum-other");

        mockMvc.perform(
                        get("/patients/{id}/usage-stats/daily", ownerPatientId)
                                .header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("P-001"));
    }

    @Test
    @DisplayName("권한 — 비인증 401 G-003")
    void daily_unauthenticatedReturns401() throws Exception {
        mockMvc.perform(get("/patients/{id}/usage-stats/daily", 1L))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("G-003"));
    }

    private void saveDaily(
            PatientProfile profile, LocalDate date, ContentType type, long totalSeconds) {
        dailyUsageStatRepository.save(
                DailyUsageStat.builder()
                        .statDate(date)
                        .contentType(type)
                        .patientProfile(profile)
                        .totalSeconds(totalSeconds)
                        .build());
    }

    private void insertMusicResult(long patientId, LocalDateTime playedAt, int durationMs) {
        Long chartId =
                jdbc.query(
                        "SELECT id FROM music_chart WHERE chart_id = 'baby-shark'",
                        rs -> {
                            rs.next();
                            return rs.getLong(1);
                        });
        jdbc.update(
                "INSERT INTO music_result"
                        + " (patient_profile_id, music_chart_id, score, max_combo,"
                        + " perfect_count, good_count, miss_count, total_notes, accuracy, rank,"
                        + " played_duration_ms, played_at)"
                        + " VALUES (?, ?, 0, 0, 0, 0, 0, 1, 0.0, 'A', ?, ?)",
                patientId,
                chartId,
                durationMs,
                playedAt);
    }

    private void insertArtwork(long patientId, LocalDateTime updatedAt, int playDurationSeconds) {
        jdbc.update(
                "INSERT INTO artworks"
                        + " (patient_profile_id, image_url, play_duration_seconds, is_public,"
                        + " created_at, updated_at)"
                        + " VALUES (?, 'test', ?, false, ?, ?)",
                patientId,
                playDurationSeconds,
                updatedAt,
                updatedAt);
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
