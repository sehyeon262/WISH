import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChatLayout } from '@/features/chat/components/ChatLayout'
import { CharacterSidebar } from '@/features/chat/components/CharacterSidebar'
import { ConversationMain } from '@/features/chat/components/ConversationMain'
import { EmotionPanel } from '@/features/chat/components/EmotionPanel'
import { PastDialoguesModal } from '@/features/chat/components/PastDialoguesModal'
import {
  CHARACTERS,
  EMOTION_SHARES,
  EMOTION_SIGNALS,
  EMOTION_TREND,
  MESSAGES,
  SESSION_META,
  SUMMARY,
  TODAY_SCORE,
} from '@/features/chat/data/mock'
import type { ConversationSummary } from '@/features/chat/data/mock'
import { HeaderBar } from '@/features/dashboard/components/HeaderBar'
import {
  CHARACTER_ID_TO_NPC,
  NPC_TO_CHARACTER_ID,
  deriveFromSession,
  formatDurationLabel,
  formatWhenLabel,
} from '@/features/chat/adapters'
import {
  pickFirstFinished,
  useGuardianDialogueDailySummary,
  useGuardianDialogueNpcStatuses,
  useGuardianDialogueSession,
  useGuardianDialogueSessions,
  useGuardianDialogueWeeklyTrend,
  type NpcDialogueStatus,
} from '@/features/chat/hooks'
import type {
  GuardianDialogueNpc,
  GuardianDialogueSignal,
  GuardianDialogueWeeklyTrendPoint,
} from '@wish/api-client'
import type { EmotionShare, EmotionSignal, EmotionTrendPoint } from '@/features/chat/data/mock'
import { useMyPatient } from '@/features/auth/hooks/useMyPatient'
import '@/features/dashboard/tokens.css'

