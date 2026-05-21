import { useEffect, useMemo, useState } from 'react'
import type { GuardianDialogueNpc, GuardianDialogueSessionMeta } from '@wish/api-client'
import { useGuardianDialogueSessions } from '../hooks'
import styles from './PastDialoguesModal.module.css'

type Props = {
  isOpen: boolean
  onClose: () => void
  patientProfileId: number | null | undefined
  npc?: GuardianDialogueNpc
  characterName: string
  activeSessionId: number | null
  onSelectSession: (sessionId: number) => void
}

type DateGroup = {
  dateKey: string // YYYY-MM-DD (KST)
  label: string
  items: GuardianDialogueSessionMeta[]
}

const KST_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const KST_TIME_FMT = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

function kstDateKey(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return KST_DATE_FMT.format(d) // YYYY-MM-DD
}

function kstTimeLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return KST_TIME_FMT.format(d)
}

function buildDateLabel(dateKey: string, todayKey: string, yestKey: string): string {
  if (dateKey === todayKey) return '오늘'
  if (dateKey === yestKey) return '어제'
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][dt.getUTCDay()]
  return `${m}월 ${d}일 (${weekday})`
}

/** 한글 받침 유무로 와/과 결정. 비한글이면 vowel형. */
function withParticle(name: string, vowel: string, consonant: string): string {
  const last = name.charCodeAt(name.length - 1)
  if (last < 0xac00 || last > 0xd7a3) return name + vowel
  const hasFinal = (last - 0xac00) % 28 !== 0
  return name + (hasFinal ? consonant : vowel)
}

export function PastDialoguesModal({
  isOpen,
  onClose,
  patientProfileId,
  npc,
  characterName,
  activeSessionId,
  onSelectSession,
}: Props) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const sessionsQuery = useGuardianDialogueSessions({ patientProfileId, npc, size: 50 })

  // ESC 닫기
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const groups: DateGroup[] = useMemo(() => {
    const raw = sessionsQuery.data?.content ?? []
    // 정상 완료된 대화만 노출 (FINISHED + COMPLETED). 나머지는 보호자에게 의미 없는 데이터.
    const filtered = raw.filter(s => s.status === 'FINISHED' && s.finishReason === 'COMPLETED')
    const todayKey = KST_DATE_FMT.format(new Date())
    const yest = new Date()
    yest.setDate(yest.getDate() - 1)
    const yestKey = KST_DATE_FMT.format(yest)

    const byDate = new Map<string, GuardianDialogueSessionMeta[]>()
    for (const s of filtered) {
      const k = kstDateKey(s.startedAt)
      const arr = byDate.get(k) ?? []
      arr.push(s)
      byDate.set(k, arr)
    }
    const out: DateGroup[] = []
    const sortedKeys = Array.from(byDate.keys()).sort().reverse()
    for (const k of sortedKeys) {
      const items = byDate.get(k)!
      items.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
      out.push({ dateKey: k, label: buildDateLabel(k, todayKey, yestKey), items })
    }
    return out
  }, [sessionsQuery.data])

  // 모달 열릴 때 / 데이터 갱신 시 가장 최근 날짜 자동 선택
  useEffect(() => {
    if (!isOpen) return
    if (groups.length === 0) {
      setSelectedDate(null)
      return
    }
    if (!selectedDate || !groups.some(g => g.dateKey === selectedDate)) {
      setSelectedDate(groups[0].dateKey)
    }
  }, [isOpen, groups, selectedDate])

  const titleWithParticle = `${withParticle(characterName, '와', '과')}의 지난 대화`

  const selectedGroup = groups.find(g => g.dateKey === selectedDate) ?? null

  if (!isOpen) return null

  const isLoading = sessionsQuery.isLoading
  const isEmpty = !isLoading && groups.length === 0

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            <span className={styles.headerIcon}>📅</span>
            <h2>{titleWithParticle}</h2>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>

        <div className={styles.body}>
          {isLoading ? (
            <div className={styles.placeholder}>불러오는 중...</div>
          ) : isEmpty ? (
            <div className={styles.placeholder}>아직 정상 완료된 대화가 없어요.</div>
          ) : (
            <>
              <aside className={styles.dateList}>
                {groups.map(g => {
                  const isActive = g.dateKey === selectedDate
                  return (
                    <button
                      key={g.dateKey}
                      type="button"
                      className={`${styles.dateItem} ${isActive ? styles.dateItemActive : ''}`}
                      onClick={() => setSelectedDate(g.dateKey)}
                    >
                      <span className={styles.dateLabel}>{g.label}</span>
                      <span className={styles.dateCount}>{g.items.length}</span>
                    </button>
                  )
                })}
              </aside>

              <section className={styles.sessionList}>
                {selectedGroup?.items.map(s => {
                  const isActive = s.sessionId === activeSessionId
                  return (
                    <button
                      key={s.sessionId}
                      type="button"
                      className={`${styles.sessionItem} ${isActive ? styles.sessionItemActive : ''}`}
                      onClick={() => onSelectSession(s.sessionId)}
                    >
                      <div className={styles.sessionTop}>
                        <span className={styles.sessionTime}>{kstTimeLabel(s.startedAt)}</span>
                      </div>
                      <div className={styles.sessionMeta}>
                        <span>
                          {s.stepCount} / {s.maxSteps} 단계
                        </span>
                        {typeof s.durationSeconds === 'number' && (
                          <span>· {Math.max(1, Math.round(s.durationSeconds / 60))}분</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
