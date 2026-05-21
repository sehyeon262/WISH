package com.comong.backend.domain.user.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.comong.backend.domain.user.entity.User;
import com.comong.backend.domain.user.entity.UserRole;

public interface UserRepository extends JpaRepository<User, Long> {
    boolean existsByEmail(String email);

    boolean existsByNickname(String nickname);

    long countByRole(UserRole role);

    long countByCreatedAtBetween(java.time.LocalDateTime start, java.time.LocalDateTime end);

    Optional<User> findByEmail(String email);
}
