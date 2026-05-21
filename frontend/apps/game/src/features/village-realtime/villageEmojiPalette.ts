import Phaser from 'phaser'
import type { TaekwondoBeltColor } from '@wish/api-client'

import {
  getTaekwondoBeltEmoteTextureKey,
  setTaekwondoBeltImageDisplay,
} from './taekwondoBeltEmoteAssets'
import {
  getTaekwondoBeltColorFromBoastEmoji,
  isTaekwondoBeltBoastEmoji,
  VILLAGE_EMOJIS,
  type VillageEmoji,
} from './types'

/** 우하단 화면 가장자리에서 안쪽으로 띄울 여백 (px). */
const PALETTE_MARGIN = 18
/** 10개 슬롯 가로 배치에 맞춰 56 → 50 으로 축소 (S14P31E103-769). */
const BUTTON_SIZE = 50
const BUTTON_GAP = 8
/** 이모지/단일 글자용 큰 폰트. */
const FONT_SIZE_EMOJI = 28
/** 한글 단축 메시지용 작은 폰트. */
const FONT_SIZE_TEXT = 16
const HANGUL_PATTERN = /[㄰-㆏가-힣]/
const BELT_IMAGE_MAX_WIDTH = 40
const BELT_IMAGE_MAX_HEIGHT = 29
const BUTTON_PULSE_SCALE = 1.35

const BELT_STROKE_COLORS: Record<TaekwondoBeltColor, number> = {
  WHITE: 0xf8fafc,
  YELLOW: 0xfacc15,
  ORANGE: 0xfb923c,
  GREEN: 0x22c55e,
  BLUE: 0x3b82f6,
  PURPLE: 0xa855f7,
  BROWN: 0x92400e,
  RED: 0xef4444,
  BLACK: 0xf5c451,
}

export interface VillageEmojiPaletteHandle {
  /** 키보드 1\~9, 0 단축키 또는 외부 트리거에서 호출 — 시각 피드백 + onSelect 발화. index 범위 밖이면 no-op. */
  triggerByIndex(index: number): void
  consumePointerDown(pointer: Phaser.Input.Pointer): boolean
  /** 비동기 사용자 정보 조회 후 0번 띠 자랑 슬롯처럼 팔레트 내용을 갱신한다. */
  setEmojis(emojis: readonly VillageEmoji[]): void
  setVisible(visible: boolean): void
  isVisible(): boolean
  destroy(): void
}

interface CreateOptions {
  onSelect: (emoji: VillageEmoji) => void
  emojis?: readonly VillageEmoji[]
  /** 초기 visibility. 미지정 시 false (Q 토글로 열어야 보임). */
  initiallyVisible?: boolean
}

/**
 * 우하단에 가로 배열된 빠른 표현 팔레트 (이모지 + 짧은 한글). setScrollFactor 0 으로 카메라 이동에 따라가지 않고 항상 같은 위치 고정.
 *
 * <p>S14P31E103-769: 10 슬롯 + 한글 가독성 위해 폰트 크기 적응형. 기본은 숨김 — VillageScene 의 Q 키로 토글한다. 키보드
 * 단축키는 팔레트 상태와 무관하게 발동 (학습 목적의 시각 매핑 + 즉시 발사 분리).
 */
