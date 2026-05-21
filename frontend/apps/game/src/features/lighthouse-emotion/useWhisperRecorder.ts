import { useCallback, useEffect, useRef, useState } from 'react'

export type WhisperRecorderStatus = 'idle' | 'recording' | 'transcribing' | 'denied' | 'error'

interface UseWhisperRecorderOptions {
  transcribe: (audio: Blob) => Promise<string>
  onFinalResult?: (transcript: string) => void
}

interface UseWhisperRecorderResult {
  supported: boolean
  status: WhisperRecorderStatus
  errorMessage: string | null
  start: () => Promise<void>
  stop: () => void
  reset: () => void
}

function isMediaRecorderSupported(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof window.MediaRecorder === 'undefined') return false
  if (typeof navigator === 'undefined') return false
  return Boolean(navigator.mediaDevices?.getUserMedia)
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime
  }
  return undefined
}

/**
 * MediaRecorder 로 짧은 발화를 녹음하고, 사용자가 마이크를 다시 누르면 Blob 을 AI 서버 Whisper 프록시로 보내 텍스트를 받는다.
 * - 토글 동작: 클릭 → 녹음, 다시 클릭 → 정지 + 업로드
 * - `transcribe` 는 외부에서 주입(테스트 가능). 실패는 status='error' 로 가시화하고 onFinalResult 미호출.
 */
export function useWhisperRecorder({
  transcribe,
  onFinalResult,
}: UseWhisperRecorderOptions): UseWhisperRecorderResult {
  const supported = isMediaRecorderSupported()

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const onFinalResultRef = useRef(onFinalResult)
  const transcribeRef = useRef(transcribe)
  const isMountedRef = useRef(true)

  const [status, setStatus] = useState<WhisperRecorderStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    onFinalResultRef.current = onFinalResult
  }, [onFinalResult])

  useEffect(() => {
    transcribeRef.current = transcribe
  }, [transcribe])

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
  }, [])

  const reset = useCallback(() => {
    chunksRef.current = []
    setStatus('idle')
    setErrorMessage(null)
  }, [])

  const start = useCallback(async () => {
    if (!supported) return
    setErrorMessage(null)
    chunksRef.current = []

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      })
    } catch (e) {
      const err = e as Error & { name?: string }
      if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
        setStatus('denied')
        setErrorMessage('마이크를 쓸 수 있게 허락해 주세요.')
      } else {
        setStatus('error')
        setErrorMessage('마이크를 시작하지 못했어요.')
      }
      return
    }

    streamRef.current = stream
    const mimeType = pickMimeType()
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    recorderRef.current = recorder

    recorder.ondataavailable = event => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data)
      }
    }

    recorder.onstop = () => {
      const recorded = chunksRef.current
      chunksRef.current = []
      stopStream()

      const blobType = recorder.mimeType || mimeType || 'audio/webm'
      const blob = new Blob(recorded, { type: blobType })

      if (blob.size === 0) {
        if (isMountedRef.current) setStatus('idle')
        return
      }

      if (isMountedRef.current) setStatus('transcribing')

      void (async () => {
        try {
          const text = (await transcribeRef.current(blob)).trim()
          if (!isMountedRef.current) return
          if (text.length > 0) {
            onFinalResultRef.current?.(text)
          }
          setStatus('idle')
        } catch {
          if (!isMountedRef.current) return
          setStatus('error')
          setErrorMessage('말을 글자로 바꾸지 못했어. 잠시 후 다시 말해 줄래?')
        }
      })()
    }

    recorder.start()
    setStatus('recording')
  }, [stopStream, supported])

  const stop = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch {
        // recorder 가 이미 inactive 인 레이스 — onstop 가 알아서 정리됨.
        stopStream()
        setStatus('idle')
      }
      return
    }
    stopStream()
    setStatus('idle')
  }, [stopStream])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop()
        } catch {
          // noop
        }
      }
      stopStream()
    }
  }, [stopStream])

  return {
    supported,
    status,
    errorMessage,
    start,
    stop,
    reset,
  }
}
