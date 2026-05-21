package com.comong.backend.domain.usage.controller;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

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

@AutoConfigureMockMvc
class UsageAverageControllerIntegrationTest extends IntegrationTestSupport {

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private DailyUsageStatRepository dailyUsageStatRepository;
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
    @DisplayName("활동 환자 기준으로 기간 접속시간과 콘텐츠별 평균을 조회")
    void periodAveragesUsePeriodActivePatients() throws Exception {
        LocalDate to = LocalDate.now().minusDays(1);
        LocalDate from = to.minusDays(1);

        PatientProfile first = savePatient("first@example.com", "first");
        PatientProfile second = savePatient("second@example.com", "second");
        PatientProfile contentOnly = savePatient("content-only@example.com", "content-only");

        saveDaily(first, from, ContentType.LOGIN, 600);
        saveDaily(first, from, ContentType.MUSIC, 120);
        saveDaily(second, to, ContentType.LOGIN, 300);
        saveDaily(contentOnly, to, ContentType.MUSIC, 999);

        mockMvc.perform(
                        get("/usage-stats/period-averages")
                                .param("from", from.toString())
                                .param("to", to.toString())
                                .with(user("guardian").roles("USER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.from").value(from.toString()))
                .andExpect(jsonPath("$.data.to").value(to.toString()))
                .andExpect(jsonPath("$.data.activePatients").value(3))
                .andExpect(jsonPath("$.data.login.totalSeconds").value(900))
                .andExpect(jsonPath("$.data.login.averageSeconds").value(300))
                .andExpect(jsonPath("$.data.contentAverages[0].contentType").value("ART"))
                .andExpect(jsonPath("$.data.contentAverages[0].averageSeconds").value(0))
                .andExpect(jsonPath("$.data.contentAverages[1].contentType").value("MUSIC"))
                .andExpect(jsonPath("$.data.contentAverages[1].totalSeconds").value(1119))
                .andExpect(jsonPath("$.data.contentAverages[1].averageSeconds").value(373));
    }

    @Test
    @DisplayName("from/to 를 생략하면 전체 기간 평균을 조회")
    void periodAveragesDefaultToAllTime() throws Exception {
        LocalDate oldDate = LocalDate.now().minusDays(20);
        LocalDate recentDate = LocalDate.now().minusDays(1);

        PatientProfile first = savePatient("all-first@example.com", "all-first");
        PatientProfile second = savePatient("all-second@example.com", "all-second");

        saveDaily(first, oldDate, ContentType.LOGIN, 600);
        saveDaily(second, recentDate, ContentType.LOGIN, 300);

        mockMvc.perform(get("/usage-stats/period-averages").with(user("guardian").roles("USER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.from").value(oldDate.toString()))
                .andExpect(jsonPath("$.data.to").value(LocalDate.now().toString()))
                .andExpect(jsonPath("$.data.activePatients").value(2))
                .andExpect(jsonPath("$.data.login.totalSeconds").value(900))
                .andExpect(jsonPath("$.data.login.averageSeconds").value(450));
    }

    @Test
    @DisplayName("활동 환자가 없으면 평균은 0초")
    void periodAveragesReturnZeroWhenNoActivePatients() throws Exception {
        LocalDate today = LocalDate.now();

        mockMvc.perform(
                        get("/usage-stats/period-averages")
                                .param("from", today.minusDays(1).toString())
                                .param("to", today.minusDays(1).toString())
                                .with(user("guardian").roles("USER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.activePatients").value(0))
                .andExpect(jsonPath("$.data.login.totalSeconds").value(0))
                .andExpect(jsonPath("$.data.login.averageSeconds").value(0))
                .andExpect(jsonPath("$.data.contentAverages[0].averageSeconds").value(0));
    }

    private PatientProfile savePatient(String email, String nickname) {
        User user =
                userRepository.save(
                        User.builder()
                                .email(email)
                                .nickname(nickname)
                                .password("encoded-password")
                                .role(UserRole.USER)
                                .build());
        return patientProfileRepository.save(
                PatientProfile.builder()
                        .user(user)
                        .name(nickname)
                        .nickname(nickname)
                        .birthDate(LocalDate.of(2020, 1, 1))
                        .gender(Gender.MALE)
                        .build());
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
}
