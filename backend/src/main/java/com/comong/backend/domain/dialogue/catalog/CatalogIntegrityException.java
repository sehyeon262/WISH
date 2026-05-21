package com.comong.backend.domain.dialogue.catalog;

import java.util.List;

/**
 * 카탈로그 무결성 검증 실패 시 던지는 예외. 앱 부트 시점에 발생하면 fail-fast 로 기동을 막는다.
 *
 * <p>BusinessException 이 아닌 RuntimeException 으로 둔 이유는 *클라이언트에 노출될 일 없는* 운영 환경 문제이기 때문. 운영 단계에서 발생하면
 * 카탈로그 JSON 자체가 깨졌다는 뜻이라 사용자 응답이 아니라 빌드/리뷰 단계에서 잡혀야 한다.
 */
public class CatalogIntegrityException extends RuntimeException {

    public CatalogIntegrityException(List<String> issues) {
        super(formatMessage(issues));
    }

    private static String formatMessage(List<String> issues) {
        StringBuilder sb = new StringBuilder("Dialogue catalog integrity check failed:\n");
        for (String issue : issues) {
            sb.append("  - ").append(issue).append('\n');
        }
        return sb.toString();
    }
}
