import type Phaser from 'phaser'
import { assetPath } from '@/game/assets/assetPath'
import { getGameSettings } from '@/game/settings/gameSettings'

const FADE_IN_MS = 900
const FADE_OUT_MS = 650
const FADE_STEP_MS = 40

const BGM_TRACKS = {
  start: {
    path: 'sounds/bgm/start-dawn.wav',
    volume: 1,
  },
  village: {
    path: 'sounds/bgm/village-day.wav',
    volume: 1,
  },
  art: {
    path: 'sounds/bgm/art-studio.wav',
    volume: 1,
  },
  quiz: {
    path: 'sounds/bgm/quiz-doodle.wav',
    volume: 1,
  },
  taekwondo: {
    path: 'sounds/bgm/taekwondo-dojang.wav',
    volume: 1,
  },
  gymnastics: {
    path: 'sounds/bgm/gymnastics-move.wav',
    volume: 1,
  },
  ferry: {
    path: 'sounds/bgm/ferry-harbor.wav',
    volume: 1,
  },
  lighthouse: {
    path: 'sounds/bgm/lighthouse-calm.wav',
    volume: 1,
  },
  musicLobby: {
    path: 'sounds/bgm/music-lobby.wav',
    volume: 1,
  },
  photoBooth: {
    path: 'sounds/bgm/photo-booth-spark.wav',
    volume: 1,
  },
} as const

export type SceneBgmTrackKey = keyof typeof BGM_TRACKS

const SCENE_BGM_TRACKS: Record<string, SceneBgmTrackKey | null> = {
  StartScene: 'start',
  VillageScene: 'village',
  ArtSelectScene: 'art',
  ArtAlbumScene: 'art',
  ArtColoringSelectScene: 'art',
  ArtColoringScene: 'art',
  ArtFreeDrawingScene: 'art',
  QuizLobbyScene: 'quiz',
  QuizPlayScene: 'quiz',
  TaekwondoSelectScene: 'taekwondo',
  TaekwondoPoomsaeSelectScene: 'taekwondo',
  TaekwondoPoomsaePracticeScene: 'taekwondo',
  GymnasticsSelectScene: 'gymnastics',
  GymnasticsTopScene: 'gymnastics',
  GymnasticsDanielScene: 'gymnastics',
  FerrySelectScene: 'ferry',
  LighthouseSelectScene: 'lighthouse',
  MusicSelectScene: 'musicLobby',
  MusicSongSelectScene: 'musicLobby',
  YouTubeSearchScene: 'musicLobby',
  MusicRhythmScene: null,
  PhotoBoothFrameSelectScene: 'photoBooth',
  PhotoBoothCameraScene: 'photoBooth',
  PhotoBoothPickScene: 'photoBooth',
  PhotoBoothResultScene: 'photoBooth',
  PhotoBoothSaveScene: 'photoBooth',
}

type FadeHandle = number

class SceneBgmController {
  private currentAudio: HTMLAudioElement | null = null
  private currentTrackKey: SceneBgmTrackKey | null = null
  private pendingTrackKey: SceneBgmTrackKey | null = null
  private fadeInHandle: FadeHandle | null = null
  private fadeOutHandle: FadeHandle | null = null
  private fadingOutAudio: HTMLAudioElement | null = null
  private isUnlocked = false
  private hasUnlockListeners = false
  private requestSerial = 0

  play(trackKey: SceneBgmTrackKey | null) {
    if (!canUseAudio()) return

    if (trackKey === null) {
      this.pendingTrackKey = null
      this.stop()
      return
    }

    this.pendingTrackKey = trackKey

    if (!getGameSettings().bgmEnabled) {
      this.stop()
      return
    }

    this.ensureUnlockListeners()

    if (!this.isUnlocked) return

    void this.startTrack(trackKey)
  }

  syncVolume() {
    if (!getGameSettings().bgmEnabled) {
      this.stop()
      return
    }

    if (!this.currentAudio && this.pendingTrackKey && this.isUnlocked) {
      void this.startTrack(this.pendingTrackKey)
      return
    }

    if (!this.currentAudio || !this.currentTrackKey) return

    this.currentAudio.volume = getTargetVolume(this.currentTrackKey)
  }

