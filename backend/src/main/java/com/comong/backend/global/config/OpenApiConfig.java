package com.comong.backend.global.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;

@Configuration
public class OpenApiConfig {

    private static final String BEARER_SCHEME = "bearerAuth";

    // server URL 은 명시하지 않는다. 명시하는 순간 springdoc 가 요청 URL 기반 추론을 끄기 때문에
    // dev (nginx 가 X-Forwarded-Prefix=/dev/api/v1 을 넘김) 에서 prefix 가 누락되어 404 가 난다.
    // forward-headers-strategy=framework 와 함께 자동 추론에 맡긴다.
    @Bean
    public OpenAPI comongOpenAPI() {
        return new OpenAPI()
                .info(
                        new Info()
                                .title("Comong API")
                                .description("Comong 게임 서비스 백엔드 API 명세")
                                .version("v0.0.1"))
                .addSecurityItem(new SecurityRequirement().addList(BEARER_SCHEME))
                .components(
                        new Components()
                                .addSecuritySchemes(
                                        BEARER_SCHEME,
                                        new SecurityScheme()
                                                .type(SecurityScheme.Type.HTTP)
                                                .scheme("bearer")
                                                .bearerFormat("JWT")
                                                .description("로그인 후 발급받은 access 토큰을 입력하세요.")));
    }
}
