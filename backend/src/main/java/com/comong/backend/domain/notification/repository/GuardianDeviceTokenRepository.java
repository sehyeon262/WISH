package com.comong.backend.domain.notification.repository;

import java.util.List;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.comong.backend.domain.notification.entity.GuardianDeviceToken;

public interface GuardianDeviceTokenRepository extends JpaRepository<GuardianDeviceToken, Long> {

    @Query(
            value =
                    """
                    INSERT INTO guardian_device_token (
                        user_id,
                        device_token,
                        platform,
                        user_agent,
                        active,
                        created_at,
                        updated_at,
                        deactivated_at
                    )
                    VALUES (
                        :userId,
                        :deviceToken,
                        :platform,
                        :userAgent,
                        TRUE,
                        CURRENT_TIMESTAMP,
                        CURRENT_TIMESTAMP,
                        NULL
                    )
                    ON CONFLICT (device_token)
                    DO UPDATE SET
                        user_id = EXCLUDED.user_id,
                        platform = EXCLUDED.platform,
                        user_agent = EXCLUDED.user_agent,
                        active = TRUE,
                        updated_at = CURRENT_TIMESTAMP,
                        deactivated_at = NULL
                    RETURNING id
                    """,
            nativeQuery = true)
    Long upsertDeviceToken(
            @Param("userId") Long userId,
            @Param("deviceToken") String deviceToken,
            @Param("platform") String platform,
            @Param("userAgent") String userAgent);

    Optional<GuardianDeviceToken> findByDeviceToken(String deviceToken);

    Optional<GuardianDeviceToken> findByUserIdAndDeviceToken(Long userId, String deviceToken);

    List<GuardianDeviceToken> findAllByUserIdAndActiveTrue(Long userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select token from GuardianDeviceToken token where token.id = :id")
    Optional<GuardianDeviceToken> findByIdForUpdate(@Param("id") Long id);
}
