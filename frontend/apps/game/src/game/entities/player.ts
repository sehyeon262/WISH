import Phaser from 'phaser'

import { assetPath } from '@/game/assets/assetPath'
import type { TaekwondoBeltColor } from '@wish/api-client'

export const PLAYER_FRAME_SIZE = 313
export const PLAYER_WALK_SPEED = 180
export const PLAYER_TEXTURE_KEY = 'character'

const PLAYER_CHARACTER_STORAGE_KEY = 'wish_player_character'
const PLAYER_OUTFIT_STORAGE_KEY = 'wish_player_outfit'

export type PlayerDirection = 'down' | 'left' | 'right' | 'up'
export type RatioPoint = { xRatio: number; yRatio: number }
export type PlayerSprite = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
export type PlayerCharacterId = 'boy' | 'girl'
export type PlayerOutfitId =
  | 'default'
  | 'man1'
  | 'man2'
  | 'man3'
  | 'man4'
  | 'man5'
  | 'man6'
  | 'man7'
  | 'man8'
  | 'man9'
  | 'girl1'
  | 'girl2'
  | 'girl3'
  | 'girl4'
  | 'girl5'
  | 'girl6'
  | 'girl7'
  | 'girl8'
  | 'girl9'

export type PlayerOutfit = {
  id: PlayerOutfitId
  characterId: PlayerCharacterId
  label: string
  textureKey: string
  sheetPath: string
}

export type PlayerCharacter = {
  id: PlayerCharacterId
  label: string
  outfits: PlayerOutfit[]
}

type CreatePlayerOptions = {
  textureKey?: string
  frame?: string | number
  scale?: number
  depth?: number
}

type UpdatePlayerMovementOptions = {
  player: PlayerSprite
  cursors: Phaser.Types.Input.Keyboard.CursorKeys
  alternativeKeys?: Partial<Record<PlayerDirection, Phaser.Input.Keyboard.Key>>
  target: Phaser.Math.Vector2 | null
  lastDirection: PlayerDirection
  speed?: number
  blocked?: boolean
}

type PlayerMovementResult = {
  target: Phaser.Math.Vector2 | null
  lastDirection: PlayerDirection
  moving: boolean
}

const CHARACTER_SHEET_PATH = assetPath('images/common/player/character_sheet.png')

const BOY_OUTFITS: PlayerOutfit[] = [
  {
    id: 'default',
    characterId: 'boy',
    label: '\uAE30\uBCF8',
    textureKey: PLAYER_TEXTURE_KEY,
    sheetPath: CHARACTER_SHEET_PATH,
  },
  ...Array.from({ length: 9 }, (_, index): PlayerOutfit => {
    const number = index + 1
    return {
      id: `man${number}` as PlayerOutfitId,
      characterId: 'boy',
      label: `\uBCF5\uC7A5 ${number}`,
      textureKey: `character-outfit-man${number}`,
      sheetPath: assetPath(`images/common/player/outfit/man${number}.png`),
    }
  }),
]

const GIRL_OUTFITS: PlayerOutfit[] = Array.from({ length: 9 }, (_, index): PlayerOutfit => {
  const number = index + 1
  return {
    id: `girl${number}` as PlayerOutfitId,
    characterId: 'girl',
    label: `\uBCF5\uC7A5 ${number}`,
    textureKey: `character-outfit-girl${number}`,
    sheetPath: assetPath(`images/common/player/outfit/girl${number}.png`),
  }
})

export const PLAYER_CHARACTERS: PlayerCharacter[] = [
  {
    id: 'boy',
    label: '\uB0A8\uC790',
    outfits: BOY_OUTFITS,
  },
  {
    id: 'girl',
    label: '\uC5EC\uC790',
    outfits: GIRL_OUTFITS,
  },
]

export const PLAYER_OUTFITS: PlayerOutfit[] = PLAYER_CHARACTERS.flatMap(
  character => character.outfits,
)

const TAEKWONDO_BELT_FILE_SUFFIXES: Record<TaekwondoBeltColor, string> = {
  WHITE: 'white',
  YELLOW: 'yellow',
  ORANGE: 'orange',
  GREEN: 'green',
  BLUE: 'blue',
  PURPLE: 'purple',
  BROWN: 'brown',
  RED: 'red',
  BLACK: 'black',
}

const TAEKWONDO_BELT_PLAYER_SHEET_PATHS: Record<
  PlayerCharacterId,
  Record<TaekwondoBeltColor, string>
> = Object.fromEntries(
  PLAYER_CHARACTERS.map(character => [
    character.id,
    Object.fromEntries(
      Object.entries(TAEKWONDO_BELT_FILE_SUFFIXES).map(([beltColor, suffix]) => [
        beltColor,
        assetPath(`images/common/player/taekwondo/${character.id}/${character.id}_${suffix}.png`),
      ]),
    ),
  ]),
) as Record<PlayerCharacterId, Record<TaekwondoBeltColor, string>>

