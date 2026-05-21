package com.comong.backend.domain.artwork.service;

import java.io.IOException;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.comong.backend.domain.artwork.dto.ArtGuessResponse;
import com.comong.backend.global.exception.BusinessException;
import com.comong.backend.global.storage.StorageErrorCode;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * 그림 퀴즈 판정 유스케이스. multipart 이미지를 받아 {@link ArtGuessClient} 로 판정 위임, 실패 시 fallback 응답.
 *
 * <p>저장은 별도 {@link ArtworkService#create} 엔드포인트(/artworks) 가 담당 — 본 서비스는 stateless 판정만.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ArtGuessService {

    private static final long MAX_IMAGE_BYTES = 10L * 1024 * 1024; // 10MB — 작품 저장과 동일 한도
    private static final String DEFAULT_MEDIA_TYPE = "image/png";

    private final ArtGuessClient client;

    public ArtGuessResponse judge(String prompt, MultipartFile imageFile) {
        validateImage(imageFile);

        byte[] bytes;
        try {
            bytes = imageFile.getBytes();
        } catch (IOException e) {
            throw new BusinessException(StorageErrorCode.INVALID_IMAGE);
        }
        String mediaType =
                imageFile.getContentType() != null && !imageFile.getContentType().isBlank()
                        ? imageFile.getContentType()
                        : DEFAULT_MEDIA_TYPE;

        return client.guess(prompt, bytes, mediaType)
                .map(
                        result ->
                                new ArtGuessResponse(
                                        result.isMatch(),
                                        result.guess(),
                                        result.confidence(),
                                        ArtGuessResponse.Source.CLAUDE))
                .orElseGet(() -> fallbackResponse(prompt));
    }

    private void validateImage(MultipartFile imageFile) {
        if (imageFile == null || imageFile.isEmpty()) {
            throw new BusinessException(StorageErrorCode.INVALID_IMAGE);
        }
        if (imageFile.getSize() > MAX_IMAGE_BYTES) {
            throw new BusinessException(StorageErrorCode.PAYLOAD_TOO_LARGE);
        }
    }

    /**
     * GMS 키 미설정 또는 외부 호출 실패 시의 응답. AI 판정을 받지 못한 케이스 — 아이의 의욕이 꺾이지 않게 isMatch=true 로 너그럽게 인정해주고,
     * source=FALLBACK 로 FE 가 구분할 수 있게 함.
     */
    private ArtGuessResponse fallbackResponse(String prompt) {
        log.info("Claude vision 사용 불가 — fallback 응답 반환 (prompt={})", prompt);
        return new ArtGuessResponse(true, prompt, 0.5, ArtGuessResponse.Source.FALLBACK);
    }
}
