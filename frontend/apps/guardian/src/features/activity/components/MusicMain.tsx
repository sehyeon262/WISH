import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  getChartStats,
  getMusicResult,
  type ChartStats,
  type MusicResultDetail,
} from '@wish/api-client'
import { useMyPatientId } from '@/features/auth/hooks/useMyPatientId'
import { useDailyUsageStats, useMyMusicResults, useUsageAverages } from '../hooks'
import { ActivityEmptyState } from './ActivityEmptyState'
import styles from './MusicMain.module.css'

const TONE_CLASS = {
  perfect: styles.chipPerfect,
  great: styles.chipGreat,
  good: styles.chipGood,
  miss: styles.chipMiss,
}

function todayKst(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

function dateKstFromIso(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

function timeKst(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '0초'
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes <= 0) return `${seconds}초`
  if (seconds === 0) return `${minutes}분`
  return `${minutes}분 ${seconds}초`
}

function formatScore(score: number): string {
  return `${score.toLocaleString('ko-KR')}점`
}

function rankLabel(rank: string): string {
  return rank === 'D' ? '연습 중' : `${rank}등급`
}

function accuracyMessage(accuracy: number): { headline: string; sub: string; emoji: string } {
  if (accuracy >= 0.95)
    return { headline: '완벽한 박자였어요!', sub: '정확도가 매우 높아요.', emoji: '✨' }
  if (accuracy >= 0.85)
    return { headline: '박자를 잘 맞췄어요!', sub: '정확도가 높아요.', emoji: '🎵' }
  if (accuracy >= 0.7)
    return { headline: '리듬을 잘 따라갔어요.', sub: '조금만 더 정확하게!', emoji: '🎶' }
  if (accuracy >= 0.5)
    return { headline: '꾸준히 따라갔어요.', sub: '연습하면 더 좋아져요.', emoji: '👏' }
  return { headline: '리듬에 익숙해지는 중.', sub: '함께 한 번 더 도전해봐요.', emoji: '💜' }
}

export function MusicMain() {
  const [searchParams] = useSearchParams()
  const queryId = searchParams.get('id')
  const initialResultId = queryId ? Number(queryId) : null

  const { data: page, isLoading, error } = useMyMusicResults({ size: 100 })
  const allResults = useMemo<MusicResultDetail[]>(() => page?.content ?? [], [page])

  const { data: patientId } = useMyPatientId()
  const today = todayKst()

  // 오늘 결과만, playedAt desc.
  const dayResults = useMemo(() => {
    return allResults
      .filter(r => dateKstFromIso(r.playedAt) === today)
      .sort((a, b) => +new Date(b.playedAt) - +new Date(a.playedAt))
  }, [allResults, today])

  const [selectedIndex, setSelectedIndex] = useState(0)

  // ?id= 딥링크가 오늘 결과면 그 인덱스로 점프 (구버전 링크 호환).
  const initializedRef = useRef(false)
  useEffect(() => {
    if (initializedRef.current) return
    if (dayResults.length === 0) return
    initializedRef.current = true
    if (initialResultId == null || Number.isNaN(initialResultId)) return
    const idx = dayResults.findIndex(r => r.id === initialResultId)
    if (idx >= 0) setSelectedIndex(idx)
  }, [dayResults, initialResultId])

  const safeIndex = Math.min(selectedIndex, Math.max(0, dayResults.length - 1))
  const current: MusicResultDetail | undefined = dayResults[safeIndex]

  const { data: daily } = useDailyUsageStats(patientId ?? undefined, { from: today, to: today })
  const dayMusicSeconds = daily?.items[0]?.music ?? 0
  const dayMusicMs = dayMusicSeconds * 1000
  const dayMusicLabel = formatDuration(dayMusicMs)
  // 또래 평균 — today 윈도우로 mineSeconds 와 분모/스케일 일치.
  const { data: averages } = useUsageAverages({ from: today, to: today })
  const peerMusic = averages?.contentAverages.find(c => c.contentType === 'MUSIC')
  const hasPeerMusic = peerMusic != null && (averages?.activePatients ?? 0) > 0
  const peerMusicMs = hasPeerMusic ? peerMusic.averageSeconds * 1000 : 0
  const peerMusicLabel = hasPeerMusic ? formatDuration(peerMusicMs) : '집계 중'
  const peerScaleMax = Math.max(dayMusicMs, peerMusicMs, 1)
  const minePctMusic = (dayMusicMs / peerScaleMax) * 100
  const peerPctMusic = hasPeerMusic ? (peerMusicMs / peerScaleMax) * 100 : 0

  // 차트 통계 (옵셔널, 실패해도 화면 안 깨짐).
  const [chartStats, setChartStats] = useState<ChartStats | undefined>(undefined)
  useEffect(() => {
    if (!current) {
      setChartStats(undefined)
      return
    }
    let cancelled = false
    getChartStats(current.chartId)
      .then(r => {
        if (!cancelled) setChartStats(r.data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [current?.chartId, current])
  void chartStats

  // list API 응답엔 presigned videoUrl 이 비어있어 슬라이드별 단건 조회로 보강.
  const [detailById, setDetailById] = useState<Record<number, MusicResultDetail>>({})
  useEffect(() => {
    if (dayResults.length === 0) return
    let cancelled = false
    for (const r of dayResults) {
      if (r.videoUrl) continue
      if (detailById[r.id]) continue
      getMusicResult(r.id)
        .then(res => {
          if (!cancelled) {
            setDetailById(prev => ({ ...prev, [r.id]: res.data }))
          }
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [dayResults, detailById])

  // 가로 슬라이더 — scroll snap 기반.
  const sliderRef = useRef<HTMLDivElement>(null)

  // 슬라이드 스크롤 → 선택 인덱스 동기화.
  useEffect(() => {
    const el = sliderRef.current
    if (!el) return
    let raf = 0
    const handleScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const w = el.clientWidth
        if (w <= 0) return
        const idx = Math.round(el.scrollLeft / w)
        setSelectedIndex(prev => (prev !== idx ? idx : prev))
      })
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('scroll', handleScroll)
    }
  }, [dayResults.length])

  // dot 클릭 / 딥링크 점프 시 슬라이더도 동기화.
  useEffect(() => {
    const el = sliderRef.current
    if (!el) return
    const target = safeIndex * el.clientWidth
    if (Math.abs(el.scrollLeft - target) > 4) {
      el.scrollTo({ left: target, behavior: 'smooth' })
    }
  }, [safeIndex])

  if (isLoading) {
    return <ActivityEmptyState variant="loading" icon="🎵" title="활동 결과를 불러오는 중..." />
  }
  if (error) {
    return (
      <ActivityEmptyState
        variant="error"
        icon="⚠️"
        title="활동을 불러오지 못했어요"
        description="잠시 후 다시 시도해주세요"
      />
    )
  }
  if (allResults.length === 0) {
    return (
      <ActivityEmptyState
        icon="🎵"
        title="아직 음악 활동 기록이 없어요"
        description="아이와 함께 음악실에서 연주를 시작해보세요"
      />
    )
  }
  if (dayResults.length === 0 || !current) {
    return (
      <ActivityEmptyState
        icon="🎵"
        title="오늘 음악 활동 기록이 없어요"
        description="오늘도 음악실에서 즐거운 연주를!"
      />
    )
  }

  const message = accuracyMessage(current.accuracy)
  const hasMultiple = dayResults.length > 1

  const stats = [
    { id: 'song', icon: '🎵', label: '선택한 노래', value: current.chartTitle },
    {
      id: 'time',
      icon: '🕐',
      label: '플레이 시간',
      value: formatDuration(current.playedDurationMs),
    },
    { id: 'score', icon: '⭐', label: '점수', value: formatScore(current.score) },
    { id: 'rank', icon: '🏆', label: '활동 결과', value: rankLabel(current.rank) },
  ] as const

  const chips = [
    { id: 'perfect', label: 'Perfect', value: current.perfectCount, tone: 'perfect' as const },
    { id: 'great', label: 'Great', value: current.greatCount ?? 0, tone: 'great' as const },
    { id: 'good', label: 'Good', value: current.goodCount, tone: 'good' as const },
    { id: 'miss', label: 'Miss', value: current.missCount, tone: 'miss' as const },
  ]

  return (
    <>
      <section className={styles.heroCard}>
        <div className={styles.heroBody}>
          <div
            className={styles.mediaSlider}
            ref={sliderRef}
            role="region"
            aria-label="오늘 플레이 영상 슬라이드"
          >
            {dayResults.map(r => {
              const d = detailById[r.id] ?? r
              return (
                <div key={r.id} className={styles.slide}>
                  {d.videoUrl ? (
                    <video
                      className={styles.video}
                      src={d.videoUrl}
                      poster={d.thumbUrl ?? undefined}
                      controls
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <span className={styles.videoFallback}>영상 준비 중</span>
                  )}
                </div>
              )
            })}
          </div>

          <div className={styles.heroMeta}>
            <span className={styles.tag}>음악실</span>
            <h3 className={styles.songTitle}>{current.chartTitle}</h3>
            <p className={styles.playedAt}>{timeKst(current.playedAt)} 플레이</p>
            <p className={styles.description}>리듬에 맞춰 노트를 따라치며 연주했어요.</p>
            {hasMultiple && (
              <div className={styles.dots} role="tablist" aria-label="플레이 선택">
                {dayResults.map((r, i) => (
                  <button
                    key={r.id}
                    type="button"
                    role="tab"
                    aria-selected={i === safeIndex}
                    aria-label={`${i + 1}번째 플레이`}
                    className={`${styles.dot} ${i === safeIndex ? styles.dotActive : ''}`}
                    onClick={() => setSelectedIndex(i)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={styles.statRow}>
        {stats.map(stat => (
          <div key={stat.id} className={styles.statCard}>
            <span className={styles.statIcon} aria-hidden>
              {stat.icon}
            </span>
            <div className={styles.statBody}>
              <span className={styles.statLabel}>{stat.label}</span>
              <span className={styles.statValue}>{stat.value}</span>
            </div>
          </div>
        ))}
      </section>

      <section className={styles.accuracyCard}>
        <div className={styles.accuracyMeta}>
          <h4 className={styles.accuracyTitle}>리듬 정확도</h4>
          <span className={styles.accuracySub}>{Math.round(current.accuracy * 100)}%</span>
          <p className={styles.accuracyMessage}>
            <span aria-hidden className={styles.accuracyIcon}>
              {message.emoji}
            </span>
            <span className={styles.accuracyMessageText}>
              <strong>{message.headline}</strong>
              <span>{message.sub}</span>
            </span>
          </p>
        </div>
        <div className={styles.chipRow}>
          {chips.map(chip => (
            <div key={chip.id} className={`${styles.chip} ${TONE_CLASS[chip.tone]}`}>
              <span className={styles.chipLabel}>{chip.label}</span>
              <span className={styles.chipValue}>{chip.value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.peerCard}>
        <div className={styles.peerLabel}>
          <span className={styles.peerIcon} aria-hidden>
            👥
          </span>
          <div className={styles.peerLabelText}>
            <strong>다른 사용자들과 비교</strong>
            <span>
              {hasPeerMusic ? '오늘 활동 환자 기준 평균이에요.' : '평균 데이터를 모으는 중이에요.'}
            </span>
          </div>
        </div>
        <div className={styles.peerBars}>
          <div className={styles.peerSide}>
            <div className={styles.peerSideHead}>
              <span className={styles.peerSideLabel}>다른 사용자들 평균</span>
              <strong className={styles.peerSideValue}>{peerMusicLabel}</strong>
            </div>
            <div className={`${styles.peerBar} ${styles.peerBarOther}`} aria-hidden>
              <div className={styles.peerBarFill} style={{ width: `${peerPctMusic}%` }} />
            </div>
          </div>
          <span className={styles.peerVs} aria-hidden>
            VS
          </span>
          <div className={styles.peerSide}>
            <div className={styles.peerSideHead}>
              <span className={styles.peerSideLabel}>우리 아이 오늘 음악 시간</span>
              <strong className={styles.peerSideValue}>{dayMusicLabel}</strong>
            </div>
            <div className={`${styles.peerBar} ${styles.peerBarMine}`} aria-hidden>
              <div className={styles.peerBarFill} style={{ width: `${minePctMusic}%` }} />
            </div>
          </div>
        </div>
        <div className={styles.peerSummary}>
          <span aria-hidden className={styles.peerSummaryIcon}>
            📈
          </span>
          <span>
            평균
            <br />
            <strong>{peerMusicLabel}</strong>
          </span>
        </div>
      </section>
    </>
  )
}
