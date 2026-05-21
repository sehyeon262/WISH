package com.comong.backend.global.config;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "cors")
public record CorsProperties(
        List<String> allowedOrigins,
        List<String> allowedOriginPatterns,
        List<String> allowedMethods,
        List<String> allowedHeaders,
        List<String> exposedHeaders,
        Boolean allowCredentials,
        Long maxAge) {

    public CorsProperties {
        allowedOrigins = normalize(allowedOrigins);
        allowedOriginPatterns = normalize(allowedOriginPatterns);
        allowedMethods =
                normalizeOrDefault(
                        allowedMethods,
                        List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        allowedHeaders = normalizeOrDefault(allowedHeaders, List.of("*"));
        exposedHeaders = normalize(exposedHeaders);
        allowCredentials = allowCredentials != null && allowCredentials;
        maxAge = maxAge != null ? maxAge : 3600L;
    }

    private static List<String> normalize(List<String> values) {
        if (values == null) {
            return List.of();
        }
        return values.stream()
                .filter(value -> value != null && !value.isBlank())
                .map(String::trim)
                .toList();
    }

    private static List<String> normalizeOrDefault(List<String> values, List<String> defaults) {
        List<String> normalized = normalize(values);
        return normalized.isEmpty() ? defaults : normalized;
    }
}
