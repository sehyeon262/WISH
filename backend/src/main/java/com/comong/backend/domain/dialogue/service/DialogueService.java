package com.comong.backend.domain.dialogue.service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.criteria.Predicate;

import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.comong.backend.domain.dialogue.catalog.DialogueCatalogService;
import com.comong.backend.domain.dialogue.catalog.model.ChoiceDefinition;
import com.comong.backend.domain.dialogue.dto.FinishSessionRequest;
import com.comong.backend.domain.dialogue.dto.FinishSessionResponse;
import com.comong.backend.domain.dialogue.dto.GuardianSessionListItemResponse;
import com.comong.backend.domain.dialogue.dto.SceneResponse;
import com.comong.backend.domain.dialogue.dto.SelectedChoiceRequest;
import com.comong.backend.domain.dialogue.dto.SessionDetailResponse;
import com.comong.backend.domain.dialogue.dto.StartSessionRequest;
import com.comong.backend.domain.dialogue.dto.StartSessionResponse;
import com.comong.backend.domain.dialogue.dto.SubmitTurnRequest;
import com.comong.backend.domain.dialogue.dto.SubmitTurnResponse;
import com.comong.backend.domain.dialogue.entity.DialogueSession;
import com.comong.backend.domain.dialogue.entity.DialogueStatus;
import com.comong.backend.domain.dialogue.entity.DialogueTurn;
import com.comong.backend.domain.dialogue.entity.DialogueTurnGeneratedBy;
import com.comong.backend.domain.dialogue.entity.NpcName;
import com.comong.backend.domain.dialogue.exception.DialogueErrorCode;
import com.comong.backend.domain.dialogue.repository.DialogueSessionRepository;
import com.comong.backend.domain.dialogue.repository.DialogueTurnRepository;
import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.service.PatientProfileService;
import com.comong.backend.global.exception.BusinessException;
import com.comong.backend.global.exception.GlobalErrorCode;

import lombok.RequiredArgsConstructor;

