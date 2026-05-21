import Phaser from 'phaser'
import { getGameWeather } from './weatherStore'
import { buildMapWeatherEffect } from './weatherEffects'
import { getMapWeatherRule } from './mapWeatherRules'
import {
  applyWeatherAccessibilityConfig,
  getWeatherAccessibilityConfig,
} from './weatherAccessibility'
import type { WeatherEffectConfig } from './types'

type PhaserWeatherLayerOptions = {
  depth?: number
}

type RainDrop = {
  object: Phaser.GameObjects.Graphics
  velocityX: number
  velocityY: number
}

const DEFAULT_WEATHER_LAYER_DEPTH = 2
const RAIN_DROP_COUNT = 84
const SNOW_FLAKE_COUNT = 54

export function createSceneWeatherLayer(
  scene: Phaser.Scene,
  mapId = scene.scene.key,
  { depth = DEFAULT_WEATHER_LAYER_DEPTH }: PhaserWeatherLayerOptions = {},
) {
  const rule = getMapWeatherRule(mapId)

  if (rule.mode === 'DISABLED') {
    return null
  }

  const layer = new PhaserSceneWeatherLayer(scene, mapId, depth)
  layer.mount()
  return layer
}

class PhaserSceneWeatherLayer {
  private readonly container: Phaser.GameObjects.Container
  private readonly tint: Phaser.GameObjects.Rectangle
  private readonly darken: Phaser.GameObjects.Rectangle
  private particles: Phaser.GameObjects.GameObject[] = []
  private activeTweens: Phaser.Tweens.Tween[] = []
  private rainDrops: RainDrop[] = []
  private rainRandom: Phaser.Math.RandomDataGenerator | null = null
  private currentEffect: WeatherEffectConfig | null = null
  private reduceMotion = false
  private destroyed = false

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly mapId: string,
    depth: number,
  ) {
    const { width, height } = scene.scale
    this.container = scene.add.container(0, 0).setDepth(depth).setScrollFactor(0)
    this.tint = scene.add
      .rectangle(0, 0, width, height, 0xffffff, 0)
      .setOrigin(0)
      .setScrollFactor(0)
    this.darken = scene.add
      .rectangle(0, 0, width, height, 0x000000, 0)
      .setOrigin(0)
      .setScrollFactor(0)
    this.container.add([this.tint, this.darken])
  }

  mount() {
    this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize)
    this.scene.events.on(Phaser.Scenes.Events.UPDATE, this.ensureParticlesVisible)
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy)
    this.scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy)
    this.applyWeather()
  }

  private readonly ensureParticlesVisible = (_time?: number, delta = 0) => {
    this.updateRain(delta)

    if (
      !this.currentEffect ||
      this.currentEffect.particleType === 'none' ||
      this.currentEffect.particleIntensity <= 0 ||
      this.particles.length > 0
    ) {
      return
    }

    this.redrawParticles()
  }

  private readonly handleResize = (gameSize: Phaser.Structs.Size) => {
    this.tint.setSize(gameSize.width, gameSize.height)
    this.darken.setSize(gameSize.width, gameSize.height)
    this.redrawParticles()
  }

  private async applyWeather() {
    const weather = await getGameWeather()

    if (this.destroyed) return

    const rule = getMapWeatherRule(this.mapId)
    const accessibilityConfig = getWeatherAccessibilityConfig()
    const baseEffect = buildMapWeatherEffect(weather.condition, rule)
    const effect = applyWeatherAccessibilityConfig(baseEffect, accessibilityConfig)
    this.renderEffect(effect, accessibilityConfig.reduceWeatherMotion)
  }

  private renderEffect(effect: WeatherEffectConfig, reduceMotion: boolean) {
    this.currentEffect = effect
    this.reduceMotion = reduceMotion
    this.tint
      .setFillStyle(Phaser.Display.Color.HexStringToColor(effect.lightTint ?? '#ffffff').color)
      .setAlpha(effect.overlayOpacity)
    this.darken.setAlpha(effect.backgroundDarken)
    this.clearParticles()

    if (effect.particleType === 'rain') {
      this.createRain(effect.particleIntensity, reduceMotion)
    } else if (effect.particleType === 'snow') {
      this.createSnow(effect.particleIntensity, reduceMotion)
    } else if (effect.particleType === 'fog') {
      this.createFog(effect.particleIntensity)
    }
  }

  private redrawParticles() {
    this.clearParticles()

    if (!this.currentEffect) {
      return
    }

    if (this.currentEffect.particleType === 'rain') {
      this.createRain(this.currentEffect.particleIntensity, this.reduceMotion)
    } else if (this.currentEffect.particleType === 'snow') {
      this.createSnow(this.currentEffect.particleIntensity, this.reduceMotion)
    } else if (this.currentEffect.particleType === 'fog') {
      this.createFog(this.currentEffect.particleIntensity)
    }
  }

  private createRain(alpha: number, reduceMotion: boolean) {
    const { width, height } = this.scene.scale
    const rainLayer = this.scene.add.container(0, 0).setAlpha(alpha).setScrollFactor(0)
    const random = new Phaser.Math.RandomDataGenerator([`${this.mapId}:rain:${width}x${height}`])
    this.rainRandom = random

    for (let index = 0; index < RAIN_DROP_COUNT; index += 1) {
      const startX = random.between(-80, width + 80)
      const startY = random.between(-height, height)
      const length = random.between(48, 68)
      const dropAlpha = random.realInRange(0.58, 0.78)
      const lineWidth = random.realInRange(2.7, 3.5)
      const drop = this.scene.add.graphics()
      drop.setScrollFactor(0)
      drop.lineStyle(lineWidth, 0xb8dcff, dropAlpha)
      drop.lineBetween(0, 0, -14, length)
      drop.setPosition(startX, startY)
      rainLayer.add(drop)

      if (!reduceMotion) {
        this.rainDrops.push({
          object: drop,
          velocityX: -random.realInRange(60, 95),
          velocityY: random.realInRange(560, 820),
        })
      }
    }

    this.particles.push(rainLayer)
    this.container.add(rainLayer)
  }

  private updateRain(delta: number) {
    if (this.rainDrops.length === 0 || !this.rainRandom) {
      return
    }

    const { width, height } = this.scene.scale
    const deltaSeconds = Math.min(delta, 40) / 1000

    this.rainDrops.forEach(drop => {
      drop.object.x += drop.velocityX * deltaSeconds
      drop.object.y += drop.velocityY * deltaSeconds

      if (drop.object.y > height + 100 || drop.object.x < -160) {
        drop.object.setPosition(
          this.rainRandom!.between(-40, width + 180),
          this.rainRandom!.between(-180, -30),
        )
      }
    })
  }

  private createSnow(alpha: number, reduceMotion: boolean) {
    const { width, height } = this.scene.scale
    const snowLayer = this.scene.add.container(0, 0).setAlpha(alpha).setScrollFactor(0)
    const random = new Phaser.Math.RandomDataGenerator([`${this.mapId}:snow:${width}x${height}`])
    const flakeTweens: Phaser.Tweens.Tween[] = []

    for (let index = 0; index < SNOW_FLAKE_COUNT; index += 1) {
      const startX = random.between(-40, width + 40)
      const startY = random.between(-height, height)
      const radius = random.realInRange(2.7, 4.8)
      const drift = random.realInRange(-42, 42)
      const duration = random.between(7600, 13200)
      const delay = random.between(0, 2400)
      const flake = this.scene.add.graphics()
      flake.setScrollFactor(0)
      flake.fillStyle(0xffffff, 1)
      flake.fillCircle(0, 0, radius)
      flake.lineStyle(1.2, 0xffffff, 0.9)
      flake.strokeCircle(0, 0, radius + 0.8)
      flake.setPosition(startX, startY)
      snowLayer.add(flake)

      if (!reduceMotion) {
        flakeTweens.push(
          this.scene.tweens.add({
            targets: flake,
            y: height + random.between(24, 90),
            duration,
            delay,
            repeat: -1,
            ease: 'Linear',
            onRepeat: () => {
              flake.setPosition(random.between(-40, width + 40), random.between(-140, -30))
            },
          }),
        )
        flakeTweens.push(
          this.scene.tweens.add({
            targets: flake,
            x: startX + drift,
            duration: random.between(2800, 5200),
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          }),
        )
      }
    }

    this.particles.push(snowLayer)
    this.container.add(snowLayer)
    this.activeTweens.push(...flakeTweens)
  }

  private createFog(alpha: number) {
    const { width, height } = this.scene.scale
    const graphics = this.scene.add.graphics().setAlpha(alpha).setScrollFactor(0)
    graphics.fillStyle(0xffffff, 0.16)
    graphics.fillEllipse(width * 0.24, height * 0.42, width * 0.62, height * 0.28)
    graphics.fillEllipse(width * 0.74, height * 0.54, width * 0.58, height * 0.24)
    this.particles.push(graphics)
    this.container.add(graphics)
  }

  private clearParticles() {
    this.activeTweens.forEach(tween => tween.stop())
    this.activeTweens = []
    this.rainDrops = []
    this.rainRandom = null
    this.particles.forEach(particle => particle.destroy())
    this.particles = []
  }

  private readonly destroy = () => {
    this.destroyed = true
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize)
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.ensureParticlesVisible)
    this.clearParticles()
    this.container.destroy()
  }
}
