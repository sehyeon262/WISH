package com.comong.backend.global.security;

import java.io.IOException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.exception.GlobalErrorCode;

import lombok.RequiredArgsConstructor;
import tools.jackson.databind.ObjectMapper;

/** 인가 실패(403) 시 {@link ApiResponse} 포맷으로 응답. */
@Component
@RequiredArgsConstructor
public class RestAccessDeniedHandler implements AccessDeniedHandler {

    private final ObjectMapper objectMapper;

    @Override
    public void handle(
            HttpServletRequest request,
            HttpServletResponse response,
            AccessDeniedException accessDeniedException)
            throws IOException {
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        ApiResponse<Void> body = ApiResponse.error(GlobalErrorCode.FORBIDDEN);
        objectMapper.writeValue(response.getWriter(), body);
    }
}