/**
 * NPC 대화 세션 유스케이스 (시작 / 턴 처리 / 종료 / 조회).
 *
 * <p>책임 분리: 등대지기(YEONGCHEOL)는 BE 가 scene 생성·라우팅·closingLines 를 모두 책임진다 (현재는 fallback tree, 558 에서
 * Claude 분기 추가). 마을 주민 6인은 FE 가 정적 스크립트(질문/선택지/다음 scene/closingLines)를 보유하며 BE 는 turn raw 데이터 적재만
 * 한다 — 즉 마을 주민 응답에선 {@code scene}, {@code nextScene}, {@code closingLines} 가 모두 {@code null}.
 *
 * <p>인가: 비소유/비존재 모두 {@link DialogueErrorCode#SESSION_NOT_FOUND}(404) 으로 통일하여 ID enumeration 을 방지한다
 * (PatientProfileService 와 동일 패턴).
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DialogueService {

    /** {@link DialogueTurn} 의 (session_id, step_index) UNIQUE 제약 이름. 마이그레이션과 일치. */
    private static final String UK_DIALOGUE_TURN_SESSION_STEP = "uk_dialogue_turn_session_step";

    /**
     * 자유 발화(STT) turn 의 표식 — 등대지기 자유 대화에서 catalog 정의가 없는 발화를 의미 (S14P31E103-787 FE 컨트랙트 약속). FE 의
     * {@code FREE_INPUT_CHOICE_INTENT_ID} 와 정확히 같은 문자열이어야 한다.
     */
    private static final String FREE_INPUT_CHOICE_INTENT_ID = "FREE_INPUT";

    private final DialogueSessionRepository sessionRepository;
    private final DialogueTurnRepository turnRepository;
    private final PatientProfileService patientProfileService;
    private final FallbackSceneProvider fallbackSceneProvider;
    private final ClaudeSceneProvider claudeSceneProvider;
    private final LighthouseIntentCatalog lighthouseIntentCatalog;
    private final CatalogSceneProvider catalogSceneProvider;
    private final DialogueCatalogService dialogueCatalogService;
    private final AiDialogueClient aiDialogueClient;
    private final DialogueEmotionAnalysisService dialogueEmotionAnalysisService;

    @Transactional
    public StartSessionResponse createSession(Long currentUserId, StartSessionRequest request) {
        PatientProfile profile =
                patientProfileService.findOwnedOrThrow(currentUserId, request.patientProfileId());

        NpcName npcName = request.npcName();
        String scriptId = null;
        SceneResponse firstScene;

        if (npcName.isLlmDriven()) {
            // 등대지기: 기존 흐름 유지 (fallback firstScene + Claude 후속)
            firstScene = fallbackSceneProvider.firstScene(npcName);
        } else {
            // 마을 NPC: catalog 에서 script 선택 후 첫 화면 반환
            List<String> recentScripts =
                    sessionRepository.findRecentScriptIds(profile.getId(), npcName);
            scriptId = catalogSceneProvider.pickScriptId(npcName, recentScripts);
            firstScene = catalogSceneProvider.firstScene(scriptId);
        }

        DialogueSession session =
                sessionRepository.save(
                        DialogueSession.builder()
                                .patientProfile(profile)
                                .npcName(npcName)
                                .scriptId(scriptId)
                                .build());
        return StartSessionResponse.of(session, firstScene);
    }

    @Transactional
    public SubmitTurnResponse submitTurn(
            Long currentUserId, Long sessionId, SubmitTurnRequest request) {
        DialogueSession session = findOwnedSessionOrThrow(currentUserId, sessionId);
        requireInProgress(session);

        SelectedChoiceRequest choice = request.selectedChoice();
        int stepIndex = session.getStepCount();

        if (session.getNpcName().isLlmDriven()) {
            // 등대지기 경로: 기존 lighthouseIntentCatalog 기반 영속 + Claude/Fallback scene
            return submitLighthouseTurn(session, request, choice, stepIndex);
        }
        // 마을 NPC: BE catalog 기반 영속 + scene
        return submitVillageTurn(session, request, choice, stepIndex);
    }

    private SubmitTurnResponse submitLighthouseTurn(
            DialogueSession session,
            SubmitTurnRequest request,
            SelectedChoiceRequest choice,
            int stepIndex) {
        boolean isFreeInput = FREE_INPUT_CHOICE_INTENT_ID.equals(choice.choiceIntentId());

        short intensity;
        List<String> concernFlags;
        List<String> protectiveFactors;
        if (isFreeInput) {
            // STT free input has no catalog choice id, so persist the client-classified
            // signal metadata. Catalog-backed choices below still use BE metadata.
            intensity = choice.intensity();
            concernFlags = List.copyOf(choice.concernFlags());
            protectiveFactors = List.copyOf(choice.protectiveFactors());
        } else {
            LighthouseIntentCatalog.ChoiceIntentMetadata meta =
                    lighthouseIntentCatalog
                            .lookup(choice.choiceIntentId())
                            .orElseThrow(
                                    () ->
                                            new BusinessException(
                                                    DialogueErrorCode.INVALID_CHOICE_FOR_STEP));
            intensity = meta.intensity();
            concernFlags = meta.concernFlags();
            protectiveFactors = meta.protectiveFactors();
        }

        persistTurn(
                session,
                stepIndex,
                request.questionText(),
                choice.choiceIntentId(),
                choice.text(),
                request.npcResponseText(),
                intensity,
                concernFlags,
                protectiveFactors,
                DialogueTurnGeneratedBy.FALLBACK,
                /* valence */ null,
                /* tone */ null,
                /* topicKeywords */ List.of(),
                /* sentimentWords */ List.of());
        session.incrementStepCount();

        // 자유 발화는 BE 가 다음 scene 을 정의하지 않는다 — FE 가 AI /dialogue/chat 결과로 다음 영철 메시지를 띄움.
        if (isFreeInput) {
            return SubmitTurnResponse.of(session, null);
        }
        SceneResponse nextScene = buildLighthouseNextScene(session, choice.choiceIntentId());
        return SubmitTurnResponse.of(session, nextScene);
    }

    private SubmitTurnResponse submitVillageTurn(
            DialogueSession session,
            SubmitTurnRequest request,
            SelectedChoiceRequest choice,
            int stepIndex) {
        ChoiceDefinition def =
                dialogueCatalogService
                        .findChoice(choice.choiceIntentId())
                        .orElseThrow(
                                () ->
                                        new BusinessException(
                                                DialogueErrorCode.INVALID_CHOICE_FOR_STEP));
        persistTurn(
                session,
                stepIndex,
                request.questionText(),
                def.choiceIntentId(),
                def.text(),
                null,
                (short) def.intensity(),
                def.concernFlags(),
                def.protectiveFactors(),
                DialogueTurnGeneratedBy.NPC_SCRIPT,
                def.valence(),
                def.tone(),
                def.topicKeywords(),
                def.sentimentWords());
        session.incrementStepCount();
        SceneResponse nextScene = catalogSceneProvider.nextScene(session.getScriptId(), def);
        return SubmitTurnResponse.of(session, nextScene);
    }

    private void persistTurn(
            DialogueSession session,
            int stepIndex,
            String questionText,
            String choiceIntentId,
            String choiceText,
            String npcResponseText,
            short intensity,
            List<String> concernFlags,
            List<String> protectiveFactors,
            DialogueTurnGeneratedBy generatedBy,
            com.comong.backend.domain.dialogue.catalog.model.ChoiceValence valence,
            com.comong.backend.domain.dialogue.catalog.model.ChoiceTone tone,
            List<String> topicKeywords,
            List<com.comong.backend.domain.dialogue.catalog.model.SentimentWord> sentimentWords) {
        try {
            turnRepository.saveAndFlush(
                    DialogueTurn.builder()
                            .session(session)
                            .stepIndex(stepIndex)
                            .questionText(questionText)
                            .choiceIntentId(choiceIntentId)
                            .choiceText(choiceText)
                            .npcResponseText(npcResponseText)
                            .intensity(intensity)
                            .concernFlags(concernFlags)
                            .protectiveFactors(protectiveFactors)
                            .valence(valence)
                            .tone(tone)
                            .topicKeywords(topicKeywords)
                            .sentimentWords(sentimentWords)
                            .generatedBy(generatedBy)
                            .build());
        } catch (DataIntegrityViolationException e) {
            throw mapTurnConstraintViolation(e);
        }
    }

    /**
     * 등대지기 다음 장면. maxSteps 도달 시는 fallback 의 종료 신호. 그렇지 않으면 Claude 시도 → 실패/검증 위반 시 fallback 라우팅 으로
     * 위임 (PDF 정책).
     */
    private SceneResponse buildLighthouseNextScene(DialogueSession session, String prevChoiceId) {
        if (session.isAtMaxSteps()) {
            return fallbackSceneProvider.nextScene(
                    session.getNpcName(),
                    prevChoiceId,
                    session.getStepCount(),
                    session.getMaxSteps());
        }
        List<DialogueTurn> turns =
                turnRepository.findAllBySessionIdOrderByStepIndexAsc(session.getId());
        return claudeSceneProvider
                .nextScene(session, turns)
                .orElseGet(
                        () ->
                                fallbackSceneProvider.nextScene(
                                        session.getNpcName(),
                                        prevChoiceId,
                                        session.getStepCount(),
                                        session.getMaxSteps()));
    }

    @Transactional
    public FinishSessionResponse finishSession(
            Long currentUserId, Long sessionId, FinishSessionRequest request) {
        DialogueSession session = findOwnedSessionOrThrow(currentUserId, sessionId);
        requireInProgress(session);
        session.finish(request.finishReason());
        List<String> closingLines =
                session.getNpcName().isLlmDriven()
                        ? fallbackSceneProvider.closingLines(
                                session.getNpcName(), request.finishReason())
                        : null; // 마을 주민은 catalog ending scene 에서 이미 closingLines 전달

        // 세션 종료 후 RAG 임베딩 트리거 — fire-and-forget (S14P31E103-788).
        // 1) lazy 연관(patientProfile) 을 트랜잭션 안에서 미리 unpack — 비동기 스레드에서 LazyInitializationException
        // 회피.
        // 2) turns 도 트랜잭션 안에서 fetch.
        // 3) afterCommit 시점에 호출 — 롤백 시 임베딩이 외부에 새지 않도록 정합성 보장.
        long patientProfileId = session.getPatientProfile().getId();
        long sessionIdValue = session.getId();
        NpcName npcName = session.getNpcName();
        List<DialogueTurn> turns =
                turnRepository.findAllBySessionIdOrderByStepIndexAsc(sessionIdValue);
        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        if (npcName.isLlmDriven()) {
                            dialogueEmotionAnalysisService.analyzePublishThenEmbedAsync(
                                    currentUserId,
                                    patientProfileId,
                                    sessionIdValue,
                                    npcName,
                                    turns);
                        } else {
                            aiDialogueClient.embedSessionAsync(
                                    patientProfileId, sessionIdValue, npcName, turns);
                        }
                    }
                });

        return FinishSessionResponse.of(session, closingLines);
    }

    public SessionDetailResponse getSession(Long currentUserId, Long sessionId) {
        DialogueSession session = findOwnedSessionOrThrow(currentUserId, sessionId);
        List<DialogueTurn> turns =
                turnRepository.findAllBySessionIdOrderByStepIndexAsc(session.getId());
        return SessionDetailResponse.from(session, turns);
    }

    /**
     * 보호자 페이지 대화 이력 목록 — 환자 owner 검증 후 NPC/기간 필터로 페이지 조회.
     *
     * <p>{@code from} / {@code to} 는 KST 기준 날짜. 서비스에서 자정 경계로 변환해 {@code started_at} 비교에 사용한다
     * ({@code from 00:00} inclusive, {@code to+1d 00:00} exclusive). {@code to} 가 {@code null} 이면
     * "오늘 cap" — 즉 오늘 자정 이전 (=어제까지) 끝난 데이터까지가 아니라 **오늘 분도 포함**하기 위해 내일 자정 미만으로 자른다. 이 cap 은 미래 시점
     * 세션이 응답에 새는 것을 방지한다 (현재 운영 상으론 미래 세션이 생길 일 없지만 방어).
     *
     * <p>{@code from > to} 인 경우 입력값 오류 (G-001).
     */
    public Page<GuardianSessionListItemResponse> searchForGuardian(
            Long currentUserId,
            Long patientProfileId,
            NpcName npc,
            LocalDate from,
            LocalDate to,
            Pageable pageable) {
        PatientProfile profile =
                patientProfileService.findOwnedOrThrow(currentUserId, patientProfileId);

        if (from != null && to != null && from.isAfter(to)) {
            throw new BusinessException(GlobalErrorCode.INVALID_INPUT);
        }

        LocalDateTime fromInclusive = from != null ? from.atStartOfDay() : null;
        LocalDate toCapped = to != null ? to : LocalDate.now();
        LocalDateTime toExclusive = toCapped.plusDays(1).atStartOfDay();

        Specification<DialogueSession> spec =
                buildGuardianSearchSpec(profile.getId(), npc, fromInclusive, toExclusive);
        return sessionRepository.findAll(spec, pageable).map(GuardianSessionListItemResponse::from);
    }

    /**
     * 보호자 검색 동적 쿼리. JPQL 의 {@code :param IS NULL} 패턴은 PostgreSQL JDBC 의 untyped NULL 처리에서 SQL
     * grammar 오류를 일으키므로 Criteria 기반 {@link Specification} 으로 작성한다. null 인자는 해당 술어 자체를 추가하지 않는 방식.
     */
    private Specification<DialogueSession> buildGuardianSearchSpec(
            Long patientProfileId,
            NpcName npc,
            LocalDateTime fromInclusive,
            LocalDateTime toExclusive) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("patientProfile").get("id"), patientProfileId));
            if (npc != null) {
                predicates.add(cb.equal(root.get("npcName"), npc));
            }
            if (fromInclusive != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("startedAt"), fromInclusive));
            }
            if (toExclusive != null) {
                predicates.add(cb.lessThan(root.get("startedAt"), toExclusive));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    /**
     * 보호자 페이지 대화 세션 상세 — 환자 owner 검증 + 해당 환자 세션 여부 검증 모두 통과해야 반환. 비소유/비존재 모두 404 (enumeration 방지).
     */
    public SessionDetailResponse getSessionForGuardian(
            Long currentUserId, Long patientProfileId, Long sessionId) {
        PatientProfile profile =
                patientProfileService.findOwnedOrThrow(currentUserId, patientProfileId);
        DialogueSession session =
                sessionRepository
                        .findById(sessionId)
                        .filter(s -> s.getPatientProfile().getId().equals(profile.getId()))
                        .orElseThrow(
                                () -> new BusinessException(DialogueErrorCode.SESSION_NOT_FOUND));
        List<DialogueTurn> turns =
                turnRepository.findAllBySessionIdOrderByStepIndexAsc(session.getId());
        return SessionDetailResponse.from(session, turns);
    }

    // ===== helpers =====

    /** 비소유/비존재 모두 404 로 통일 (enumeration 방지). */
    private DialogueSession findOwnedSessionOrThrow(Long currentUserId, Long sessionId) {
        return sessionRepository
                .findById(sessionId)
                .filter(s -> s.getPatientProfile().getUser().getId().equals(currentUserId))
                .orElseThrow(() -> new BusinessException(DialogueErrorCode.SESSION_NOT_FOUND));
    }

    private void requireInProgress(DialogueSession session) {
        if (session.getStatus() != DialogueStatus.IN_PROGRESS) {
            throw new BusinessException(DialogueErrorCode.SESSION_ALREADY_FINISHED);
        }
    }

    private RuntimeException mapTurnConstraintViolation(DataIntegrityViolationException e) {
        for (Throwable cause = e.getCause(); cause != null; cause = cause.getCause()) {
            if (cause instanceof ConstraintViolationException cve
                    && UK_DIALOGUE_TURN_SESSION_STEP.equalsIgnoreCase(cve.getConstraintName())) {
                return new BusinessException(DialogueErrorCode.SESSION_TURN_DUPLICATE);
            }
        }
        return e;
    }
}
