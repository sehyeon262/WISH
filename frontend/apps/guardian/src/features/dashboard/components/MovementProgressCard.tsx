import { useEffect, useMemo, useState } from 'react'
import { useMyPatientId } from '@/features/auth/hooks/useMyPatientId'
import { MOVEMENTS, type Movement } from '../data/mock'
import { MOTION_CLIPS } from '../data/motionClips'
import { toRecordedMotionClip } from '../data/replayClips'
import type { GymnasticsRangeSummaryItem } from '../gymnasticsRangeSummary'
import { useGymnasticsMotionReplay, useGymnasticsRangeSummary } from '../hooks'
import { Character3D } from './Character3D'
import { ChevronDownIcon } from './icons'
import { ScoreRing } from './ScoreRing'
import styles from './MovementProgressCard.module.css'

const COLLAPSED_COUNT = 3
const TOP_CLIP_ID_BY_MOTION_ID: Record<number, string> = {
  1: 'march',
  2: 'side-step',
  3: 'torso-cross',
  4: 'face-cross',
  5: 'sit-stand',
}

type DashboardMovement = Movement & {
  motionResultId?: number
  exerciseMotionId?: number
  replayAvailable?: boolean
  progressLabel?: string
  scoreAvailable?: boolean
}

const DEFAULT_MOVEMENT_BY_ID = new Map(MOVEMENTS.map(movement => [movement.id, movement]))
const FALLBACK_THUMBNAIL = MOVEMENTS[0].thumbnail
type ReplayMode = 'raw' | 'compact'

function resolveMotionPercent(item: GymnasticsRangeSummaryItem): number {
  if (item.targetCount > 0) {
    return Math.round(Math.min(1, item.completedCount / item.targetCount) * 100)
  }

  return item.scoreAvailable ? item.currentPercent : 0
}

function toDashboardMovement(item: GymnasticsRangeSummaryItem): DashboardMovement {
  const clipId =
    TOP_CLIP_ID_BY_MOTION_ID[item.exerciseMotionId] ?? `motion-${item.exerciseMotionId}`
  const fallback = DEFAULT_MOVEMENT_BY_ID.get(clipId)

  return {
    id: clipId,
    motionResultId: item.motionResultId,
    exerciseMotionId: item.exerciseMotionId,
    replayAvailable: item.replayAvailable,
    name: item.motionName || fallback?.name || '체조 동작',
    score: resolveMotionPercent(item),
    thumbnail: fallback?.thumbnail ?? FALLBACK_THUMBNAIL,
    progressLabel: item.progressLabel,
    scoreAvailable: item.targetCount > 0 || item.scoreAvailable,
  }
}

function formatReplayTime(ms: number): string {
  return `${Math.max(0, Math.floor(ms / 1000))}s`
}

