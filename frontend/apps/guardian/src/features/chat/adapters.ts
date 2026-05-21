import type {
  GuardianDialogueNpc,
  GuardianDialogueSentimentWord,
  GuardianDialogueSessionDetail,
  GuardianDialogueSessionMeta,
  GuardianDialogueTurn,
} from '@wish/api-client'
import type {
  ChatMessage,
  EmotionShare,
  EmotionSignal,
  EmotionTrendPoint,
  MessagePart,
} from './data/mock'
import { getFlagLabel } from './flagLabels'

export const NPC_TO_CHARACTER_ID: Record<GuardianDialogueNpc, string> = {
  YEONGCHEOL: 'yeongchul',
  SEORIN: 'comong',
  DAIN: 'dain',
  GEONBIN: 'gunbin',
  JEONGHO: 'jeongho',
  SEHYEON: 'sehyun',
  JOEUN: 'joeun',
}

export const CHARACTER_ID_TO_NPC: Record<string, GuardianDialogueNpc> = Object.fromEntries(
  Object.entries(NPC_TO_CHARACTER_ID).map(([npc, id]) => [id, npc as GuardianDialogueNpc]),
)

export function toChatMessages(turns: GuardianDialogueTurn[]): ChatMessage[] {
  const sorted = [...turns].sort((a, b) => a.stepIndex - b.stepIndex)
  const out: ChatMessage[] = []
  for (const t of sorted) {
    if (t.questionText) {
      pushCharacterMessage(out, `t${t.id}-q`, t.questionText)
    }
    if (t.choiceText) {
      out.push({
        id: `t${t.id}-c`,
        speaker: 'child',
        parts: highlightSentimentWords(t.choiceText, t.sentimentWords ?? [], t.valence),
      })
    }
    if (t.npcResponseText) {
      pushCharacterMessage(out, `t${t.id}-r`, t.npcResponseText)
    }
  }
  return out
}

function pushCharacterMessage(out: ChatMessage[], id: string, text: string) {
  const trimmed = text.trim()
  if (!trimmed) return
  const previous = out[out.length - 1]
  if (
    previous?.speaker === 'character' &&
    previous.parts
      .map(part => part.text)
      .join('')
      .trim() === trimmed
  ) {
    return
  }
  out.push({
    id,
    speaker: 'character',
    parts: [{ text: trimmed }],
  })
}

/**
 * 카탈로그가 지정한 sentimentWords 가 있으면 단어 단위로 색상 강조.
 * 없으면 valence 로 전체 문장 톤만 표시.
 */
function highlightSentimentWords(
  text: string,
  words: GuardianDialogueSentimentWord[],
  valence: GuardianDialogueTurn['valence'],
): MessagePart[] {
  if (!words || words.length === 0) {
    if (valence === 'POSITIVE') return [{ text, sentiment: 'positive' }]
    if (valence === 'NEGATIVE') return [{ text, sentiment: 'negative' }]
    return [{ text }]
  }
  // sentimentWords 의 phrase 를 text 안에서 찾아 분리 (긴 phrase 먼저 매칭)
  const sorted = [...words].sort((a, b) => b.phrase.length - a.phrase.length)
  const parts: MessagePart[] = [{ text }]
  for (const w of sorted) {
    if (!w.phrase) continue
    const tone: 'positive' | 'negative' = w.tone === 'POSITIVE' ? 'positive' : 'negative'
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]
      if (p.sentiment) continue
      const idx = p.text.indexOf(w.phrase)
      if (idx === -1) continue
      const before = p.text.slice(0, idx)
      const after = p.text.slice(idx + w.phrase.length)
      const replacement: MessagePart[] = []
      if (before) replacement.push({ text: before })
      replacement.push({ text: w.phrase, sentiment: tone })
      if (after) replacement.push({ text: after })
      parts.splice(i, 1, ...replacement)
      i += replacement.length - 1
    }
  }
  return parts
}

export function toEmotionTrend(turns: GuardianDialogueTurn[]): EmotionTrendPoint[] {
  const sorted = [...turns].sort((a, b) => a.stepIndex - b.stepIndex)
  return sorted.map((t, i) => ({
    label: `${i + 1}`,
    score: clamp01to100(normalizeIntensity(t.intensity ?? 0)),
  }))
}