  private async startTrack(trackKey: SceneBgmTrackKey) {
    if (!getGameSettings().bgmEnabled) return

    if (this.currentTrackKey === trackKey && this.currentAudio && !this.currentAudio.paused) {
      this.fadeIn(this.currentAudio, getTargetVolume(trackKey), FADE_IN_MS)
      return
    }

    const requestId = ++this.requestSerial
    const previousAudio = this.currentAudio
    const previousFadeInHandle = this.fadeInHandle
    const track = BGM_TRACKS[trackKey]
    const audio = new Audio(assetPath(track.path))

    audio.loop = true
    audio.preload = 'auto'
    audio.volume = 0

    try {
      await audio.play()
    } catch {
      audio.pause()
      this.isUnlocked = false
      this.ensureUnlockListeners()
      return
    }

    if (requestId !== this.requestSerial || this.pendingTrackKey !== trackKey) {
      audio.pause()
      audio.src = ''
      return
    }

    if (previousFadeInHandle) window.clearInterval(previousFadeInHandle)

    this.currentAudio = audio
    this.currentTrackKey = trackKey
    this.fadeIn(audio, getTargetVolume(trackKey), FADE_IN_MS)
    this.restartSameAudioOnEnded(audio, trackKey, requestId)

    if (previousAudio) {
      this.fadeOut(previousAudio, FADE_OUT_MS)
    }
  }

  private stop() {
    this.requestSerial += 1

    if (!this.currentAudio) {
      this.currentTrackKey = null
      return
    }

    if (this.fadeInHandle) {
      window.clearInterval(this.fadeInHandle)
      this.fadeInHandle = null
    }

    const audio = this.currentAudio
    this.currentAudio = null
    this.currentTrackKey = null
    this.fadeOut(audio, FADE_OUT_MS)
  }

  private fadeIn(audio: HTMLAudioElement, targetVolume: number, durationMs: number) {
    if (this.fadeInHandle) window.clearInterval(this.fadeInHandle)

    this.fadeInHandle = tweenVolume(audio, audio.volume, targetVolume, durationMs, () => {
      this.fadeInHandle = null
    })
  }

  private fadeOut(audio: HTMLAudioElement, durationMs: number) {
    if (this.fadeOutHandle) {
      window.clearInterval(this.fadeOutHandle)
      if (this.fadingOutAudio) releaseAudio(this.fadingOutAudio)
    }

    this.fadingOutAudio = audio
    this.fadeOutHandle = tweenVolume(audio, audio.volume, 0, durationMs, () => {
      releaseAudio(audio)
      if (this.fadingOutAudio === audio) this.fadingOutAudio = null
      this.fadeOutHandle = null
    })
  }

  private restartSameAudioOnEnded(
    audio: HTMLAudioElement,
    trackKey: SceneBgmTrackKey,
    requestId: number,
  ) {
    audio.addEventListener('ended', () => {
      if (
        requestId !== this.requestSerial ||
        this.currentAudio !== audio ||
        this.currentTrackKey !== trackKey ||
        !getGameSettings().bgmEnabled
      ) {
        return
      }

      audio.currentTime = 0
      void audio.play()
    })
  }

  private ensureUnlockListeners() {
    if (!canUseAudio() || this.isUnlocked || this.hasUnlockListeners) return

    this.hasUnlockListeners = true
    window.addEventListener('pointerdown', this.handleUnlockGesture, {
      capture: true,
      once: true,
    })
    window.addEventListener('keydown', this.handleUnlockGesture, { capture: true, once: true })
  }

  private removeUnlockListeners() {
    if (!this.hasUnlockListeners || !canUseAudio()) return

    window.removeEventListener('pointerdown', this.handleUnlockGesture, { capture: true })
    window.removeEventListener('keydown', this.handleUnlockGesture, { capture: true })
    this.hasUnlockListeners = false
  }

  private readonly handleUnlockGesture = () => {
    this.removeUnlockListeners()
    this.isUnlocked = true

    if (this.pendingTrackKey && getGameSettings().bgmEnabled) {
      void this.startTrack(this.pendingTrackKey)
    }
  }
}

const sceneBgmController = new SceneBgmController()

export function playSceneBgm(scene: Phaser.Scene) {
  sceneBgmController.play(getBgmTrackForScene(scene.scene.key))
}

export function syncSceneBgmVolume() {
  sceneBgmController.syncVolume()
}

export function getBgmTrackForScene(sceneKey: string): SceneBgmTrackKey | null {
  return SCENE_BGM_TRACKS[sceneKey] ?? null
}

function getTargetVolume(trackKey: SceneBgmTrackKey) {
  return BGM_TRACKS[trackKey].volume
}

function tweenVolume(
  audio: HTMLAudioElement,
  from: number,
  to: number,
  durationMs: number,
  onComplete: () => void,
) {
  const startedAt = window.performance.now()

  const handle = window.setInterval(() => {
    const elapsedMs = window.performance.now() - startedAt
    const progress = Math.min(1, elapsedMs / durationMs)
    audio.volume = from + (to - from) * easeInOutSine(progress)

    if (progress >= 1) {
      window.clearInterval(handle)
      onComplete()
    }
  }, FADE_STEP_MS)

  return handle
}

function easeInOutSine(value: number) {
  return -(Math.cos(Math.PI * value) - 1) / 2
}

function canUseAudio() {
  return typeof window !== 'undefined' && typeof Audio !== 'undefined'
}

function releaseAudio(audio: HTMLAudioElement) {
  audio.pause()
  audio.src = ''
}
