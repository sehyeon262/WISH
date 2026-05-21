import Phaser from 'phaser'
import { assetPath } from '@/game/assets/assetPath'

type FloatingInteractionIconOptions = {
  x: number
  y: number
  textureKey?: string
  displaySize?: number
  depth?: number
  bobOffset?: number
  bobDuration?: number
}

export function loadInteractionIcons(scene: Phaser.Scene) {
  scene.load.image('talk-icon', assetPath('images/ui/icons/talk.png'))
  scene.load.image('talking-icon', assetPath('images/ui/icons/talking.png'))
}

export function createFloatingInteractionIcon(
  scene: Phaser.Scene,
  {
    x,
    y,
    textureKey = 'talk-icon',
    displaySize = 56,
    depth = 12,
    bobOffset = 10,
    bobDuration = 700,
  }: FloatingInteractionIconOptions,
) {
  const icon = scene.add
    .image(x, y, textureKey)
    .setDepth(depth)
    .setDisplaySize(displaySize, displaySize)

  scene.tweens.add({
    targets: icon,
    y: icon.y - bobOffset,
    duration: bobDuration,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  })

  return icon
}

export function setInteractionIconActive(icon: Phaser.GameObjects.Image, isActive: boolean) {
  const textureKey = isActive ? 'talking-icon' : 'talk-icon'

  if (icon.texture.key !== textureKey) {
    icon.setTexture(textureKey)
  }
}
