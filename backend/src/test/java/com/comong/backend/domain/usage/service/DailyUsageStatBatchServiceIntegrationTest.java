package com.comong.backend.domain.usage.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import com.comong.backend.domain.patient.entity.Gender;
import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.usage.entity.ContentType;
import com.comong.backend.domain.usage.entity.DailyUsageStat;
import com.comong.backend.domain.usage.repository.DailyUsageStatRepository;
import com.comong.backend.domain.user.entity.User;
import com.comong.backend.domain.user.entity.UserRole;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.support.IntegrationTestSupport;

/**
 * Daily usage stat 배치 통합 테스트 (환자별 finest granularity, V20 이후). 시간 컬럼들이 source 엔티티의
 * {@code @PrePersist} 로 강제되어 통제 불가하므로 JdbcTemplate 으로 source row 를 직접 INSERT 해서 명시적 타임스탬프를 부여한다.
 */
class DailyUsageStatBatchServiceIntegrationTest extends IntegrationTestSupport {

    @Autowired private DailyUsageStatBatchService batchService;
    @Autowired private DailyUsageStatRepository dailyUsageStatRepository;
    @Autowired private PatientProfileRepository patientProfileRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private JdbcTemplate jdbc;

    private static final LocalDate TARGET = LocalDate.of(2026, 5, 7);
    private static final LocalDateTime YESTERDAY_10AM = TARGET.atTime(10, 0);

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
    @DisplayName("환자별로 5종 source 활동을 모두 집계 — 1 환자 5 row")
    void aggregateForDate_singlePatient_persistsFiveRows() {
        long patientId = createUserAndPatient("agg-all@example.com", "agg-all");
        insertLoginSession(patientId, YESTERDAY_10AM, YESTERDAY_10AM.plusSeconds(3600), 3600);
        insertMusicResult(patientId, YESTERDAY_10AM.plusHours(2), 60_000);
        insertTaekwondoSession(patientId, YESTERDAY_10AM.plusHours(3), 300);
        insertExerciseSession(patientId, YESTERDAY_10AM.plusHours(4), 200);
        insertArtwork(patientId, YESTERDAY_10AM.plusHours(5), 500);

        batchService.aggregateForDate(TARGET);

        assertStat(patientId, ContentType.LOGIN, 3600);
        assertStat(patientId, ContentType.MUSIC, 60);
        assertStat(patientId, ContentType.TAEKWONDO, 300);
        assertStat(patientId, ContentType.GYMNASTICS, 200);
        assertStat(patientId, ContentType.ART, 500);
    }

    @Test
    @DisplayName("두 환자가 각자 활동하면 환자별로 분리된 row 가 작성됨 — ADMIN 합산은 SUM derive")
    void aggregateForDate_multiplePatients_writesPerPatientRows() {
        long alice = createUserAndPatient("agg-alice@example.com", "agg-alice");
        long bob = createUserAndPatient("agg-bob@example.com", "agg-bob");

        insertLoginSession(alice, YESTERDAY_10AM, YESTERDAY_10AM.plusSeconds(1800), 1800);
        insertLoginSession(bob, YESTERDAY_10AM, YESTERDAY_10AM.plusSeconds(900), 900);

        batchService.aggregateForDate(TARGET);

        assertStat(alice, ContentType.LOGIN, 1800);
        assertStat(bob, ContentType.LOGIN, 900);

        // ADMIN 전체 합산이 필요하면 SUM 으로 derive
        Long globalLogin =
                jdbc.queryForObject(
                        "SELECT SUM(total_seconds) FROM daily_usage_stat"
                                + " WHERE stat_date = ? AND content_type = 'LOGIN'",
                        Long.class,
                        TARGET);
        assertThat(globalLogin).isEqualTo(2700L);
    }

    @Test
    @DisplayName("활동 안 한 환자에 대해선 row 를 안 만든다 (sparse)")
    void aggregateForDate_inactivePatientHasNoRow() {
        long active = createUserAndPatient("agg-active@example.com", "agg-active");
        long inactive = createUserAndPatient("agg-inactive@example.com", "agg-inactive");

        insertMusicResult(active, YESTERDAY_10AM, 60_000);

        batchService.aggregateForDate(TARGET);

        assertStat(active, ContentType.MUSIC, 60);
        Optional<DailyUsageStat> inactiveRow =
                dailyUsageStatRepository.findByStatDateAndContentTypeAndPatientProfileId(
                        TARGET, ContentType.MUSIC, inactive);
        assertThat(inactiveRow).isEmpty();
    }

    @Test
    @DisplayName("ART 는 환자별 (현재 누적) - (그 환자의 이전 daily 합) 으로 일별 증가분 계산")
    void aggregateForDate_artUsesPerPatientCumulativeDiff() {
        long alice = createUserAndPatient("agg-art-alice@example.com", "agg-art-alice");
        long bob = createUserAndPatient("agg-art-bob@example.com", "agg-art-bob");

        // 두 환자 모두 어제 작품 수정 (누적 컬럼은 작품별이라 두 row 의 합이 환자 누적)
        insertArtwork(alice, YESTERDAY_10AM, 500);
        insertArtwork(bob, YESTERDAY_10AM, 300);

        // 앨리스만 그제 이전에 ART 200초가 누적되어 있음 → 어제 분 증가분 = 500 - 200 = 300
        PatientProfile aliceProfile = patientProfileRepository.findById(alice).orElseThrow();
        dailyUsageStatRepository.save(
                DailyUsageStat.builder()
                        .statDate(TARGET.minusDays(2))
                        .contentType(ContentType.ART)
                        .patientProfile(aliceProfile)
                        .totalSeconds(200)
                        .build());

        batchService.aggregateForDate(TARGET);

        assertStat(alice, ContentType.ART, 300);
        assertStat(bob, ContentType.ART, 300);
    }

