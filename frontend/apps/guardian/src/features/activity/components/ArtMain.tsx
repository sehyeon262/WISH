import { useMemo, useState } from 'react'
import type { Artwork } from '@wish/api-client'
import artIconImg from '@/assets/art_icon.png'
import { useMyPatientId } from '@/features/auth/hooks/useMyPatientId'
import { PaletteColorIcon, StarFilledIcon } from '@/features/dashboard/components/icons'
import { useDailyUsageStats, useMyArtworks, useUsageAverages } from '../hooks'
import { ActivityEmptyState } from './ActivityEmptyState'
import styles from './ArtMain.module.css'

function todayKst(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

function isCreatedTodayKst(createdAt: string): boolean {
  const dateStr = new Date(createdAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  return dateStr === todayKst()
}

function artworkDisplayTitle(artwork: Artwork, indexInList: number): string {
  return artwork.title?.trim() ? artwork.title : `내 그림 ${indexInList + 1}`
}

function formatDurationSec(seconds: number): string {
  if (seconds <= 0) return '0초'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}초`
  if (s === 0) return `${m}분`
  return `${m}분 ${s}초`
}

function formatShortDateKst(createdAt: string): string {
  const kst = new Date(createdAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  const [, mm, dd] = kst.split('-')
  return `${parseInt(mm, 10)}/${parseInt(dd, 10)}`
}

const PAST_VISIBLE_COUNT = 1

// AI 요약 미구현 — Phase 3 에서 lighthouse 감정 분석과 유사한 구조로 교체.
const SUMMARY_PLACEHOLDER_TEXT = '다양한 색을 사용해서 멋진 풍경을 표현했어요.'
const SUMMARY_PLACEHOLDER_TAGS = ['색감 표현이 풍부해요', '구성이 안정적이에요', '집중력이 좋아요']

/**
 * 미술 활동 결과 화면.
 * 좌측: 당일 그림 carousel + 활동 요약 카드.
 * 우측: 그림별 정보 카드 (시간/색/종류) + 또래 평균 비교 + 지난 그림 보기.
 */
export function ArtMain() {
  const { data, isLoading, error } = useMyArtworks({ size: 20 })
  const { data: patientId } = useMyPatientId()
  const today = todayKst()
  const { data: daily } = useDailyUsageStats(patientId ?? undefined, {
    from: today,
    to: today,
  })
  // mineSeconds 가 today 단일일이라 또래 평균도 같은 today 윈도우로 맞춰야 분모/스케일이 일치.
  const { data: averages } = useUsageAverages({ from: today, to: today })
  const peerArt = averages?.contentAverages.find(c => c.contentType === 'ART')
  const todayArtSeconds = daily?.items[0]?.art ?? 0
  const [index, setIndex] = useState(0)

  const todayArtworks = useMemo<Artwork[]>(() => {
    if (!data?.content) return []
    return data.content.filter(a => isCreatedTodayKst(a.createdAt))
  }, [data])

  const pastArtworks = useMemo<Artwork[]>(() => {
    if (!data?.content) return []
    return data.content.filter(a => !isCreatedTodayKst(a.createdAt))
  }, [data])

  if (isLoading) {
    return <ActivityEmptyState variant="loading" icon="🎨" title="그림을 불러오는 중..." />
  }

  if (error) {
    return (
      <ActivityEmptyState
        variant="error"
        icon="⚠️"
        title="그림을 불러오지 못했어요"
        description="잠시 후 다시 시도해주세요"
      />
    )
  }

  if (todayArtworks.length === 0) {
    return (
      <ActivityEmptyState
        icon="🎨"
        title="오늘 그린 그림이 아직 없어요"
        description="아이와 함께 그림을 그려보세요"
      />
    )
  }

  const safeIndex = Math.min(index, todayArtworks.length - 1)
  const current = todayArtworks[safeIndex]
  const hasPrev = safeIndex > 0
  const hasNext = safeIndex < todayArtworks.length - 1

  return (
    <div className={styles.layout}>
      <div className={styles.mainColumn}>
        <section className={styles.heroCard}>
          <h2 className={styles.title}>미술 결과</h2>
          <div className={styles.carousel}>
            <div className={styles.imageFrame}>
              <img
                src={current.imageUrl}
                alt={artworkDisplayTitle(current, safeIndex)}
                className={styles.image}
              />
              {todayArtworks.length > 1 && (
                <>
                  <button
                    type="button"
                    className={`${styles.navBtn} ${styles.navPrev}`}
                    onClick={() => setIndex(i => Math.max(0, i - 1))}
                    disabled={!hasPrev}
                    aria-label="이전 그림"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className={`${styles.navBtn} ${styles.navNext}`}
                    onClick={() => setIndex(i => Math.min(todayArtworks.length - 1, i + 1))}
                    disabled={!hasNext}
                    aria-label="다음 그림"
                  >
                    ›
                  </button>
                </>
              )}
            </div>
            <div className={styles.captionBar}>
              <span className={styles.captionMascot} aria-hidden>
                <PaletteColorIcon width={26} height={26} />
              </span>
              <div className={styles.captionText}>
                <span className={styles.captionLabel}>오늘의 작품</span>
                <strong className={styles.captionTitle}>
                  {artworkDisplayTitle(current, safeIndex)}
                </strong>
              </div>
            </div>
          </div>
          {todayArtworks.length > 1 && (
            <div className={styles.indexPill}>
              {safeIndex + 1} / {todayArtworks.length}
            </div>
          )}
        </section>
        <ArtSummaryCard />
      </div>
      <aside className={styles.sideColumn}>
        <ArtInfoCard artwork={current} />
        <ArtPeerCompareCard
          mineSeconds={todayArtSeconds}
          peerSeconds={peerArt?.averageSeconds ?? null}
          activePatients={averages?.activePatients ?? 0}
        />
        <ArtPastCarousel artworks={pastArtworks} />
      </aside>
    </div>
  )
}

function ArtSummaryCard() {
  return (
    <section className={styles.summaryCard}>
      <span aria-hidden className={styles.summarySparkleA}>
        ✦
      </span>
      <span aria-hidden className={styles.summarySparkleB}>
        ✦
      </span>
      <span aria-hidden className={styles.summarySparkleC}>
        ✦
      </span>
      <div className={styles.summaryBody}>
        <h3 className={styles.summaryTitle}>
          <StarFilledIcon width={22} height={22} aria-hidden className={styles.summaryStar} />
          오늘의 미술 활동 요약
        </h3>
        <p className={styles.summaryText}>{SUMMARY_PLACEHOLDER_TEXT}</p>
        <div className={styles.summaryTags}>
          {SUMMARY_PLACEHOLDER_TAGS.map(tag => (
            <span key={tag} className={styles.summaryTag}>
              {tag}
            </span>
          ))}
        </div>
      </div>
      <img src={artIconImg} alt="" aria-hidden className={styles.summaryMascot} />
    </section>
  )
}

function ArtPeerCompareCard({
  mineSeconds,
  peerSeconds,
  activePatients,
}: {
  mineSeconds: number
  peerSeconds: number | null
  activePatients: number
}) {
  // BE /usage-stats/period-averages 가 today 윈도우로 활동 환자 수 = 0 일 수도 있다.
  // 그 경우 averageSeconds 도 0 으로 내려오는데 "비교"가 아니라 "집계 중" UI 가 더 정확.
  const hasPeer = peerSeconds != null && activePatients > 0
  const peerValue = hasPeer ? peerSeconds : 0

  const max = Math.max(mineSeconds, peerValue, 1)
  const minePct = (mineSeconds / max) * 100
  const peerPct = hasPeer ? (peerValue / max) * 100 : 0
  const peerLabel = hasPeer ? formatDurationSec(peerValue) : '집계 중'

  return (
    <section className={styles.peerCard}>
      <h3 className={styles.peerCardTitle}>다른 사용자들과 비교</h3>
      <div className={styles.peerRows}>
        <div className={styles.peerRow}>
          <div className={styles.peerRowHead}>
            <span className={styles.peerRowLabel}>아이</span>
            <strong className={styles.peerRowValue}>{formatDurationSec(mineSeconds)}</strong>
          </div>
          <div className={styles.peerBar}>
            <div
              className={`${styles.peerBarFill} ${styles.peerBarFillMine}`}
              style={{ width: `${minePct}%` }}
            />
          </div>
        </div>
        <div className={styles.peerRow}>
          <div className={styles.peerRowHead}>
            <span className={styles.peerRowLabel}>평균</span>
            <strong className={styles.peerRowValue}>{peerLabel}</strong>
          </div>
          <div className={styles.peerBar}>
            <div
              className={`${styles.peerBarFill} ${styles.peerBarFillOther}`}
              style={{ width: `${peerPct}%` }}
            />
          </div>
        </div>
      </div>
      {!hasPeer && (
        <div className={styles.peerNote}>
          <span aria-hidden className={styles.peerNoteIcon}>
            ⌛
          </span>
          <span>또래 평균 데이터를 모으는 중이에요</span>
        </div>
      )}
    </section>
  )
}

function ArtPastCarousel({ artworks }: { artworks: Artwork[] }) {
  const [offset, setOffset] = useState(0)
  const safeOffset = Math.min(offset, Math.max(0, artworks.length - PAST_VISIBLE_COUNT))
  const visible = artworks.slice(safeOffset, safeOffset + PAST_VISIBLE_COUNT)
  const hasPrev = safeOffset > 0
  const hasNext = safeOffset + PAST_VISIBLE_COUNT < artworks.length

  return (
    <section className={styles.pastCard}>
      <h3 className={styles.pastTitle}>지난 그림 보기</h3>
      {artworks.length === 0 ? (
        <div className={styles.pastEmpty}>아직 지난 그림이 없어요</div>
      ) : (
        <div className={styles.pastRow}>
          <button
            type="button"
            className={`${styles.pastNavBtn} ${styles.pastNavPrev}`}
            onClick={() => setOffset(o => Math.max(0, o - 1))}
            disabled={!hasPrev}
            aria-label="이전 그림"
          >
            ‹
          </button>
          <div className={styles.pastThumbs}>
            {visible.map(a => (
              <div key={a.id} className={styles.pastThumb}>
                <div className={styles.pastThumbFrame}>
                  <img
                    src={a.imageUrl}
                    alt={a.title?.trim() || '지난 그림'}
                    className={styles.pastThumbImg}
                  />
                </div>
                <span className={styles.pastThumbDate}>{formatShortDateKst(a.createdAt)}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            className={`${styles.pastNavBtn} ${styles.pastNavNext}`}
            onClick={() => setOffset(o => Math.min(artworks.length - PAST_VISIBLE_COUNT, o + 1))}
            disabled={!hasNext}
            aria-label="다음 그림"
          >
            ›
          </button>
        </div>
      )}
    </section>
  )
}

function ArtInfoCard({ artwork }: { artwork: Artwork }) {
  const kindLabel = artwork.sketchCode == null ? '자유그림' : '색칠하기'
  // V23 마이그레이션 이전 작품은 colorCount 가 0/undefined 로 내려옴 — "—" 표시.
  const colorsLabel =
    artwork.colorCount != null && artwork.colorCount > 0 ? `${artwork.colorCount}가지` : '—'
  const stats = [
    {
      id: 'time',
      label: '그리기 시간',
      value: formatDurationSec(artwork.playDurationSeconds),
    },
    {
      id: 'colors',
      label: '사용한 색',
      value: colorsLabel,
    },
    {
      id: 'kind',
      label: '활동 종류',
      value: kindLabel,
    },
  ] as const

  return (
    <section className={styles.infoCard}>
      <h3 className={styles.infoCardTitle}>그림 정보</h3>
      <div className={styles.infoStatsRow}>
        {stats.map(stat => (
          <div key={stat.id} className={styles.infoStat}>
            <span className={styles.infoStatValue}>{stat.value}</span>
            <span className={styles.infoStatLabel}>{stat.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