export function MovementProgressCard() {
  const { data: patientId } = useMyPatientId()
  const { data: rangeSummary, isLoading: isRangeSummaryLoading } =
    useGymnasticsRangeSummary(patientId)
  const [expanded, setExpanded] = useState(true)
  const [activeMotionId, setActiveMotionId] = useState<string | null>(null)
  const [isReplayPlaying, setIsReplayPlaying] = useState(true)
  const [replayTimeMs, setReplayTimeMs] = useState(0)
  const [replayMode, setReplayMode] = useState<ReplayMode>('raw')

  const scoreColor = (score: number) => {
    if (score >= 90) return { from: '#6ddec0', to: '#34c99c' }
    if (score >= 70) return { from: '#a892ff', to: '#7c5cff' }
    return { from: '#7cc7ff', to: '#5b9eff' }
  }

  const movements = useMemo<DashboardMovement[]>(() => {
    if (!rangeSummary || rangeSummary.items.length === 0) return []
    return rangeSummary.items.map(toDashboardMovement)
  }, [rangeSummary])

  useEffect(() => {
    if (!activeMotionId) return
    if (movements.some(movement => movement.id === activeMotionId)) return
    setActiveMotionId(null)
  }, [activeMotionId, movements])

  const visible = expanded ? movements : movements.slice(0, COLLAPSED_COUNT)
  const canExpand = movements.length > COLLAPSED_COUNT

  const activeMovement = useMemo(
    () => movements.find(movement => movement.id === activeMotionId) ?? null,
    [activeMotionId, movements],
  )
  const { data: replayResult } = useGymnasticsMotionReplay(
    activeMovement?.motionResultId,
    activeMovement?.replayAvailable === true,
  )
  const rawReplayClip = useMemo(
    () =>
      activeMovement
        ? toRecordedMotionClip(
            replayResult?.replay,
            `replay-${activeMovement.id}`,
            activeMovement.name,
            'recorded',
          )
        : null,
    [activeMovement, replayResult],
  )
  const compactReplayClip = useMemo(
    () =>
      activeMovement
        ? toRecordedMotionClip(
            replayResult?.compactReplay,
            `compact-replay-${activeMovement.id}`,
            activeMovement.name,
            'compact',
          )
        : null,
    [activeMovement, replayResult],
  )

  useEffect(() => {
    setReplayMode('raw')
  }, [activeMovement?.motionResultId])

  useEffect(() => {
    if (replayMode === 'compact' && !compactReplayClip) {
      setReplayMode('raw')
    }
  }, [compactReplayClip, replayMode])

  const selectedReplayMode: ReplayMode =
    replayMode === 'compact' && compactReplayClip ? 'compact' : 'raw'
  const selectedReplayClip = selectedReplayMode === 'compact' ? compactReplayClip : rawReplayClip
  const fallbackClip = activeMotionId ? (MOTION_CLIPS[activeMotionId] ?? null) : null
  const activeClip = selectedReplayClip ?? fallbackClip
  const hasStoredReplay = activeClip?.source === 'recorded' || activeClip?.source === 'compact'

  useEffect(() => {
    setReplayTimeMs(0)
    setIsReplayPlaying(true)
  }, [activeClip?.id, selectedReplayMode])

  useEffect(() => {
    if (!activeClip || !hasStoredReplay || !isReplayPlaying) return

    let frameId = 0
    let previous = performance.now()
    const tick = (now: number) => {
      const delta = now - previous
      previous = now
      setReplayTimeMs(current => {
        const durationMs = Math.max(1, activeClip.durationMs)
        return (current + delta) % durationMs
      })
      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frameId)
  }, [activeClip, hasStoredReplay, isReplayPlaying])

  const toggleMotion = (id: string) => {
    setActiveMotionId(prev => (prev === id ? null : id))
  }

  return (
    <article className={styles.card}>
      <div className={styles.sessionToggle}>
        <span className={styles.sessionLabel}>
          {rangeSummary ? '최근 체조 세션 동작' : '체조 동작 기록'}
        </span>
      </div>

      <div className={`${styles.leftCol} ${!expanded ? styles.leftColCollapsed : ''}`}>
        {visible.length === 0 ? (
          <div className={styles.emptyState}>
            <strong>
              {isRangeSummaryLoading ? '기록을 불러오는 중입니다.' : '최근 체조 기록이 없습니다.'}
            </strong>
            <span>아이의 체조 세션이 저장되면 완료 동작과 리플레이를 보여줍니다.</span>
          </div>
        ) : (
          <div className={styles.list}>
            {visible.map(movement => {
              const { from, to } = scoreColor(movement.score)
              const isActive = activeMotionId === movement.id
              return (
                <button
                  key={movement.id}
                  type="button"
                  className={`${styles.row} ${isActive ? styles.rowActive : ''}`}
                  onClick={() => toggleMotion(movement.id)}
                  aria-pressed={isActive}
                >
                  <div className={styles.thumb} aria-hidden>
                    <img src={movement.thumbnail} alt="" />
                  </div>
                  <span className={styles.rowText}>
                    <span className={styles.rowName}>{movement.name}</span>
                    {movement.progressLabel && (
                      <span className={styles.rowMeta}>{movement.progressLabel}</span>
                    )}
                  </span>
                  {movement.scoreAvailable === false ? (
                    <span className={styles.sessionBadge}>세션 기록</span>
                  ) : (
                    <ScoreRing
                      value={movement.score}
                      size={52}
                      strokeWidth={5.5}
                      fontSize={17}
                      gradientFrom={from}
                      gradientTo={to}
                    />
                  )}
                </button>
              )
            })}
          </div>
        )}

        {canExpand && (
          <button
            type="button"
            className={styles.viewAll}
            onClick={() => setExpanded(value => !value)}
            aria-expanded={expanded}
          >
            {expanded ? '접기' : '전체 동작 보기'}
            <ChevronDownIcon
              className={`${styles.viewAllChev} ${expanded ? styles.viewAllChevOpen : ''}`}
            />
          </button>
        )}
      </div>

      <div className={styles.rightCol}>
        <div className={styles.ghost} aria-hidden />
        <div className={styles.stage}>
          <Character3D
            activeMotion={activeClip}
            playbackTimeMs={hasStoredReplay ? replayTimeMs : null}
          />
        </div>
        {activeMovement && (
          <div className={styles.replayPanel}>
            {hasStoredReplay && activeClip ? (
              <div className={styles.replayControls}>
                <button
                  type="button"
                  className={styles.replayButton}
                  onClick={() => setIsReplayPlaying(value => !value)}
                >
                  {isReplayPlaying ? '일시정지' : '재생'}
                </button>
                <input
                  className={styles.replaySlider}
                  type="range"
                  min={0}
                  max={Math.max(1, activeClip.durationMs)}
                  value={Math.min(replayTimeMs, Math.max(1, activeClip.durationMs))}
                  onChange={event => {
                    setIsReplayPlaying(false)
                    setReplayTimeMs(Number(event.currentTarget.value))
                  }}
                  aria-label="리플레이 재생 위치"
                />
                <span className={styles.replayTime}>
                  {formatReplayTime(replayTimeMs)} / {formatReplayTime(activeClip.durationMs)}
                </span>
              </div>
            ) : (
              <p className={styles.replayFallback}>
                {activeMovement.replayAvailable
                  ? '좌표 리플레이를 불러오지 못해 기본 동작을 보여줍니다.'
                  : '저장된 좌표 리플레이가 없어 기본 동작을 보여줍니다.'}
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
