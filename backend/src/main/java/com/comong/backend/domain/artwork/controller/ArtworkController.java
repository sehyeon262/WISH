package com.comong.backend.domain.artwork.controller;

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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.comong.backend.domain.artwork.dto.ArtGuessRequest;
import com.comong.backend.domain.artwork.dto.ArtGuessResponse;
import com.comong.backend.domain.artwork.dto.ArtworkCreateRequest;
import com.comong.backend.domain.artwork.dto.ArtworkResponse;
import com.comong.backend.domain.artwork.dto.ArtworkUpdateRequest;
import com.comong.backend.domain.artwork.dto.PublicArtworkResponse;
import com.comong.backend.domain.artwork.service.ArtGuessService;
import com.comong.backend.domain.artwork.service.ArtworkService;
import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.security.JwtTokenProvider.AuthenticatedUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@Tag(name = "Artwork", description = "색칠하기 작품 API")
@RestController
@RequestMapping("/artworks")
@RequiredArgsConstructor
public class ArtworkController {

    private final ArtworkService artworkService;
    private final ArtGuessService artGuessService;

    @Operation(
            summary = "작품 저장",
            description =
                    "현재 보호자 계정의 환자 프로필 하위로 작품을 생성한다. multipart 의 request 파트에 메타데이터(JSON), image 파트에"
                            + " 이미지 파일을 담아 보낸다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "201",
                description = "생성 성공 — Location 헤더에 새 작품 URI"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "400",
                description = "메타데이터 검증 실패 (G-001) 또는 이미지 검증 실패 (S-001 INVALID_IMAGE)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "환자 프로필이 없거나 본인 소유가 아님 (P-001)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "413",
                description = "이미지 크기 한도 초과 (S-003 PAYLOAD_TOO_LARGE) — 10MB")
    })
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<ArtworkResponse>> create(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Valid @RequestPart("request") ArtworkCreateRequest request,
            @RequestPart("image") MultipartFile image) {
        ArtworkResponse response = artworkService.create(currentUser.userId(), request, image);
        URI location = URI.create("/artworks/" + response.id());
        return ResponseEntity.created(location).body(ApiResponse.success(response));
    }

    @Operation(
            summary = "그림 퀴즈 판정",
            description =
                    "아이가 그린 그림을 Claude vision 으로 제시어와 비교 판정. multipart 의 request 파트(JSON)에 prompt,"
                            + " image 파트에 PNG 를 담아 전송. 인증 불필요(게임 내 클라이언트가 직접 호출).")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "판정 완료 (source 가 fallback 이면 Claude 호출 실패 또는 비활성화)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "400",
                description = "메타데이터 검증 실패 (G-001) 또는 이미지 검증 실패 (S-001)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "413",
                description = "이미지 크기 한도 초과 (S-003) — 10MB")
    })
    @PostMapping(value = "/guess", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<ArtGuessResponse>> guess(
            @Valid @RequestPart("request") ArtGuessRequest request,
            @RequestPart("image") MultipartFile image) {
        return ResponseEntity.ok(
                ApiResponse.success(artGuessService.judge(request.prompt(), image)));
    }

    @Operation(summary = "내 작품 목록", description = "현재 사용자의 환자 프로필이 소유한 작품 목록 (최신순).")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "조회 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)")
    })
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<Page<ArtworkResponse>>> listMine(
            @AuthenticationPrincipal AuthenticatedUser currentUser, Pageable pageable) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        artworkService.findMine(
                                currentUser.userId(), withCreatedAtDesc(pageable))));
    }

    @Operation(summary = "공개 갤러리 목록", description = "is_public = true 인 작품 목록 (최신순). 비로그인 허용.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "조회 성공")
    })
    @GetMapping("/public")
    public ResponseEntity<ApiResponse<Page<PublicArtworkResponse>>> listPublic(Pageable pageable) {
        return ResponseEntity.ok(
                ApiResponse.success(artworkService.findPublic(withCreatedAtDesc(pageable))));
    }

    @Operation(
            summary = "작품 단건 조회",
            description = "공개 작품은 비로그인도 조회 가능, 비공개 작품은 작성자만. 권한 없거나 존재하지 않으면 404 (ID 노출 방지).")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "조회 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description =
                        "작품이 없거나 비공개 작품을 작성자가 아닌 사람이 조회 (AR-001) — enumeration 방지를 위해 비소유/비존재를 구분하지 않음")
    })
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ArtworkResponse>> detail(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "작품 ID", required = true) @PathVariable Long id) {
        Long userId = currentUser != null ? currentUser.userId() : null;
        return ResponseEntity.ok(ApiResponse.success(artworkService.findOne(userId, id)));
    }

    @Operation(
            summary = "작품 부분 수정",
            description =
                    "isPublic / additionalPlayDurationSeconds 부분 수정. image 파트 생략 가능. 작성자만 가능, 그 외 403.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "수정 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "400",
                description = "입력값 검증 실패 (G-001) 또는 이미지 검증 실패 (S-001)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "403",
                description = "작성자가 아님 (AR-002 ARTWORK_ACCESS_DENIED)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "작품 없음 (AR-001)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "413",
                description = "이미지 크기 한도 초과 (S-003)")
    })
    @PatchMapping(value = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<ArtworkResponse>> update(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "작품 ID (작성자 본인)", required = true) @PathVariable Long id,
            @Valid @RequestPart("request") ArtworkUpdateRequest request,
            @RequestPart(value = "image", required = false) MultipartFile image) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        artworkService.update(currentUser.userId(), id, request, image)));
    }

    @Operation(summary = "작품 삭제", description = "하드 삭제. 스토리지 파일도 함께 삭제. 작성자만 가능.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "204",
                description = "삭제 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "403",
                description = "작성자가 아님 (AR-002)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "작품 없음 (AR-001)")
    })
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "작품 ID (작성자 본인)", required = true) @PathVariable Long id) {
        artworkService.delete(currentUser.userId(), id);
        return ResponseEntity.noContent().build();
    }

    /**
     * 정렬 강제 — createdAt DESC 로 고정 (사용자 입력 sort 무시).
     *
     * <p>인덱스 (idx_artworks_user_created / idx_artworks_public_created) 를 활용하면서, 임의 컬럼 정렬로 인한 풀스캔 /
     * 정보 노출 / SQL injection 표면을 차단. 사용자 sort 필요해지면 화이트리스트 도입 시점에 풀어준다.
     */
    private Pageable withCreatedAtDesc(Pageable pageable) {
        return PageRequest.of(
                pageable.getPageNumber(),
                pageable.getPageSize(),
                Sort.by(Sort.Direction.DESC, "createdAt"));
    }
}
