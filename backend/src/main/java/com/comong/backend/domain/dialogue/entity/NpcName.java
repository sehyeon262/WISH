package com.comong.backend.domain.dialogue.entity;

import java.util.Map;
import java.util.Optional;

/**
 * 대화 상대 NPC 의 고유 이름.
 *
 * <p>{@link #YEONGCHEOL} (등대지기) 는 Claude (GMS) 로 BE 가 scene 을 생성한다. 마을 주민 6인은 BE 의 dialogue
 * 카탈로그(JSON 리소스)에서 정적 스크립트로 진행된다 (B2 부터). 카탈로그의 npcId 는 FE/디자인 친화적 이름이라 본 enum 과 직접 일치하지 않아 {@link
 * #catalogId()} 로 매핑한다.
 *
 * <p>한글 캐릭터 매핑:
 *
 * <ul>
 *   <li>{@link #YEONGCHEOL} — 등대지기 영철 (LLM)
 *   <li>{@link #JOEUN} — 간호사 토끼 → catalog: {@code nurse_bunny}
 *   <li>{@link #DAIN} — 사슴 친구 → catalog: {@code dain}
 *   <li>{@link #GEONBIN} — 잠자는 양 → catalog: {@code sleepy_sheep}
 *   <li>{@link #SEORIN} — 원숭이 친구 (코몽) → catalog: {@code monkey_friend}
 *   <li>{@link #JEONGHO} — 정원사 곰 → catalog: {@code gardener_bear}
 *   <li>{@link #SEHYEON} — 다람쥐 주민 → catalog: {@code squirrel_friend}
 * </ul>
 */
public enum NpcName {
    YEONGCHEOL,
    JOEUN,
    DAIN,
    GEONBIN,
    SEORIN,
    JEONGHO,
    SEHYEON;

    private static final Map<NpcName, String> CATALOG_IDS =
            Map.of(
                    JOEUN, "nurse_bunny",
                    DAIN, "dain",
                    GEONBIN, "sleepy_sheep",
                    SEORIN, "monkey_friend",
                    JEONGHO, "gardener_bear",
                    SEHYEON, "squirrel_friend");

    /** BE 가 scene 생성/라우팅을 책임지는 NPC 인지. 모든 NPC 가 BE-driven (B2 부터). */
    public boolean isBackendDriven() {
        return true;
    }

    /** Claude (LLM) 로 scene 을 생성하는 NPC 인지. 등대지기만. 마을 주민은 카탈로그(정적) 기반. */
    public boolean isLlmDriven() {
        return this == YEONGCHEOL;
    }

    /** 카탈로그 JSON 의 npcId. 등대지기는 카탈로그에 없으므로 {@link Optional#empty()}. */
    public Optional<String> catalogId() {
        return Optional.ofNullable(CATALOG_IDS.get(this));
    }

    /**
     * 보호자/사용자에게 보여줄 한글 표시명 fallback. 카탈로그 displayName 이 있는 NPC 는 그쪽이 우선이며, 카탈로그가 없는 등대지기(LLM)나 카탈로그
     * 미로드 시에 사용된다.
     */
    public String displayName() {
        return switch (this) {
            case YEONGCHEOL -> "등대지기 영철";
            case JOEUN -> "간호사 조은";
            case DAIN -> "다인";
            case GEONBIN -> "건빈";
            case SEORIN -> "코몽";
            case JEONGHO -> "정호";
            case SEHYEON -> "세현";
        };
    }
}
