package com.comong.backend.domain.photobooth.controller;

import java.net.URI;

import jakarta.validation.Valid;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.comong.backend.domain.photobooth.dto.PhotoBoothCreateRequest;
import com.comong.backend.domain.photobooth.dto.PhotoBoothResponse;
import com.comong.backend.domain.photobooth.dto.PhotoBoothUpdateRequest;
import com.comong.backend.domain.photobooth.dto.PublicPhotoBoothResponse;
import com.comong.backend.domain.photobooth.service.PhotoBoothService;
import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.security.JwtTokenProvider.AuthenticatedUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@Tag(name = "PhotoBooth", description = "인생네컷 포토부스 결과물 API")
@RestController
@RequestMapping("/photo-booths")
@RequiredArgsConstructor
public class PhotoBoothController {

    private final PhotoBoothService photoBoothService;

    @Operation(
            summary = "인생네컷 저장",
            description =
                    "현재 보호자 계정의 환자 프로필 하위로 인생네컷 결과(합성된 PNG)를 저장한다. multipart 의 request 파트에"
                            + " 메타데이터(JSON), image 파트에 합성된 PNG 를 담아 보낸다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "201",
                description = "생성 성공 — Location 헤더에 새 사진 URI"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "400",
                description = "메타데이터 검증 실패 (G-001) 또는 이미지 검증 실패 (S-001)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "환자 프로필 없음 (P-001)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "413",
                description = "이미지 크기 한도 초과 (S-003)")
    })
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<PhotoBoothResponse>> create(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Valid @RequestPart("request") PhotoBoothCreateRequest request,
            @RequestPart("image") MultipartFile image,
            @RequestPart(value = "thumbnail", required = false) MultipartFile thumbnail) {
        PhotoBoothResponse response =
                photoBoothService.create(currentUser.userId(), request, image, thumbnail);
        URI location = URI.create("/photo-booths/" + response.id());
        return ResponseEntity.created(location).body(ApiResponse.success(response));
    }

    @Operation(summary = "내 인생네컷 목록", description = "현재 사용자의 환자 프로필이 소유한 사진 목록 (최신순).")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "조회 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)")
    })
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<Page<PhotoBoothResponse>>> listMine(
            @AuthenticationPrincipal AuthenticatedUser currentUser, Pageable pageable) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        photoBoothService.findMine(
                                currentUser.userId(), withCreatedAtDesc(pageable))));
    }

    @Operation(summary = "공개 갤러리 목록", description = "is_public = true 인 사진 목록 (최신순). 비로그인 허용.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "조회 성공")
    })
    @GetMapping("/public")
    public ResponseEntity<ApiResponse<Page<PublicPhotoBoothResponse>>> listPublic(
            Pageable pageable) {
        return ResponseEntity.ok(
                ApiResponse.success(photoBoothService.findPublic(withCreatedAtDesc(pageable))));
    }

    @Operation(
            summary = "사진 단건 조회",
            description = "공개 사진은 비로그인도 조회 가능, 비공개 사진은 작성자만. 권한 없거나 존재하지 않으면 404 (ID 노출 방지).")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "조회 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description =
                        "사진이 없거나 비공개 사진을 작성자가 아닌 사람이 조회 (PB-001) —"
                                + " enumeration 방지를 위해 비소유/비존재를 구분하지 않음")
    })
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<PhotoBoothResponse>> detail(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "사진 ID", required = true) @PathVariable Long id) {
        Long userId = currentUser != null ? currentUser.userId() : null;
        return ResponseEntity.ok(ApiResponse.success(photoBoothService.findOne(userId, id)));
    }

    @Operation(summary = "사진 공개 여부 토글", description = "isPublic 만 변경 가능. 작성자만 가능, 그 외 403.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "수정 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "403",
                description = "작성자가 아님 (PB-002)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "사진 없음 (PB-001)")
    })
    @PatchMapping("/{id}")
    public ResponseEntity<ApiResponse<PhotoBoothResponse>> update(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "사진 ID (작성자 본인)", required = true) @PathVariable Long id,
            @Valid @RequestBody PhotoBoothUpdateRequest request) {
        return ResponseEntity.ok(
                ApiResponse.success(photoBoothService.update(currentUser.userId(), id, request)));
    }

    @Operation(summary = "사진 삭제", description = "하드 삭제. 스토리지 파일도 함께 삭제. 작성자만 가능.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "204",
                description = "삭제 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "403",
                description = "작성자가 아님 (PB-002)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "사진 없음 (PB-001)")
    })
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "사진 ID (작성자 본인)", required = true) @PathVariable Long id) {
        photoBoothService.delete(currentUser.userId(), id);
        return ResponseEntity.noContent().build();
    }

    /**
     * 정렬 강제 — createdAt DESC 로 고정 (사용자 입력 sort 무시).
     *
     * <p>인덱스 (idx_photo_booth_photos_patient_created / idx_photo_booth_photos_public_created) 를
     * 활용하면서, 임의 컬럼 정렬로 인한 풀스캔 / 정보 노출 / SQL injection 표면을 차단. artwork 컨트롤러와 동일한 정책.
     */
    private Pageable withCreatedAtDesc(Pageable pageable) {
        return PageRequest.of(
                pageable.getPageNumber(),
                pageable.getPageSize(),
                Sort.by(Sort.Direction.DESC, "createdAt"));
    }
}
