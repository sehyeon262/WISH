import Phaser from 'phaser'

export const PHOTO_BOOTH_RETURN_SPAWN = { xRatio: 0.515, yRatio: 0.345 } as const
const PHOTO_BOOTH_RETURN_COOLDOWN_MS = 250

export function exitPhotoBoothToVillage(scene: Phaser.Scene, duration = 250) {
  scene.cameras.main.fadeOut(duration, 0, 0, 0)
  scene.time.delayedCall(duration, () => {
    if (scene.scene.isPaused('VillageScene')) {
      scene.scene.resume('VillageScene')
      scene.scene.stop()
      return
    }

    scene.scene.start('VillageScene', {
      spawn: PHOTO_BOOTH_RETURN_SPAWN,
      portalCooldownMs: PHOTO_BOOTH_RETURN_COOLDOWN_MS,
    })
  })
}
