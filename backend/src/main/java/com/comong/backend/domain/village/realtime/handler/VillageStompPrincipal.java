package com.comong.backend.domain.village.realtime.handler;

import java.security.Principal;

import com.comong.backend.domain.user.entity.UserRole;

/**
 * 마을 광장 STOMP 세션의 Principal. {@code accessor.getUser()} 로 핸들러가 꺼내 쓴다.
 *
 * <p>{@link Principal#getName()} 은 userId 문자열을 반환 — Spring 의 {@code /user/queue/...} 라우팅이 이 이름을
 * 사용하므로 사용자 식별자로 충분히 unique 한 값을 돌려준다. role/email 은 후속 권한 분기 시 활용.
 */
public record VillageStompPrincipal(Long userId, String email, UserRole role) implements Principal {

    @Override
    public String getName() {
        return String.valueOf(userId);
    }
}
