import Phaser from 'phaser'

type FadeToSceneOptions = {
  duration?: number
  data?: object
  color?: [number, number, number]
}

export function fadeToScene(
  scene: Phaser.Scene,
  sceneKey: string,
  { duration = 250, data, color = [0, 0, 0] }: FadeToSceneOptions = {},
) {
  scene.cameras.main.fadeOut(duration, ...color)
  scene.time.delayedCall(duration, () => {
    scene.scene.start(sceneKey, data)
  })
}
