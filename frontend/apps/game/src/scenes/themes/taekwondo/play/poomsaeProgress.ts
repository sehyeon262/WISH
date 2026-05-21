import Phaser from 'phaser'
import { createTaekwondoRoundedPanel } from './taekwondoPracticePanel'

type PoomsaeProgressOptions = {
  x: number
  y: number
  width: number
  height: number
  inactiveIconKey: string
  activeIconKey: string
  defaultTotalStepCount: number
}

export type PoomsaeProgressView = {
  update: (totalStepCount: number, activeStepCount: number) => void
  destroy: () => void
}

export function createPoomsaeProgressView(
  scene: Phaser.Scene,
  options: PoomsaeProgressOptions,
): PoomsaeProgressView {
  const container = scene.add.container(options.x, options.y).setDepth(4)

  const update = (totalStepCount: number, activeStepCount: number) => {
    const stepCount = totalStepCount > 0 ? totalStepCount : options.defaultTotalStepCount
    container.removeAll(true)
    container.add(
      createTaekwondoRoundedPanel(scene, 0, 0, options.width, options.height, {
        depth: 0,
        radiusRatio: 0.48,
      }),
    )

    const horizontalPadding = options.width * 0.055
    const availableWidth = options.width - horizontalPadding * 2
    const iconSize = Phaser.Math.Clamp(
      Math.min(options.height * 0.76, (availableWidth / Math.max(stepCount, 1)) * 0.88),
      32,
      58,
    )
    const gap =
      stepCount > 1 ? Math.max(4, (availableWidth - iconSize * stepCount) / (stepCount - 1)) : 0
    const totalWidth = iconSize * stepCount + gap * Math.max(0, stepCount - 1)
    const startX = -totalWidth / 2 + iconSize / 2

    for (let index = 0; index < stepCount; index += 1) {
      const texture = index < activeStepCount ? options.activeIconKey : options.inactiveIconKey
      container.add(
        scene.add
          .image(startX + index * (iconSize + gap), 0, texture)
          .setDisplaySize(iconSize, iconSize),
      )
    }
  }

  update(options.defaultTotalStepCount, 0)

  return {
    update,
    destroy: () => container.destroy(true),
  }
}
