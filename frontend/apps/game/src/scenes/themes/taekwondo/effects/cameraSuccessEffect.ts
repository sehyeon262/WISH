import Phaser from 'phaser'

export type CameraSuccessEffectBounds = {
  x: number
  y: number
  width: number
  height: number
  radius: number
}

export type CameraSuccessEffectOptions = {
  count?: number
  intensity?: number
}

type CameraEnemy = {
  container: Phaser.GameObjects.Container
  floatTween: Phaser.Tweens.Tween
}

type CameraSuccessEffectConfig = {
  bounds: CameraSuccessEffectBounds
  depth?: number
  idleEnemyCount?: number
  onSuccessFeedback?: (message: string) => void
}

const DEFAULT_IDLE_ENEMY_COUNT = 4
const SUCCESS_FEEDBACK_MESSAGE = '좋아요! 정확한 동작이에요.'

export class CameraSuccessEffect {
  private readonly layer: Phaser.GameObjects.Container
  private readonly bounds: CameraSuccessEffectBounds
  private readonly idleEnemyCount: number
  private readonly maskShape: Phaser.GameObjects.Graphics
  private readonly onSuccessFeedback?: (message: string) => void
  private activeTweens: Phaser.Tweens.Tween[] = []
  private enemies: CameraEnemy[] = []

  constructor(
    private readonly scene: Phaser.Scene,
    {
      bounds,
      depth = 5,
      idleEnemyCount = DEFAULT_IDLE_ENEMY_COUNT,
      onSuccessFeedback,
    }: CameraSuccessEffectConfig,
  ) {
    if (bounds.width <= 0 || bounds.height <= 0) {
      throw new Error('CameraSuccessEffect bounds width and height must be positive.')
    }

    this.bounds = bounds
    this.idleEnemyCount = idleEnemyCount
    this.onSuccessFeedback = onSuccessFeedback
    this.layer = scene.add.container(0, 0).setDepth(depth)

    this.maskShape = scene.add.graphics()
    this.maskShape
      .fillStyle(0xffffff, 1)
      .fillRoundedRect(
        bounds.x - bounds.width / 2,
        bounds.y - bounds.height / 2,
        bounds.width,
        bounds.height,
        bounds.radius,
      )
      .setVisible(false)
    this.layer.setMask(this.maskShape.createGeometryMask())

    this.spawnNextMotionEnemies()
  }

  triggerSuccess(options: CameraSuccessEffectOptions = {}) {
    const intensity = Phaser.Math.Clamp(options.intensity ?? 0.75, 0, 1)
    const count = Phaser.Math.Clamp(options.count ?? this.enemies.length, 1, 12)
    this.ensureEnemies(this.idleEnemyCount)

    const targets = Phaser.Utils.Array.Shuffle([...this.enemies]).slice(0, count)
    targets.forEach(enemy => this.defeatEnemy(enemy, intensity))
    this.onSuccessFeedback?.(SUCCESS_FEEDBACK_MESSAGE)
  }

  spawnNextMotionEnemies() {
    this.clearEnemies()
    this.ensureEnemies(this.idleEnemyCount)
  }

  destroy() {
    this.stopActiveTweens()
    this.clearEnemies()
    this.layer.destroy(true)
    this.maskShape.destroy()
  }

  private ensureEnemies(targetCount: number) {
    while (this.enemies.length < targetCount) {
      this.enemies.push(this.createEnemy())
    }
  }

  private createEnemy(): CameraEnemy {
    const size = Phaser.Math.Clamp(
      this.bounds.height * Phaser.Math.FloatBetween(0.07, 0.105),
      42,
      72,
    )
    const x = Phaser.Math.Between(
      Math.round(this.bounds.x - this.bounds.width * 0.38),
      Math.round(this.bounds.x + this.bounds.width * 0.38),
    )
    const y = Phaser.Math.Between(
      Math.round(this.bounds.y - this.bounds.height * 0.34),
      Math.round(this.bounds.y + this.bounds.height * 0.32),
    )
    const container = this.scene.add.container(x, y).setAlpha(0.82)
    const body = this.scene.add.graphics()
    this.drawEnemy(body, size)
    container.add(body)
    this.layer.add(container)

    const floatTween = this.trackTween(
      this.scene.tweens.add({
        targets: container,
        x: x + Phaser.Math.Between(-18, 18),
        y: y + Phaser.Math.Between(-16, 16),
        angle: Phaser.Math.Between(-10, 10),
        duration: Phaser.Math.Between(1500, 2400),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      }),
    )

    return { container, floatTween }
  }

