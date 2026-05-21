import {
  EXERCISE_SESSION_DETAIL_ERROR_MESSAGE,
  EXERCISE_SESSION_ERROR_MESSAGE,
} from '@wish/api-client'
import type { CSSProperties } from 'react'
import { useState } from 'react'
import { useExerciseSessionDetail, useExerciseSessions } from './hooks'
import { resolvePatientProfileId } from './patientProfile'
import {
  buildExerciseSessionReportSummary,
  formatCompletionRate,
  formatDateTime,
  formatDurationSec,
  formatExerciseType,
  sortExerciseSessionMotions,
} from './format'

type ExerciseSessionListOverlayProps = {
  open: boolean
  onClose: () => void
}

const text = {
  title: '\uCCB4\uC870 \uC138\uC158 \uAE30\uB85D',
  close: '\uB2EB\uAE30',
  retry: '\uB2E4\uC2DC \uC2DC\uB3C4',
  missingPatient:
    '\uD658\uC790 \uC815\uBCF4\uAC00 \uC5C6\uC5B4 \uCCB4\uC870 \uC138\uC158 \uAE30\uB85D\uC744 \uBD88\uB7EC\uC62C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.',
  loading:
    '\uCCB4\uC870 \uC138\uC158 \uAE30\uB85D\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.',
  empty:
    '\uC544\uC9C1 \uAE30\uB85D\uB41C \uCCB4\uC870 \uC138\uC158\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.',
  detailTitle: '\uCCB4\uC870 \uC138\uC158 \uC0C1\uC138',
  detailLoading:
    '\uCCB4\uC870 \uC138\uC158 \uC0C1\uC138 \uAE30\uB85D\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.',
  emptyMotions: '\uAE30\uB85D\uB41C \uB3D9\uC791 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.',
  motionResults: '\uB3D9\uC791\uBCC4 \uACB0\uACFC',
} as const

const overlayStyles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(31, 26, 21, 0.52)',
    fontFamily:
      '"Pretendard Variable", Pretendard, "Noto Sans KR", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  panel: {
    width: 'min(760px, calc(100vw - 32px))',
    maxHeight: 'min(800px, calc(100vh - 32px))',
    overflow: 'auto',
    borderRadius: 8,
    border: '3px solid #7f5a32',
    background: '#fff7e8',
    boxShadow: '0 18px 42px rgba(35, 24, 13, 0.28)',
    padding: 24,
    color: '#3e2a18',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 18,
  },
  title: {
    margin: 0,
    fontSize: 24,
    lineHeight: 1.25,
  },
  closeButton: {
    border: 0,
    borderRadius: 6,
    padding: '9px 13px',
    background: '#6d4a27',
    color: '#fff8ec',
    fontWeight: 700,
    cursor: 'pointer',
  },
  message: {
    margin: '22px 0',
    borderRadius: 8,
    background: '#f2e2c8',
    padding: 18,
    fontWeight: 700,
  },
  retryButton: {
    marginTop: 12,
    border: 0,
    borderRadius: 6,
    padding: '10px 14px',
    background: '#8a6339',
    color: '#fff8ec',
    fontWeight: 700,
    cursor: 'pointer',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 10,
    marginBottom: 18,
  },
  summaryItem: {
    borderRadius: 8,
    background: '#f4e5ca',
    padding: 12,
  },
  summaryLabel: {
    display: 'block',
    marginBottom: 4,
    fontSize: 13,
    color: '#73583b',
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: 800,
  },
  list: {
    display: 'grid',
    gap: 12,
  },
  cardButton: {
    width: '100%',
    borderRadius: 8,
    border: '2px solid #d6bd92',
    background: '#fffdf8',
    padding: 16,
    color: '#3e2a18',
    cursor: 'pointer',
    textAlign: 'left',
  },
  cardTitle: {
    margin: '0 0 10px',
    fontSize: 18,
  },
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: 8,
    fontSize: 14,
  },
  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 1010,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(31, 26, 21, 0.34)',
  },
  modalPanel: {
    width: 'min(680px, calc(100vw - 40px))',
    maxHeight: 'min(720px, calc(100vh - 40px))',
    overflow: 'auto',
    borderRadius: 8,
    border: '3px solid #7f5a32',
    background: '#fffdf8',
    boxShadow: '0 18px 42px rgba(35, 24, 13, 0.32)',
    padding: 22,
  },
  sectionTitle: {
    margin: '22px 0 10px',
    fontSize: 18,
  },
  motionCard: {
    borderRadius: 8,
    border: '1px solid #d6bd92',
    background: '#fff7e8',
    padding: 14,
  },
  motionList: {
    display: 'grid',
    gap: 10,
  },
  motionVideo: {
    width: '100%',
    maxHeight: 280,
    marginTop: 12,
    borderRadius: 8,
    background: '#2a2118',
    objectFit: 'contain',
  },
} satisfies Record<string, CSSProperties>

