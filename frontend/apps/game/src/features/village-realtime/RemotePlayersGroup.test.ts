import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { VillageMoveEvent, VillageSnapshot } from './types'

interface FakeSprite {
  x: number
  y: number
  displayHeight: number
  frame: { name: string }
  destroy: ReturnType<typeof vi.fn>
  setTexture: ReturnType<typeof vi.fn>
  anims: {
    currentAnim: { key: string } | null
    isPlaying: boolean
    play: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
  }
}

interface FakeText {
  x: number
  y: number
  content: string
  destroy: ReturnType<typeof vi.fn>
  setOrigin: ReturnType<typeof vi.fn>
  setDepth: ReturnType<typeof vi.fn>
  setPosition: ReturnType<typeof vi.fn>
}

interface FakeTween {
  stop: ReturnType<typeof vi.fn>
  config: Record<string, unknown>
}

const createPlayerMock = vi.fn()
const ensurePlayerWalkAnimationsMock = vi.fn()
const getPlayerWalkAnimationKeyMock = vi.fn()
const emitEmoteBubbleMock = vi.fn()

vi.mock('@/game/entities/player', () => ({
  createPlayer: (...args: unknown[]) => createPlayerMock(...args),
  ensurePlayerWalkAnimations: (...args: unknown[]) => ensurePlayerWalkAnimationsMock(...args),
  getPlayerWalkAnimationKey: (...args: unknown[]) => getPlayerWalkAnimationKeyMock(...args),
  PLAYER_TEXTURE_KEY: 'character',
}))

vi.mock('./emoteBubble', () => ({
  emitEmoteBubble: (...args: unknown[]) => emitEmoteBubbleMock(...args),
}))

// Phaser 는 ESM 으로 import 되지만 RemotePlayersGroup 가 Phaser.Tweens.Tween 타입만 참조해서 런타임에는 사용하지 않으므로
// 빈 mock 으로 충분 — jsdom 환경에서 Phaser 가 canvas 를 만지지 않게 한다.
vi.mock('phaser', () => ({ default: {} }))

import { RemotePlayersGroup } from './RemotePlayersGroup'

function newFakeSprite(): FakeSprite {
  return {
    x: 0,
    y: 0,
    displayHeight: 100,
    frame: { name: '0' },
    destroy: vi.fn(),
    setTexture: vi.fn(),
    anims: {
      currentAnim: null,
      isPlaying: false,
      play: vi.fn(),
      stop: vi.fn(),
    },
  }
}

function newFakeText(x: number, y: number, content: string): FakeText {
  const text: FakeText = {
    x,
    y,
    content,
    destroy: vi.fn(),
    setOrigin: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setPosition: vi.fn(),
  }
  text.setPosition.mockImplementation((nx: number, ny: number) => {
    text.x = nx
    text.y = ny
    return text
  })
  return text
}

function setupScene() {
  const sprites: FakeSprite[] = []
  const texts: FakeText[] = []
  const tweens: FakeTween[] = []

  createPlayerMock.mockImplementation((_scene: unknown, x: number, y: number) => {
    const sprite = newFakeSprite()
    sprite.x = x
    sprite.y = y
    sprites.push(sprite)
    return sprite
  })
  getPlayerWalkAnimationKeyMock.mockImplementation((dir: string) => `walk-${dir}`)

  const scene = {
    textures: {
      exists: vi.fn(
        (textureKey: string) => textureKey === 'character' || textureKey === 'outfit-a',
      ),
    },
    tweens: {
      add: vi.fn((config: Record<string, unknown>) => {
        const tween: FakeTween = { stop: vi.fn(), config }
        // tween 이 즉시 완료된 것처럼 sprite 좌표를 목표값으로 옮긴다 — 테스트 결정성 확보.
        const targets = config.targets as FakeSprite
        targets.x = config.x as number
        targets.y = config.y as number
        // onUpdate / onComplete 가 등록돼 있으면 동기 호출 — 닉네임 텍스트 sync 검증.
        ;(config.onUpdate as (() => void) | undefined)?.()
        ;(config.onComplete as (() => void) | undefined)?.()
        tweens.push(tween)
        return tween
      }),
    },
    add: {
      text: vi.fn((x: number, y: number, content: string) => {
        const t = newFakeText(x, y, content)
        texts.push(t)
        return t
      }),
    },
  }

  return { scene, sprites, texts, tweens }
}

