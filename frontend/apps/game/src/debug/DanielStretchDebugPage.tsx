import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { POSE_LANDMARK_NAMES, PoseTracker } from '../game/motion/poseTracker'

type LandmarkPayload = {
  name: string
  x: number
  y: number
  z?: number
  visibility?: number
}

type DanielMotionId =
  | 'daniel_forward_press'
  | 'daniel_upward_press'
  | 'daniel_side_bend_left'
  | 'daniel_side_bend_right'
  | 'daniel_forward_bend'

type DanielStretchApiResponse = {
  motion_id: DanielMotionId
  motion_name: string
  state: string
  accuracy: number
  feedback: string | null
  tracking: string
  hold_duration_ms: number
  hold_completed: boolean
  hold_last_timestamp_ms: number | null
  reference_hip_x: number | null
  reference_hip_y: number | null
  reference_scale: number | null
  displayed_feedback_code: string | null
  displayed_feedback_text: string | null
  displayed_feedback_frames: number
  candidate_feedback_code: string | null
  candidate_feedback_text: string | null
  candidate_feedback_streak: number
  representative_feedback_totals: Record<string, number>
  representative_feedback_code: string | null
  representative_feedback_text: string | null
  representative_feedback_frames: number
  baseline_left_wrist_forward: number | null
  baseline_right_wrist_forward: number | null
  features: Record<string, number | null>
}

type DanielStretchSummaryResponse = {
  motionId: string
  motionName: string
  durationSec: number
  accuracy: number
  holdCompleted: boolean
  representativeFeedback: string | null
  tracking: string
  state: string
}

type StateLogEntry = {
  state: string
  holdDurationMs: number
  feedback: string | null
  timestampLabel: string
}

const DEFAULT_AI_BASE_URL = import.meta.env.VITE_AI_BASE_URL ?? 'http://localhost:8001/api/v1'
const DEFAULT_TARGET_HOLD_MS = 10_000
const MAX_STATE_LOGS = 12

const MOTION_OPTIONS: Array<{ id: DanielMotionId; label: string }> = [
  { id: 'daniel_forward_press', label: '손 깍지 끼고 앞으로 밀기' },
  { id: 'daniel_upward_press', label: '손 깍지 끼고 위로 밀기' },
  { id: 'daniel_side_bend_left', label: '왼쪽 옆구리 굽히기' },
  { id: 'daniel_side_bend_right', label: '오른쪽 옆구리 굽히기' },
  { id: 'daniel_forward_bend', label: '손 깍지 끼고 아래로 숙이기' },
]