  private drawEnemy(graphics: Phaser.GameObjects.Graphics, size: number) {
    const bodyColor = Phaser.Utils.Array.GetRandom([0x8bd36f, 0x6ec6c1, 0xb6d96f])
    const spotColor = 0x3d7f46
    graphics.clear()
    graphics.fillStyle(bodyColor, 0.92)
    graphics.fillCircle(0, 0, size * 0.48)
    graphics.lineStyle(Math.max(2, size * 0.08), 0x2f6f43, 0.9)
    graphics.strokeCircle(0, 0, size * 0.48)

    graphics.fillStyle(spotColor, 0.75)
    graphics.fillCircle(-size * 0.18, -size * 0.12, size * 0.09)
    graphics.fillCircle(size * 0.14, size * 0.05, size * 0.07)
    graphics.fillCircle(size * 0.02, -size * 0.24, size * 0.06)

    graphics.fillStyle(0xffffff, 0.95)
    graphics.fillCircle(-size * 0.12, -size * 0.05, size * 0.055)
    graphics.fillCircle(size * 0.14, -size * 0.05, size * 0.055)
    graphics.fillStyle(0x1f3524, 1)
    graphics.fillCircle(-size * 0.1, -size * 0.04, size * 0.025)
    graphics.fillCircle(size * 0.16, -size * 0.04, size * 0.025)

    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI * 2 * index) / 8
      const sx = Math.cos(angle) * size * 0.46
      const sy = Math.sin(angle) * size * 0.46
      const ex = Math.cos(angle) * size * 0.64
      const ey = Math.sin(angle) * size * 0.64
      graphics.lineStyle(Math.max(2, size * 0.05), 0x2f6f43, 0.85)
      graphics.lineBetween(sx, sy, ex, ey)
    }
  }

  private defeatEnemy(enemy: CameraEnemy, intensity: number) {
    const enemyIndex = this.enemies.indexOf(enemy)
    if (enemyIndex >= 0) {
      this.enemies.splice(enemyIndex, 1)
    }

    enemy.floatTween.stop()
    const burstCount = Math.round(Phaser.Math.Linear(6, 14, intensity))
    this.createSuccessBurst(enemy.container.x, enemy.container.y, burstCount)

    this.trackTween(
      this.scene.tweens.add({
        targets: enemy.container,
        x: enemy.container.x + Phaser.Math.Between(-80, 80) * (0.6 + intensity),
        y: enemy.container.y - Phaser.Math.Between(50, 130) * (0.6 + intensity),
        angle: Phaser.Math.Between(-180, 180),
        scale: 0.1,
        alpha: 0,
        duration: Math.round(Phaser.Math.Linear(420, 680, intensity)),
        ease: 'Back.easeIn',
        onComplete: () => enemy.container.destroy(true),
      }),
    )
  }

  private clearEnemies() {
    this.enemies.forEach(enemy => {
      enemy.floatTween.stop()
      enemy.container.destroy(true)
    })
    this.enemies = []
  }

  private createSuccessBurst(x: number, y: number, count: number) {
    for (let index = 0; index < count; index += 1) {
      const sparkle = this.scene.add.graphics()
      const size = Phaser.Math.Between(4, 9)
      sparkle.fillStyle(0xffd95a, 0.95)
      sparkle.fillCircle(0, 0, size)
      sparkle.lineStyle(1.5, 0xffffff, 0.75)
      sparkle.strokeCircle(0, 0, size)

      const container = this.scene.add.container(x, y, [sparkle]).setDepth(6)
      this.layer.add(container)
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2)
      const distance = Phaser.Math.Between(28, 86)

      this.trackTween(
        this.scene.tweens.add({
          targets: container,
          x: x + Math.cos(angle) * distance,
          y: y + Math.sin(angle) * distance,
          scale: Phaser.Math.FloatBetween(0.45, 0.9),
          alpha: 0,
          duration: Phaser.Math.Between(360, 620),
          ease: 'Sine.easeOut',
          onComplete: () => container.destroy(true),
        }),
      )
    }
  }

  private trackTween(tween: Phaser.Tweens.Tween) {
    this.activeTweens.push(tween)
    tween.once(Phaser.Tweens.Events.TWEEN_COMPLETE, () => {
      this.activeTweens = this.activeTweens.filter(activeTween => activeTween !== tween)
    })
    tween.once(Phaser.Tweens.Events.TWEEN_STOP, () => {
      this.activeTweens = this.activeTweens.filter(activeTween => activeTween !== tween)
    })
    return tween
  }

  private stopActiveTweens() {
    const tweens = [...this.activeTweens]
    this.activeTweens = []
    tweens.forEach(tween => tween.stop())
  }
}
