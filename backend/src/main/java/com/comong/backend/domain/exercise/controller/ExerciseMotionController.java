package com.comong.backend.domain.exercise.controller;

import java.net.URI;
import java.util.List;

import jakarta.validation.Valid;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.comong.backend.domain.exercise.dto.ExerciseMotionCreateRequest;
import com.comong.backend.domain.exercise.dto.ExerciseMotionReorderRequest;
import com.comong.backend.domain.exercise.dto.ExerciseMotionResponse;
import com.comong.backend.domain.exercise.dto.ExerciseMotionUpdateRequest;
import com.comong.backend.domain.exercise.entity.ExerciseType;
import com.comong.backend.domain.exercise.service.ExerciseMotionService;
import com.comong.backend.global.common.response.ApiResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@Tag(name = "Exercise Motion", description = "체조 동작 조회 및 관리자 API")
@RestController
@RequestMapping("/exercise-motions")
@RequiredArgsConstructor
public class ExerciseMotionController {

    private final ExerciseMotionService exerciseMotionService;

    @Operation(summary = "체조 동작 목록 조회", description = "체조 타입별 동작을 루틴 순서 오름차순으로 조회한다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "조회 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "400",
                description = "exerciseType enum 값이 유효하지 않음 (G-001)")
    })
    @GetMapping
    public ResponseEntity<ApiResponse<List<ExerciseMotionResponse>>> list(
            @Parameter(description = "체조 타입 (enum)", required = true) @RequestParam
                    ExerciseType exerciseType) {
        return ResponseEntity.ok(
                ApiResponse.success(exerciseMotionService.findAllByExerciseType(exerciseType)));
    }

    @Operation(summary = "체조 동작 상세 조회", description = "체조 동작 마스터 데이터를 단건 조회한다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "조회 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "체조 동작 없음 (EX-001)")
    })
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ExerciseMotionResponse>> detail(
            @Parameter(description = "체조 동작 ID", required = true) @PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(exerciseMotionService.findOne(id)));
    }

    @Operation(
            summary = "체조 동작 등록",
            description =
                    "ADMIN 권한으로 체조 동작 마스터 데이터를 등록한다. multipart 의 request 파트에 메타데이터(JSON), thumbnail /"
                            + " demoVideo 파트에 각각 이미지/영상 파일을 담는다 (둘 다 선택).")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "201",
                description = "생성 성공 — Location 헤더에 새 동작 URI"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "400",
                description = "메타데이터 검증 실패 (G-001), 이미지 검증 실패 (S-001) 또는 영상 검증 실패 (S-004)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "403",
                description = "ADMIN 권한 부족 (G-004)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "409",
                description = "같은 체조 타입에 이미 등록된 routineOrder (EX-002)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "413",
                description = "이미지(10MB) 또는 영상(100MB) 한도 초과 (S-003)")
    })
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<ExerciseMotionResponse>> create(
            @Valid @RequestPart("request") ExerciseMotionCreateRequest request,
            @RequestPart(value = "thumbnail", required = false) MultipartFile thumbnail,
            @RequestPart(value = "demoVideo", required = false) MultipartFile demoVideo) {
        ExerciseMotionResponse response =
                exerciseMotionService.create(request, thumbnail, demoVideo);
        URI location = URI.create("/exercise-motions/" + response.id());
        return ResponseEntity.created(location).body(ApiResponse.success(response));
    }

    @Operation(
            summary = "체조 동작 순서 변경",
            description = "ADMIN 권한으로 체조 타입별 동작 ID 전체 목록을 원하는 순서로 보내 루틴 순서를 재정렬한다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "재정렬 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "400",
                description = "입력값 검증 실패 (G-001) 또는 보낸 동작 목록이 현재 목록과 일치하지 않음 (EX-006)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "403",
                description = "ADMIN 권한 부족 (G-004)")
    })
    @PreAuthorize("hasRole('ADMIN')")
    @PatchMapping("/reorder")
    public ResponseEntity<ApiResponse<List<ExerciseMotionResponse>>> reorder(
            @Valid @RequestBody ExerciseMotionReorderRequest request) {
        return ResponseEntity.ok(ApiResponse.success(exerciseMotionService.reorder(request)));
    }

    @Operation(
            summary = "체조 동작 수정",
            description =
                    "ADMIN 권한으로 체조 동작 마스터 데이터를 수정한다. 메타데이터는 request 파트(JSON), 미디어 교체는 thumbnail /"
                            + " demoVideo 파트(생략 가능). 미디어를 명시적으로 제거하려면 request 안에 clearThumbnail /"
                            + " clearDemoVideo 플래그를 true 로 보낸다 (해당 파일 part 가 없을 때만 효과).")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "수정 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "400",
                description = "메타데이터 검증 실패 (G-001), 이미지 검증 실패 (S-001) 또는 영상 검증 실패 (S-004)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "403",
                description = "ADMIN 권한 부족 (G-004)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "체조 동작 없음 (EX-001)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "409",
                description = "같은 체조 타입에 이미 등록된 routineOrder (EX-002)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "413",
                description = "이미지/영상 한도 초과 (S-003)")
    })
    @PreAuthorize("hasRole('ADMIN')")
    @PatchMapping(value = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<ExerciseMotionResponse>> update(
            @Parameter(description = "체조 동작 ID", required = true) @PathVariable Long id,
            @Valid @RequestPart("request") ExerciseMotionUpdateRequest request,
            @RequestPart(value = "thumbnail", required = false) MultipartFile thumbnail,
            @RequestPart(value = "demoVideo", required = false) MultipartFile demoVideo) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        exerciseMotionService.update(id, request, thumbnail, demoVideo)));
    }

    @Operation(
            summary = "체조 동작 삭제",
            description = "ADMIN 권한으로 아직 수행 기록에서 사용되지 않은 체조 동작을 삭제한다. 연관 미디어(썸네일/영상)도 함께 정리된다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "204",
                description = "삭제 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "403",
                description = "ADMIN 권한 부족 (G-004)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "체조 동작 없음 (EX-001)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "409",
                description = "수행 기록에서 사용 중 (EX-003)")
    })
    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @Parameter(description = "체조 동작 ID", required = true) @PathVariable Long id) {
        exerciseMotionService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
