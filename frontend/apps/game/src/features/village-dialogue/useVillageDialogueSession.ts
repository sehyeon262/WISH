import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  cancelVillagerDialogueSession,
  finishVillageDialogueSession,
  startVillageDialogueSession,
  submitVillageTurnCatalog,
  type VillageDialogueFinishReason,
  type VillageScene,
} from './villageDialogueClient'
import { VILLAGE_NPC_TO_API_ENUM } from './npcMapping'
import { VILLAGER_FIRST_GREETING, villageDialogues } from './villageDialogues'
import type {
  VillagerChoice,
  VillagerDialogueNode,
  VillagerDialogueStatus,
  VillagerNpcId,
} from './types'

/**
 * 마을 NPC 대화 세션 hook — BE 카탈로그 (B2 이후) 가 모든 scene 을 내려준다. FE 는 BE 응답을 그대로 화면에 그리는 *터미널* 역할만 한다.
 *
 * <p>이전 (B2 이전) 에는 FE 가 sharedCounselingScripts 트리를 들고 로컬에서 분기·라우팅했지만, BE 카탈로그가 단일 진실의 원천이 되면서
 * FE 의 트리 정의는 제거됐다. 임상 신호 (intensity, flags) 도 BE 가 catalog 룩업으로 영속하므로 FE 는 choiceIntentId 만 보낸다.
 */
const RESPONSE_LINE_DELAY_MS = 850
const QUESTION_DELAY_MS = 700
const MIN_QUESTION_DELAY_MS = 900
const SAVE_ERROR_LINE = '대화를 저장하지 못했어. 잠시 후 다시 해보자.'

function toVillagerChoice(simple: { choiceIntentId: string; text: string }): VillagerChoice {
  // BE 가 임상 메타 owner — FE 는 화면 렌더용으로만 choice 객체를 만든다.
  return {
    choiceIntentId: simple.choiceIntentId,
    text: simple.text,
    nextNodeId: null,
    intensity: 0,
    concernFlags: [],
    protectiveFactors: [],
    fallbackResponseLines: [],
  }
}

