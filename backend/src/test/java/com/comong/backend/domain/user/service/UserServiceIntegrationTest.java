package com.comong.backend.domain.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.user.dto.UserResponse;
import com.comong.backend.domain.user.exception.UserErrorCode;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.global.exception.BusinessException;
import com.comong.backend.global.exception.ErrorCode;
import com.comong.backend.support.IntegrationTestSupport;

class UserServiceIntegrationTest extends IntegrationTestSupport {

    @Autowired private UserService userService;

    @Autowired private UserRepository userRepository;

    @Autowired private PatientProfileRepository patientProfileRepository;

    @BeforeEach
    void setUp() {
        patientProfileRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void rejectsDuplicatedEmail() {
        userService.create("guardian1@example.com", "guardian1", "encoded-password");

        assertThatThrownBy(
                        () ->
                                userService.create(
                                        "guardian1@example.com",
                                        "guardian1-other",
                                        "encoded-password"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(UserErrorCode.EMAIL_DUPLICATED);
    }

    @Test
    void rejectsDuplicatedNickname() {
        userService.create("guardian2@example.com", "guardian2", "encoded-password");

        assertThatThrownBy(
                        () ->
                                userService.create(
                                        "guardian2-other@example.com",
                                        "guardian2",
                                        "encoded-password"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(UserErrorCode.NICKNAME_DUPLICATED);
    }

    @Test
    void keepsOneUserWhenEmailCreateRequestsRace() throws Exception {
        List<Object> results =
                runConcurrentCreates(
                        createUserInput("race-email@example.com", "raceEmail1"),
                        createUserInput("race-email@example.com", "raceEmail2"));

        assertThat(results.stream().filter(UserResponse.class::isInstance)).hasSize(1);
        assertThat(results).filteredOn(UserErrorCode.EMAIL_DUPLICATED::equals).hasSize(1);
        assertThat(userRepository.count()).isEqualTo(1);
    }

    @Test
    void keepsOneUserWhenNicknameCreateRequestsRace() throws Exception {
        List<Object> results =
                runConcurrentCreates(
                        createUserInput("race-nickname1@example.com", "raceNickname"),
                        createUserInput("race-nickname2@example.com", "raceNickname"));

        assertThat(results.stream().filter(UserResponse.class::isInstance)).hasSize(1);
        assertThat(results).filteredOn(UserErrorCode.NICKNAME_DUPLICATED::equals).hasSize(1);
        assertThat(userRepository.count()).isEqualTo(1);
    }

    private List<Object> runConcurrentCreates(
            CreateUserInput firstInput, CreateUserInput secondInput) throws Exception {
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executorService = Executors.newFixedThreadPool(2);

        try {
            Future<Object> first = executorService.submit(createUserTask(firstInput, ready, start));
            Future<Object> second =
                    executorService.submit(createUserTask(secondInput, ready, start));

            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            return List.of(first.get(), second.get());
        } finally {
            executorService.shutdownNow();
        }
    }

    private Callable<Object> createUserTask(
            CreateUserInput input, CountDownLatch ready, CountDownLatch start) {
        return () -> {
            ready.countDown();
            if (!start.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Timed out waiting for concurrent start");
            }
            try {
                return userService.create(input.email(), input.nickname(), "encoded-password");
            } catch (BusinessException e) {
                ErrorCode errorCode = e.getErrorCode();
                if (errorCode == UserErrorCode.EMAIL_DUPLICATED
                        || errorCode == UserErrorCode.NICKNAME_DUPLICATED) {
                    return errorCode;
                }
                throw e;
            }
        };
    }

    private CreateUserInput createUserInput(String email, String nickname) {
        return new CreateUserInput(email, nickname);
    }

    private record CreateUserInput(String email, String nickname) {}
}
