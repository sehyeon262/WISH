package com.comong.backend.domain.usage.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.LocalDateTime;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import com.comong.backend.domain.patient.entity.Gender;
import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.user.entity.User;
import com.comong.backend.domain.user.entity.UserRole;

/** LoginSession 엔티티 단위 테스트. 시간 계산은 LocalDateTime 인자를 명시적으로 넘겨 결정적으로 검증한다 (통합 테스트의 시계 의존성 제거). */
class LoginSessionTest {

    private static final LocalDateTime BASE = LocalDateTime.of(2026, 5, 8, 10, 0, 0);

    @Nested
    @DisplayName("heartbeat()")
    class Heartbeat {

        @Test
        void updatesLastHeartbeatAtAndDuration() {
            LoginSession session = newSession();

            session.heartbeat(BASE.plusSeconds(30));

            assertThat(session.getLastHeartbeatAt()).isEqualTo(BASE.plusSeconds(30));
            assertThat(session.getDurationSeconds()).isEqualTo(30);
            assertThat(session.isEnded()).isFalse();
        }

        @Test
        void ignoresOutOfOrderHeartbeat() {
            LoginSession session = newSession();
            session.heartbeat(BASE.plusSeconds(60));

            // 과거 시각으로 들어온 heartbeat 는 무시
            session.heartbeat(BASE.plusSeconds(10));

            assertThat(session.getLastHeartbeatAt()).isEqualTo(BASE.plusSeconds(60));
            assertThat(session.getDurationSeconds()).isEqualTo(60);
        }

        @Test
        void noOpAfterEnd() {
            LoginSession session = newSession();
            session.end(BASE.plusSeconds(120));

            session.heartbeat(BASE.plusSeconds(180));

            assertThat(session.getEndedAt()).isEqualTo(BASE.plusSeconds(120));
            assertThat(session.getDurationSeconds()).isEqualTo(120);
        }

        @Test
        void rejectsNullNow() {
            LoginSession session = newSession();
            assertThrows(NullPointerException.class, () -> session.heartbeat(null));
        }
    }

    @Nested
    @DisplayName("end()")
    class End {

        @Test
        void setsEndedAtAndFinalizesDuration() {
            LoginSession session = newSession();

            session.end(BASE.plusSeconds(45));

            assertThat(session.getEndedAt()).isEqualTo(BASE.plusSeconds(45));
            assertThat(session.getLastHeartbeatAt()).isEqualTo(BASE.plusSeconds(45));
            assertThat(session.getDurationSeconds()).isEqualTo(45);
            assertThat(session.isEnded()).isTrue();
        }

        @Test
        void isIdempotent() {
            LoginSession session = newSession();
            session.end(BASE.plusSeconds(45));

            // 두 번째 end 는 무시 — 처음 종료 시각 보존
            session.end(BASE.plusSeconds(60));

            assertThat(session.getEndedAt()).isEqualTo(BASE.plusSeconds(45));
            assertThat(session.getDurationSeconds()).isEqualTo(45);
        }

        @Test
        void clampsToLastHeartbeatWhenNowIsInPast() {
            LoginSession session = newSession();
            session.heartbeat(BASE.plusSeconds(60));

            // now 가 last heartbeat 보다 과거 — duration 음수 방지를 위해 lastHeartbeatAt 시점으로 클램프
            session.end(BASE.plusSeconds(30));

            assertThat(session.getEndedAt()).isEqualTo(BASE.plusSeconds(60));
            assertThat(session.getDurationSeconds()).isEqualTo(60);
        }
    }

    @Test
    void isOwnedBy_matchesGuardianUserId() {
        LoginSession session = newSession();

        assertThat(session.isOwnedBy(1L)).isTrue();
        assertThat(session.isOwnedBy(2L)).isFalse();
        assertThat(session.isOwnedBy(null)).isFalse();
    }

    private LoginSession newSession() {
        User user = userOfId(1L);
        PatientProfile patient = patientFor(user);
        return LoginSession.builder().patientProfile(patient).startedAt(BASE).build();
    }

    private User userOfId(long id) {
        User user =
                User.builder()
                        .email("guardian@example.com")
                        .nickname("guardian")
                        .password("hash")
                        .role(UserRole.USER)
                        .build();
        setField(user, "id", id);
        return user;
    }

    private PatientProfile patientFor(User user) {
        PatientProfile patient =
                PatientProfile.builder()
                        .user(user)
                        .name("Patient")
                        .nickname("patient")
                        .birthDate(java.time.LocalDate.of(2020, 1, 1))
                        .gender(Gender.MALE)
                        .build();
        setField(patient, "id", 100L);
        return patient;
    }

    private static void setField(Object target, String name, Object value) {
        try {
            java.lang.reflect.Field field = target.getClass().getDeclaredField(name);
            field.setAccessible(true);
            field.set(target, value);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("test field set failed: " + name, e);
        }
    }
}