export function useVillageDialogueSession(
  patientProfileId: number | undefined,
  onFinished?: () => void,
) {
  const [status, setStatus] = useState<VillagerDialogueStatus>('idle')
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [currentNpcId, setCurrentNpcId] = useState<VillagerNpcId | null>(null)
  const [currentNode, setCurrentNode] = useState<VillagerDialogueNode | null>(null)
  const [visibleLines, setVisibleLines] = useState<string[]>([])
  const [selectedChoiceIntentId, setSelectedChoiceIntentId] = useState<string | null>(null)

  const timeoutIds = useRef<number[]>([])
  const sessionIdRef = useRef<number | null>(null)
  const startInFlightRef = useRef(false)
  const lastQuestionTextRef = useRef<string>('')

  const script = useMemo(
    () => (currentNpcId ? villageDialogues[currentNpcId] : null),
    [currentNpcId],
  )

  const clearTimers = useCallback(() => {
    timeoutIds.current.forEach(id => window.clearTimeout(id))
    timeoutIds.current = []
  }, [])

  const queueTimer = useCallback((cb: () => void, delayMs: number) => {
    const id = window.setTimeout(cb, delayMs)
    timeoutIds.current.push(id)
  }, [])

  const resetSession = useCallback(() => {
    clearTimers()
    sessionIdRef.current = null
    lastQuestionTextRef.current = ''
    setStatus('idle')
    setSessionId(null)
    setCurrentNpcId(null)
    setCurrentNode(null)
    setVisibleLines([])
    setSelectedChoiceIntentId(null)
  }, [clearTimers])

  const finishSession = useCallback(async (reason: VillageDialogueFinishReason) => {
    const target = sessionIdRef.current
    if (typeof target !== 'number') return
    try {
      await finishVillageDialogueSession(target, reason)
    } catch {
      // finish 실패는 사용자 UI 를 가두지 않는다.
    }
  }, [])

  const closeDialogue = useCallback(
    (reason: VillageDialogueFinishReason = 'COMPLETED') => {
      void finishSession(reason)
      resetSession()
      onFinished?.()
    },
    [finishSession, onFinished, resetSession],
  )

  const cancelDialogue = useCallback(() => {
    const target = sessionIdRef.current
    if (target) {
      void cancelVillagerDialogueSession(target).catch(() => undefined)
    }
    closeDialogue('CANCELLED')
  }, [closeDialogue])

  /**
   * BE 가 내려준 scene 한 개를 화면에 적용. NPC 응답 라인이 있으면 먼저 보여주고, 잠시 후 새 질문 + 선택지로 전환. ending scene 이면
   * 최종 대사만 보여주고 close 대기.
   */
  const applyScene = useCallback(
    (scene: VillageScene) => {
      const node: VillagerDialogueNode = {
        nodeId: 'be',
        questionText: scene.questionText,
        choices: scene.choices.map(toVillagerChoice),
      }
      lastQuestionTextRef.current = scene.questionText

      const npcLines = scene.npcResponse ?? []
      if (npcLines.length > 0) {
        setVisibleLines([npcLines[0]])
        setStatus('showing_response')
        npcLines.slice(1).forEach((line, idx) => {
          queueTimer(
            () => {
              setVisibleLines(prev => [...prev, line].slice(-2))
            },
            (idx + 1) * RESPONSE_LINE_DELAY_MS,
          )
        })
        const delay = Math.max(MIN_QUESTION_DELAY_MS, npcLines.length * RESPONSE_LINE_DELAY_MS)
        queueTimer(() => {
          if (scene.shouldEndSession) {
            setSelectedChoiceIntentId(null)
            setStatus('waiting_final_close')
            return
          }
          setCurrentNode(node)
          setVisibleLines([scene.questionText])
          setSelectedChoiceIntentId(null)
          setStatus('showing_question')
          queueTimer(() => {
            setStatus(prev => (prev === 'showing_question' ? 'waiting_choice' : prev))
          }, QUESTION_DELAY_MS)
        }, delay)
      } else {
        // 첫 화면: NPC 라인 없이 바로 질문 (혹은 BE가 npcResponse 비워서 보낸 케이스).
        if (scene.shouldEndSession) {
          setStatus('waiting_final_close')
          return
        }
        setCurrentNode(node)
        setVisibleLines([scene.questionText])
        setSelectedChoiceIntentId(null)
        setStatus('showing_question')
        queueTimer(() => {
          setStatus(prev => (prev === 'showing_question' ? 'waiting_choice' : prev))
        }, QUESTION_DELAY_MS)
      }
    },
    [queueTimer],
  )

  const startVillagerDialogue = useCallback(
    async (npcId: VillagerNpcId) => {
      if (startInFlightRef.current || sessionIdRef.current) return

      clearTimers()
      setCurrentNpcId(npcId)
      setSelectedChoiceIntentId(null)
      setStatus('opening_greeting')
      setVisibleLines(VILLAGER_FIRST_GREETING[npcId].slice(0, 2))

      if (typeof patientProfileId !== 'number' || patientProfileId <= 0) {
        // 미로그인 / 환자 프로필 없음 — 인사만 보여주고 멈춤.
        setStatus('error')
        return
      }

      try {
        startInFlightRef.current = true
        const result = await startVillageDialogueSession(
          patientProfileId,
          VILLAGE_NPC_TO_API_ENUM[npcId],
        )
        sessionIdRef.current = result.sessionId
        setSessionId(result.sessionId)

        if (result.scene) {
          // 첫 화면은 NPC 인사를 잠깐 보여준 뒤 BE scene 으로 전환.
          queueTimer(() => applyScene(result.scene!), QUESTION_DELAY_MS)
        } else {
          // 등대지기처럼 BE 가 scene 미내려주는 케이스 (이론상 마을 NPC 는 항상 scene).
          setStatus('error')
        }
      } catch {
        setStatus('error')
        setVisibleLines([SAVE_ERROR_LINE])
      } finally {
        startInFlightRef.current = false
      }
    },
    [applyScene, clearTimers, patientProfileId, queueTimer],
  )

  const advanceDialogue = useCallback(() => {
    if (status === 'waiting_final_close') {
      closeDialogue('COMPLETED')
      return
    }
    if (status === 'error') {
      closeDialogue('ERROR')
    }
  }, [closeDialogue, status])

  const selectChoice = useCallback(
    async (choice: VillagerChoice) => {
      const target = sessionIdRef.current
      if (status !== 'waiting_choice' || !target) return

      clearTimers()
      setStatus('submitting_choice')
      setSelectedChoiceIntentId(choice.choiceIntentId)

      try {
        const { nextScene } = await submitVillageTurnCatalog(
          target,
          choice.choiceIntentId,
          lastQuestionTextRef.current,
          choice.text,
        )
        applyScene(nextScene)
      } catch {
        setStatus('error')
        setVisibleLines([SAVE_ERROR_LINE])
      }
    },
    [applyScene, clearTimers, status],
  )

  useEffect(() => clearTimers, [clearTimers])

  return {
    status,
    sessionId,
    currentNpcId,
    currentTopic: null,
    currentNode,
    visibleLines,
    visibleText: visibleLines.join('\n'),
    selectedChoiceIntentId,
    selectedEvents: [], // 레거시 시그니처 호환 — BE 가 직접 영속하므로 FE 누적 불필요
    script,
    startVillagerDialogue,
    selectChoice,
    advanceDialogue,
    closeDialogue,
    cancelDialogue,
  }
}