export function ExerciseSessionListOverlay({ open, onClose }: ExerciseSessionListOverlayProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null)
  const patientProfileId = resolvePatientProfileId()
  const { data = [], isLoading, isError, refetch } = useExerciseSessions(patientProfileId)
  const summary = buildExerciseSessionReportSummary(data)

  if (!open) return null

  return (
    <div style={overlayStyles.backdrop} role="dialog" aria-modal="true">
      <section style={overlayStyles.panel}>
        <header style={overlayStyles.header}>
          <h2 style={overlayStyles.title}>{text.title}</h2>
          <button type="button" style={overlayStyles.closeButton} onClick={onClose}>
            {text.close}
          </button>
        </header>

        {!patientProfileId && <p style={overlayStyles.message}>{text.missingPatient}</p>}

        {patientProfileId && isLoading && <p style={overlayStyles.message}>{text.loading}</p>}

        {patientProfileId && isError && (
          <div style={overlayStyles.message}>
            <p>{EXERCISE_SESSION_ERROR_MESSAGE}</p>
            <button type="button" style={overlayStyles.retryButton} onClick={() => void refetch()}>
              {text.retry}
            </button>
          </div>
        )}

        {patientProfileId && !isLoading && !isError && data.length === 0 && (
          <p style={overlayStyles.message}>{text.empty}</p>
        )}

        {patientProfileId && !isLoading && !isError && data.length > 0 && (
          <>
            <div style={overlayStyles.summaryGrid}>
              <SummaryItem
                label={'\uCD1D \uCCB4\uC870 \uC138\uC158'}
                value={`${summary.totalSessionCount}\uD68C`}
              />
              <SummaryItem
                label={'\uCD1D \uC6B4\uB3D9 \uC2DC\uAC04'}
                value={formatDurationSec(summary.totalDurationSec)}
              />
              <SummaryItem
                label={'\uD3C9\uADE0 \uC218\uD589\uB960'}
                value={formatCompletionRate(summary.averageCompletionRate)}
              />
              <SummaryItem
                label={'\uC644\uB8CC \uB3D9\uC791'}
                value={`${summary.totalCompletedMotionCount}\uAC1C`}
              />
              <SummaryItem
                label={'\uCD5C\uADFC \uC6B4\uB3D9\uC77C'}
                value={formatDateTime(summary.latestSessionAt)}
              />
            </div>

            <div style={overlayStyles.list}>
              {data.map(session => (
                <button
                  key={session.id}
                  type="button"
                  style={overlayStyles.cardButton}
                  onClick={() => setSelectedSessionId(session.id)}
                >
                  <h3 style={overlayStyles.cardTitle}>
                    {'\uC6B4\uB3D9 \uC885\uB958'}: {formatExerciseType(session.exerciseType)}
                  </h3>
                  <div style={overlayStyles.detailGrid}>
                    <span>
                      {'\uC6B4\uB3D9 \uC2DC\uAC04'}: {formatDurationSec(session.durationSec)}
                    </span>
                    <span>
                      {'\uD3C9\uADE0 \uC218\uD589\uB960'}:{' '}
                      {formatCompletionRate(session.averageAccuracy)}
                    </span>
                    <span>
                      {'\uC644\uB8CC \uB3D9\uC791'}: {session.completedMotionCount}
                      {'\uAC1C'}
                    </span>
                    <span>
                      {'\uB0A0\uC9DC'}: {formatDateTime(session.createdAt)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <ExerciseSessionDetailModal
        open={Boolean(selectedSessionId)}
        sessionId={selectedSessionId}
        onClose={() => setSelectedSessionId(null)}
      />
    </div>
  )
}

function ExerciseSessionDetailModal({
  open,
  sessionId,
  onClose,
}: {
  open: boolean
  sessionId: number | null
  onClose: () => void
}) {
  const { data, isLoading, isError, refetch } = useExerciseSessionDetail(sessionId)
  const sortedMotions = data ? sortExerciseSessionMotions(data.motions) : []

  if (!open) return null

  return (
    <div style={overlayStyles.modalBackdrop} role="dialog" aria-modal="true">
      <section style={overlayStyles.modalPanel}>
        <header style={overlayStyles.header}>
          <h2 style={overlayStyles.title}>{text.detailTitle}</h2>
          <button type="button" style={overlayStyles.closeButton} onClick={onClose}>
            {text.close}
          </button>
        </header>

        {isLoading && <p style={overlayStyles.message}>{text.detailLoading}</p>}

        {isError && (
          <div style={overlayStyles.message}>
            <p>{EXERCISE_SESSION_DETAIL_ERROR_MESSAGE}</p>
            <button type="button" style={overlayStyles.retryButton} onClick={() => void refetch()}>
              {text.retry}
            </button>
          </div>
        )}

        {!isLoading && !isError && data && (
          <>
            <div style={overlayStyles.summaryGrid}>
              <SummaryItem
                label={'\uC6B4\uB3D9 \uC885\uB958'}
                value={formatExerciseType(data.exerciseType)}
              />
              <SummaryItem
                label={'\uC6B4\uB3D9 \uC2DC\uAC04'}
                value={formatDurationSec(data.durationSec)}
              />
              <SummaryItem
                label={'\uD3C9\uADE0 \uC218\uD589\uB960'}
                value={formatCompletionRate(data.averageAccuracy)}
              />
              <SummaryItem
                label={'\uC644\uB8CC \uB3D9\uC791'}
                value={`${data.completedMotionCount}\uAC1C`}
              />
              <SummaryItem label={'\uAE30\uB85D\uC77C'} value={formatDateTime(data.createdAt)} />
            </div>

            <h3 style={overlayStyles.sectionTitle}>{text.motionResults}</h3>
            {sortedMotions.length === 0 ? (
              <p style={overlayStyles.message}>{text.emptyMotions}</p>
            ) : (
              <div style={overlayStyles.motionList}>
                {sortedMotions.map(motion => (
                  <article key={motion.id} style={overlayStyles.motionCard}>
                    <h4 style={overlayStyles.cardTitle}>
                      {motion.routineOrder}. {motion.motionName}
                    </h4>
                    <div style={overlayStyles.detailGrid}>
                      <span>
                        {'\uC2DC\uAC04'}: {formatDurationSec(motion.durationSec)}
                      </span>
                      <span>
                        {'\uC218\uD589\uB960'}: {formatCompletionRate(motion.accuracy)}
                      </span>
                      <span>
                        {'\uC218\uD589 \uD69F\uC218'}: {motion.completedReps}
                        {'\uD68C'}
                      </span>
                      <span>
                        {'\uAE30\uB85D \uC2DC\uAC04'}: {formatDateTime(motion.createdAt)}
                      </span>
                    </div>
                    {motion.feedback && (
                      <p style={{ margin: '10px 0 0' }}>
                        {'\uD53C\uB4DC\uBC31'}: {motion.feedback}
                      </p>
                    )}
                    {motion.videoUrl && (
                      <video
                        controls
                        preload="metadata"
                        src={motion.videoUrl}
                        poster={motion.thumbUrl ?? undefined}
                        style={overlayStyles.motionVideo}
                      />
                    )}
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={overlayStyles.summaryItem}>
      <span style={overlayStyles.summaryLabel}>{label}</span>
      <strong style={overlayStyles.summaryValue}>{value}</strong>
    </div>
  )
}
