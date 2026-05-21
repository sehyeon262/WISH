import { useQueries, useQuery } from '@tanstack/react-query'
import {
  getGuardianDialogueDailySummary,
  getGuardianDialogueSession,
  getGuardianDialogueWeeklyTrend,
  listGuardianDialogueSessions,
  type GuardianDialogueNpc,
  type GuardianDialogueSessionMeta,
} from '@wish/api-client'
import { deriveDominantTone, type EmotionTone } from './adapters'

export const GUARDIAN_DIALOGUE_SESSIONS_QUERY_KEY = 'guardian-dialogue-sessions'
export const GUARDIAN_DIALOGUE_SESSION_QUERY_KEY = 'guardian-dialogue-session'
export const GUARDIAN_DIALOGUE_DAILY_SUMMARY_QUERY_KEY = 'guardian-dialogue-daily-summary'
export const GUARDIAN_DIALOGUE_WEEKLY_TREND_QUERY_KEY = 'guardian-dialogue-weekly-trend'

type SessionsParams = {
  patientProfileId: number | null | undefined
  npc?: GuardianDialogueNpc
  from?: string
  to?: string
  size?: number
}

export function useGuardianDialogueSessions({
  patientProfileId,
  npc,
  from,
  to,
  size = 20,
}: SessionsParams) {
  return useQuery({
    queryKey: [
      GUARDIAN_DIALOGUE_SESSIONS_QUERY_KEY,
      patientProfileId,
      npc ?? null,
      from ?? null,
      to ?? null,
      size,
    ],
    queryFn: async () => {
      const res = await listGuardianDialogueSessions({
        patientProfileId: patientProfileId!,
        npc,
        from,
        to,
        page: 0,
        size,
      })
      return res.data
    },
    enabled: typeof patientProfileId === 'number' && patientProfileId > 0,
  })
}

export function useGuardianDialogueSession(
  patientProfileId: number | null | undefined,
  sessionId: number | null | undefined,
) {
  return useQuery({
    queryKey: [GUARDIAN_DIALOGUE_SESSION_QUERY_KEY, patientProfileId, sessionId],
    queryFn: async () => {
      const res = await getGuardianDialogueSession(patientProfileId!, sessionId!)
      return res.data
    },
    enabled:
      typeof patientProfileId === 'number' &&
      patientProfileId > 0 &&
      typeof sessionId === 'number' &&
      sessionId > 0,
  })
}

/** 백엔드에 status 필터가 없어 클라이언트에서 FINISHED (정상 종료된) 세션만 남긴다.
 *  IN_PROGRESS / ABANDONED 는 사용자에게 노출하지 않는다. */
export function pickFirstFinished(
  metas: GuardianDialogueSessionMeta[] | undefined,
): GuardianDialogueSessionMeta | null {
  if (!metas) return null
  for (const m of metas) {
    if (m.status === 'FINISHED') return m
  }
  return null
}

/** 사이드바 1줄 상태:
 *  - hasSession=false → 세션 자체가 없음 ("대화 없음")
 *  - hasSession=true,  tone=null → 세션은 있지만 concern/protective flag 없음 ("보통")
 *  - hasSession=true,  tone!=null → 안정/피로/걱정 */
export type NpcDialogueStatus = {
  tone: EmotionTone | null
  hasSession: boolean
  isLatest: boolean
  latestAt: string | null
}

export function useGuardianDialogueNpcStatuses(
  patientProfileId: number | null | undefined,
  npcs: GuardianDialogueNpc[],
): Record<GuardianDialogueNpc, NpcDialogueStatus> {
  const enabled = typeof patientProfileId === 'number' && patientProfileId > 0
  const sessionsSize = 10

  const sessionQueries = useQueries({
    queries: npcs.map(npc => ({
      queryKey: [
        GUARDIAN_DIALOGUE_SESSIONS_QUERY_KEY,
        patientProfileId,
        npc,
        null,
        null,
        sessionsSize,
      ],
      queryFn: async () => {
        const res = await listGuardianDialogueSessions({
          patientProfileId: patientProfileId!,
          npc,
          page: 0,
          size: sessionsSize,
        })
        return res.data
      },
      enabled,
    })),
  })

  const detailQueries = useQueries({
    queries: npcs.map((_, i) => {
      const latestFinished = pickFirstFinished(sessionQueries[i]?.data?.content)
      const sessionId = latestFinished?.sessionId ?? null
      return {
        queryKey: [GUARDIAN_DIALOGUE_SESSION_QUERY_KEY, patientProfileId, sessionId],
        queryFn: async () => {
          const res = await getGuardianDialogueSession(patientProfileId!, sessionId!)
          return res.data
        },
        enabled: enabled && typeof sessionId === 'number' && sessionId > 0,
      }
    }),
  })

  const latestTimes = npcs.map((_, i) => {
    const detail = detailQueries[i]?.data
    return toTimeValue(detail?.emotionAnalyzedAt ?? detail?.endedAt ?? detail?.startedAt)
  })
  const maxLatestTime = Math.max(0, ...latestTimes)

  const out = {} as Record<GuardianDialogueNpc, NpcDialogueStatus>
  npcs.forEach((npc, i) => {
    const detail = detailQueries[i]?.data
    const latestTime = latestTimes[i] ?? 0
    out[npc] = {
      tone: detail ? (toEmotionTone(detail.emotionTone) ?? deriveDominantTone(detail.turns)) : null,
      hasSession: !!detail,
      isLatest: !!detail && latestTime > 0 && latestTime === maxLatestTime,
      latestAt: detail?.emotionAnalyzedAt ?? detail?.endedAt ?? detail?.startedAt ?? null,
    }
  })
  return out
}

function toEmotionTone(tone: GuardianDialogueSessionMeta['emotionTone']): EmotionTone | null {
  switch (tone) {
    case 'CALM':
      return 'calm'
    case 'TIRED':
      return 'tired'
    case 'WORRIED':
      return 'worried'
    default:
      return null
  }
}

function toTimeValue(value: string | null | undefined): number {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

/**
 * 보호자 화면의 *오늘 종합 요약*. B4 API.
 *
 * 점수가 아니라 valence 분포 + 정성 요약 + 시그널 + 만난 NPC.
 */
export function useGuardianDialogueDailySummary(
  patientProfileId: number | null | undefined,
  date?: string,
) {
  return useQuery({
    queryKey: [GUARDIAN_DIALOGUE_DAILY_SUMMARY_QUERY_KEY, patientProfileId, date ?? null],
    queryFn: () => getGuardianDialogueDailySummary(patientProfileId!, date),
    enabled: typeof patientProfileId === 'number' && patientProfileId > 0,
  })
}

/** 보호자 화면의 *주간 응답 톤 변화*. {@code endDate} 포함 7일치 긍정+보통 비율 %. */
export function useGuardianDialogueWeeklyTrend(
  patientProfileId: number | null | undefined,
  endDate?: string,
) {
  return useQuery({
    queryKey: [GUARDIAN_DIALOGUE_WEEKLY_TREND_QUERY_KEY, patientProfileId, endDate ?? null],
    queryFn: () => getGuardianDialogueWeeklyTrend(patientProfileId!, endDate),
    enabled: typeof patientProfileId === 'number' && patientProfileId > 0,
  })
}
