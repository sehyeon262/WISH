package com.comong.backend.domain.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 보호자에게 전송할 안내 메시지 요청. MVP 단계에서는 실제 전송 채널(이메일/푸시)을 붙이지 않고 "전송 의도 + 운영자 식별 + 환자 식별" 만 서버 로그로 흘려 발표
 * 데모 및 자소서 소재로 사용한다. 향후 채널 연동 시 본 DTO 를 그대로 사용한다.
 *
 * <p>type 은 자유로운 라벨이 아니라 운영 정책상 정의된 카테고리만 허용한다 — {@code RISK}(이탈 위험 환자), {@code CONTENT_SKEW}(콘텐츠
 * 편중), {@code CHECK_IN}(일반 안내). FE 가 전달하는 type 을 그대로 받되 검증은 서비스 레이어에서 한다.
 */
public record GuardianNotificationRequest(
        @NotNull Long patientId,
        @NotBlank @Size(max = 32) String type,
        @NotBlank @Size(max = 500) String message) {}
