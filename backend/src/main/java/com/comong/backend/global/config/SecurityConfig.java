package com.comong.backend.global.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.util.matcher.RegexRequestMatcher;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import com.comong.backend.global.security.JwtAuthenticationFilter;
import com.comong.backend.global.security.JwtProperties;
import com.comong.backend.global.security.RestAccessDeniedHandler;
import com.comong.backend.global.security.RestAuthenticationEntryPoint;
import com.comong.backend.global.storage.StorageProperties;

import lombok.RequiredArgsConstructor;

/**
 * 인증/인가 설정.
 *
 * <p>원칙: Stateless JWT 기반, 세션/CSRF/formLogin/httpBasic 모두 비활성. 공개 엔드포인트 외 전부 인증 필요.
 *
 * <p>스토리지 prefix ({@link StorageProperties.Local#publicUrlPrefix()}) 는 {@code
 * STORAGE_PUBLIC_URL_PREFIX} 환경변수로 운영에서 변경 가능하므로 하드코딩하지 않고 런타임에 합쳐넣는다 — 그래야 정적 핸들러 매핑과 Security
 * permit 이 같은 source of truth 를 공유한다. {@code storage.type=s3} 환경에서는 로컬 정적 핸들러 자체가 비활성화되므로 prefix
 * permit 도 추가되지 않는다 (S14P31E103-490).
 */
@Configuration
@RequiredArgsConstructor
@EnableMethodSecurity
@EnableConfigurationProperties({JwtProperties.class, CorsProperties.class})
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final RestAuthenticationEntryPoint authenticationEntryPoint;
    private final RestAccessDeniedHandler accessDeniedHandler;
    private final StorageProperties storageProperties;
    private final CorsProperties corsProperties;

    /**
     * 인증/문서/헬스체크 관련 정적 공개 엔드포인트. 동적으로 합쳐지는 항목 (스토리지 prefix) 은 {@link
     * #securityFilterChain(HttpSecurity)} 에서 추가된다.
     *
     * <p>스토리지 prefix 는 로컬 업로드 이미지를 정적 리소스로 서빙하는 경로 (S14P31E103-217). 현재 정책은 "URL 만 알면 누구나 접근 가능" —
     * UUID 기반 파일명으로 추측을 어렵게 했으나 비공개 작품 이미지에 대한 권한 체크는 없다. S14P31E103-218/219 작업 시 인증된 컨트롤러로 다운로드
     * 경로를 분리하면 이 동적 추가도 제거한다.
     */
    private static final String[] STATIC_PUBLIC_ENDPOINTS = {
        "/auth/**",
        "/actuator/health",
        "/actuator/prometheus",
        "/v3/api-docs/**",
        "/swagger-ui.html",
        "/swagger-ui/**"
    };

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(corsProperties.allowedOrigins());
        configuration.setAllowedOriginPatterns(corsProperties.allowedOriginPatterns());
        configuration.setAllowedMethods(corsProperties.allowedMethods());
        configuration.setAllowedHeaders(corsProperties.allowedHeaders());
        configuration.setExposedHeaders(corsProperties.exposedHeaders());
        configuration.setAllowCredentials(corsProperties.allowCredentials());
        configuration.setMaxAge(corsProperties.maxAge());

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        // storage.type=s3 환경에서는 storage.local 자체가 null 일 수 있다 (로컬 정적 핸들러도 비활성).
        // 그 경우 storage prefix permit 자체가 의미 없으므로 정적 엔드포인트만 노출한다.
        StorageProperties.Local local = storageProperties.local();
        String[] localPublicUploadPatterns =
                local == null
                        ? new String[0]
                        : new String[] {stripTrailingSlash(local.publicUrlPrefix()) + "/**"};

        http.csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(
                        auth ->
                                auth
                                        // 1. 인증/문서/헬스체크 — 모든 메서드 허용
                                        .requestMatchers(STATIC_PUBLIC_ENDPOINTS)
                                        .permitAll()
                                        // 1-1. 로컬 스토리지 정적 서빙 — 조회 메서드만 공개
                                        .requestMatchers(HttpMethod.GET, localPublicUploadPatterns)
                                        .permitAll()
                                        .requestMatchers(HttpMethod.HEAD, localPublicUploadPatterns)
                                        .permitAll()
                                        // 2. 공개 갤러리 (목록/상세 분리 안 하고 GET 만 허용)
                                        .requestMatchers(
                                                HttpMethod.GET,
                                                "/artworks/public",
                                                "/artworks/public/**",
                                                "/photo-booths/public",
                                                "/photo-booths/public/**")
                                        .permitAll()
                                        // 3. /me 는 본인 컨텐츠만이라 인증 필수 (밑의 catch 보다 먼저 매칭)
                                        .requestMatchers(
                                                HttpMethod.GET, "/artworks/me", "/photo-booths/me")
                                        .authenticated()
                                        // 4. GET /artworks/{id}, /photo-booths/{id} — 비공개는 service
                                        //    레이어 AccessChecker.verifyReadable 가 담당.
                                        //    비로그인 (anonymous) 접근 허용해서 공개 컨텐츠 상세를 외부 공유 가능.
                                        //    숫자 ID 만 매칭하도록 정규식으로 제한 — 미래에 /artworks/something
                                        //    같은 임의 segment 가 추가돼도 의도치 않게 permitAll 에 포함되지 않음.
                                        .requestMatchers(
                                                RegexRequestMatcher.regexMatcher(
                                                        HttpMethod.GET, "/artworks/\\d+"))
                                        .permitAll()
                                        .requestMatchers(
                                                RegexRequestMatcher.regexMatcher(
                                                        HttpMethod.GET, "/photo-booths/\\d+"))
                                        .permitAll()
                                        // 5. 마을 광장 WebSocket 핸드셰이크 — HTTP 단계는 permit.
                                        //    실제 인증은 STOMP CONNECT 프레임의 ChannelInterceptor 가 수행
                                        //    (VillageStompAuthInterceptor). S14P31E103-714.
                                        .requestMatchers("/ws/village", "/ws/village/**")
                                        .permitAll()
                                        // 5-1. 그림 퀴즈 멀티플레이 WebSocket 핸드셰이크 — 마을과 동일 정책.
                                        //      JWT 검증은 STOMP CONNECT 단계 (S14P31E103-820).
                                        .requestMatchers("/ws/quiz", "/ws/quiz/**")
                                        .permitAll()
                                        // 6. 그 외 모든 요청 (POST/PATCH/DELETE on artworks 포함) — 인증 필수
                                        .anyRequest()
                                        .authenticated())
                .exceptionHandling(
                        e ->
                                e.authenticationEntryPoint(authenticationEntryPoint)
                                        .accessDeniedHandler(accessDeniedHandler))
                .addFilterBefore(
                        jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    private static String stripTrailingSlash(String s) {
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }
}
