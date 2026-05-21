package com.comong.backend.domain.patient.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
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

import com.comong.backend.domain.patient.dto.PatientProfileCreateRequest;
import com.comong.backend.domain.patient.dto.PatientProfileResponse;
import com.comong.backend.domain.patient.entity.Gender;
import com.comong.backend.domain.patient.exception.PatientErrorCode;
import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.domain.user.service.UserService;
import com.comong.backend.global.exception.BusinessException;
import com.comong.backend.global.exception.ErrorCode;
import com.comong.backend.support.IntegrationTestSupport;

class PatientProfileServiceIntegrationTest extends IntegrationTestSupport {

    @Autowired private PatientProfileService patientProfileService;

    @Autowired private PatientProfileRepository patientProfileRepository;

    @Autowired private UserRepository userRepository;

    @Autowired private UserService userService;

    @BeforeEach
    void setUp() {
        patientProfileRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void createsAndListsMyPatientProfile() {
        Long userId = createUser("guardian1@example.com", "guardian1");

        PatientProfileResponse created =
                patientProfileService.create(userId, createRequest("patient1"));

        assertThat(created.id()).isNotNull();
        assertThat(created.name()).isEqualTo("patient1 name");
        assertThat(created.nickname()).isEqualTo("patient1");
        assertThat(patientProfileService.findMine(userId)).hasSize(1);
    }

    @Test
    void rejectsSecondPatientProfileForSameUser() {
        Long userId = createUser("guardian2@example.com", "guardian2");
        patientProfileService.create(userId, createRequest("patient2"));

        assertThatThrownBy(() -> patientProfileService.create(userId, createRequest("patient2b")))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(PatientErrorCode.PATIENT_PROFILE_ALREADY_EXISTS);
    }

    @Test
    void keepsOneProfileWhenCreateRequestsRace() throws Exception {
        Long userId = createUser("guardian3@example.com", "guardian3");
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executorService = Executors.newFixedThreadPool(2);

        try {
            Future<Object> first =
                    executorService.submit(
                            createProfileTask(userId, createRequest("patient3a"), ready, start));
            Future<Object> second =
                    executorService.submit(
                            createProfileTask(userId, createRequest("patient3b"), ready, start));

            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            List<Object> results = List.of(first.get(), second.get());

            assertThat(results.stream().filter(PatientProfileResponse.class::isInstance))
                    .hasSize(1);
            assertThat(results)
                    .filteredOn(PatientErrorCode.PATIENT_PROFILE_ALREADY_EXISTS::equals)
                    .hasSize(1);
            assertThat(patientProfileRepository.findAllByUserId(userId)).hasSize(1);
        } finally {
            executorService.shutdownNow();
        }
    }

    @Test
    void hidesOtherUsersPatientProfileAsNotFound() {
        Long ownerId = createUser("guardian4@example.com", "guardian4");
        Long otherId = createUser("guardian5@example.com", "guardian5");
        PatientProfileResponse ownerProfile =
                patientProfileService.create(ownerId, createRequest("patient4"));

        assertThatThrownBy(() -> patientProfileService.findOne(otherId, ownerProfile.id()))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(PatientErrorCode.PATIENT_PROFILE_NOT_FOUND);
    }

    private Callable<Object> createProfileTask(
            Long userId,
            PatientProfileCreateRequest request,
            CountDownLatch ready,
            CountDownLatch start) {
        return () -> {
            ready.countDown();
            if (!start.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Timed out waiting for concurrent start");
            }
            try {
                return patientProfileService.create(userId, request);
            } catch (BusinessException e) {
                ErrorCode errorCode = e.getErrorCode();
                if (errorCode == PatientErrorCode.PATIENT_PROFILE_ALREADY_EXISTS) {
                    return errorCode;
                }
                throw e;
            }
        };
    }

    private Long createUser(String email, String nickname) {
        return userService.create(email, nickname, "encoded-password").id();
    }

    private PatientProfileCreateRequest createRequest(String nickname) {
        return new PatientProfileCreateRequest(
                nickname + " name", nickname, LocalDate.of(2018, 5, 1), Gender.MALE);
    }
}
