// YouTube IFrame Player API bridge for in-game audio playback.

interface YTPlayer {
  playVideo(): void
  pauseVideo(): void
  stopVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getCurrentTime(): number
  getPlayerState(): number
  destroy(): void
}

declare global {
  interface Window {
    YT: {
      Player: new (
        el: HTMLElement,
        opts: {
          videoId: string
          width: number
          height: number
          playerVars: Record<string, string | number>
          events: {
            onReady?: (e: { target: YTPlayer }) => void
            onStateChange?: (e: { data: number }) => void
            onError?: (e: { data: number }) => void
          }
        },
      ) => YTPlayer
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

let _apiReady = false
let _apiLoading = false
const _queue: Array<() => void> = []

function ensureIframeAPI(): Promise<void> {
  if (_apiReady) return Promise.resolve()
  return new Promise(resolve => {
    _queue.push(resolve)
    if (_apiLoading) return
    _apiLoading = true
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      _apiReady = true
      prev?.()
      _queue.splice(0).forEach(cb => cb())
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(script)
  })
}

// Small 160×90 player rendered in the bottom-right corner during gameplay.
// YouTube ToS requires the player to be visible; keeping it small & unobtrusive.
export class YouTubePlayerBridge {
  private player: YTPlayer | null = null
  private container: HTMLDivElement
  private _ready = false
  onEnded?: () => void
  onPaused?: () => void

  constructor(private readonly videoId: string) {
    this.container = document.createElement('div')
    Object.assign(this.container.style, {
      position: 'fixed',
      bottom: '12px',
      right: '12px',
      width: '160px',
      height: '90px',
      borderRadius: '8px',
      overflow: 'hidden',
      zIndex: '10000',
      boxShadow: '0 4px 16px rgba(0,0,0,.6)',
      border: '1.5px solid rgba(255,255,255,.18)',
      pointerEvents: 'none',
    })
    document.body.appendChild(this.container)
  }

  async load(): Promise<void> {
    await ensureIframeAPI()
    return new Promise((resolve, reject) => {
      this.player = new window.YT.Player(this.container, {
        videoId: this.videoId,
        width: 160,
        height: 90,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            this._ready = true
            resolve()
          },
          onStateChange: e => {
            if (e.data === 0) this.onEnded?.()
            if (e.data === 2) this.onPaused?.()
          },
          onError: e => reject(new Error(`YT error code ${e.data}`)),
        },
      })
    })
  }

  get isReady() {
    return this._ready
  }

  play() {
    this.player?.playVideo()
  }

  stop() {
    this.player?.stopVideo()
  }

  seekTo(ms: number) {
    this.player?.seekTo(ms / 1000, true)
  }

  getCurrentTimeMs(): number {
    if (!this._ready || !this.player) return 0
    try {
      return (this.player.getCurrentTime() ?? 0) * 1000
    } catch {
      return 0
    }
  }

  destroy() {
    try {
      this.player?.destroy()
    } catch {
      // ignore — player may already be gone
    }
    this.player = null
    this._ready = false
    this.container.remove()
  }
}
