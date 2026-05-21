package com.comong.backend.domain.dialogue.service;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.comong.backend.domain.dialogue.entity.DialogueSession;
import com.comong.backend.domain.dialogue.entity.DialogueTurn;
import com.comong.backend.domain.dialogue.entity.NpcName;
import com.comong.backend.domain.dialogue.repository.DialogueSessionRepository;
import com.comong.backend.domain.realtime.dto.RealtimeEventResponse;
import com.comong.backend.domain.realtime.service.RealtimeEventService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class DialogueEmotionAnalysisService {

    private final AiDialogueClient aiDialogueClient;
    private final DialogueSessionRepository sessionRepository;
    private final RealtimeEventService realtimeEventService;
    private final PlatformTransactionManager transactionManager;

    @Async("aiDialogueTaskExecutor")
    public void analyzeAndPublishAsync(
            Long userId,
            Long patientProfileId,
            Long sessionId,
            NpcName npcName,
            List<DialogueTurn> turns) {
        analyzeAndPublish(userId, patientProfileId, sessionId, npcName, turns);
    }

    @Async("aiDialogueTaskExecutor")
    public void analyzePublishThenEmbedAsync(
            Long userId,
            Long patientProfileId,
            Long sessionId,
            NpcName npcName,
            List<DialogueTurn> turns) {
        try {
            analyzeAndPublish(userId, patientProfileId, sessionId, npcName, turns);
        } finally {
            aiDialogueClient.embedSession(patientProfileId, sessionId, npcName, turns);
        }
    }

    private void analyzeAndPublish(
            Long userId,
            Long patientProfileId,
            Long sessionId,
            NpcName npcName,
            List<DialogueTurn> turns) {
        aiDialogueClient
                .summarizeEmotion(patientProfileId, sessionId, npcName, turns)
                .ifPresent(
                        summary ->
                                new TransactionTemplate(transactionManager)
                                        .executeWithoutResult(
                                                status ->
                                                        saveSummaryAndPublish(
                                                                userId,
                                                                patientProfileId,
                                                                sessionId,
                                                                npcName,
                                                                summary)));
    }

    private void saveSummaryAndPublish(
            Long userId,
            Long patientProfileId,
            Long sessionId,
            NpcName npcName,
            AiDialogueClient.EmotionSummaryResult summary) {
        DialogueSession session = sessionRepository.findById(sessionId).orElse(null);
        if (session == null) {
            log.warn("Dialogue session not found for emotion summary. sessionId={}", sessionId);
            return;
        }

        session.applyEmotionSummary(
                summary.overallValence(),
                summary.tone(),
                summary.intensity(),
                summary.concernFlags(),
                summary.protectiveFactors(),
                summary.guardianMessage(),
                LocalDateTime.now());

        publishAfterCommit(
                userId,
                RealtimeEventResponse.dialogueEmotionUpdated(
                        patientProfileId,
                        sessionId,
                        npcName.name(),
                        summary.overallValence().name(),
                        summary.tone().name(),
                        (int) summary.intensity(),
                        summary.guardianMessage()));
    }

    private void publishAfterCommit(Long userId, RealtimeEventResponse event) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            publishSafely(userId, event);
            return;
        }
        try {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            publishSafely(userId, event);
                        }
                    });
        } catch (IllegalStateException e) {
            log.warn(
                    "Dialogue emotion realtime synchronization failed. userId={}, eventType={}",
                    userId,
                    event.type(),
                    e);
        }
    }

    private void publishSafely(Long userId, RealtimeEventResponse event) {
        try {
            realtimeEventService.publish(userId, event);
        } catch (RuntimeException e) {
            log.warn(
                    "Dialogue emotion realtime publish failed. userId={}, eventType={}",
                    userId,
                    event.type(),
                    e);
        }
    }
}
