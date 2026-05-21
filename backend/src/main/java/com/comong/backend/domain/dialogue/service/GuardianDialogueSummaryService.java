package com.comong.backend.domain.dialogue.service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.dialogue.catalog.DialogueCatalogService;
import com.comong.backend.domain.dialogue.catalog.model.ChoiceValence;
import com.comong.backend.domain.dialogue.dto.DailyDialogueSummaryResponse;
import com.comong.backend.domain.dialogue.dto.DialogueSignalResponse;
import com.comong.backend.domain.dialogue.dto.DialogueSignalResponse.SignalKind;
import com.comong.backend.domain.dialogue.dto.NpcVisitedResponse;
import com.comong.backend.domain.dialogue.dto.ValenceDistributionResponse;
import com.comong.backend.domain.dialogue.dto.WeeklyDialogueTrendResponse;
import com.comong.backend.domain.dialogue.entity.DialogueSession;
import com.comong.backend.domain.dialogue.entity.DialogueTurn;
import com.comong.backend.domain.dialogue.entity.NpcName;
import com.comong.backend.domain.dialogue.repository.DialogueSessionRepository;
import com.comong.backend.domain.dialogue.repository.DialogueTurnRepository;
import com.comong.backend.domain.dialogue.summary.DialogueSummaryComposer;
import com.comong.backend.domain.dialogue.summary.FlagLabels;
import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.service.PatientProfileService;

import lombok.RequiredArgsConstructor;