export const TAEKWONDO_BELT_PLAYER_TEXTURE_KEYS: Record<
  PlayerCharacterId,
  Record<TaekwondoBeltColor, string>
> = Object.fromEntries(
  PLAYER_CHARACTERS.map(character => [
    character.id,
    Object.fromEntries(
      Object.entries(TAEKWONDO_BELT_FILE_SUFFIXES).map(([beltColor, suffix]) => [
        beltColor,
        `character-taekwondo-${character.id}-${suffix}`,
      ]),
    ),
  ]),
) as Record<PlayerCharacterId, Record<TaekwondoBeltColor, string>>

const PLAYER_WALK_ANIMATIONS: Array<{
  key: `walk-${PlayerDirection}`
  start: number
  end: number
}> = [
  { key: 'walk-down', start: 0, end: 3 },
  { key: 'walk-left', start: 4, end: 7 },
  { key: 'walk-right', start: 8, end: 11 },
  { key: 'walk-up', start: 12, end: 15 },
]

export function getPlayerWalkAnimationKey(
  direction: PlayerDirection,
  textureKey = PLAYER_TEXTURE_KEY,
) {
  return textureKey === PLAYER_TEXTURE_KEY ? `walk-${direction}` : `walk-${direction}-${textureKey}`
}

export function getTaekwondoBeltPlayerTextureKey(
  beltColor: TaekwondoBeltColor,
  characterId = getSelectedPlayerCharacterId(),
) {
  return TAEKWONDO_BELT_PLAYER_TEXTURE_KEYS[characterId][beltColor]
}

export function getPlayerOutfit(outfitId: PlayerOutfitId) {
  return PLAYER_OUTFITS.find(outfit => outfit.id === outfitId) ?? PLAYER_OUTFITS[0]
}

export function getPlayerCharacter(characterId: PlayerCharacterId) {
  return PLAYER_CHARACTERS.find(character => character.id === characterId) ?? PLAYER_CHARACTERS[0]
}

export function getPlayerOutfits(characterId: PlayerCharacterId) {
  return getPlayerCharacter(characterId).outfits
}

export function getSelectedPlayerCharacterId(): PlayerCharacterId {
  if (typeof window === 'undefined') {
    return 'boy'
  }

  try {
    return normalizePlayerCharacterId(window.localStorage.getItem(PLAYER_CHARACTER_STORAGE_KEY))
  } catch {
    return 'boy'
  }
}

export function setSelectedPlayerCharacterId(characterId: PlayerCharacterId) {
  const next = normalizePlayerCharacterId(characterId)

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(PLAYER_CHARACTER_STORAGE_KEY, next)
    } catch {
      // localStorage can be unavailable in private mode; the in-memory sprite still updates.
    }
  }

  return next
}

export function getSelectedPlayerOutfitId(
  characterId = getSelectedPlayerCharacterId(),
): PlayerOutfitId {
  if (typeof window === 'undefined') {
    return getPlayerOutfits(characterId)[0].id
  }

  try {
    return normalizePlayerOutfitId(
      window.localStorage.getItem(getPlayerOutfitStorageKey(characterId)),
      characterId,
    )
  } catch {
    return getPlayerOutfits(characterId)[0].id
  }
}

export function setSelectedPlayerOutfitId(
  outfitId: PlayerOutfitId,
  characterId = getPlayerOutfit(outfitId).characterId,
) {
  const next = normalizePlayerOutfitId(outfitId, characterId)

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(getPlayerOutfitStorageKey(characterId), next)
    } catch {
      // localStorage can be unavailable in private mode; the in-memory sprite still updates.
    }
  }

  return next
}

export function getSelectedPlayerTextureKey() {
  const characterId = getSelectedPlayerCharacterId()
  return getPlayerOutfit(getSelectedPlayerOutfitId(characterId)).textureKey
}

export function getPlayerOutfitTextureKey(outfitId: PlayerOutfitId) {
  return getPlayerOutfit(outfitId).textureKey
}

export function loadPlayerSpritesheet(
  scene: Phaser.Scene,
  textureKey = PLAYER_TEXTURE_KEY,
  sheetPath = CHARACTER_SHEET_PATH,
) {
  if (scene.textures.exists(textureKey)) {
    return
  }

  scene.load.spritesheet(textureKey, sheetPath, {
    frameWidth: PLAYER_FRAME_SIZE,
    frameHeight: PLAYER_FRAME_SIZE,
    margin: 0,
    spacing: 0,
  })
}

export function loadPlayerSpritesheets(scene: Phaser.Scene) {
  PLAYER_OUTFITS.forEach(outfit => {
    loadPlayerSpritesheet(scene, outfit.textureKey, outfit.sheetPath)
  })
}

export function loadTaekwondoBeltPlayerSpritesheets(scene: Phaser.Scene) {
  Object.entries(TAEKWONDO_BELT_PLAYER_SHEET_PATHS).forEach(([characterId, sheetPaths]) => {
    Object.entries(sheetPaths).forEach(([beltColor, sheetPath]) => {
      loadPlayerSpritesheet(
        scene,
        getTaekwondoBeltPlayerTextureKey(
          beltColor as TaekwondoBeltColor,
          characterId as PlayerCharacterId,
        ),
        sheetPath,
      )
    })
  })
}

