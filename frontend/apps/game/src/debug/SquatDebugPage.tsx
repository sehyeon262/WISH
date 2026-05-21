import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'
import { POSE_LANDMARK_NAMES, PoseTracker } from '../game/motion/poseTracker'

type LandmarkPayload = {
  name: string
  x: number
  y: number
  z?: number
  visibility?: number
}

type SquatApiResponse = {
  motion_id: string
  state: string
  step_count: number
  accuracy: number
  feedback: string | null
  tracking: string
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
  features: {
    hip_drop: number
    left_knee_angle: number | null
    right_knee_angle: number | null
    avg_knee_angle: number | null
    torso_tilt: number
    pelvis_shift_x: number
    pelvis_depth_shift: number
  }
}

type StateLogEntry = {
  state: string
  stepCount: number
  feedback: string | null
  timestampLabel: string
}

const DEFAULT_AI_BASE_URL = 'http://localhost:8001/api/v1'
const DEFAULT_TARGET_STEPS = 8
const MAX_STATE_LOGS = 12

function SquatDebugPage() {
  const mountRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const trackerRef = useRef<PoseTracker | null>(null)
  const rafRef = useRef<number | null>(null)
  const requestInFlightRef = useRef(false)
  const previousStateRef = useRef('idle')
  const stepCountRef = useRef(0)
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

  const [aiBaseUrl, setAiBaseUrl] = useState(DEFAULT_AI_BASE_URL)
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState('Idle')
  const [result, setResult] = useState<SquatApiResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stateLogs, setStateLogs] = useState<StateLogEntry[]>([])
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    return () => stopTracking()
  }, [])

  const resetEvaluatorState = () => {
    previousStateRef.current = 'idle'
    stepCountRef.current = 0
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
    setResult(null)
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
      setRunning(true)
      setStatus('Squat test running')

      const loop = async () => {
        const activeTracker = trackerRef.current
        if (!activeTracker) return

        const detection = activeTracker.detect()
        const pose = detection.poses[0]
        drawPose(pose?.landmarks ?? [])

        if (pose && !requestInFlightRef.current) {
          requestInFlightRef.current = true
          try {
            const response = await fetch(`${aiBaseUrl}/gymnastics/squat/evaluate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                frame: {
                  timestamp_ms: Math.floor(detection.timestampMs),
                  mirrored: true,
                  landmarks: toLandmarkPayload(pose.landmarks),
                },
                previous_state: previousStateRef.current,
                step_count: stepCountRef.current,
                target_steps: DEFAULT_TARGET_STEPS,
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
              }),
            })

            if (!response.ok) {
              throw new Error(`AI response error: ${response.status}`)
            }

            const payload = (await response.json()) as SquatApiResponse

            if (payload.state !== previousStateRef.current) {
              const timestampLabel = new Date().toLocaleTimeString('ko-KR', { hour12: false })
              setStateLogs(current =>
                [
                  {
                    state: payload.state,
                    stepCount: payload.step_count,
                    feedback: payload.feedback,
                    timestampLabel,
                  },
                  ...current,
                ].slice(0, MAX_STATE_LOGS),
              )
            }

            previousStateRef.current = payload.state
            stepCountRef.current = payload.step_count
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
            setResult(payload)
            setStatus(payload.feedback ?? 'Running normally')
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

  return (
    <div style={pageStyle}>
      <div style={layoutStyle}>
        <section>
          <h1 style={{ margin: 0, fontSize: '32px' }}>Squat AI Debug</h1>
          <p style={{ marginTop: '8px', color: '#4d5b71' }}>
            양손은 가슴 앞에서 교차하고 양 발은 어깨 너비로 벌린 상태에서 앉았다 일어서기를 8회
            반복합니다. 웹캠 포즈를 실시간으로 <code>squat/evaluate</code> API에 전송해 상태를
            확인합니다.
          </p>

          <label style={{ display: 'block', marginTop: '16px', fontWeight: 600 }}>
            AI Base URL
          </label>
          <input
            value={aiBaseUrl}
            onChange={event => setAiBaseUrl(event.target.value)}
            style={inputStyle}
          />

          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
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
            Check these first: <strong>state</strong>, <strong>stepCount</strong>,{' '}
            <strong>hipDrop</strong>, <strong>feedback</strong>
          </p>
          <InfoRow label="Status" value={status} />
          <InfoRow label="Error" value={error ?? '-'} />
          <InfoRow label="tracking" value={result?.tracking ?? '-'} />
          <InfoRow label="state" value={result?.state ?? '-'} />
          <InfoRow label="stepCount" value={String(result?.step_count ?? 0)} />
          <InfoRow label="feedback" value={result?.feedback ?? '-'} />
          <InfoRow label="hipDrop" value={formatNumber(result?.features.hip_drop)} />
          <InfoRow
            label="avgKneeAngle"
            value={formatNullableNumber(result?.features.avg_knee_angle)}
          />
          <InfoRow label="torsoTilt" value={formatNumber(result?.features.torso_tilt)} />

          <button onClick={() => setShowAdvanced(current => !current)} style={toggleStyle}>
            {showAdvanced ? 'Hide advanced debug' : 'Show advanced debug'}
          </button>

          {showAdvanced ? (
            <>
              <h3 style={{ marginTop: '20px', marginBottom: '12px' }}>Advanced</h3>
              <InfoRow label="accuracy" value={String(result?.accuracy ?? '-')} />
              <InfoRow
                label="representativeFeedback"
                value={result?.representative_feedback_text ?? '-'}
              />
              <InfoRow
                label="representativeFeedbackFrames"
                value={String(result?.representative_feedback_frames ?? 0)}
              />
              <InfoRow
                label="displayedFeedbackFrames"
                value={String(result?.displayed_feedback_frames ?? 0)}
              />
              <InfoRow label="candidateFeedback" value={result?.candidate_feedback_text ?? '-'} />
              <InfoRow
                label="candidateFeedbackStreak"
                value={String(result?.candidate_feedback_streak ?? 0)}
              />
              <InfoRow
                label="leftKneeAngle"
                value={formatNullableNumber(result?.features.left_knee_angle)}
              />
              <InfoRow
                label="rightKneeAngle"
                value={formatNullableNumber(result?.features.right_knee_angle)}
              />
              <InfoRow label="pelvisShiftX" value={formatNumber(result?.features.pelvis_shift_x)} />
              <InfoRow
                label="pelvisDepthShift"
                value={formatNumber(result?.features.pelvis_depth_shift)}
              />
              <InfoRow label="referenceHipY" value={formatNumber(result?.reference_hip_y)} />
              <InfoRow label="referenceScale" value={formatNumber(result?.reference_scale)} />
            </>
          ) : null}

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
                    stepCount: {log.stepCount}
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

function formatNumber(value: number | null | undefined) {
  if (value == null) return '-'
  return value.toFixed(3)
}

function formatNullableNumber(value: number | null | undefined) {
  if (value == null) return '-'
  return value.toFixed(1)
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
  maxWidth: '1200px',
  margin: '0 auto',
  display: 'grid',
  gridTemplateColumns: '1.4fr 1fr',
  gap: '24px',
} satisfies CSSProperties

const inputStyle = {
  width: '100%',
  marginTop: '8px',
  padding: '12px 14px',
  borderRadius: '12px',
  border: '1px solid #cad5e2',
  fontSize: '14px',
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

const infoRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '10px 0',
  borderBottom: '1px solid #e8edf3',
  gap: '16px',
} satisfies CSSProperties

export default SquatDebugPage
