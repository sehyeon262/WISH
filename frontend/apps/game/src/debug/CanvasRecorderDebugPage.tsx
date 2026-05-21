import { useEffect, useRef, useState } from 'react'
import { pickSupportedMimeType, recordCanvas } from '../game/motion/canvasRecorder'
import { extractThumbnailFromVideoBlob } from '../game/motion/extractThumbnail'

const CANVAS_WIDTH = 640
const CANVAS_HEIGHT = 360
const RECORD_MS = 5_000

type RecordingState = 'idle' | 'recording' | 'done' | 'error'

function CanvasRecorderDebugPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const startedAtRef = useRef<number>(0)
  const [supportedMime, setSupportedMime] = useState<string | null>(null)
  const [state, setState] = useState<RecordingState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [resultMime, setResultMime] = useState<string | null>(null)
  const [resultSizeKb, setResultSizeKb] = useState<number | null>(null)
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [thumbSizeKb, setThumbSizeKb] = useState<number | null>(null)
  const [thumbDimensions, setThumbDimensions] = useState<string | null>(null)
  const [thumbError, setThumbError] = useState<string | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    setSupportedMime(pickSupportedMimeType())
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    startedAtRef.current = performance.now()

    const draw = (now: number) => {
      const elapsed = (now - startedAtRef.current) / 1000

      // 배경 — 시간에 따라 색이 도는 그라데이션 (인코딩이 잘 되는지 시각적으로 확인하기 좋음)
      const hue = (elapsed * 30) % 360
      ctx.fillStyle = `hsl(${hue}, 60%, 12%)`
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

      // 도는 원 — 프레임이 빠지지 않는지 눈으로 확인
      const cx = CANVAS_WIDTH / 2 + Math.cos(elapsed * 1.5) * 160
      const cy = CANVAS_HEIGHT / 2 + Math.sin(elapsed * 1.5) * 80
      ctx.fillStyle = `hsl(${(hue + 180) % 360}, 80%, 60%)`
      ctx.beginPath()
      ctx.arc(cx, cy, 40, 0, Math.PI * 2)
      ctx.fill()

      // 시간 텍스트 — 영상에 타임스탬프 박혀있으면 길이 검증 쉬움
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 28px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`t = ${elapsed.toFixed(2)}s`, 20, 40)

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // 녹화 진행 표시
  useEffect(() => {
    if (state !== 'recording') return
    const startedAt = performance.now()
    const id = window.setInterval(() => {
      setElapsedMs(performance.now() - startedAt)
    }, 50)
    return () => window.clearInterval(id)
  }, [state])

  const handleRecord = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl)
      setResultUrl(null)
    }
    if (thumbUrl) {
      URL.revokeObjectURL(thumbUrl)
      setThumbUrl(null)
    }
    setErrorMessage(null)
    setThumbError(null)
    setThumbDimensions(null)
    setThumbSizeKb(null)
    setState('recording')
    setElapsedMs(0)

    try {
      const result = await recordCanvas(canvas, { durationMs: RECORD_MS })
      const url = URL.createObjectURL(result.blob)
      setResultUrl(url)
      setResultMime(result.mimeType)
      setResultSizeKb(Math.round(result.blob.size / 1024))
      setState('done')

      // 영상 디코드 직후 첫 안정 프레임을 썸네일로 추출
      try {
        const thumb = await extractThumbnailFromVideoBlob(result.blob, {
          atSec: 0.5,
          maxWidth: 480,
        })
        setThumbUrl(URL.createObjectURL(thumb.blob))
        setThumbSizeKb(Math.round(thumb.blob.size / 1024))
        setThumbDimensions(`${thumb.width}×${thumb.height}`)
      } catch (thumbErr) {
        setThumbError(thumbErr instanceof Error ? thumbErr.message : String(thumbErr))
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
      setState('error')
    }
  }

  const handleDownload = () => {
    if (!resultUrl) return
    const ext = resultMime?.includes('mp4') ? 'mp4' : 'webm'
    const a = document.createElement('a')
    a.href = resultUrl
    a.download = `canvas-recorder-test.${ext}`
    a.click()
  }

  const recordProgress = Math.min(elapsedMs / RECORD_MS, 1)

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0a0a14',
        color: '#e7e5ff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: 24,
      }}
    >
      <h1 style={{ marginTop: 0 }}>Canvas Recorder Debug</h1>
      <p style={{ color: '#a8a4d0', marginTop: 0 }}>
        ?debug=canvas-recorder · 5초 녹화 후 다운로드/재생으로 검증
      </p>

      <div style={{ marginBottom: 12, fontSize: 14 }}>
        <strong>지원 MIME:</strong>{' '}
        <code style={{ color: supportedMime ? '#a7f3d0' : '#fca5a5' }}>
          {supportedMime ?? '(없음 — 이 브라우저는 MediaRecorder 미지원)'}
        </code>
      </div>

      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        style={{
          display: 'block',
          borderRadius: 12,
          border: '1px solid #2a2840',
          marginBottom: 16,
        }}
      />

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <button
          onClick={handleRecord}
          disabled={state === 'recording' || supportedMime === null}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            backgroundColor: state === 'recording' ? '#3a3168' : '#7c6aff',
            color: 'white',
            fontWeight: 700,
            cursor: state === 'recording' ? 'wait' : 'pointer',
          }}
        >
          {state === 'recording' ? '녹화 중...' : '5초 녹화 시작'}
        </button>

        {state === 'recording' && (
          <div
            style={{
              flex: 1,
              maxWidth: 280,
              height: 8,
              backgroundColor: '#1f1a35',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${recordProgress * 100}%`,
                height: '100%',
                backgroundColor: '#ff6fbd',
                transition: 'width 50ms linear',
              }}
            />
          </div>
        )}
      </div>

      {errorMessage && (
        <div style={{ color: '#fca5a5', marginBottom: 16 }}>
          <strong>오류:</strong> {errorMessage}
        </div>
      )}

      {state === 'done' && resultUrl && (
        <div style={{ display: 'grid', gap: 12, maxWidth: CANVAS_WIDTH }}>
          <div style={{ fontSize: 14, color: '#a8a4d0' }}>
            MIME: <code>{resultMime}</code> · 크기: <strong>{resultSizeKb} KB</strong>
          </div>
          <video
            src={resultUrl}
            controls
            playsInline
            style={{ width: '100%', borderRadius: 12, border: '1px solid #2a2840' }}
          />

          <div style={{ marginTop: 8, color: '#a8a4d0', fontSize: 14 }}>
            <strong style={{ color: '#e7e5ff' }}>썸네일</strong>{' '}
            {thumbDimensions && thumbSizeKb !== null && (
              <span>
                · {thumbDimensions} · <strong>{thumbSizeKb} KB</strong>
              </span>
            )}
          </div>
          {thumbError && (
            <div style={{ color: '#fca5a5', fontSize: 14 }}>
              <strong>썸네일 오류:</strong> {thumbError}
            </div>
          )}
          {thumbUrl && (
            <img
              src={thumbUrl}
              alt="추출된 썸네일"
              style={{
                width: '100%',
                maxWidth: 480,
                borderRadius: 12,
                border: '1px solid #2a2840',
              }}
            />
          )}
          {!thumbUrl && !thumbError && (
            <div style={{ color: '#a8a4d0', fontSize: 14 }}>썸네일 추출 중...</div>
          )}

          <button
            onClick={handleDownload}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid #4fd8ff',
              backgroundColor: 'transparent',
              color: '#4fd8ff',
              fontWeight: 700,
              cursor: 'pointer',
              justifySelf: 'start',
            }}
          >
            영상 다운로드
          </button>
        </div>
      )}
    </div>
  )
}

export default CanvasRecorderDebugPage
