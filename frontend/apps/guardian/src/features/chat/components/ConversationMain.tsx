import { memo, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { ChatMessage, ConversationSummary } from '../data/mock'
import styles from './ConversationMain.module.css'
import { WishCharacter3D } from './WishCharacter3D'

const TICK_MS = 800

/** 가상의 대화 흐름: tick 이 증가할 때마다 messages 를 한 칸씩 누적 노출.
 *  마지막 메시지가 노출된 뒤로는 더 이상 진행하지 않음 (한 번만 재생). */
function useStreamingMessages(messages: ChatMessage[]) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    setTick(0)
  }, [messages])

  useEffect(() => {
    if (messages.length === 0) return
    if (tick >= messages.length - 1) return
    const id = window.setTimeout(() => setTick(t => t + 1), TICK_MS)
    return () => window.clearTimeout(id)
  }, [messages, tick])

  if (messages.length === 0) return []
  const out: Array<ChatMessage & { _streamId: string }> = []
  for (let i = 0; i <= tick && i < messages.length; i++) {
    out.push({ ...messages[i], _streamId: `s-${i}` })
  }
  return out
}

/** tick 마다 부모가 재렌더되어도 3D Canvas 가 재초기화되지 않게 격리. */
const StableLeftStage = memo(function StableLeftStage() {
  return (
    <div className={styles.stageLeft}>
      <WishCharacter3D />
    </div>
  )
})

type RightStageProps = {
  partnerImageUrl?: string
  partnerImageScale?: string
  partnerImageOffsetX?: string
  partnerImageOffsetY?: string
}

const StableRightStage = memo(function StableRightStage({
  partnerImageUrl,
  partnerImageScale,
  partnerImageOffsetX,
  partnerImageOffsetY,
}: RightStageProps) {
  return (
    <div className={styles.stageRight}>
      {partnerImageUrl ? (
        <img
          src={partnerImageUrl}
          alt=""
          className={styles.partnerImg}
          style={
            {
              ...(partnerImageScale ? { '--partner-img-scale': partnerImageScale } : {}),
              ...(partnerImageOffsetX ? { '--partner-img-x': partnerImageOffsetX } : {}),
              ...(partnerImageOffsetY ? { '--partner-img-y': partnerImageOffsetY } : {}),
            } as CSSProperties
          }
        />
      ) : null}
    </div>
  )
})

const StreamingBubbles = memo(function StreamingBubbles({ messages }: { messages: ChatMessage[] }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const visibleMessages = useStreamingMessages(messages)

  useEffect(() => {
    const node = scrollerRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [visibleMessages.length])

  return (
    <div ref={scrollerRef} className={styles.bubbles} role="log">
      {visibleMessages.map(m => (
        <div
          key={m._streamId}
          className={`${styles.bubble} ${m.speaker === 'child' ? styles.bubbleChild : ''}`}
        >
          {m.parts.map((p, i) => {
            const isChildSentiment = m.speaker === 'child' && p.sentiment
            const cls = isChildSentiment
              ? p.sentiment === 'positive'
                ? styles.bubbleTextPositive
                : styles.bubbleTextNegative
              : ''
            return (
              <span key={i} className={cls}>
                {p.text}
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
})

type Props = {
  characterName: string
  whenLabel?: string
  durationLabel?: string
  messages: ChatMessage[]
  summary: ConversationSummary
  partnerImageUrl?: string
  partnerImageScale?: string
  partnerImageOffsetX?: string
  partnerImageOffsetY?: string
  topicsSample?: boolean
  recommendedActivitySample?: boolean
  emptyState?: boolean
  onOpenPast?: () => void
  isViewingPast?: boolean
  onReturnToLatest?: () => void
}

/** 한글 받침 유무로 와/과 등 조사 결정. 비한글이면 vowel형 반환. */
function withParticle(name: string, vowel: string, consonant: string): string {
  const last = name.charCodeAt(name.length - 1)
  if (last < 0xac00 || last > 0xd7a3) return name + vowel
  const hasFinal = (last - 0xac00) % 28 !== 0
  return name + (hasFinal ? consonant : vowel)
}

function SampleBadge() {
  return <span className={styles.sampleBadge}>샘플</span>
}

export function ConversationMain({
  characterName,
  whenLabel,
  durationLabel,
  messages,
  summary,
  partnerImageUrl,
  partnerImageScale,
  partnerImageOffsetX,
  partnerImageOffsetY,
  topicsSample = false,
  recommendedActivitySample = false,
  emptyState = false,
  onOpenPast,
  isViewingPast = false,
  onReturnToLatest,
}: Props) {
  return (
    <div className={styles.card}>
      <div className={styles.topRow}>
        <div className={styles.titleBlock}>
          <h2 className={styles.title}>{withParticle(characterName, '와', '과')}의 대화</h2>
          <div className={styles.metaRow}>
            {emptyState ? (
              <span className={styles.metaChip}>아직 대화 기록 없음</span>
            ) : (
              <>
                {whenLabel && <span className={styles.metaChip}>{whenLabel}</span>}
                {durationLabel && (
                  <span className={`${styles.metaChip} ${styles.metaChipDone}`}>
                    ✓ {durationLabel}
                  </span>
                )}
                {isViewingPast && (
                  <span className={`${styles.metaChip} ${styles.metaChipPast}`}>
                    지난 대화 보는 중
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <div className={styles.topActions}>
          {isViewingPast && onReturnToLatest && (
            <button type="button" className={styles.pastBtn} onClick={onReturnToLatest}>
              ↩ 최신 대화로
            </button>
          )}
          <button type="button" className={styles.pastBtn} onClick={onOpenPast}>
            📅 지난 대화 보기
          </button>
        </div>
      </div>

      <div className={styles.stage}>
        <StableLeftStage />
        {emptyState ? (
          <div className={styles.bubbles}>
            <div className={styles.bubble}>
              {withParticle(characterName, '와', '과')} 아직 나눈 대화가 없어요.
            </div>
            <div className={styles.bubble}>게임에서 대화를 진행하면 여기에 기록돼요.</div>
          </div>
        ) : (
          <StreamingBubbles messages={messages} />
        )}
        <StableRightStage
          partnerImageUrl={partnerImageUrl}
          partnerImageScale={partnerImageScale}
          partnerImageOffsetX={partnerImageOffsetX}
          partnerImageOffsetY={partnerImageOffsetY}
        />
      </div>

      <div className={styles.summarySection}>
        <div className={styles.summaryHeader}>
          <span>✨ 대화 결과 요약</span>
          <span className={styles.summarySub}>이번 대화의 핵심을 한눈에 확인해요.</span>
        </div>
        <div className={styles.summaryRow}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryTitle}>대화 주제 {topicsSample && <SampleBadge />}</div>
            <div className={styles.summaryBody}>
              <div className={styles.tagRow}>
                {summary.topics.map(t => (
                  <span key={t} className={styles.tag}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryTitle}>
              추천 후속 활동 {recommendedActivitySample && <SampleBadge />}
            </div>
            <div className={styles.summaryBody}>
              <div>{summary.recommendedActivity}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
