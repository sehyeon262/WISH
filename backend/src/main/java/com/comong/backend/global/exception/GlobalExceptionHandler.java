package com.comong.backend.global.exception;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.authorization.AuthorizationDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.storage.StorageErrorCode;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusinessException(BusinessException e) {
        ErrorCode errorCode = e.getErrorCode();
        log.warn("BusinessException: {} - {}", errorCode.getCode(), errorCode.getMessage());
        return ResponseEntity.status(errorCode.getStatus()).body(ApiResponse.error(errorCode));
    }

    @ExceptionHandler(AuthorizationDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handleAuthorizationDenied(
            AuthorizationDeniedException e) {
        log.warn("AuthorizationDeniedException: {}", e.getMessage());
        return ResponseEntity.status(GlobalErrorCode.FORBIDDEN.getStatus())
                .body(ApiResponse.error(GlobalErrorCode.FORBIDDEN));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidationException(
            MethodArgumentNotValidException e) {
        Map<String, String> fieldErrors = new LinkedHashMap<>();
        e.getBindingResult()
                .getFieldErrors()
                .forEach(
                        fe ->
                                fieldErrors.merge(
                                        fe.getField(),
                                        fe.getDefaultMessage(),
                                        (existing, next) -> existing + "; " + next));
        log.warn("ValidationException: {}", fieldErrors);
        return ResponseEntity.status(GlobalErrorCode.INVALID_INPUT.getStatus())
                .body(ApiResponse.error(GlobalErrorCode.INVALID_INPUT, fieldErrors));
    }

    /**
     * multipart 요청에서 필수 파트(@RequestPart)가 빠졌을 때. 클라이언트 책임 400 — catch-all (Exception) 의 500 으로 빠지지
     * 않도록 별도 매핑.
     */
    @ExceptionHandler(MissingServletRequestPartException.class)
    public ResponseEntity<ApiResponse<Void>> handleMissingPart(
            MissingServletRequestPartException e) {
        log.warn("multipart 필수 파트 누락: {}", e.getRequestPartName());
        return ResponseEntity.status(GlobalErrorCode.INVALID_INPUT.getStatus())
                .body(ApiResponse.error(GlobalErrorCode.INVALID_INPUT));
    }

    /** 쿼리/폼 필수 파라미터 누락도 같은 카테고리(클라이언트 책임)이라 400 으로 매핑. */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiResponse<Void>> handleMissingParam(
            MissingServletRequestParameterException e) {
        log.warn("필수 요청 파라미터 누락: {}", e.getParameterName());
        return ResponseEntity.status(GlobalErrorCode.INVALID_INPUT.getStatus())
                .body(ApiResponse.error(GlobalErrorCode.INVALID_INPUT));
    }

    /**
     * multipart 파싱 실패 (잘못된 boundary, 깨진 form-data 등). MaxUploadSizeExceededException 도 본 타입의 자식이라
     * MaxUploadSizeExceededException 핸들러가 우선 매칭되도록 메서드 시그니처 분리. 그 외 모든 multipart 파싱 오류는 클라이언트 입력
     * 문제로 보고 400.
     */
    @ExceptionHandler(MultipartException.class)
    public ResponseEntity<ApiResponse<Void>> handleMultipart(MultipartException e) {
        log.warn("multipart 파싱 실패: {}", e.getMessage());
        return ResponseEntity.status(GlobalErrorCode.INVALID_INPUT.getStatus())
                .body(ApiResponse.error(GlobalErrorCode.INVALID_INPUT));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiResponse<Void>> handleMaxUploadSizeExceeded(
            MaxUploadSizeExceededException e) {
        // cause (SizeLimitExceededException 등) 추적용으로 스택 트레이스 함께 출력.
        // 운영 트래픽이 늘어 로그 노이즈가 되면 sampling 또는 message-only 로 다운그레이드 검토.
        log.warn("multipart 한도 초과: {}", e.getMessage(), e);
        return ResponseEntity.status(StorageErrorCode.PAYLOAD_TOO_LARGE.getStatus())
                .body(ApiResponse.error(StorageErrorCode.PAYLOAD_TOO_LARGE));
    }

    @ExceptionHandler({NoHandlerFoundException.class, NoResourceFoundException.class})
    public ResponseEntity<ApiResponse<Void>> handleNotFound(Exception e) {
        log.warn("No resource found: {}", e.getMessage());
        return ResponseEntity.status(GlobalErrorCode.NOT_FOUND.getStatus())
                .body(ApiResponse.error(GlobalErrorCode.NOT_FOUND));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnexpectedException(Exception e) {
        log.error("Unhandled exception", e);
        return ResponseEntity.status(GlobalErrorCode.INTERNAL_SERVER_ERROR.getStatus())
                .body(ApiResponse.error(GlobalErrorCode.INTERNAL_SERVER_ERROR));
    }
}
