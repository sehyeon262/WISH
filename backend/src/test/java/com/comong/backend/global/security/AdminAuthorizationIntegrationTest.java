package com.comong.backend.global.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

import com.comong.backend.domain.exercise.repository.ExerciseMotionRepository;
import com.comong.backend.domain.exercise.repository.ExerciseSessionMotionRepository;
import com.comong.backend.domain.exercise.repository.ExerciseSessionRepository;
import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.user.entity.User;
import com.comong.backend.domain.user.entity.UserRole;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.support.IntegrationTestSupport;

import tools.jackson.databind.ObjectMapper;

/**
 * 실제 인증 흐름 (회원가입 → 로그인 → JWT) 으로 ADMIN 권한이 보호되는지 검증한다.
 *
 * <p>기존 {@code with(user().roles("ADMIN"))} 테스트는 Spring Security Test 가 SecurityContext 를 직접 주입해
 * {@code JwtAuthenticationFilter} 를 우회하기 때문에 "실제 ADMIN 권한 발급 경로" 는 검증되지 않았다 (S14P31E103-300).
 *
 * <p>본 테스트는 다음 두 사각지대를 메운다.
 *
 * <ul>
 *   <li>USER 로 가입한 사용자의 토큰으로는 admin endpoint 가 거부됨
 *   <li>운영 절차로 직접 role 을 ADMIN 으로 갱신한 사용자가 재로그인 후 admin endpoint 를 통과함
 * </ul>
 *
 * <p>운영에서 ADMIN 부여는 DB 직접 수정으로만 한다 (자세한 절차는 {@code backend/docs/admin-bootstrap.md}). 본 테스트는 그 운영
 * 절차를 {@link User#promoteToAdmin()} 호출로 시뮬레이션한다.
 */
@AutoConfigureMockMvc
class AdminAuthorizationIntegrationTest extends IntegrationTestSupport {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private UserRepository userRepository;
    @Autowired private PatientProfileRepository patientProfileRepository;
    @Autowired private ExerciseMotionRepository exerciseMotionRepository;
    @Autowired private ExerciseSessionRepository exerciseSessionRepository;
    @Autowired private ExerciseSessionMotionRepository exerciseSessionMotionRepository;

    @BeforeEach
    void cleanDb() {
        cleanAll();
    }

    @AfterEach
    void cleanDbAfter() {
        cleanAll();
    }

    /**
     * V10 seed 가 TOP routine_order 1~5 를 채워두기 때문에 motion 저장소도 함께 비워야 admin endpoint 호출 시 unique 제약
     * 충돌(EX-002)을 피할 수 있다. FK 정책상 master(exercise_motion) 는 RESTRICT 라 자식(session_motion)을 먼저 비운 뒤
     * master 를 지운다.
     */
    private void cleanAll() {
        exerciseSessionMotionRepository.deleteAll();
        exerciseSessionRepository.deleteAll();
        exerciseMotionRepository.deleteAll();
        patientProfileRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void userTokenIsForbiddenOnAdminEndpoint() throws Exception {
        signup("user1@example.com", "user1", "P@ssw0rd!");
        String userToken = login("user1@example.com", "P@ssw0rd!");

        mockMvc.perform(
                        motionCreateMultipart("TOP", 1, "제자리 걷기")
                                .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("G-004"));
    }

    @Test
    void promotedUserPassesAdminEndpointAfterReLogin() throws Exception {
        // 1. 일반 회원가입 — USER 로 시작.
        signup("admin1@example.com", "admin1", "P@ssw0rd!");
        String beforeToken = login("admin1@example.com", "P@ssw0rd!");

        // 가입 직후 토큰은 USER 이므로 admin endpoint 거부.
        mockMvc.perform(
                        motionCreateMultipart("TOP", 2, "사이드 스텝")
                                .header("Authorization", "Bearer " + beforeToken))
                .andExpect(status().isForbidden());

        // 2. 운영 절차 시뮬레이션 — DB 직접 갱신으로 USER → ADMIN 승격.
        User user = userRepository.findByEmail("admin1@example.com").orElseThrow();
        user.promoteToAdmin();
        userRepository.save(user);

        assertThat(userRepository.findByEmail("admin1@example.com").orElseThrow().getRole())
                .isEqualTo(UserRole.ADMIN);

        // 3. 재로그인 — 새 토큰엔 role=ADMIN claim.
        String afterToken = login("admin1@example.com", "P@ssw0rd!");

        // 4. 같은 사용자, 새 토큰으로 admin endpoint 통과.
        mockMvc.perform(
                        motionCreateMultipart("TOP", 3, "대각선 지르기")
                                .header("Authorization", "Bearer " + afterToken))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("SUCCESS"));
    }

    private void signup(String email, String nickname, String password) throws Exception {
        mockMvc.perform(
                        post("/auth/signup")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(json(new SignupPayload(email, nickname, password))))
                .andExpect(status().isCreated());
    }

    private String login(String email, String password) throws Exception {
        String response =
                mockMvc.perform(
                                post("/auth/login")
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(json(new LoginPayload(email, password))))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        return objectMapper.readTree(response).get("data").get("accessToken").asString();
    }

    /** ExerciseMotion create 호출은 multipart 다 (S14P31E103-308). request part 만 채우고 미디어 part 는 생략. */
    private MockMultipartHttpServletRequestBuilder motionCreateMultipart(
            String exerciseType, int routineOrder, String name) throws Exception {
        String body = json(new MotionCreatePayload(exerciseType, name, routineOrder, 8, "테스트 동작"));
        return multipart("/exercise-motions")
                .file(
                        new MockMultipartFile(
                                "request",
                                /* originalFilename */ null,
                                MediaType.APPLICATION_JSON_VALUE,
                                body.getBytes(StandardCharsets.UTF_8)));
    }

    private String json(Object value) throws Exception {
        return objectMapper.writeValueAsString(value);
    }

    private record SignupPayload(String email, String nickname, String password) {}

    private record LoginPayload(String email, String password) {}

    private record MotionCreatePayload(
            String exerciseType,
            String name,
            int routineOrder,
            int targetReps,
            String description) {}
}