    @Test
    @DisplayName("좀비 세션 (ended_at IS NULL) 은 last_heartbeat_at + 5분 까지로 duration 추정")
    void aggregateForDate_zombieLoginSessionUsesGraceCutoff() {
        long patientId = createUserAndPatient("agg-zombie@example.com", "agg-zombie");
        // started 10:00, last heartbeat 10:30, ended NULL → grace 5min → ~ 35분 = 2100s
        insertLoginSessionRaw(patientId, YESTERDAY_10AM, YESTERDAY_10AM.plusMinutes(30), null, 0);

        batchService.aggregateForDate(TARGET);

        Optional<DailyUsageStat> login =
                dailyUsageStatRepository.findByStatDateAndContentTypeAndPatientProfileId(
                        TARGET, ContentType.LOGIN, patientId);
        assertThat(login).isPresent();
        assertThat(login.get().getTotalSeconds()).isBetween(2100L, 2160L);
    }

    @Test
    @DisplayName("재실행 시 같은 (date, type, patient) row 를 UPSERT 로 덮어쓴다 (idempotent)")
    void aggregateForDate_isIdempotent() {
        long patientId = createUserAndPatient("agg-idem@example.com", "agg-idem");
        insertMusicResult(patientId, YESTERDAY_10AM, 60_000);

        batchService.aggregateForDate(TARGET);
        batchService.aggregateForDate(TARGET);

        List<DailyUsageStat> musicRows =
                dailyUsageStatRepository
                        .findAllByPatientProfileIdAndStatDateBetween(patientId, TARGET, TARGET)
                        .stream()
                        .filter(s -> s.getContentType() == ContentType.MUSIC)
                        .toList();
        assertThat(musicRows).hasSize(1);
        assertThat(musicRows.get(0).getTotalSeconds()).isEqualTo(60);
    }

    @Test
    @DisplayName("source 에 데이터가 없으면 row 를 안 만든다 (sparse)")
    void aggregateForDate_emptySources_writesNoRows() {
        batchService.aggregateForDate(TARGET);

        assertThat(dailyUsageStatRepository.count()).isZero();
    }

    @Test
    @DisplayName("당일 외 날짜의 source 는 집계에 포함되지 않는다")
    void aggregateForDate_excludesOtherDates() {
        long patientId = createUserAndPatient("agg-window@example.com", "agg-window");
        insertMusicResult(patientId, YESTERDAY_10AM, 60_000);
        insertMusicResult(patientId, YESTERDAY_10AM.minusDays(1), 30_000);

        batchService.aggregateForDate(TARGET);

        assertStat(patientId, ContentType.MUSIC, 60);
    }

    private void assertStat(long patientId, ContentType type, long expectedSeconds) {
        Optional<DailyUsageStat> stat =
                dailyUsageStatRepository.findByStatDateAndContentTypeAndPatientProfileId(
                        TARGET, type, patientId);
        assertThat(stat)
                .as("daily_usage_stat row for patient=" + patientId + " type=" + type)
                .isPresent();
        assertThat(stat.get().getTotalSeconds())
                .as("totalSeconds for patient=" + patientId + " type=" + type)
                .isEqualTo(expectedSeconds);
    }

    private long createUserAndPatient(String email, String nickname) {
        User user =
                userRepository.save(
                        User.builder()
                                .email(email)
                                .nickname(nickname)
                                .password("hashed")
                                .role(UserRole.USER)
                                .build());
        PatientProfile profile =
                patientProfileRepository.save(
                        PatientProfile.builder()
                                .user(user)
                                .name("Patient")
                                .nickname("patient")
                                .birthDate(LocalDate.of(2020, 1, 1))
                                .gender(Gender.MALE)
                                .build());
        return profile.getId();
    }

    private void insertLoginSession(
            long patientId, LocalDateTime started, LocalDateTime ended, int durationSeconds) {
        insertLoginSessionRaw(patientId, started, ended, ended, durationSeconds);
    }

    private void insertLoginSessionRaw(
            long patientId,
            LocalDateTime started,
            LocalDateTime lastHeartbeat,
            LocalDateTime ended,
            int durationSeconds) {
        jdbc.update(
                "INSERT INTO user_login_session"
                        + " (patient_profile_id, started_at, last_heartbeat_at, ended_at, duration_seconds)"
                        + " VALUES (?, ?, ?, ?, ?)",
                patientId,
                started,
                lastHeartbeat,
                ended,
                durationSeconds);
    }

    private void insertMusicResult(long patientId, LocalDateTime playedAt, int durationMs) {
        Long chartId = ensureMusicChart();
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

    private Long ensureMusicChart() {
        return jdbc.query(
                "SELECT id FROM music_chart WHERE chart_id = 'baby-shark'",
                rs -> {
                    rs.next();
                    return rs.getLong(1);
                });
    }

    private void insertTaekwondoSession(long patientId, LocalDateTime createdAt, int durationSec) {
        jdbc.update(
                "INSERT INTO taekwondo_session"
                        + " (patient_id, poomsae, duration_sec, average_accuracy,"
                        + " completed_motion_count, monsters_defeated, created_at)"
                        + " VALUES (?, 'TAEGEUK_1', ?, 0.0, 0, 0, ?)",
                patientId,
                durationSec,
                createdAt);
    }

    private void insertExerciseSession(long patientId, LocalDateTime createdAt, int durationSec) {
        jdbc.update(
                "INSERT INTO exercise_session"
                        + " (patient_id, exercise_type, duration_sec, average_accuracy,"
                        + " completed_motion_count, created_at)"
                        + " VALUES (?, 'TOP', ?, 0.0, 0, ?)",
                patientId,
                durationSec,
                createdAt);
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
}
