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

type DiagonalFacePunchApiResponse = {
  motion_id: string
  state: string
  step_count: number
  accuracy: number
  feedback: string | null
  tracking: string
  last_counted_side: string | null
  last_seen_side: string | null
  left_armed: boolean
  right_armed: boolean
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
  baseline_stance_span: number | null
  features: {
    left_wrist_forward: number
    right_wrist_forward: number
    left_wrist_height: number
    right_wrist_height: number
    left_arm_extension: number
    right_arm_extension: number
    left_elbow_angle: number | null
    right_elbow_angle: number | null
    stance_span: number
    torso_tilt: number
    pelvis_shift_x: number
    pelvis_shift_y: number
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

function DiagonalFacePunchDebugPage() {
  const mountRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const trackerRef = useRef<PoseTracker | null>(null)
  const rafRef = useRef<number | null>(null)
  const requestInFlightRef = useRef(false)
  const previousStateRef = useRef('idle')
  const stepCountRef = useRef(0)
  const lastCountedSideRef = useRef<string | null>(null)
  const lastSeenSideRef = useRef<string | null>(null)
  const leftArmedRef = useRef(true)
  const rightArmedRef = useRef(true)
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
  const baselineStanceSpanRef = useRef<number | null>(null)

  const [aiBaseUrl, setAiBaseUrl] = useState(DEFAULT_AI_BASE_URL)
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState('Idle')
  const [result, setResult] = useState<DiagonalFacePunchApiResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stateLogs, setStateLogs] = useState<StateLogEntry[]>([])
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    return () => stopTracking()
  }, [])

  const resetEvaluatorState = () => {
    previousStateRef.current = 'idle'
    stepCountRef.current = 0
    lastCountedSideRef.current = null
    lastSeenSideRef.current = null
    leftArmedRef.current = true
    rightArmedRef.current = true
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
    baselineStanceSpanRef.current = null
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
      setStatus('Diagonal face punch test running')

      const loop = async () => {
        const activeTracker = trackerRef.current
        if (!activeTracker) return

        const detection = activeTracker.detect()
        const pose = detection.poses[0]
        drawPose(pose?.landmarks ?? [])

        if (pose && !requestInFlightRef.current) {
          requestInFlightRef.current = true
          try {
            const response = await fetch(`${aiBaseUrl}/gymnastics/diagonal-face-punch/evaluate`, {
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
                last_counted_side: lastCountedSideRef.current,
                last_seen_side: lastSeenSideRef.current,
                left_armed: leftArmedRef.current,
                right_armed: rightArmedRef.current,
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
                baseline_stance_span: baselineStanceSpanRef.current,
              }),
            })

            if (!response.ok) {
              throw new Error(`AI response error: ${response.status}`)
            }

            const payload = (await response.json()) as DiagonalFacePunchApiResponse

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
            lastCountedSideRef.current = payload.last_counted_side
            lastSeenSideRef.current = payload.last_seen_side
            leftArmedRef.current = payload.left_armed
            rightArmedRef.current = payload.right_armed
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
            baselineStanceSpanRef.current = payload.baseline_stance_span
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
          <h1 style={{ margin: 0, fontSize: '32px' }}>Diagonal Face Punch AI Debug</h1>
          <p style={{ marginTop: '8px', color: '#4d5b71' }}>
            Capture pose landmarks from the webcam, send them to the `diagonal-face-punch/evaluate`
            API, and inspect alternating diagonal face punch counting in real time.
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
            <strong>feedback</strong>, <strong>leftWristForward</strong>,{' '}
            <strong>rightWristForward</strong>, <strong>leftWristHeight</strong>,{' '}
            <strong>rightWristHeight</strong>
          </p>
          <InfoRow label="Status" value={status} />
          <InfoRow label="Error" value={error ?? '-'} />
          <InfoRow label="tracking" value={result?.tracking ?? '-'} />
          <InfoRow label="state" value={result?.state ?? '-'} />
          <InfoRow label="stepCount" value={String(result?.step_count ?? 0)} />
          <InfoRow label="feedback" value={result?.feedback ?? '-'} />
          <InfoRow
            label="leftWristForward"
            value={formatNumber(result?.features.left_wrist_forward)}
          />
          <InfoRow
            label="rightWristForward"
            value={formatNumber(result?.features.right_wrist_forward)}
          />
          <InfoRow
            label="leftWristHeight"
            value={formatNumber(result?.features.left_wrist_height)}
          />
          <InfoRow
            label="rightWristHeight"
            value={formatNumber(result?.features.right_wrist_height)}
          />

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
              <InfoRow label="leftArmed" value={String(result?.left_armed ?? true)} />
              <InfoRow label="rightArmed" value={String(result?.right_armed ?? true)} />
              <InfoRow
                label="leftArmExtension"
                value={formatNumber(result?.features.left_arm_extension)}
              />
              <InfoRow
                label="rightArmExtension"
                value={formatNumber(result?.features.right_arm_extension)}
              />
              <InfoRow
                label="leftElbowAngle"
                value={formatNullableNumber(result?.features.left_elbow_angle)}
              />
              <InfoRow
                label="rightElbowAngle"
                value={formatNullableNumber(result?.features.right_elbow_angle)}
              />
              <InfoRow label="stanceSpan" value={formatNumber(result?.features.stance_span)} />
              <InfoRow label="torsoTilt" value={formatNumber(result?.features.torso_tilt)} />
              <InfoRow label="pelvisShiftX" value={formatNumber(result?.features.pelvis_shift_x)} />
              <InfoRow label="pelvisShiftY" value={formatNumber(result?.features.pelvis_shift_y)} />
              <InfoRow
                label="pelvisDepthShift"
                value={formatNumber(result?.features.pelvis_depth_shift)}
              />
              <InfoRow
                label="baselineLeftWristForward"
                value={formatNumber(result?.baseline_left_wrist_forward)}
              />
              <InfoRow
                label="baselineRightWristForward"
                value={formatNumber(result?.baseline_right_wrist_forward)}
              />
              <InfoRow
                label="baselineStanceSpan"
                value={formatNumber(result?.baseline_stance_span)}
              />
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

export default DiagonalFacePunchDebugPage