export function createVillageEmojiPalette(
  scene: Phaser.Scene,
  options: CreateOptions,
): VillageEmojiPaletteHandle {
  const { width: vw, height: vh } = scene.scale
  let emojis = options.emojis ?? VILLAGE_EMOJIS
  const totalWidth = emojis.length * BUTTON_SIZE + (emojis.length - 1) * BUTTON_GAP
  const startX = vw - PALETTE_MARGIN - totalWidth
  const y = vh - PALETTE_MARGIN - BUTTON_SIZE
  const depth = 100

  const container = scene.add
    .container(startX, y)
    .setScrollFactor(0)
    .setDepth(depth)
    .setVisible(options.initiallyVisible ?? false)

  const buttons: {
    bg: Phaser.GameObjects.Rectangle
    text: Phaser.GameObjects.Text
    beltImage: Phaser.GameObjects.Image
    sparkles: Phaser.GameObjects.Graphics
    pulseBaseScaleX: number
    pulseBaseScaleY: number
  }[] = []
  let lastConsumedPointerKey: string | null = null

  emojis.forEach((emoji, index) => {
    const buttonX = index * (BUTTON_SIZE + BUTTON_GAP) + BUTTON_SIZE / 2
    const buttonY = BUTTON_SIZE / 2
    const fontSize = getButtonFontSize(emoji)

    const bg = scene.add
      .rectangle(buttonX, buttonY, BUTTON_SIZE, BUTTON_SIZE, 0x000000, 0.32)
      .setStrokeStyle(2, getButtonStrokeColor(emoji), 0.7)

    const text = scene.add
      .text(buttonX, buttonY, emoji, {
        fontSize: `${fontSize}px`,
        fontFamily: "'Jua', 'Apple SD Gothic Neo', sans-serif",
        align: 'center',
        fixedWidth: BUTTON_SIZE - 8,
        resolution: 2,
      })
      .setOrigin(0.5, 0.5)

    const beltImage = scene.add
      .image(buttonX, buttonY + 2, getTaekwondoBeltEmoteTextureKey('YELLOW'))
      .setOrigin(0.5, 0.5)
    const sparkles = scene.add.graphics()
    applyButtonEmoji(bg, text, beltImage, sparkles, emoji)
    const pulseBaseScale = getCurrentPulseScale({ text, beltImage }, emoji)

    // 1\~9, 0 매핑 키 라벨 — 사용자가 단축키 학습할 수 있게 작은 글씨로 좌상단.
    const keyLabel = (index + 1) % 10
    const keyText = scene.add
      .text(buttonX - BUTTON_SIZE / 2 + 4, buttonY - BUTTON_SIZE / 2 + 2, String(keyLabel), {
        fontSize: '10px',
        fontFamily: "'Jua', 'Apple SD Gothic Neo', sans-serif",
        color: '#ffffffaa',
        resolution: 2,
      })
      .setOrigin(0, 0)

    const hitZone = scene.add
      .zone(buttonX, buttonY, BUTTON_SIZE, BUTTON_SIZE)
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true })
    hitZone.on(
      'pointerdown',
      (
        pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event?: Phaser.Types.Input.EventData,
      ) => {
        event?.stopPropagation()
        consumePointerDown(pointer, index)
      },
    )

    container.add([bg, text, beltImage, sparkles, keyText, hitZone])
    buttons.push({
      bg,
      text,
      beltImage,
      sparkles,
      pulseBaseScaleX: pulseBaseScale.x,
      pulseBaseScaleY: pulseBaseScale.y,
    })
  })

  function triggerByIndex(index: number) {
    if (index < 0 || index >= emojis.length) return
    const emoji = emojis[index]
    // 살짝 통통 피드백.
    const button = buttons[index]
    const target = getTweenTarget(button, emoji)
    scene.tweens.killTweensOf(target)
    target.setScale(button.pulseBaseScaleX, button.pulseBaseScaleY)
    scene.tweens.add({
      targets: target,
      scaleX: button.pulseBaseScaleX * BUTTON_PULSE_SCALE,
      scaleY: button.pulseBaseScaleY * BUTTON_PULSE_SCALE,
      duration: 90,
      yoyo: true,
      ease: 'Quad.Out',
      onComplete: () => {
        target.setScale(button.pulseBaseScaleX, button.pulseBaseScaleY)
      },
    })
    options.onSelect(emoji)
  }

  function consumePointerDown(pointer: Phaser.Input.Pointer, knownIndex?: number) {
    if (!container.visible) return false

    const index = knownIndex ?? getPointerEmojiIndex(pointer)
    if (index === null) return false

    const pointerKey = getPointerEventKey(pointer, index)
    if (lastConsumedPointerKey === pointerKey) {
      return true
    }

    lastConsumedPointerKey = pointerKey
    triggerByIndex(index)
    return true
  }

  function getPointerEmojiIndex(pointer: Phaser.Input.Pointer) {
    const localX = pointer.x - container.x
    const localY = pointer.y - container.y
    const currentTotalWidth =
      emojis.length * BUTTON_SIZE + Math.max(0, emojis.length - 1) * BUTTON_GAP

    if (localX < 0 || localX > currentTotalWidth || localY < 0 || localY > BUTTON_SIZE) {
      return null
    }

    const stride = BUTTON_SIZE + BUTTON_GAP
    const index = Math.floor(localX / stride)
    const slotX = localX - index * stride

    if (index < 0 || index >= emojis.length || slotX > BUTTON_SIZE) {
      return null
    }

    return index
  }

  return {
    triggerByIndex,
    consumePointerDown,
    setEmojis(nextEmojis: readonly VillageEmoji[]) {
      emojis = nextEmojis
      buttons.forEach((button, index) => {
        const { bg, text, beltImage, sparkles } = button
        const emoji = emojis[index]
        if (!emoji) return
        scene.tweens.killTweensOf([text, beltImage])
        applyButtonEmoji(bg, text, beltImage, sparkles, emoji)
        const pulseBaseScale = getCurrentPulseScale(button, emoji)
        button.pulseBaseScaleX = pulseBaseScale.x
        button.pulseBaseScaleY = pulseBaseScale.y
      })
    },
    setVisible(visible: boolean) {
      container.setVisible(visible)
    },
    isVisible() {
      return container.visible
    },
    destroy() {
      container.destroy()
    },
  }
}