function DanielStretchDebugPage() {
  const mountRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const trackerRef = useRef<PoseTracker | null>(null)
  const rafRef = useRef<number | null>(null)
  const requestInFlightRef = useRef(false)
  const startedAtRef = useRef<string | null>(null)

  const previousStateRef = useRef('idle')
  const holdDurationMsRef = useRef(0)
  const holdLastTimestampMsRef = useRef<number | null>(null)
  const referenceHipXRef = useRef<number | null>(null)
  const referenceHipYRef = useRef<number | null>(null)
  const referenceScaleRef = useRef<number | null>(null)
  const displayedFeedbackCodeRef = useRef<string | null>(null)
  const displayedFeedbackTextRef = useRef<string | null>(null)
  const displayedFeedbackFramesRef = useRef(0)
  const candidateFeedbackCodeRef = useRef<string | null>(null)
  const candidateFeedbackTextRef = useRef<string | null>(null)
  const candidateFeedbackStreakRef = useRef(0)
  const representativeFeedbackTotalsRef = useRef<Record<string, number>>({})
  const representativeFeedbackCodeRef = useRef<string | null>(null)
  const representativeFeedbackTextRef = useRef<string | null>(null)
  const representativeFeedbackFramesRef = useRef(0)
  const baselineLeftWristForwardRef = useRef<number | null>(null)
  const baselineRightWristForwardRef = useRef<number | null>(null)

  const [motionId, setMotionId] = useState<DanielMotionId>('daniel_forward_press')
  const [aiBaseUrl, setAiBaseUrl] = useState(DEFAULT_AI_BASE_URL)
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState('Idle')
  const [result, setResult] = useState<DanielStretchApiResponse | null>(null)
  const [summary, setSummary] = useState<DanielStretchSummaryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stateLogs, setStateLogs] = useState<StateLogEntry[]>([])
  const [showAdvanced, setShowAdvanced] = useState(false)

  const currentMotionLabel = useMemo(
    () => MOTION_OPTIONS.find(option => option.id === motionId)?.label ?? motionId,
    [motionId],
  )

  useEffect(() => {
    return () => stopTracking()
  }, [])

  const resetEvaluatorState = () => {
    previousStateRef.current = 'idle'
    holdDurationMsRef.current = 0
    holdLastTimestampMsRef.current = null
    referenceHipXRef.current = null
    referenceHipYRef.current = null
    referenceScaleRef.current = null
    displayedFeedbackCodeRef.current = null
    displayedFeedbackTextRef.current = null
    displayedFeedbackFramesRef.current = 0
    candidateFeedbackCodeRef.current = null
    candidateFeedbackTextRef.current = null
    candidateFeedbackStreakRef.current = 0
    representativeFeedbackTotalsRef.current = {}
    representativeFeedbackCodeRef.current = null
    representativeFeedbackTextRef.current = null
    representativeFeedbackFramesRef.current = 0
    baselineLeftWristForwardRef.current = null
    baselineRightWristForwardRef.current = null
    startedAtRef.current = null
    setResult(null)
    setSummary(null)
    setStateLogs([])
  }

  const startTracking = async () => {
    if (running) return

    try {
      setError(null)
      setStatus('Starting camera and pose tracker')

      const tracker = new PoseTracker()
      await tracker.start()
      trackerRef.current = tracker

      if (mountRef.current && tracker.video) {
        mountRef.current.innerHTML = ''
        tracker.video.style.width = '100%'
        tracker.video.style.height = '100%'
        tracker.video.style.objectFit = 'cover'
        tracker.video.style.transform = 'scaleX(-1)'
        mountRef.current.appendChild(tracker.video)
      }

      resetEvaluatorState()
      startedAtRef.current = new Date().toISOString()
      setRunning(true)
      setStatus(`Daniel stretch test running: ${currentMotionLabel}`)

      const loop = async () => {
        const activeTracker = trackerRef.current
        if (!activeTracker) return

        const detection = activeTracker.detect()
        const pose = detection.poses[0]
        drawPose(pose?.landmarks ?? [])

        if (pose && !requestInFlightRef.current) {
          requestInFlightRef.current = true

          try {
            const response = await fetch(`${aiBaseUrl}/gymnastics/daniel/evaluate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                motion_id: motionId,
                frame: {
                  timestamp_ms: Math.floor(detection.timestampMs),
                  mirrored: true,
                  landmarks: toLandmarkPayload(pose.landmarks),
                },
                previous_state: previousStateRef.current,
                target_hold_ms: DEFAULT_TARGET_HOLD_MS,
                hold_duration_ms: holdDurationMsRef.current,
                hold_last_timestamp_ms: holdLastTimestampMsRef.current,
                reference_hip_x: referenceHipXRef.current,
                reference_hip_y: referenceHipYRef.current,
                reference_scale: referenceScaleRef.current,
                displayed_feedback_code: displayedFeedbackCodeRef.current,
                displayed_feedback_text: displayedFeedbackTextRef.current,
                displayed_feedback_frames: displayedFeedbackFramesRef.current,
                candidate_feedback_code: candidateFeedbackCodeRef.current,
                candidate_feedback_text: candidateFeedbackTextRef.current,
                candidate_feedback_streak: candidateFeedbackStreakRef.current,
                representative_feedback_totals: representativeFeedbackTotalsRef.current,
                representative_feedback_code: representativeFeedbackCodeRef.current,
                representative_feedback_text: representativeFeedbackTextRef.current,
                representative_feedback_frames: representativeFeedbackFramesRef.current,
                baseline_left_wrist_forward: baselineLeftWristForwardRef.current,
                baseline_right_wrist_forward: baselineRightWristForwardRef.current,
              }),
            })

            if (!response.ok) {
              throw new Error(`AI response error: ${response.status}`)
            }

            const payload = (await response.json()) as DanielStretchApiResponse

            if (payload.state !== previousStateRef.current) {
              const timestampLabel = new Date().toLocaleTimeString('ko-KR', { hour12: false })
              setStateLogs(current =>
                [
                  {
                    state: payload.state,
                    holdDurationMs: payload.hold_duration_ms,
                    feedback: payload.feedback,
                    timestampLabel,
                  },
                  ...current,
                ].slice(0, MAX_STATE_LOGS),
              )
            }

            previousStateRef.current = payload.state
            holdDurationMsRef.current = payload.hold_duration_ms
            holdLastTimestampMsRef.current = payload.hold_last_timestamp_ms
            referenceHipXRef.current = payload.reference_hip_x
            referenceHipYRef.current = payload.reference_hip_y
            referenceScaleRef.current = payload.reference_scale
            displayedFeedbackCodeRef.current = payload.displayed_feedback_code
            displayedFeedbackTextRef.current = payload.displayed_feedback_text
            displayedFeedbackFramesRef.current = payload.displayed_feedback_frames
            candidateFeedbackCodeRef.current = payload.candidate_feedback_code
            candidateFeedbackTextRef.current = payload.candidate_feedback_text
            candidateFeedbackStreakRef.current = payload.candidate_feedback_streak
            representativeFeedbackTotalsRef.current = payload.representative_feedback_totals
            representativeFeedbackCodeRef.current = payload.representative_feedback_code
            representativeFeedbackTextRef.current = payload.representative_feedback_text
            representativeFeedbackFramesRef.current = payload.representative_feedback_frames
            baselineLeftWristForwardRef.current = payload.baseline_left_wrist_forward
            baselineRightWristForwardRef.current = payload.baseline_right_wrist_forward
            setResult(payload)
            setStatus(
              payload.feedback ??
                (payload.hold_completed
                  ? 'Hold complete'
                  : payload.state === 'holding'
                    ? 'Holding correctly'
                    : 'Tracking normally'),
            )
          } catch (fetchError) {
            const message =
              fetchError instanceof Error ? fetchError.message : 'AI evaluation request failed'
            setError(message)
            setStatus('AI response error')
          } finally {
            requestInFlightRef.current = false
          }
        }

        rafRef.current = window.requestAnimationFrame(loop)
      }

      rafRef.current = window.requestAnimationFrame(loop)
    } catch (startError) {
      const message = startError instanceof Error ? startError.message : 'Failed to start camera'
      setError(message)
      setStatus('Start failed')
      stopTracking()
    }
  }

  const stopTracking = () => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    requestInFlightRef.current = false
    trackerRef.current?.stop()
    trackerRef.current = null
    if (mountRef.current) {
      mountRef.current.innerHTML = ''
    }
    const canvas = canvasRef.current
    if (canvas) {
      const context = canvas.getContext('2d')
      context?.clearRect(0, 0, canvas.width, canvas.height)
    }
    setRunning(false)
    setStatus('Stopped')
  }

  const buildSummary = async () => {
    if (!result || !startedAtRef.current) {
      setError('No completed session data to summarize yet.')
      return
    }

    try {
      setError(null)
      const response = await fetch(`${aiBaseUrl}/gymnastics/daniel/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          motion_id: result.motion_id,
          started_at: startedAtRef.current,
          ended_at: new Date().toISOString(),
          accuracy: result.accuracy,
          hold_completed: result.hold_completed,
          representative_feedback: result.representative_feedback_text,
          tracking: result.tracking,
          state: result.state,
        }),
      })

      if (!response.ok) {
        throw new Error(`Summary response error: ${response.status}`)
      }

      const payload = (await response.json()) as DanielStretchSummaryResponse
      setSummary(payload)
      setStatus('Summary built')
    } catch (summaryError) {
      const message =
        summaryError instanceof Error ? summaryError.message : 'Summary request failed'
      setError(message)
      setStatus('Summary error')
    }
  }

  return (
    <div style={pageStyle}>
      <div style={layoutStyle}>
        <section>
          <h1 style={{ margin: 0, fontSize: '32px' }}>Daniel Stretch Integrated AI Debug</h1>
          <p style={{ marginTop: '8px', color: '#4d5b71' }}>
            Pick any Daniel stretch motion, send webcam pose data to the unified `daniel/evaluate`
            API, and verify summary output from `daniel/summary`.
          </p>

          <label style={labelStyle}>Motion</label>
          <select
            value={motionId}
            onChange={event => {
              setMotionId(event.target.value as DanielMotionId)
              if (!running) {
                resetEvaluatorState()
                setStatus('Idle')
              }
            }}
            disabled={running}
            style={inputStyle}
          >
            {MOTION_OPTIONS.map(option => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>

          <label style={{ ...labelStyle, marginTop: '16px' }}>AI Base URL</label>
          <input
            value={aiBaseUrl}
            onChange={event => setAiBaseUrl(event.target.value)}
            style={inputStyle}
          />

          <div style={{ display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
            <button
              onClick={() => void startTracking()}
              disabled={running}
              style={buttonStyle('#0b6bcb')}
            >
              Start
            </button>
            <button onClick={stopTracking} disabled={!running} style={buttonStyle('#b13b2e')}>
              Stop
            </button>
            <button
              onClick={() => void buildSummary()}
              disabled={running || !result}
              style={buttonStyle('#0f8b50')}
            >
              Build Summary
            </button>
          </div>

          <div style={guideStyle}>
            한 화면에서 다니엘 스트레칭 5개 동작을 바꿔가며 테스트할 수 있습니다. Start 후 자세를
            잡고, 상태가 바뀌는지 확인한 다음 Build Summary로 최종 대표 피드백과 summary 응답을
            검증하면 됩니다.
          </div>

          <div style={previewStyle}>
            <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            />
          </div>
        </section>

        <section style={panelStyle}>
          <h2 style={{ marginTop: 0, fontSize: '22px' }}>Live Result</h2>
          <p style={{ marginTop: 0, marginBottom: '16px', color: '#677489', fontSize: '14px' }}>
            Check these first: <strong>motion</strong>, <strong>state</strong>,{' '}
            <strong>holdDurationMs</strong>, <strong>feedback</strong>
          </p>
          <InfoRow label="Status" value={status} />
          <InfoRow label="Error" value={error ?? '-'} />
          <InfoRow label="motion" value={result?.motion_name ?? currentMotionLabel} />
          <InfoRow label="tracking" value={result?.tracking ?? '-'} />
          <InfoRow label="state" value={result?.state ?? '-'} />
          <InfoRow label="holdDurationMs" value={String(result?.hold_duration_ms ?? 0)} />
          <InfoRow label="holdCompleted" value={String(result?.hold_completed ?? false)} />
          <InfoRow label="feedback" value={result?.feedback ?? '-'} />
          <InfoRow
            label="representativeFeedback"
            value={result?.representative_feedback_text ?? '-'}
          />

          <button onClick={() => setShowAdvanced(current => !current)} style={toggleStyle}>
            {showAdvanced ? 'Hide advanced debug' : 'Show advanced debug'}
          </button>

          {showAdvanced && result ? (
            <>
              <h3 style={{ marginTop: '20px', marginBottom: '12px' }}>Feature Snapshot</h3>
              <InfoRow label="accuracy" value={String(result.accuracy)} />
              {Object.entries(result.features).map(([key, value]) => (
                <InfoRow key={key} label={key} value={formatFeatureValue(value)} />
              ))}
              <InfoRow
                label="baselineLeftWristForward"
                value={formatFeatureValue(result.baseline_left_wrist_forward)}
              />
              <InfoRow
                label="baselineRightWristForward"
                value={formatFeatureValue(result.baseline_right_wrist_forward)}
              />
            </>
          ) : null}

          <h3 style={{ marginTop: '24px', marginBottom: '12px' }}>Summary</h3>
          {summary ? (
            <div style={summaryCardStyle}>
              <InfoRow label="motionId" value={summary.motionId} />
              <InfoRow label="motionName" value={summary.motionName} />
              <InfoRow label="durationSec" value={summary.durationSec.toFixed(1)} />
              <InfoRow label="accuracy" value={summary.accuracy.toFixed(2)} />
              <InfoRow label="holdCompleted" value={String(summary.holdCompleted)} />
              <InfoRow
                label="representativeFeedback"
                value={summary.representativeFeedback ?? '-'}
              />
              <InfoRow label="tracking" value={summary.tracking} />
              <InfoRow label="state" value={summary.state} />
            </div>
          ) : (
            <div style={emptyStateStyle}>
              No summary yet. Stop or pause, then click Build Summary.
            </div>
          )}

          <h3 style={{ marginTop: '24px', marginBottom: '12px' }}>State Log</h3>
          <div style={{ display: 'grid', gap: '10px', maxHeight: '280px', overflowY: 'auto' }}>
            {stateLogs.length === 0 ? (
              <div style={emptyStateStyle}>No state changes yet.</div>
            ) : (
              stateLogs.map((log, index) => (
                <div key={`${log.timestampLabel}-${log.state}-${index}`} style={logCardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <strong>{log.state}</strong>
                    <span style={{ color: '#677489' }}>{log.timestampLabel}</span>
                  </div>
                  <div style={{ marginTop: '8px', color: '#425066', fontSize: '14px' }}>
                    holdDurationMs: {log.holdDurationMs}
                  </div>
                  <div style={{ marginTop: '4px', color: '#425066', fontSize: '14px' }}>
                    feedback: {log.feedback ?? '-'}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )

  function drawPose(landmarks: readonly { x: number; y: number }[]) {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#5ce1e6'
    for (const landmark of landmarks) {
      context.beginPath()
      context.arc((1 - landmark.x) * canvas.width, landmark.y * canvas.height, 4, 0, Math.PI * 2)
      context.fill()
    }
  }
}

function toLandmarkPayload(
  landmarks: readonly { x: number; y: number; z: number; visibility?: number }[],
): LandmarkPayload[] {
  return landmarks.map((landmark, index) => ({
    name: POSE_LANDMARK_NAMES[index] ?? `LANDMARK_${index}`,
    x: landmark.x,
    y: landmark.y,
    z: landmark.z,
    visibility: landmark.visibility,
  }))
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoRowStyle}>
      <strong>{label}</strong>
      <span style={{ textAlign: 'right', color: '#425066' }}>{value}</span>
    </div>
  )
}

function formatFeatureValue(value: number | null | undefined) {
  if (value == null) return '-'
  return Number.isInteger(value) ? String(value) : value.toFixed(3)
}

function buttonStyle(background: string) {
  return {
    border: 'none',
    borderRadius: '12px',
    padding: '12px 18px',
    background,
    color: '#fff',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
  } satisfies CSSProperties
}

const pageStyle = {
  minHeight: '100vh',
  background: '#f4f6f8',
  color: '#18212f',
  padding: '24px',
  fontFamily: '"Pretendard", "Noto Sans KR", sans-serif',
} satisfies CSSProperties

const layoutStyle = {
  maxWidth: '1280px',
  margin: '0 auto',
  display: 'grid',
  gridTemplateColumns: '1.3fr 1fr',
  gap: '24px',
} satisfies CSSProperties

const labelStyle = {
  display: 'block',
  marginTop: '4px',
  fontWeight: 600,
} satisfies CSSProperties

const inputStyle = {
  width: '100%',
  marginTop: '8px',
  padding: '12px 14px',
  borderRadius: '12px',
  border: '1px solid #cad5e2',
  fontSize: '14px',
} satisfies CSSProperties

const guideStyle = {
  marginTop: '16px',
  padding: '12px 14px',
  borderRadius: '12px',
  background: '#eaf4ff',
  color: '#23415f',
  fontSize: '14px',
  lineHeight: 1.5,
} satisfies CSSProperties

const previewStyle = {
  position: 'relative',
  marginTop: '20px',
  width: '100%',
  aspectRatio: '4 / 3',
  background: '#111827',
  borderRadius: '20px',
  overflow: 'hidden',
} satisfies CSSProperties

const panelStyle = {
  background: '#ffffff',
  borderRadius: '20px',
  padding: '20px',
  boxShadow: '0 10px 30px rgba(19, 33, 55, 0.08)',
} satisfies CSSProperties

const toggleStyle = {
  marginTop: '16px',
  border: 'none',
  background: 'transparent',
  color: '#0b6bcb',
  fontSize: '14px',
  fontWeight: 700,
  cursor: 'pointer',
  padding: 0,
} satisfies CSSProperties

const emptyStateStyle = {
  padding: '14px',
  borderRadius: '12px',
  background: '#f5f7fa',
  color: '#66758c',
} satisfies CSSProperties

const logCardStyle = {
  padding: '14px',
  borderRadius: '12px',
  background: '#f5f7fa',
  border: '1px solid #e2e8f0',
} satisfies CSSProperties

const summaryCardStyle = {
  padding: '14px',
  borderRadius: '12px',
  background: '#f8fbff',
  border: '1px solid #dbe8f6',
} satisfies CSSProperties

const infoRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '10px 0',
  borderBottom: '1px solid #e8edf3',
  gap: '16px',
} satisfies CSSProperties

export default DanielStretchDebugPage
