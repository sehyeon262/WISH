package com.comong.backend.domain.artwork.repository;

import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.comong.backend.domain.artwork.entity.Artwork;

public interface ArtworkRepository extends JpaRepository<Artwork, Long> {

    /**
     * 단건 조회 시 patientProfile/user 까지 JOIN FETCH 로 함께 로딩 — 권한 체크에서 {@code
     * artwork.patientProfile.user.id} 참조 시 N+1 방지.
     */
    @Query(
            "SELECT a FROM Artwork a "
                    + "JOIN FETCH a.patientProfile pp "
                    + "JOIN FETCH pp.user "
                    + "WHERE a.id = :id")
    Optional<Artwork> findByIdWithProfileAndUser(@Param("id") Long id);

    /**
     * 환자 프로필 user 의 작품 목록. patientProfile.user.id 로 필터링 — Artwork 의 FK 가 patient_profile_id 이므로
     * {@code pp.user.id} 비교가 필요.
     */
    @Query(
            "SELECT a FROM Artwork a "
                    + "JOIN FETCH a.patientProfile pp "
                    + "JOIN FETCH pp.user u "
                    + "WHERE u.id = :userId")
    Page<Artwork> findByOwnerUserId(@Param("userId") Long userId, Pageable pageable);

    /** 공개 갤러리. patientProfile/user 도 응답 작성자 정보용으로 함께 fetch. */
    @Query(
            "SELECT a FROM Artwork a "
                    + "JOIN FETCH a.patientProfile pp "
                    + "JOIN FETCH pp.user "
                    + "WHERE a.isPublic = true")
    Page<Artwork> findPublic(Pageable pageable);
}
