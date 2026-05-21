import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { HeaderBar } from '@/features/dashboard/components/HeaderBar'
import { ChevronLeftIcon } from '@/features/dashboard/components/icons'
import { useMyPatientId } from '@/features/auth/hooks/useMyPatientId'
import { JointStepNav } from '@/features/rom/components/JointStepNav'
import { ROMAnalysisPanel } from '@/features/rom/components/ROMAnalysisPanel'
import { ROMCharacter3D } from '@/features/rom/components/ROMCharacter3D'
import {
  ROM_JOINT_GROUPS,
  type RomJointId,
  type RomMovementAnalysisView,
} from '@/features/rom/data/model'
import { useRomMovementAnalysis } from '@/features/rom/hooks'
import '@/features/dashboard/tokens.css'
import styles from './ROMDetailPage.module.css'

function StatePanel({ title, description }: { title: string; description: string }) {
  return (
    <article className={styles.statePanel}>
      <h2 className={styles.stateTitle}>{title}</h2>
      <p className={styles.stateText}>{description}</p>
    </article>
  )
}

function CriteriaSummary({ analysis }: { analysis: RomMovementAnalysisView }) {
  return (
    <section className={styles.criteriaPanel} aria-label="ROM 지표 기준">
      <div className={styles.criteriaIntro}>
        <span>ROM 기준</span>
        <strong>100% 점수가 아니라, 운동 중 실제로 움직인 각도입니다.</strong>
      </div>
      <div className={styles.criteriaGrid}>
        <div className={styles.criteriaItem}>
          <span>움직임 각도</span>
          <strong>최대 각도 - 최소 각도</strong>
        </div>
        <div className={styles.criteriaItem}>
          <span>좌우 차이</span>
          <strong>왼쪽 평균과 오른쪽 평균의 차이</strong>
        </div>
        <div className={styles.criteriaItem}>
          <span>촬영 안정도</span>
          <strong>카메라가 관절을 잡은 신뢰도</strong>
        </div>
        <div className={styles.criteriaItem}>
          <span>분석 동작</span>
          <strong>
            {analysis.analyzedMotionCount}/{analysis.motionCount}개
            {analysis.failedMotionCount > 0 ? ` · 제외 ${analysis.failedMotionCount}개` : ''}
          </strong>
        </div>
      </div>
    </section>
  )
}

export function ROMDetailPage() {
  const { data: patientId } = useMyPatientId()
  const { data: analysisView, isError, isLoading } = useRomMovementAnalysis(patientId)
  const [activeId, setActiveId] = useState<RomJointId>('elbow')
  const isProgrammaticScrollRef = useRef(false)
  const programmaticScrollTimerRef = useRef<number | null>(null)

  const joints = useMemo(() => analysisView?.joints ?? [], [analysisView?.joints])
  const navItems = useMemo(() => (joints.length > 0 ? joints : ROM_JOINT_GROUPS), [joints])
  const hasAnalyzedMotion = (analysisView?.analyzedMotionCount ?? 0) > 0

  useEffect(() => {
    document.body.classList.add('rom-no-scrollbar')
    return () => {
      document.body.classList.remove('rom-no-scrollbar')
    }
  }, [])

  useEffect(() => {
    if (navItems.some(joint => joint.id === activeId)) return
    setActiveId(navItems[0]?.id ?? 'elbow')
  }, [activeId, navItems])

  useEffect(() => {
    const panels = joints
      .map(joint => document.getElementById(`joint-panel-${joint.id}`))
      .filter((el): el is HTMLElement => Boolean(el))
    if (panels.length === 0) return

    let rafId = 0
    const updateActive = () => {
      if (isProgrammaticScrollRef.current) return
      const center = window.innerHeight * 0.45
      let bestId: RomJointId | null = null
      let bestDistance = Infinity
      for (const panel of panels) {
        const rect = panel.getBoundingClientRect()
        const panelCenter = rect.top + rect.height / 2
        const distance = Math.abs(panelCenter - center)
        if (distance < bestDistance) {
          bestDistance = distance
          bestId = panel.getAttribute('data-joint-id') as RomJointId | null
        }
      }
      if (bestId) {
        setActiveId(prev => (prev === bestId ? prev : bestId))
      }
    }

    const onScroll = () => {
      if (rafId) return
      rafId = window.requestAnimationFrame(() => {
        rafId = 0
        updateActive()
      })
    }

    updateActive()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (rafId) window.cancelAnimationFrame(rafId)
    }
  }, [joints])

  const handleSelect = useCallback((id: RomJointId) => {
    setActiveId(id)
    const target = document.getElementById(`joint-panel-${id}`)
    if (!target) return
    isProgrammaticScrollRef.current = true
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if (programmaticScrollTimerRef.current !== null) {
      window.clearTimeout(programmaticScrollTimerRef.current)
    }
    programmaticScrollTimerRef.current = window.setTimeout(() => {
      isProgrammaticScrollRef.current = false
    }, 700)
  }, [])

  return (
    <div className={styles.shell}>
      <div className={styles.headerSlot}>
        <HeaderBar />
      </div>

      <main className={styles.main}>
        <aside className={styles.leftCol}>
          <article className={styles.leftCard}>
            <header className={styles.leftHead}>
              <Link to="/" className={styles.backBtn} aria-label="대시보드로 돌아가기">
                <ChevronLeftIcon className={styles.backIcon} />
                <span>움직임 기록</span>
              </Link>
            </header>
            <div className={styles.stepNavSlot}>
              <JointStepNav items={navItems} activeId={activeId} onSelect={handleSelect} />
            </div>
            <div className={styles.characterSlot}>
              <ROMCharacter3D focusJoint={activeId} />
            </div>
          </article>
        </aside>

        <section className={styles.rightCol}>
          {analysisView && <CriteriaSummary analysis={analysisView} />}
          {isLoading ? (
            <StatePanel
              title="움직임 분석을 불러오는 중입니다"
              description="최근 체조 세션에서 관절이 얼마나 움직였는지 확인하고 있습니다."
            />
          ) : isError ? (
            <StatePanel
              title="움직임 분석을 불러오지 못했습니다"
              description="네트워크 상태를 확인한 뒤 잠시 후 다시 시도해 주세요."
            />
          ) : !analysisView ? (
            <StatePanel
              title="최근 체조 세션이 없습니다"
              description="체조 세션이 저장되면 이 화면에서 관절별 움직임 기록을 확인할 수 있습니다."
            />
          ) : !hasAnalyzedMotion ? (
            <StatePanel
              title="확인할 수 있는 움직임 기록이 없습니다"
              description="최근 세션에서 관절 위치가 충분히 잡히지 않아 움직임을 확인하지 못했습니다."
            />
          ) : (
            <>
              {analysisView.failedMotionCount > 0 && (
                <div className={styles.noticeBanner}>
                  <strong>일부 동작 기록을 불러오지 못했습니다.</strong>
                  <span>
                    {analysisView.failedMotionCount}개 동작은 제외하고{' '}
                    {analysisView.analyzedMotionCount}개 동작 기준으로 표시합니다.
                  </span>
                </div>
              )}
              {joints.map(joint => (
                <article
                  key={joint.id}
                  id={`joint-panel-${joint.id}`}
                  data-joint-id={joint.id}
                  className={styles.panel}
                >
                  <div className={styles.panelInner}>
                    <ROMAnalysisPanel joint={joint} />
                  </div>
                </article>
              ))}
            </>
          )}
        </section>
      </main>
    </div>
  )
}
