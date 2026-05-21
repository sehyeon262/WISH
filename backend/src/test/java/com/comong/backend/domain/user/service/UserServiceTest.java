package com.comong.backend.domain.user.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.sql.SQLException;

import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.user.entity.User;
import com.comong.backend.domain.user.exception.UserErrorCode;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.global.exception.BusinessException;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock private UserRepository userRepository;

    @Mock private PatientProfileRepository patientProfileRepository;

    @InjectMocks private UserService userService;

    @Test
    void mapsEmailConstraintViolationToDuplicatedEmail() {
        when(userRepository.existsByEmail("guardian1@example.com")).thenReturn(false);
        when(userRepository.existsByNickname("guardian1")).thenReturn(false);
        when(userRepository.save(any(User.class))).thenThrow(uniqueViolation("uk_users_email"));

        assertThatThrownBy(
                        () ->
                                userService.create(
                                        "guardian1@example.com", "guardian1", "encoded-password"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(UserErrorCode.EMAIL_DUPLICATED);
    }

    @Test
    void mapsNicknameConstraintViolationToDuplicatedNickname() {
        when(userRepository.existsByEmail("guardian2@example.com")).thenReturn(false);
        when(userRepository.existsByNickname("guardian2")).thenReturn(false);
        when(userRepository.save(any(User.class))).thenThrow(uniqueViolation("uk_users_nickname"));

        assertThatThrownBy(
                        () ->
                                userService.create(
                                        "guardian2@example.com", "guardian2", "encoded-password"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(UserErrorCode.NICKNAME_DUPLICATED);
    }

    private DataIntegrityViolationException uniqueViolation(String constraintName) {
        ConstraintViolationException cause =
                new ConstraintViolationException(
                        "duplicate key", new SQLException("duplicate key"), constraintName);
        return new DataIntegrityViolationException("duplicate key", cause);
    }
}
