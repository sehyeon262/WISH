import Phaser from 'phaser'

import type { PlayerSprite } from '@/game/entities/player'

import { syncCurrentBeltEmojiToPalette } from './currentBeltEmote'
import { emitEmoteBubble } from './emoteBubble'
import { createVillageEmojiPalette } from './villageEmojiPalette'
import type { VillageRealtimeIntegration } from './villageRealtimeIntegration'
import {
  isWhiteBeltBoastEmoji,
  VILLAGE_EMOJI_SLOT_COUNT,
  WHITE_BELT_PROMOTION_GUIDE_MESSAGE,
} from './types'

const HINT_FONT_FAMILY = "'Jua', 'Apple SD Gothic Neo', sans-serif"
const HINT_TEXT = '[Q] 이모티콘'
const HINT_OPEN_TEXT = '[Q] 닫기'
const PALETTE_DEPTH = 100
const HINT_MARGIN = 18
const HINT_OPEN_OFFSET_Y = 66

interface AttachEmojiPaletteOptions {
  /** 발화에 사용할 realtime 핸들. null 이면 publishEmote 시도 안 함. */
  realtime: VillageRealtimeIntegration | null
  /** 현재 local player sprite — emote bubble 을 띄울 좌표 기준. */
  getPlayer: () => PlayerSprite
  /** 다이얼로그/설정 패널 등 입력 가로채는 오버레이가 열려 있는지. true 면 팔레트/단축키/힌트 전부 비활성. */
  isOverlayOpen: () => boolean
}

export interface AttachedEmojiPalette {
  /** scene.update() 매 tick 에 호출 — 오버레이 상태에 맞춰 팔레트/힌트 visibility 동기화. */
  update(): void
  consumePointerDown(pointer: Phaser.Input.Pointer): boolean
  destroy(): void
}

/**
 * 이모티콘 팔레트 + 힌트 + 단축키 (1\~9 0, Q 토글) 한 묶음을 씬에 부착한다 (S14P31E103-794).
 *
 * <p>마을 광장 / 테마 select 씬에서 공통 사용. 각 씬마다 똑같은 wiring 을 복붙하지 않도록 헬퍼로 추출.
 */
export function attachEmojiPalette(
  scene: Phaser.Scene,
  options: AttachEmojiPaletteOptions,
): AttachedEmojiPalette {
  const { width: vw, height: vh } = scene.scale
  /** Q 키로 사용자가 의도적으로 팔레트를 켰는지. 다이얼로그/설정 패널 자동 숨김과 분리. */
  let manuallyShown = false

  const palette = createVillageEmojiPalette(scene, {
    onSelect: emoji => {
      if (options.isOverlayOpen()) return
      if (isWhiteBeltBoastEmoji(emoji)) {
        emitEmoteBubble(
          scene,
          options.getPlayer(),
          WHITE_BELT_PROMOTION_GUIDE_MESSAGE,
          PALETTE_DEPTH,
        )
        return
      }

      if (!options.realtime?.publishEmote(emoji)) return
      // 로컬 즉시 렌더로 latency 가림. 서버 echo 는 RemotePlayersGroup 가 localUserId 필터링으로 무시.
      emitEmoteBubble(scene, options.getPlayer(), emoji, PALETTE_DEPTH)
    },
  })
  const disposeBeltEmojiSync = syncCurrentBeltEmojiToPalette(palette)

  // 팔레트는 기본 숨김 → 단축키를 모른 사용자가 발견할 수 있도록 우하단 고정 힌트. 팔레트가 열리면 같은 자리이므로 숨겨서 겹침 회피.
  const hint = scene.add
    .text(vw - HINT_MARGIN, vh - HINT_MARGIN, HINT_TEXT, {
      fontSize: '14px',
      fontFamily: HINT_FONT_FAMILY,
      color: '#ffffff',
      backgroundColor: '#00000080',
      padding: { left: 8, right: 8, top: 4, bottom: 4 },
      resolution: 2,
    })
    .setOrigin(1, 1)
    .setScrollFactor(0)
    .setDepth(PALETTE_DEPTH)
    .setInteractive({ useHandCursor: true })

  // 1\~9 + 0 단축키. 팔레트가 숨겨져 있어도 발사 가능 (학습용 토글 vs 즉시 발사 분리).
  const emojiKeyNames = [
    'ONE',
    'TWO',
    'THREE',
    'FOUR',
    'FIVE',
    'SIX',
    'SEVEN',
    'EIGHT',
    'NINE',
    'ZERO',
  ] as const
  const keyHandlers: { name: string; handler: () => void }[] = []
  emojiKeyNames.forEach((name, index) => {
    if (index >= VILLAGE_EMOJI_SLOT_COUNT) return
    const eventName = `keydown-${name}`
    const handler = () => {
      if (options.isOverlayOpen()) return
      palette.triggerByIndex(index)
    }
    scene.input.keyboard?.on(eventName, handler)
    keyHandlers.push({ name: eventName, handler })
  })

  // Q 키 — 팔레트 토글. 오버레이 열려있으면 무시.
  const togglePalette = () => {
    if (options.isOverlayOpen()) return
    manuallyShown = !manuallyShown
  }
  const toggleHandler = () => {
    togglePalette()
  }
  scene.input.keyboard?.on('keydown-Q', toggleHandler)
  hint.on('pointerdown', (event: Phaser.Types.Input.EventData) => {
    ;(event as unknown as { stopPropagation?: () => void }).stopPropagation?.()
    togglePalette()
  })

  return {
    update() {
      const overlaysOpen = options.isOverlayOpen()
      const paletteVisible = manuallyShown && !overlaysOpen
      palette.setVisible(paletteVisible)
      hint.setText(paletteVisible ? HINT_OPEN_TEXT : HINT_TEXT)
      hint.setY(paletteVisible ? vh - HINT_MARGIN - HINT_OPEN_OFFSET_Y : vh - HINT_MARGIN)
      hint.setVisible(!overlaysOpen)
    },
    consumePointerDown(pointer: Phaser.Input.Pointer) {
      return palette.consumePointerDown(pointer)
    },
    destroy() {
      disposeBeltEmojiSync()
      keyHandlers.forEach(({ name, handler }) => scene.input.keyboard?.off(name, handler))
      scene.input.keyboard?.off('keydown-Q', toggleHandler)
      palette.destroy()
      hint.destroy()
    },
  }
}
