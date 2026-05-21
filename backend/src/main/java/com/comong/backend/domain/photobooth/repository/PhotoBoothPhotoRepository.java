package com.comong.backend.domain.photobooth.repository;

import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.comong.backend.domain.photobooth.entity.PhotoBoothPhoto;

public interface PhotoBoothPhotoRepository extends JpaRepository<PhotoBoothPhoto, Long> {

    /**
     * 단건 조회 시 patientProfile/user 까지 JOIN FETCH — 권한 체크에서 {@code photo.patientProfile.user.id} 참조 시
     * N+1 방지.
     */
    @Query(
            "SELECT p FROM PhotoBoothPhoto p "
                    + "JOIN FETCH p.patientProfile pp "
                    + "JOIN FETCH pp.user "
                    + "WHERE p.id = :id")
    Optional<PhotoBoothPhoto> findByIdWithProfileAndUser(@Param("id") Long id);

    /**
     * 보호자(user) 의 환자 프로필 하위 사진 목록. patientProfile.user.id 로 필터링 — PhotoBoothPhoto 의 FK 가
     * patient_profile_id 이므로 {@code pp.user.id} 비교가 필요.
     */
    @Query(
            "SELECT p FROM PhotoBoothPhoto p "
                    + "JOIN FETCH p.patientProfile pp "
                    + "JOIN FETCH pp.user u "
                    + "WHERE u.id = :userId")
    Page<PhotoBoothPhoto> findByOwnerUserId(@Param("userId") Long userId, Pageable pageable);

    /** 공개 갤러리. patientProfile/user 도 응답 작성자 정보용으로 함께 fetch. */
    @Query(
            "SELECT p FROM PhotoBoothPhoto p "
                    + "JOIN FETCH p.patientProfile pp "
                    + "JOIN FETCH pp.user "
                    + "WHERE p.isPublic = true")
    Page<PhotoBoothPhoto> findPublic(Pageable pageable);
}
