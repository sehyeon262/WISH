package com.comong.backend.domain.realtime.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.realtime.exception.RealtimeErrorCode;
import com.comong.backend.domain.usage.entity.LoginSession;
import com.comong.backend.domain.usage.service.LoginSessionService;
import com.comong.backend.global.exception.BusinessException;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RealtimeLoginSessionAccessService {

    private final LoginSessionService loginSessionService;

    public LoginSession findActiveOwnedSession(Long userId, Long loginSessionId) {
        LoginSession session = loginSessionService.findOwnedOrThrow(userId, loginSessionId);
        if (session.isEnded()) {
            throw new BusinessException(RealtimeErrorCode.LOGIN_SESSION_ALREADY_ENDED);
        }
        return session;
    }
}
