package com.comong.backend.domain.realtime.service;

import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.realtime.dto.ActiveLiveSessionResponse;
import com.comong.backend.domain.usage.entity.LoginSession;
import com.comong.backend.domain.usage.service.LoginSessionService;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RealtimeActiveSessionService {

    private final LoginSessionService loginSessionService;
    private final RealtimeContentStateService realtimeContentStateService;

    public Optional<ActiveLiveSessionResponse> findActiveSession(Long userId) {
        return loginSessionService.findLatestActiveOwned(userId).map(this::toResponse);
    }

    private ActiveLiveSessionResponse toResponse(LoginSession session) {
        return ActiveLiveSessionResponse.from(
                session, realtimeContentStateService.find(session.getId()));
    }
}
