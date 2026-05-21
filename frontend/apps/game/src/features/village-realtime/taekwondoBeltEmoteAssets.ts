import Phaser from 'phaser'
import type { TaekwondoBeltColor } from '@wish/api-client'

import { assetPath } from '@/game/assets/assetPath'

const BELT_IMAGE_COLORS = [
  'YELLOW',
  'ORANGE',
  'GREEN',
  'BLUE',
  'PURPLE',
  'BROWN',
  'RED',
  'BLACK',
] as const satisfies readonly TaekwondoBeltColor[]

type BeltImageColor = (typeof BELT_IMAGE_COLORS)[number]

export const TAEKWONDO_BELT_EMOTE_TEXTURE_KEYS: Record<BeltImageColor, string> = {
  YELLOW: 'village-emote-belt-yellow',
  ORANGE: 'village-emote-belt-orange',
  GREEN: 'village-emote-belt-green',
  BLUE: 'village-emote-belt-blue',
  PURPLE: 'village-emote-belt-purple',
  BROWN: 'village-emote-belt-brown',
  RED: 'village-emote-belt-red',
  BLACK: 'village-emote-belt-black',
}

export function loadTaekwondoBeltEmoteImages(scene: Phaser.Scene) {
  BELT_IMAGE_COLORS.forEach(beltColor => {
    const textureKey = TAEKWONDO_BELT_EMOTE_TEXTURE_KEYS[beltColor]
    if (scene.textures.exists(textureKey)) return

    scene.load.image(
      textureKey,
      assetPath(`images/themes/taekwondo/ui/belt_${beltColor.toLowerCase()}.png`),
    )
  })
}

export function getTaekwondoBeltEmoteTextureKey(beltColor: TaekwondoBeltColor) {
  return beltColor === 'WHITE'
    ? TAEKWONDO_BELT_EMOTE_TEXTURE_KEYS.YELLOW
    : TAEKWONDO_BELT_EMOTE_TEXTURE_KEYS[beltColor]
}

export function getTaekwondoBeltEmoteTintFill(beltColor: TaekwondoBeltColor) {
  return beltColor === 'WHITE' ? 0xffffff : undefined
}

export function setTaekwondoBeltImageDisplay(
  image: Phaser.GameObjects.Image,
  beltColor: TaekwondoBeltColor,
  maxWidth: number,
  maxHeight: number,
) {
  image.setTexture(getTaekwondoBeltEmoteTextureKey(beltColor))
  const sourceWidth = image.width || maxWidth
  const sourceHeight = image.height || maxHeight
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight)
  image.setDisplaySize(sourceWidth * scale, sourceHeight * scale)

  const tintFill = getTaekwondoBeltEmoteTintFill(beltColor)
  if (tintFill === undefined) {
    image.clearTint()
    return
  }

  image.setTintFill(tintFill)
}
