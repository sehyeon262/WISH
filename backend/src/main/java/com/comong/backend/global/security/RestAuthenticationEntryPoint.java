package com.comong.backend.global.security;

import java.io.IOException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.exception.GlobalErrorCode;

import lombok.RequiredArgsConstructor;
import tools.jackson.databind.ObjectMapper;

/** 인증 실패 시 {@link ApiResponse} 포맷으로 401 을 반환한다. Spring Security 기본 동작(리다이렉트/HTML) 대신 JSON 으로 통일. */
@Component
@RequiredArgsConstructor
public class RestAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private final ObjectMapper objectMapper;

    @Override
    public void commence(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException authException)
            throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        ApiResponse<Void> body = ApiResponse.error(GlobalErrorCode.UNAUTHORIZED);
        objectMapper.writeValue(response.getWriter(), body);
    }
}
