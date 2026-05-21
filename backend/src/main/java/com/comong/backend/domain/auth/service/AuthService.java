package com.comong.backend.domain.auth.service;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.auth.dto.LoginRequest;
import com.comong.backend.domain.auth.dto.SignupRequest;
import com.comong.backend.domain.auth.dto.TokenResponse;
import com.comong.backend.domain.auth.exception.AuthErrorCode;
import com.comong.backend.domain.auth.service.RefreshTokenService.IssuedToken;
import com.comong.backend.domain.auth.service.RefreshTokenService.RotationResult;
import com.comong.backend.domain.user.dto.UserResponse;
import com.comong.backend.domain.user.entity.User;
import com.comong.backend.domain.user.service.UserService;
import com.comong.backend.global.exception.BusinessException;
import com.comong.backend.global.security.JwtTokenProvider;

import lombok.RequiredArgsConstructor;

/**
 * 인증 유스케이스 (회원가입/로그인/리프레시). User 도메인과는 service 레이어로 의존 (컨벤션 준수).
 *
 * <p>로그인 실패 시 "이메일 없음" 과 "비밀번호 불일치" 를 구분하지 않고 동일한 {@link AuthErrorCode#INVALID_CREDENTIALS} 로 응답 —
 * 계정 enumeration 방지.
 *
 * <p>리프레시 흐름 (S14P31E103-780): 로그인 응답에 refresh token 동봉 → FE 가 access 만료 시 {@link #refresh(String)}
 * 호출 → 새 access + 회전된 refresh 발급. 이미 폐기된 refresh 재사용은 401 + 같은 user 전체 폐기 (탈취 시그널 차단).
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AuthService {

    private final UserService userService;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final RefreshTokenService refreshTokenService;

    /** 회원가입. 비밀번호는 이곳에서 해시한 뒤 UserService 로 넘긴다. */
    @Transactional
    public UserResponse signup(SignupRequest request) {
        String encodedPassword = passwordEncoder.encode(request.password());
        return userService.create(request.email(), request.nickname(), encodedPassword);
    }

    @Transactional
    public TokenResponse login(LoginRequest request) {
        User user =
                userService
                        .findEntityByEmail(request.email())
                        .orElseThrow(
                                () -> new BusinessException(AuthErrorCode.INVALID_CREDENTIALS));
        if (!passwordEncoder.matches(request.password(), user.getPassword())) {
            throw new BusinessException(AuthErrorCode.INVALID_CREDENTIALS);
        }
        return issueTokens(user);
    }

    /**
     * Refresh token 평문을 받아 새 access + 회전된 refresh 를 발급한다. 토큰이 폐기/만료/위조면 401, 재사용 감지 시 같은 user 의 모든
     * 활성 refresh 가 함께 폐기된다.
     */
    @Transactional
    public TokenResponse refresh(String refreshTokenPlaintext) {
        RotationResult rotation = refreshTokenService.rotate(refreshTokenPlaintext);
        User user =
                userService
                        .findEntityById(rotation.userId())
                        // 사용자 삭제 → CASCADE 로 refresh 도 함께 삭제되므로 도달 불가. 방어 차원.
                        .orElseThrow(
                                () -> new BusinessException(AuthErrorCode.INVALID_REFRESH_TOKEN));
        String accessToken =
                jwtTokenProvider.createAccessToken(user.getId(), user.getEmail(), user.getRole());
        return TokenResponse.of(
                accessToken,
                rotation.refreshToken().plaintext(),
                jwtTokenProvider.getAccessTokenTtlSeconds(),
                rotation.refreshToken().expiresInSeconds());
    }

    private TokenResponse issueTokens(User user) {
        String accessToken =
                jwtTokenProvider.createAccessToken(user.getId(), user.getEmail(), user.getRole());
        IssuedToken refresh = refreshTokenService.issue(user.getId());
        return TokenResponse.of(
                accessToken,
                refresh.plaintext(),
                jwtTokenProvider.getAccessTokenTtlSeconds(),
                refresh.expiresInSeconds());
    }
}