function applyButtonEmoji(
  bg: Phaser.GameObjects.Rectangle,
  text: Phaser.GameObjects.Text,
  beltImage: Phaser.GameObjects.Image,
  sparkles: Phaser.GameObjects.Graphics,
  emoji: VillageEmoji,
) {
  const isBelt = isTaekwondoBeltBoastEmoji(emoji)
  bg.setStrokeStyle(isBelt ? 1 : 2, getButtonStrokeColor(emoji), isBelt ? 0.32 : 0.7)

  if (!isBelt) {
    beltImage.setVisible(false)
    sparkles.clear()
    sparkles.setVisible(false)
    text.setText(emoji)
    text.setFontSize(getButtonFontSize(emoji))
    text.setScale(1)
    text.setVisible(true)
    return
  }

  const beltColor = getTaekwondoBeltColorFromBoastEmoji(emoji)
  if (!beltColor) return

  text.setVisible(false)
  beltImage.setScale(1)
  setTaekwondoBeltImageDisplay(beltImage, beltColor, BELT_IMAGE_MAX_WIDTH, BELT_IMAGE_MAX_HEIGHT)
  beltImage.setVisible(true)
  drawPaletteSparkles(sparkles, beltColor, beltImage.x, beltImage.y)
  sparkles.setVisible(true)
}

function getButtonFontSize(emoji: VillageEmoji) {
  return HANGUL_PATTERN.test(emoji) ? FONT_SIZE_TEXT : FONT_SIZE_EMOJI
}

function getButtonStrokeColor(emoji: VillageEmoji) {
  const beltColor = getTaekwondoBeltColorFromBoastEmoji(emoji)
  return beltColor ? BELT_STROKE_COLORS[beltColor] : 0xffffff
}

function getTweenTarget(
  button: { text: Phaser.GameObjects.Text; beltImage: Phaser.GameObjects.Image },
  emoji: VillageEmoji,
) {
  return isTaekwondoBeltBoastEmoji(emoji) ? button.beltImage : button.text
}

function getCurrentPulseScale(
  button: { text: Phaser.GameObjects.Text; beltImage: Phaser.GameObjects.Image },
  emoji: VillageEmoji,
) {
  const target = getTweenTarget(button, emoji)
  return { x: target.scaleX, y: target.scaleY }
}

function getPointerEventKey(pointer: Phaser.Input.Pointer, index: number) {
  return `${pointer.id}:${pointer.downTime}:${index}`
}

function drawPaletteSparkles(
  sparkles: Phaser.GameObjects.Graphics,
  beltColor: TaekwondoBeltColor,
  centerX: number,
  centerY: number,
) {
  sparkles.clear()
  const color = getButtonStrokeColor(`taekwondo-belt:${beltColor}`)
  sparkles.lineStyle(1.4, color, 0.95)
  drawSparkle(sparkles, centerX - 18, centerY - 11, 4)
  sparkles.lineStyle(1.1, 0xffffff, 0.85)
  drawSparkle(sparkles, centerX + 18, centerY - 9, 3)
  sparkles.lineStyle(1, color, 0.75)
  drawSparkle(sparkles, centerX + 13, centerY + 12, 2.4)
}

function drawSparkle(graphics: Phaser.GameObjects.Graphics, x: number, y: number, radius: number) {
  graphics.beginPath()
  graphics.moveTo(x, y - radius)
  graphics.lineTo(x, y + radius)
  graphics.moveTo(x - radius, y)
  graphics.lineTo(x + radius, y)
  graphics.strokePath()
}