function group(scene: unknown, opts: Partial<{ localUserId: number; w: number; h: number }> = {}) {
  return new RemotePlayersGroup({
    scene: scene as never,
    localUserId: opts.localUserId ?? 99,
    worldWidth: opts.w ?? 1000,
    worldHeight: opts.h ?? 800,
  })
}

beforeEach(() => {
  createPlayerMock.mockReset()
  ensurePlayerWalkAnimationsMock.mockReset()
  getPlayerWalkAnimationKeyMock.mockReset()
  emitEmoteBubbleMock.mockReset()
})

describe('RemotePlayersGroup', () => {
  it('applies snapshot and skips local user', () => {
    const { scene, sprites } = setupScene()
    const g = group(scene, { localUserId: 99 })

    const snapshot: VillageSnapshot = {
      members: [
        { userId: 1, nickname: 'a', textureKey: 'character', x: 0.5, y: 0.3, dir: 'down' },
        { userId: 99, nickname: 'me', textureKey: 'character', x: 0.4, y: 0.4, dir: 'down' },
        { userId: 2, nickname: 'b', textureKey: 'character', x: 0.7, y: 0.6, dir: 'left' },
      ],
    }
    g.applySnapshot(snapshot)

    expect(g.size()).toBe(2)
    expect(g.has(1)).toBe(true)
    expect(g.has(2)).toBe(true)
    expect(g.has(99)).toBe(false)
    expect(sprites).toHaveLength(2)
    // ratio → pixel 변환 검증
    expect(sprites[0]).toMatchObject({ x: 500, y: 240 })
    expect(sprites[1]).toMatchObject({ x: 700, y: 480 })
  })

  it('snapshot is idempotent — duplicate userId is not spawned twice', () => {
    const { scene } = setupScene()
    const g = group(scene)

    g.applySnapshot({
      members: [{ userId: 1, nickname: 'a', textureKey: 'character', x: 0.5, y: 0.5, dir: 'down' }],
    })
    g.applySnapshot({
      members: [{ userId: 1, nickname: 'a', textureKey: 'character', x: 0.5, y: 0.5, dir: 'down' }],
    })

    expect(g.size()).toBe(1)
    expect(createPlayerMock).toHaveBeenCalledTimes(1)
  })

  it('join event spawns a sprite and move event tweens it', () => {
    const { scene, sprites, tweens } = setupScene()
    const g = group(scene)

    g.applyEvent({
      type: 'join',
      userId: 1,
      nickname: 'a',
      textureKey: 'character',
      x: 0.1,
      y: 0.2,
      dir: 'down',
    })
    g.applyEvent({ type: 'move', userId: 1, x: 0.5, y: 0.6, dir: 'right', moving: true })

    expect(tweens).toHaveLength(1)
    expect(tweens[0].config).toMatchObject({ x: 500, y: 480, duration: 200 })
    expect(sprites[0].anims.play).toHaveBeenCalledWith('walk-right')
  })

  it('move skips tween when within threshold but updates anim', () => {
    const { scene, sprites, tweens } = setupScene()
    const g = group(scene)
    g.applyEvent({
      type: 'join',
      userId: 1,
      nickname: 'a',
      textureKey: 'character',
      x: 0.5,
      y: 0.5,
      dir: 'down',
    })

    // 동일 위치 패킷 — tween 안 만들고 anim 만 변경
    g.applyEvent({
      type: 'move',
      userId: 1,
      x: 0.5,
      y: 0.5,
      dir: 'up',
      moving: true,
    } as VillageMoveEvent)

    expect(tweens).toHaveLength(0)
    expect(sprites[0].anims.play).toHaveBeenCalledWith('walk-up')
  })

  it('move stops animation when moving=false', () => {
    const { scene, sprites } = setupScene()
    const g = group(scene)
    g.applyEvent({
      type: 'join',
      userId: 1,
      nickname: 'a',
      textureKey: 'character',
      x: 0.1,
      y: 0.1,
      dir: 'down',
    })

    g.applyEvent({ type: 'move', userId: 1, x: 0.4, y: 0.4, dir: 'down', moving: false })

    expect(sprites[0].anims.stop).toHaveBeenCalled()
  })

  it('move updates the remote sprite texture when textureKey changes', () => {
    const { scene, sprites } = setupScene()
    const g = group(scene)
    g.applyEvent({
      type: 'join',
      userId: 1,
      nickname: 'a',
      textureKey: 'character',
      x: 0.1,
      y: 0.1,
      dir: 'down',
    })

    g.applyEvent({
      type: 'move',
      userId: 1,
      textureKey: 'outfit-a',
      x: 0.1,
      y: 0.1,
      dir: 'down',
      moving: false,
    })

    expect(ensurePlayerWalkAnimationsMock).toHaveBeenCalledWith(scene, 'outfit-a')
    expect(sprites[0].setTexture).toHaveBeenCalledWith('outfit-a', 0)
  })

  it('successive moves stop the previous tween', () => {
    const { scene, tweens } = setupScene()
    const g = group(scene)
    g.applyEvent({
      type: 'join',
      userId: 1,
      nickname: 'a',
      textureKey: 'character',
      x: 0.1,
      y: 0.1,
      dir: 'down',
    })
    g.applyEvent({ type: 'move', userId: 1, x: 0.3, y: 0.3, dir: 'down', moving: true })
    g.applyEvent({ type: 'move', userId: 1, x: 0.6, y: 0.6, dir: 'down', moving: true })

    expect(tweens).toHaveLength(2)
    expect(tweens[0].stop).toHaveBeenCalled()
    expect(tweens[1].stop).not.toHaveBeenCalled()
  })

  it('leave removes the member and destroys sprite', () => {
    const { scene, sprites } = setupScene()
    const g = group(scene)
    g.applyEvent({
      type: 'join',
      userId: 1,
      nickname: 'a',
      textureKey: 'character',
      x: 0.1,
      y: 0.1,
      dir: 'down',
    })
    g.applyEvent({ type: 'leave', userId: 1 })

    expect(g.size()).toBe(0)
    expect(sprites[0].destroy).toHaveBeenCalled()
  })

  it('move arriving before join lazily spawns the sprite', () => {
    const { scene, sprites } = setupScene()
    const g = group(scene)

    g.applyEvent({ type: 'move', userId: 5, x: 0.5, y: 0.5, dir: 'left', moving: true })

    expect(g.size()).toBe(1)
    expect(sprites).toHaveLength(1)
  })

  it('move ignores the local user', () => {
    const { scene, sprites } = setupScene()
    const g = group(scene, { localUserId: 1 })

    g.applyEvent({ type: 'move', userId: 1, x: 0.5, y: 0.5, dir: 'down', moving: true })

    expect(g.size()).toBe(0)
    expect(sprites).toHaveLength(0)
  })

  it('join creates a nickname text above the sprite', () => {
    const { scene, sprites, texts } = setupScene()
    const g = group(scene)
    g.applyEvent({
      type: 'join',
      userId: 1,
      nickname: '꼬마곰',
      textureKey: 'character',
      x: 0.5,
      y: 0.5,
      dir: 'down',
    })

    expect(texts).toHaveLength(1)
    expect(texts[0].content).toBe('꼬마곰')
    // sprite.displayHeight=100, gap=8 → text y = sprite.y - 50 - 8
    expect(texts[0].x).toBe(sprites[0].x)
    expect(texts[0].y).toBe(sprites[0].y - 100 / 2 - 8)
    expect(texts[0].setOrigin).toHaveBeenCalledWith(0.5, 1)
    expect(texts[0].setDepth).toHaveBeenCalled()
  })

  it('lazy-spawned member without nickname does not create a text', () => {
    const { scene, texts } = setupScene()
    const g = group(scene)

    g.applyEvent({ type: 'move', userId: 7, x: 0.5, y: 0.5, dir: 'left', moving: true })

    expect(texts).toHaveLength(0)
  })

  it('move tween syncs nickname text position via onUpdate', () => {
    const { scene, texts } = setupScene()
    const g = group(scene)
    g.applyEvent({
      type: 'join',
      userId: 1,
      nickname: '구름',
      textureKey: 'character',
      x: 0.1,
      y: 0.1,
      dir: 'down',
    })

    g.applyEvent({ type: 'move', userId: 1, x: 0.5, y: 0.7, dir: 'right', moving: true })

    // setupScene 의 tween 모의가 onUpdate 를 호출. text 가 새 sprite 위치 위로 따라옴.
    expect(texts[0].x).toBe(500)
    expect(texts[0].y).toBe(560 - 100 / 2 - 8)
  })

  it('leave destroys both sprite and nickname text', () => {
    const { scene, sprites, texts } = setupScene()
    const g = group(scene)
    g.applyEvent({
      type: 'join',
      userId: 1,
      nickname: 'a',
      textureKey: 'character',
      x: 0.1,
      y: 0.1,
      dir: 'down',
    })

    g.applyEvent({ type: 'leave', userId: 1 })

    expect(sprites[0].destroy).toHaveBeenCalled()
    expect(texts[0].destroy).toHaveBeenCalled()
  })

  it('emote event spawns a bubble on the matching remote sprite', () => {
    const { scene, sprites } = setupScene()
    const g = group(scene)
    g.applyEvent({
      type: 'join',
      userId: 7,
      nickname: '구름',
      textureKey: 'character',
      x: 0.3,
      y: 0.3,
      dir: 'down',
    })

    g.applyEvent({ type: 'emote', userId: 7, emoji: '😄' })

    expect(emitEmoteBubbleMock).toHaveBeenCalledTimes(1)
    expect(emitEmoteBubbleMock).toHaveBeenCalledWith(scene, sprites[0], '😄', expect.any(Number))
  })

  it('emote event is ignored for the local user (already rendered locally)', () => {
    const { scene } = setupScene()
    const g = group(scene, { localUserId: 1 })

    g.applyEvent({ type: 'emote', userId: 1, emoji: '😄' })

    expect(emitEmoteBubbleMock).not.toHaveBeenCalled()
  })

  it('emote event for unknown member is silently ignored', () => {
    const { scene } = setupScene()
    const g = group(scene)

    g.applyEvent({ type: 'emote', userId: 99, emoji: '😄' })

    expect(emitEmoteBubbleMock).not.toHaveBeenCalled()
  })

  it('destroy clears all members and stops tweens', () => {
    const { scene, sprites, tweens } = setupScene()
    const g = group(scene)
    g.applySnapshot({
      members: [
        { userId: 1, nickname: 'a', textureKey: 'character', x: 0.5, y: 0.5, dir: 'down' },
        { userId: 2, nickname: 'b', textureKey: 'character', x: 0.3, y: 0.3, dir: 'down' },
      ],
    })
    g.applyEvent({ type: 'move', userId: 1, x: 0.7, y: 0.7, dir: 'down', moving: true })

    g.destroy()

    expect(g.size()).toBe(0)
    expect(sprites[0].destroy).toHaveBeenCalled()
    expect(sprites[1].destroy).toHaveBeenCalled()
    expect(tweens[0].stop).toHaveBeenCalled()
  })
})
