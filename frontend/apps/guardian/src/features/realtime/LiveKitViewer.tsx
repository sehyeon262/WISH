import { useCallback, useEffect, useRef, useState } from 'react'
import { type ActiveLiveSession, useRealtimeStore } from '@/stores/realtimeStore'
import { PttButton } from './PttButton'
import { useLiveKitViewer, type LiveKitViewerStatus } from './useLiveKitViewer'
import styles from './LiveKitViewer.module.css'

type Props = {
  activeSession: ActiveLiveSession
}

// 활성 LoginSession 에 대응되는 LiveKit room 의 게임 화면을 보여주는 viewer.
// 부모(LiveMonitorPage) 가 activeSession 이 null 인 경우엔 아예 이 컴포넌트를 마운트하지 않는다.
//
// 레이아웃: stage 가 viewport 의 대부분을 차지하고, 환자 라벨/상태/소리/PTT 는 모두
// stage 위의 absolute overlay 로 떠 있다. 별도의 status bar 가 아래로 빠지지 않아
// PTT 까지 한 화면에 들어온다.
export function LiveKitViewer({ activeSession }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const { status, hasRemoteVideo, setMicrophoneEnabled } = useLiveKitViewer({
    loginSessionId: activeSession.loginSessionId,
    videoRef,
    audioRef,
  })

  // 게임앱 Phaser canvas 가 항상 16:9 인 건 아니라(개발자 도구/멀티모니터/특이 비율 환경)
  // stage 비율을 source 의 videoWidth/videoHeight 로 동적 매핑한다. 비율이 맞으면
  // letterbox(검은 여백) 도 없고 가로 잘림도 없다. 메타데이터 도착 전엔 16:9 폴백.
  const [videoAspect, setVideoAspect] = useState(16 / 9)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const sync = () => {
      const { videoWidth, videoHeight } = video
      if (videoWidth > 0 && videoHeight > 0) {
        setVideoAspect(videoWidth / videoHeight)
      }
    }
    video.addEventListener('loadedmetadata', sync)
    video.addEventListener('resize', sync)
    sync()
    return () => {
      video.removeEventListener('loadedmetadata', sync)
      video.removeEventListener('resize', sync)
    }
  }, [hasRemoteVideo])
  const contentActive = useRealtimeStore(state => state.contentActive)
  const pttEnabled = status === 'connected' && contentActive

  // 첫 진입 시엔 browser autoplay 정책상 muted=true 로 두고, 사용자가 '소리 켜기' 를
  // 누르면 그때 unmute + play 명시 호출. 재연결로 srcObject 가 교체되면 element 의
  // muted 상태가 풀려도 audioUnmuted 가 false 면 다시 mute 시킨다.
  const [audioUnmuted, setAudioUnmuted] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    const audio = audioRef.current
    if (!video || !audio) return
    video.muted = !audioUnmuted
    audio.muted = !audioUnmuted
    if (audioUnmuted) {
      void video.play().catch(() => {})
      void audio.play().catch(() => {})
    }
  }, [audioUnmuted, hasRemoteVideo])

  // 연결이 끊기거나 viewer 가 리셋되면 unmute 의도를 보존하지 않는다.
  // 다음 연결에서 사용자가 다시 명시적으로 켜야 안전.
  useEffect(() => {
    if (status === 'disconnected' || status === 'error') {
      setAudioUnmuted(false)
    }
  }, [status])

  const toggleAudio = useCallback(() => {
    setAudioUnmuted(prev => !prev)
  }, [])

  // stage 의 aspect-ratio 와 max-width 둘 다 source 비율에 맞춰 inline 설정.
  // 세로 100vh - 100px(헤더/패딩) 공간 안에서 source 비율에 따라 가로 한도 결정.
  const stageStyle = {
    aspectRatio: String(videoAspect),
    maxWidth: `calc((100vh - 100px) * ${videoAspect})`,
  }

  return (
    <div className={styles.viewer}>
      <div className={styles.stage} style={stageStyle}>
        <video
          ref={videoRef}
          className={styles.video}
          autoPlay
          playsInline
          muted
          // 안드로이드 Chrome 에서 일부 비디오 코덱이 autoplay 정책 검사를 못 통과하는 경우 대비.
          controls={false}
        />
        {/* muted 기본값으로 autoplay 차단 우회 — 소리 켜기 버튼이 unmute 한다. */}
        <audio ref={audioRef} className={styles.audio} autoPlay muted />

        <div className={styles.topRightBar}>
          {status === 'connected' ? (
            <button
              type="button"
              className={`${styles.audioToggle} ${audioUnmuted ? styles.audioToggleOn : ''}`}
              onClick={toggleAudio}
              aria-pressed={audioUnmuted}
            >
              {audioUnmuted ? '음소거' : '소리 켜기'}
            </button>
          ) : null}
          <span
            className={`${styles.statusBadge} ${status === 'connected' ? styles.statusBadgeLive : ''}`}
          >
            {statusLabel(status)}
          </span>
        </div>

        <div className={styles.bottomCenterBar}>
          <PttButton enabled={pttEnabled} setMicrophoneEnabled={setMicrophoneEnabled} />
        </div>

        {hasRemoteVideo ? null : (
          <div className={styles.waitingOverlay}>
            {overlayMessage(status, activeSession.patientName)}
          </div>
        )}
      </div>
    </div>
  )
}

function overlayMessage(status: LiveKitViewerStatus, patientName: string): string {
  switch (status) {
    case 'idle':
      return '연결을 준비하고 있어요...'
    case 'requesting-token':
      return '실시간 입장권을 받아오고 있어요...'
    case 'connecting':
      return '아이의 화면에 연결하고 있어요...'
    case 'connected':
      return `${patientName} 님의 화면을 기다리고 있어요...`
    case 'disconnected':
      return '연결이 끊겼어요. 새로고침해서 다시 시도해 주세요.'
    case 'error':
      return '연결에 실패했어요. 잠시 후 다시 시도해 주세요.'
  }
}

function statusLabel(status: LiveKitViewerStatus): string {
  switch (status) {
    case 'idle':
      return '대기'
    case 'requesting-token':
      return '입장권 요청 중'
    case 'connecting':
      return '연결 중'
    case 'connected':
      return 'LIVE'
    case 'disconnected':
      return '연결 끊김'
    case 'error':
      return '오류'
  }
}
