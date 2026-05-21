package com.comong.backend.domain.auth.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.comong.backend.domain.auth.entity.RefreshToken;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {

    Optional<RefreshToken> findByTokenHash(String tokenHash);

    /** 재사용 감지 시 같은 사용자의 모든 활성 토큰을 한 번에 폐기하기 위한 조회. */
    List<RefreshToken> findAllByUserIdAndRevokedAtIsNull(long userId);
}
