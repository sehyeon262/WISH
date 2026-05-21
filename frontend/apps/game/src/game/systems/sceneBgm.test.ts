import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/settings/gameSettings', () => ({
  getGameSettings: () => ({ bgmEnabled: true, masterVolume: 0.8 }),
}))

const { getBgmTrackForScene, playSceneBgm } = await import('./sceneBgm')

describe('scene BGM mapping', () => {
  it('maps major screens to their BGM groups', () => {
    expect(getBgmTrackForScene('StartScene')).toBe('start')
    expect(getBgmTrackForScene('VillageScene')).toBe('village')
    expect(getBgmTrackForScene('ArtSelectScene')).toBe('art')
    expect(getBgmTrackForScene('QuizPlayScene')).toBe('quiz')
    expect(getBgmTrackForScene('TaekwondoPoomsaePracticeScene')).toBe('taekwondo')
    expect(getBgmTrackForScene('GymnasticsDanielScene')).toBe('gymnastics')
    expect(getBgmTrackForScene('LighthouseSelectScene')).toBe('lighthouse')
    expect(getBgmTrackForScene('PhotoBoothCameraScene')).toBe('photoBooth')
  })

  it('keeps rhythm gameplay clear for the selected song audio', () => {
    expect(getBgmTrackForScene('MusicSelectScene')).toBe('musicLobby')
    expect(getBgmTrackForScene('MusicRhythmScene')).toBeNull()
  })

  it('does not play BGM for unknown scenes', () => {
    expect(getBgmTrackForScene('UnknownScene')).toBeNull()
  })

  it('restarts long BGM on the same looped audio element', async () => {
    vi.useFakeTimers()

    const audioInstances: FakeAudio[] = []
    class FakeAudio extends EventTarget {
      loop = false
      preload = ''
      volume = 0
      paused = true
      currentTime = 12
      src: string
      play = vi.fn(() => {
        this.paused = false
        return Promise.resolve()
      })
      pause = vi.fn(() => {
        this.paused = true
      })

      constructor(src: string) {
        super()
        this.src = src
        audioInstances.push(this)
      }
    }

    vi.stubGlobal('Audio', FakeAudio)

    playSceneBgm({ scene: { key: 'StartScene' } } as Phaser.Scene)
    window.dispatchEvent(new Event('pointerdown'))
    await Promise.resolve()

    expect(audioInstances).toHaveLength(1)
    expect(audioInstances[0].loop).toBe(true)

    vi.advanceTimersByTime(FADE_TEST_DURATION_MS)
    expect(audioInstances[0].volume).toBe(1)

    audioInstances[0].dispatchEvent(new Event('ended'))
    await Promise.resolve()

    expect(audioInstances).toHaveLength(1)
    expect(audioInstances[0].currentTime).toBe(0)
    expect(audioInstances[0].play).toHaveBeenCalledTimes(2)

    playSceneBgm({ scene: { key: 'UnknownScene' } } as Phaser.Scene)
    vi.advanceTimersByTime(FADE_TEST_DURATION_MS)
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
})

const FADE_TEST_DURATION_MS = 1_000