/**
 * 보호자 페이지의 *오늘 종합* + *주간 응답 톤 변화* API 데이터를 조립한다.
 *
 * <p>점수는 제공하지 않음 (임상 진단 회피). 대신 응답 톤 분포 (긍정/보통/부정 카운트), 시그널 카드, 주제 태그, 만난 NPC, 정성 요약 텍스트를 내린다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GuardianDialogueSummaryService {

    private final DialogueSessionRepository sessionRepository;
    private final DialogueTurnRepository turnRepository;
    private final DialogueCatalogService catalogService;
    private final DialogueSummaryComposer summaryComposer;
    private final PatientProfileService patientProfileService;

    /** 일별 종합 (KST 자정 ~ 다음 자정). */
    public DailyDialogueSummaryResponse daily(
            Long currentUserId, Long patientProfileId, LocalDate date) {
        PatientProfile profile =
                patientProfileService.findOwnedOrThrow(currentUserId, patientProfileId);
        LocalDateTime from = date.atStartOfDay();
        LocalDateTime to = date.plusDays(1).atStartOfDay();

        List<DialogueSession> sessions = sessionRepository.findInRange(profile.getId(), from, to);
        if (sessions.isEmpty()) {
            return new DailyDialogueSummaryResponse(
                    date,
                    "오늘 마을에 들르지 않았어요.",
                    new ValenceDistributionResponse(0, 0, 0),
                    List.of(),
                    List.of(),
                    List.of(),
                    null,
                    0);
        }

        Map<Long, List<DialogueTurn>> turnsBySession = loadTurnsBySession(sessions);

        String summaryText = summaryComposer.composeDailySummary(sessions, turnsBySession);
        ValenceDistributionResponse valence = aggregateValence(turnsBySession.values());
        List<DialogueSignalResponse> signals = buildSignals(sessions, turnsBySession);
        List<String> topics = aggregateTopics(turnsBySession.values());
        List<NpcVisitedResponse> npcsVisited = aggregateNpcVisited(sessions);
        String recommendedActivity =
                summaryComposer.resolveRecommendedActivity(sessions, turnsBySession).orElse(null);

        return new DailyDialogueSummaryResponse(
                date,
                summaryText,
                valence,
                signals,
                topics,
                npcsVisited,
                recommendedActivity,
                sessions.size());
    }

    /** 주간 응답 톤 변화 — {@code endDate} 포함 직전 7일. */
    public WeeklyDialogueTrendResponse weekly(
            Long currentUserId, Long patientProfileId, LocalDate endDate) {
        PatientProfile profile =
                patientProfileService.findOwnedOrThrow(currentUserId, patientProfileId);
        LocalDate from = endDate.minusDays(6);
        LocalDateTime fromTs = from.atStartOfDay();
        LocalDateTime toTs = endDate.plusDays(1).atStartOfDay();

        List<DialogueSession> sessions =
                sessionRepository.findInRange(profile.getId(), fromTs, toTs);
        Map<Long, List<DialogueTurn>> turnsBySession = loadTurnsBySession(sessions);

        // 일자별 그룹
        Map<LocalDate, List<DialogueSession>> byDate = new HashMap<>();
        for (DialogueSession s : sessions) {
            LocalDate d = s.getStartedAt().toLocalDate();
            byDate.computeIfAbsent(d, k -> new ArrayList<>()).add(s);
        }

        List<WeeklyDialogueTrendResponse.TrendPoint> points = new ArrayList<>(7);
        for (int i = 0; i < 7; i++) {
            LocalDate d = from.plusDays(i);
            List<DialogueSession> daySessions = byDate.getOrDefault(d, List.of());
            if (daySessions.isEmpty()) {
                points.add(new WeeklyDialogueTrendResponse.TrendPoint(d, null, 0));
                continue;
            }
            // 일자별 valence 분포 계산
            ValenceDistributionResponse v =
                    aggregateValence(
                            daySessions.stream()
                                    .map(s -> turnsBySession.getOrDefault(s.getId(), List.of()))
                                    .toList());
            int percent = computePositiveNeutralPercent(v);
            points.add(new WeeklyDialogueTrendResponse.TrendPoint(d, percent, daySessions.size()));
        }

        return new WeeklyDialogueTrendResponse(points);
    }

    // ===== helpers =====

    private Map<Long, List<DialogueTurn>> loadTurnsBySession(List<DialogueSession> sessions) {
        if (sessions.isEmpty()) return Map.of();
        List<Long> ids = sessions.stream().map(DialogueSession::getId).toList();
        List<DialogueTurn> all =
                turnRepository.findAllBySessionIdInOrderBySessionIdAscStepIndexAsc(ids);
        Map<Long, List<DialogueTurn>> by = new LinkedHashMap<>();
        for (DialogueSession s : sessions) by.put(s.getId(), new ArrayList<>());
        for (DialogueTurn t : all) by.get(t.getSession().getId()).add(t);
        return by;
    }

    private ValenceDistributionResponse aggregateValence(Iterable<List<DialogueTurn>> turnLists) {
        int pos = 0, neu = 0, neg = 0;
        for (List<DialogueTurn> turns : turnLists) {
            for (DialogueTurn t : turns) {
                ChoiceValence v = t.getValence();
                if (v == null) continue; // legacy turn — skip
                switch (v) {
                    case POSITIVE -> pos++;
                    case NEUTRAL -> neu++;
                    case NEGATIVE -> neg++;
                }
            }
        }
        return new ValenceDistributionResponse(pos, neu, neg);
    }

    private int computePositiveNeutralPercent(ValenceDistributionResponse v) {
        int total = v.total();
        if (total == 0) return 0;
        return Math.round(((float) (v.positive() + v.neutral()) / total) * 100);
    }

    private List<DialogueSignalResponse> buildSignals(
            List<DialogueSession> sessions, Map<Long, List<DialogueTurn>> turnsBySession) {
        Set<String> seen = new HashSet<>();
        List<DialogueSignalResponse> result = new ArrayList<>();
        for (DialogueSession s : sessions) {
            String npc = npcDisplayName(s);
            List<DialogueTurn> turns = turnsBySession.getOrDefault(s.getId(), List.of());
            for (DialogueTurn t : turns) {
                for (String f : safe(t.getConcernFlags())) {
                    String key = "concern:" + f;
                    if (seen.add(key)) {
                        result.add(
                                new DialogueSignalResponse(
                                        SignalKind.CONCERN, f, FlagLabels.labelOf(f), npc));
                    }
                }
                for (String f : safe(t.getProtectiveFactors())) {
                    String key = "protective:" + f;
                    if (seen.add(key)) {
                        result.add(
                                new DialogueSignalResponse(
                                        SignalKind.PROTECTIVE, f, FlagLabels.labelOf(f), npc));
                    }
                }
            }
        }
        return result;
    }

    private List<String> aggregateTopics(Iterable<List<DialogueTurn>> turnLists) {
        Set<String> topics = new LinkedHashSet<>();
        for (List<DialogueTurn> turns : turnLists) {
            for (DialogueTurn t : turns) {
                for (String topic : safe(t.getTopicKeywords())) topics.add(topic);
            }
        }
        return new ArrayList<>(topics);
    }

    private List<NpcVisitedResponse> aggregateNpcVisited(List<DialogueSession> sessions) {
        // (NpcName + scriptId) 조합으로 그룹 + 카운트
        record Key(NpcName npc, String scriptId) {}
        Map<Key, Integer> count = new LinkedHashMap<>();
        for (DialogueSession s : sessions) {
            count.merge(new Key(s.getNpcName(), s.getScriptId()), 1, Integer::sum);
        }
        List<NpcVisitedResponse> result = new ArrayList<>(count.size());
        for (Map.Entry<Key, Integer> e : count.entrySet()) {
            String display = npcDisplayName(e.getKey().npc());
            String title =
                    e.getKey().scriptId() == null
                            ? null
                            : catalogService
                                    .findScript(e.getKey().scriptId())
                                    .map(sc -> sc.title())
                                    .orElse(null);
            result.add(
                    new NpcVisitedResponse(e.getKey().npc().name(), display, title, e.getValue()));
        }
        return result;
    }

    private String npcDisplayName(DialogueSession session) {
        return npcDisplayName(session.getNpcName());
    }

    private String npcDisplayName(NpcName npc) {
        return npc.catalogId()
                .flatMap(catalogService::findNpc)
                .map(n -> n.displayName())
                .orElseGet(npc::displayName);
    }

    private static <T> List<T> safe(List<T> list) {
        return list == null ? List.of() : list;
    }
}