export function ensurePlayerWalkAnimations(scene: Phaser.Scene, textureKey = PLAYER_TEXTURE_KEY) {
  PLAYER_WALK_ANIMATIONS.forEach(({ key, start, end }) => {
    const direction = key.replace('walk-', '') as PlayerDirection
    const animationKey = getPlayerWalkAnimationKey(direction, textureKey)

    if (scene.anims.exists(animationKey)) {
      return
    }

    scene.anims.create({
      key: animationKey,
      frames: scene.anims.generateFrameNumbers(textureKey, { start, end }),
      frameRate: 8,
      repeat: -1,
    })
  })
}

export function createPlayer(
  scene: Phaser.Scene,
  x: number,
  y: number,
  {
    textureKey = getSelectedPlayerTextureKey(),
    frame = 0,
    scale = 0.5,
    depth = 10,
  }: CreatePlayerOptions = {},
) {
  ensurePlayerWalkAnimations(scene, textureKey)
  const player = scene.physics.add.sprite(x, y, textureKey, frame)
  player.setScale(scale).setDepth(depth)
  player.setCollideWorldBounds(true)
  player.body.setSize(PLAYER_FRAME_SIZE * 0.35, PLAYER_FRAME_SIZE * 0.25)
  player.body.setOffset(PLAYER_FRAME_SIZE * 0.33, PLAYER_FRAME_SIZE * 0.65)

  return player
}

function getPlayerOutfitStorageKey(characterId: PlayerCharacterId) {
  return characterId === 'boy'
    ? PLAYER_OUTFIT_STORAGE_KEY
    : `${PLAYER_OUTFIT_STORAGE_KEY}_${characterId}`
}

function normalizePlayerCharacterId(value: unknown): PlayerCharacterId {
  return PLAYER_CHARACTERS.some(character => character.id === value)
    ? (value as PlayerCharacterId)
    : 'boy'
}

function normalizePlayerOutfitId(value: unknown, characterId: PlayerCharacterId): PlayerOutfitId {
  const outfits = getPlayerOutfits(characterId)
  return outfits.some(outfit => outfit.id === value) ? (value as PlayerOutfitId) : outfits[0].id
}

export function updatePlayerMovement({
  player,
  cursors,
  alternativeKeys,
  target,
  lastDirection,
  speed = PLAYER_WALK_SPEED,
  blocked = false,
}: UpdatePlayerMovementOptions): PlayerMovementResult {
  let nextTarget = target
  let nextDirection = lastDirection
  let vx = 0
  let vy = 0

  if (blocked) {
    nextTarget = null
  } else {
    const { left, right, up, down } = cursors
    const leftPressed = left.isDown || Boolean(alternativeKeys?.left?.isDown)
    const rightPressed = right.isDown || Boolean(alternativeKeys?.right?.isDown)
    const upPressed = up.isDown || Boolean(alternativeKeys?.up?.isDown)
    const downPressed = down.isDown || Boolean(alternativeKeys?.down?.isDown)
    const isKeyPressed = leftPressed || rightPressed || upPressed || downPressed

    if (isKeyPressed) {
      nextTarget = null
      if (leftPressed) {
        vx -= speed
        nextDirection = 'left'
      }
      if (rightPressed) {
        vx += speed
        nextDirection = 'right'
      }
      if (upPressed) {
        vy -= speed
        nextDirection = 'up'
      }
      if (downPressed) {
        vy += speed
        nextDirection = 'down'
      }
      if (vx !== 0 && vy !== 0) {
        vx *= 0.707
        vy *= 0.707
      }
    } else if (nextTarget) {
      const dx = nextTarget.x - player.x
      const dy = nextTarget.y - player.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < 6) {
        nextTarget = null
      } else {
        const targetSpeed = Math.min(speed, dist * 5)
        vx = (dx / dist) * targetSpeed
        vy = (dy / dist) * targetSpeed
        nextDirection =
          Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
      }
    }
  }

  player.setVelocity(vx, vy)

  const moving = vx !== 0 || vy !== 0
  if (moving) {
    const anim = getPlayerWalkAnimationKey(nextDirection, player.texture.key)
    if (player.anims.currentAnim?.key !== anim || !player.anims.isPlaying) {
      player.anims.play(anim)
    }
  } else {
    player.anims.stop()
  }

  return { target: nextTarget, lastDirection: nextDirection, moving }
}

export function createClickTargetMarker(scene: Phaser.Scene, x: number, y: number) {
  const marker = scene.add.circle(x, y, 6, 0xffffff, 0.6)
  scene.tweens.add({
    targets: marker,
    alpha: 0,
    scale: 2,
    duration: 400,
    onComplete: () => marker.destroy(),
  })
}
