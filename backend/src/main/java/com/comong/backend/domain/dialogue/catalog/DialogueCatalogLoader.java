package com.comong.backend.domain.dialogue.catalog;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Objects;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

import com.comong.backend.domain.dialogue.catalog.model.DialogueChoiceCatalog;

import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.ObjectMapper;

/**
 * 앱 시작 시 {@code dialogue/choice-catalog.json} 을 메모리에 로드 + 무결성 검증을 수행하는 컴포넌트.
 *
 * <p>검증 실패 시 {@link CatalogIntegrityException} 으로 부트 자체를 막는다 (fail-fast). 운영 단계에서 깨진 카탈로그가 절대 떠 있지
 * 않도록.
 *
 * <p>로드된 카탈로그는 immutable 하게 보관되며 {@link DialogueCatalogService} 가 조회용으로 가져간다.
 */
@Component
@Slf4j
public class DialogueCatalogLoader {

    private final DialogueChoiceCatalog catalog;

    public DialogueCatalogLoader(
            ResourceLoader resourceLoader,
            ObjectMapper objectMapper,
            @Value("${dialogue.catalog.location:classpath:dialogue/choice-catalog.json}")
                    String location) {
        Objects.requireNonNull(resourceLoader, "resourceLoader must not be null");
        Objects.requireNonNull(objectMapper, "objectMapper must not be null");
        this.catalog = load(resourceLoader, objectMapper, location);
        log.info(
                "Loaded dialogue catalog from {}: {} npcs, {} scripts, {} choices",
                location,
                this.catalog.npcs().size(),
                this.catalog.scripts().size(),
                this.catalog.choices().size());
    }

    public DialogueChoiceCatalog getCatalog() {
        return catalog;
    }

    private static DialogueChoiceCatalog load(
            ResourceLoader resourceLoader, ObjectMapper objectMapper, String location) {
        Resource resource = resourceLoader.getResource(location);
        if (!resource.exists()) {
            throw new IllegalStateException("Dialogue catalog resource not found at: " + location);
        }
        DialogueChoiceCatalog parsed;
        try (InputStream in = resource.getInputStream()) {
            parsed = objectMapper.readValue(in, DialogueChoiceCatalog.class);
        } catch (IOException | RuntimeException e) {
            throw new IllegalStateException("Failed to parse dialogue catalog at " + location, e);
        }

        List<String> issues = new DialogueCatalogIntegrityValidator(parsed).validate();
        if (!issues.isEmpty()) {
            throw new CatalogIntegrityException(issues);
        }
        return parsed;
    }
}
