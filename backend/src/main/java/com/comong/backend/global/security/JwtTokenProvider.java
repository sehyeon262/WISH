package com.comong.backend.global.security;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;

import javax.crypto.SecretKey;

import org.springframework.stereotype.Component;

import com.comong.backend.domain.user.entity.UserRole;

import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

/**
 * JWT 생성 / 파싱 유틸.
 *
 * <p>subject 에 userId (Long) 를 문자열로 넣고, 커스텀 claim {@code email} / {@code role} 을 함께 넣는다. access 토큰만
 * 발급하며, refresh 토큰은 추후 이슈에서 확장 예정.
 */
@Component
public class JwtTokenProvider {

    private final JwtProperties properties;
    private final SecretKey key;

    public JwtTokenProvider(JwtProperties properties) {
        this.properties = properties;
        this.key = Keys.hmacShaKeyFor(properties.secret().getBytes(StandardCharsets.UTF_8));
    }

    public String createAccessToken(Long userId, String email, UserRole role) {
        Instant now = Instant.now();
        Instant expiry = now.plusSeconds(properties.accessTokenTtlSeconds());
        return Jwts.builder()
                .issuer(properties.issuer())
                .subject(String.valueOf(userId))
                .claim("email", email)
                .claim("role", role.name())
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiry))
                .signWith(key)
                .compact();
    }

    public long getAccessTokenTtlSeconds() {
        return properties.accessTokenTtlSeconds();
    }

    /**
     * 토큰 파싱. 만료/위변조 시 해당 예외를 던져 호출자(필터)가 에러코드로 변환하도록 한다.
     *
     * <p>role claim 이 없는 구토큰(이번 변경 이전 발급분)은 {@link UserRole#USER} 로 fallback — 토큰 TTL(1시간)이 지나면
     * 자연스럽게 모두 role 이 박힌 신토큰으로 교체된다.
     *
     * @throws ExpiredJwtException 만료
     * @throws JwtException 서명 불일치 / 형식 오류 등
     */
    public AuthenticatedUser parse(String token) {
        var claims = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
        Long userId = Long.valueOf(claims.getSubject());
        String email = claims.get("email", String.class);
        String roleName = claims.get("role", String.class);
        UserRole role = roleName != null ? UserRole.valueOf(roleName) : UserRole.USER;
        return new AuthenticatedUser(userId, email, role);
    }

    /** 인증된 사용자 정보. SecurityContext 의 principal 로 사용된다. */
    public record AuthenticatedUser(Long userId, String email, UserRole role) {}
}