export function toTopicTags(turns: GuardianDialogueTurn[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  // 1순위: catalog 가 명시한 topicKeywords (주제 그 자체)
  for (const t of turns) {
    for (const k of t.topicKeywords ?? []) {
      if (seen.has(k)) continue
      seen.add(k)
      out.push(k)
      if (out.length >= 10) return out
    }
  }
  // 폴백: 옛 turn (topicKeywords 미보유) — flag 라벨로 대체
  if (out.length === 0) {
    for (const t of turns) {
      for (const f of [...t.concernFlags, ...t.protectiveFactors]) {
        if (seen.has(f)) continue
        seen.add(f)
        out.push(getFlagLabel(f).label)
        if (out.length >= 10) return out
      }
    }
  }
  return out
}

export function toEmotionSignals(turns: GuardianDialogueTurn[]): EmotionSignal[] {
  const out: EmotionSignal[] = []
  const seen = new Set<string>()
  for (const t of turns) {
    for (const f of t.concernFlags) {
      const key = `c:${f}`
      if (seen.has(key)) continue
      seen.add(key)
      const meta = getFlagLabel(f)
      out.push({
        id: key,
        tone: 'worried',
        title: meta.label,
        description: meta.description || (t.choiceText ?? t.questionText),
      })
    }
    for (const f of t.protectiveFactors) {
      const key = `p:${f}`
      if (seen.has(key)) continue
      seen.add(key)
      const meta = getFlagLabel(f)
      out.push({
        id: key,
        tone: 'calm',
        title: meta.label,
        description: meta.description || (t.choiceText ?? t.questionText),
      })
    }
  }
  return out
}

export function toEmotionShares(turns: GuardianDialogueTurn[]): EmotionShare[] {
  let concern = 0
  let protective = 0
  for (const t of turns) {
    concern += t.concernFlags.length
    protective += t.protectiveFactors.length
  }
  const total = concern + protective
  if (total === 0) {
    return [
      { tone: 'calm', label: '안정', percent: 0 },
      { tone: 'tired', label: '피로', percent: 0 },
      { tone: 'worried', label: '걱정', percent: 0 },
    ]
  }
  const calmPct = Math.round((protective / total) * 100)
  const worriedPct = Math.round((concern / total) * 100)
  return [
    { tone: 'calm', label: '안정', percent: calmPct },
    { tone: 'tired', label: '피로', percent: Math.max(0, 100 - calmPct - worriedPct) },
    { tone: 'worried', label: '걱정', percent: worriedPct },
  ]
}

export function formatWhenLabel(startedAt: string): string {
  const d = new Date(startedAt)
  if (Number.isNaN(d.getTime())) return startedAt
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const yest = new Date(now)
  yest.setDate(now.getDate() - 1)
  const isYesterday =
    d.getFullYear() === yest.getFullYear() &&
    d.getMonth() === yest.getMonth() &&
    d.getDate() === yest.getDate()
  const hh = d.getHours()
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ampm = hh < 12 ? '오전' : '오후'
  const hh12 = hh % 12 === 0 ? 12 : hh % 12
  const time = `${ampm} ${hh12}:${mm}`
  if (sameDay) return `오늘, ${time}`
  if (isYesterday) return `어제, ${time}`
  return `${d.getMonth() + 1}월 ${d.getDate()}일, ${time}`
}

export function formatDurationLabel(meta: GuardianDialogueSessionMeta): string {
  const seconds =
    meta.durationSeconds ??
    (meta.endedAt
      ? Math.max(
          0,
          Math.round(
            (new Date(meta.endedAt).getTime() - new Date(meta.startedAt).getTime()) / 1000,
          ),
        )
      : null)
  const status =
    meta.status === 'FINISHED'
      ? meta.finishReason === 'COMPLETED'
        ? '대화 완료'
        : meta.finishReason === 'REST_TODAY'
          ? '오늘은 쉼'
          : '종료'
      : meta.status === 'IN_PROGRESS'
        ? '진행 중'
        : '중단됨'
  if (seconds == null) return status
  const mins = Math.max(1, Math.round(seconds / 60))
  return `${status} (${mins}분)`
}

function normalizeIntensity(intensity: number): number {
  // intensity 범위 가정: -3..+3 또는 0..1 등 다양한 경우 대응. 0~100 으로 평탄화.
  if (intensity >= -1 && intensity <= 1) return (intensity + 1) * 50
  if (intensity >= -3 && intensity <= 3) return ((intensity + 3) / 6) * 100
  return Math.max(0, Math.min(100, intensity))
}

function clamp01to100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

const FATIGUE_FLAGS = new Set([
  'fatigue_present',
  'fatigue_high',
  'needs_rest',
  'rest_need_named',
  'sleep_worry',
])

export type EmotionTone = 'calm' | 'tired' | 'worried'

export function deriveDominantTone(turns: GuardianDialogueTurn[]): EmotionTone | null {
  if (turns.length === 0) return null
  let concern = 0
  let protective = 0
  let fatigue = 0
  for (const t of turns) {
    concern += t.concernFlags.length
    protective += t.protectiveFactors.length
    fatigue += t.concernFlags.filter(f => FATIGUE_FLAGS.has(f)).length
  }
  if (concern === 0 && protective === 0) return null
  if (fatigue > 0 && fatigue >= concern - fatigue) return 'tired'
  if (concern > protective) return 'worried'
  return 'calm'
}

export type DialogueDerivations = {
  messages: ChatMessage[]
  trend: EmotionTrendPoint[]
  shares: EmotionShare[]
  signals: EmotionSignal[]
  topics: string[]
}

export function deriveFromSession(detail: GuardianDialogueSessionDetail): DialogueDerivations {
  return {
    messages: toChatMessages(detail.turns),
    trend: toEmotionTrend(detail.turns),
    shares: toEmotionShares(detail.turns),
    signals: toEmotionSignals(detail.turns),
    topics: toTopicTags(detail.turns),
  }
}