export function ChatPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState(
    () => getCharacterIdFromNpcParam(searchParams.get('npc')) ?? SESSION_META.characterId,
  )
  const selected = CHARACTERS.find(c => c.id === selectedId) ?? CHARACTERS[0]

  const { data: patient } = useMyPatient()
  const patientProfileId = patient?.id ?? null
  const npc = CHARACTER_ID_TO_NPC[selectedId]

  const sidebarNpcList = useMemo(
    () =>
      CHARACTERS.map(c => CHARACTER_ID_TO_NPC[c.id]).filter((n): n is GuardianDialogueNpc => !!n),
    [],
  )
  const npcStatuses = useGuardianDialogueNpcStatuses(patientProfileId, sidebarNpcList)
  const sidebarStatuses = useMemo(() => {
    const out: Record<string, NpcDialogueStatus> = {}
    for (const c of CHARACTERS) {
      const n = CHARACTER_ID_TO_NPC[c.id]
      out[c.id] = n
        ? (npcStatuses[n] ?? { tone: null, hasSession: false, isLatest: false, latestAt: null })
        : { tone: null, hasSession: false, isLatest: false, latestAt: null }
    }
    return out
  }, [npcStatuses])

  // 캐릭터 전환 시 사용자가 고른 과거 세션은 리셋
  const [pickedSessionId, setPickedSessionId] = useState<number | null>(null)
  const [pastOpen, setPastOpen] = useState(false)

  useEffect(() => {
    const nextSelectedId = getCharacterIdFromNpcParam(searchParams.get('npc'))
    const nextSessionId = getSessionIdFromParam(searchParams.get('sessionId'))

    if (nextSelectedId) {
      setSelectedId(nextSelectedId)
    }
    if (nextSessionId) {
      setPickedSessionId(nextSessionId)
    }
  }, [searchParams])

  // 최신 FINISHED 세션을 찾기 위해 최근 10개 메타를 받아오고 클라이언트에서 필터
  const sessionsQuery = useGuardianDialogueSessions({ patientProfileId, npc, size: 10 })
  const latestFinishedMeta = pickFirstFinished(sessionsQuery.data?.content)
  const latestFinishedId = latestFinishedMeta?.sessionId ?? null

  const activeSessionId = pickedSessionId ?? latestFinishedId
  const activeMeta =
    sessionsQuery.data?.content?.find(m => m.sessionId === activeSessionId) ?? latestFinishedMeta

  const detailQuery = useGuardianDialogueSession(patientProfileId, activeSessionId)

  const derived = useMemo(
    () => (detailQuery.data ? deriveFromSession(detailQuery.data) : null),
    [detailQuery.data],
  )

  // B4: 오른쪽 패널의 데이터 소스를 *오늘 종합* daily summary + weekly trend 로.
  // 왼쪽 (채팅 미리보기·주제) 은 세션별 상세 그대로.
  const dailySummaryQuery = useGuardianDialogueDailySummary(patientProfileId)
  const weeklyTrendQuery = useGuardianDialogueWeeklyTrend(patientProfileId)

  const hasRealSession = !!derived && derived.messages.length > 0
  const isEmptyForLoggedIn =
    !!patientProfileId && sessionsQuery.isSuccess && !latestFinishedMeta && !pickedSessionId

  const messages = hasRealSession ? derived!.messages : isEmptyForLoggedIn ? [] : MESSAGES
  const topics = hasRealSession ? derived!.topics : SUMMARY.topics

  // 인증된 사용자: daily summary 가 단일 진실의 원천. (sessionCount=0 이면 0% 로 정직하게 표시)
  // 인증 안 된 사용자: 데모용 mock 폴백을 유지해서 랜딩 UX 가 비어 보이지 않도록.
  const isAuthenticated = !!patientProfileId
  const dailySummary = dailySummaryQuery.data
  const weeklyTrend = weeklyTrendQuery.data
  const hasDailyData = isAuthenticated && !!dailySummary
  const summarySample = !isAuthenticated
  const trendSample = !isAuthenticated
  const signalsSample = !isAuthenticated
  const topicsSample = !hasRealSession && !isAuthenticated

  const shares: EmotionShare[] = hasDailyData
    ? (() => {
        const v = dailySummary!.valenceDistribution
        const total = v.positive + v.neutral + v.negative
        if (total === 0) {
          return [
            { tone: 'calm', label: '긍정', percent: 0 },
            { tone: 'tired', label: '보통', percent: 0 },
            { tone: 'worried', label: '부정', percent: 0 },
          ]
        }
        const pos = Math.round((v.positive / total) * 100)
        const neg = Math.round((v.negative / total) * 100)
        const neu = 100 - pos - neg
        return [
          { tone: 'calm', label: '긍정', percent: pos },
          { tone: 'tired', label: '보통', percent: neu },
          { tone: 'worried', label: '부정', percent: neg },
        ]
      })()
    : EMOTION_SHARES

  const signals: EmotionSignal[] = hasDailyData
    ? dailySummary!.signals.map((s: GuardianDialogueSignal, idx: number) => ({
        id: `${s.kind}:${s.flag}:${idx}`,
        tone: s.kind === 'CONCERN' ? 'worried' : 'calm',
        title: s.label,
        description: `${s.npc}와의 대화에서`,
      }))
    : EMOTION_SIGNALS

  const trend: EmotionTrendPoint[] =
    isAuthenticated && weeklyTrend
      ? weeklyTrend.points.map((p: GuardianDialogueWeeklyTrendPoint) => ({
          label: p.date.slice(5), // MM-DD
          score: p.positiveNeutralPercent ?? 0,
        }))
      : EMOTION_TREND

  // 큰 숫자 = 긍정+보통 비율 (%) — 점수가 아닌 분포.
  const todayScore = hasDailyData
    ? (() => {
        const v = dailySummary!.valenceDistribution
        const total = v.positive + v.neutral + v.negative
        return total === 0 ? 0 : Math.round(((v.positive + v.neutral) / total) * 100)
      })()
    : TODAY_SCORE

  const whenLabel = activeMeta
    ? formatWhenLabel(activeMeta.startedAt)
    : isEmptyForLoggedIn
      ? undefined
      : SESSION_META.whenLabel
  const durationLabel = activeMeta
    ? formatDurationLabel(activeMeta)
    : isEmptyForLoggedIn
      ? undefined
      : SESSION_META.durationLabel

  // 추천 후속 활동: BE daily summary 우선. 없으면 mock (인증 안 된 데모 케이스 한정).
  // 좌측 ConversationMain 의 '추천 후속 활동' 카드에 노출.
  const recommendedActivity = hasDailyData
    ? (dailySummary!.recommendedActivity ?? '오늘은 아직 추천할 활동이 없어요.')
    : SUMMARY.recommendedActivity
  const summary: ConversationSummary = { ...SUMMARY, topics, recommendedActivity }
  const recommendedActivitySample = !hasDailyData

  const handleSelectCharacter = (id: string) => {
    setSelectedId(id)
    setPickedSessionId(null)
    setSearchParams({}, { replace: true })
  }

  return (
    <>
      <ChatLayout
        header={<HeaderBar />}
        sidebar={
          <CharacterSidebar
            characters={CHARACTERS}
            selectedId={selectedId}
            onSelect={handleSelectCharacter}
            statuses={sidebarStatuses}
          />
        }
        main={
          <ConversationMain
            characterName={selected.name}
            whenLabel={whenLabel}
            durationLabel={durationLabel}
            messages={messages}
            summary={summary}
            partnerImageUrl={selected.chatImageUrl ?? selected.avatarUrl}
            partnerImageScale={selected.chatImageScale}
            partnerImageOffsetX={selected.chatImageOffsetX}
            partnerImageOffsetY={selected.chatImageOffsetY}
            topicsSample={topicsSample}
            recommendedActivitySample={recommendedActivitySample}
            emptyState={isEmptyForLoggedIn}
            onOpenPast={() => setPastOpen(true)}
            isViewingPast={!!pickedSessionId}
            onReturnToLatest={() => {
              setPickedSessionId(null)
              setSearchParams({}, { replace: true })
            }}
          />
        }
        rightPanel={
          <EmotionPanel
            todayScore={todayScore}
            shares={shares}
            trend={trend}
            signals={signals}
            summaryText={hasDailyData ? (dailySummary?.summaryText ?? null) : null}
            npcsVisited={hasDailyData ? (dailySummary?.npcsVisited ?? null) : null}
            summarySample={summarySample}
            trendSample={trendSample}
            signalsSample={signalsSample}
          />
        }
      />
      <PastDialoguesModal
        isOpen={pastOpen}
        onClose={() => setPastOpen(false)}
        patientProfileId={patientProfileId}
        npc={npc}
        characterName={selected.name}
        activeSessionId={activeSessionId}
        onSelectSession={id => {
          setPickedSessionId(id)
          setSearchParams({}, { replace: true })
          setPastOpen(false)
        }}
      />
    </>
  )
}

function getCharacterIdFromNpcParam(npcParam: string | null): string | null {
  if (!npcParam) return null
  return NPC_TO_CHARACTER_ID[npcParam as GuardianDialogueNpc] ?? null
}

function getSessionIdFromParam(sessionIdParam: string | null): number | null {
  if (!sessionIdParam) return null
  const parsed = Number(sessionIdParam)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}
