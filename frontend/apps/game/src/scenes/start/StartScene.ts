import Phaser from 'phaser'
import { playSceneBgm } from '@/game/systems/sceneBgm'
import { assetPath } from '@/game/assets/assetPath'
import { hasValidAuthToken } from '@/features/auth'
import { loadTaekwondoBeltEmoteImages } from '@/features/village-realtime'

export class StartScene extends Phaser.Scene {
  constructor() {
    super({ key: 'StartScene' })
  }

  preload() {
    this.load.image('home', assetPath('images/common/background/home.png'))
    this.load.image('logo', assetPath('images/common/logo.png'))
    this.load.image('startbtn', assetPath('images/ui/buttons/startbtn.png'))
    loadTaekwondoBeltEmoteImages(this)
  }

  create() {
    playSceneBgm(this)
    const { width, height } = this.scale

    // 배경
    const bg = this.add.image(width / 2, height / 2, 'home')
    bg.setScale(Math.max(width / bg.width, height / bg.height)).setDepth(0)

    // 어두운 오버레이
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.45).setDepth(10)

    // 로고
    const logo = this.add.image(width / 2, height / 2 - 60, 'logo')
    const logoScale = (width * 0.35) / logo.width
    logo.setScale(logoScale).setDepth(11)
    // logo.png 내용이 이미지 중심에서 ~23px(원본 기준) 우측으로 치우쳐 있어 시각 중심을 화면 중앙에 맞추기 위해 보정
    logo.x -= 23 * logoScale

    this.tweens.add({
      targets: logo,
      y: logo.y - 10,
      duration: 1800,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    })

    // 시작 버튼
    const btn = this.add
      .image(width / 2, logo.y + logo.displayHeight / 2 + 20, 'startbtn')
      .setInteractive({ useHandCursor: true })
      .setDepth(11)

    const baseScale = (width * 0.26) / btn.width
    btn.setScale(baseScale)
    btn.y = logo.y + logo.displayHeight / 2 + btn.displayHeight / 2 + 20

    btn.on('pointerover', () => {
      this.tweens.killTweensOf(btn)
      this.tweens.add({ targets: btn, scale: baseScale * 1.08, duration: 120 })
    })
    btn.on('pointerout', () => {
      this.tweens.killTweensOf(btn)
      this.tweens.add({ targets: btn, scale: baseScale, duration: 120 })
    })
    let waitingForAuth = false
    let authFadeTween: Phaser.Tweens.Tween | null = null

    const fadeAuthFocus = (toAlpha: number) => {
      authFadeTween?.stop()
      authFadeTween = this.tweens.add({
        targets: [logo, btn],
        alpha: toAlpha,
        duration: 220,
        ease: 'Sine.easeOut',
        onComplete: () => {
          authFadeTween = null
        },
      })
    }

    const proceedToVillage = () => {
      this.cameras.main.fadeOut(400, 0, 0, 0)
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('VillageScene')
      })
    }

    btn.on('pointerdown', () => {
      if (waitingForAuth) return

      if (hasValidAuthToken()) {
        proceedToVillage()
        return
      }

      waitingForAuth = true

      const onCompleted = () => {
        waitingForAuth = false
        this.game.events.off('auth:cancelled', onCancelled)
        proceedToVillage()
      }
      const onCancelled = () => {
        waitingForAuth = false
        this.game.events.off('auth:completed', onCompleted)
        fadeAuthFocus(1)
      }

      this.game.events.once('auth:completed', onCompleted)
      this.game.events.once('auth:cancelled', onCancelled)
      this.game.events.emit('auth:request')
      fadeAuthFocus(0)
    })

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('auth:completed')
      this.game.events.off('auth:cancelled')
    })
  }

  // 낙엽: 위에서 아래로 살랑살랑
  private spawnLeaf(width: number, height: number) {
    const colors = [0xe8632a, 0xd4a017, 0xc0392b, 0xe67e22, 0xf1c40f]
    const color = colors[Phaser.Math.Between(0, colors.length - 1)]
    const size = Phaser.Math.FloatBetween(3, 6)
    const startX = Phaser.Math.Between(0, width)
    const duration = Phaser.Math.Between(4000, 8000)
    const swayWidth = Phaser.Math.Between(30, 80)

    const leaf = this.add.graphics().setDepth(8)
    leaf.fillStyle(color, 0.75)
    leaf.fillEllipse(0, 0, size * 2, size)
    leaf.x = startX
    leaf.y = -10

    // 아래로 떨어지면서 좌우로 흔들림
    this.tweens.add({
      targets: leaf,
      y: height + 20,
      x: startX + Phaser.Math.Between(-swayWidth, swayWidth),
      angle: Phaser.Math.Between(-180, 180),
      duration,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        leaf.destroy()
        this.time.delayedCall(Phaser.Math.Between(500, 2500), () => {
          this.spawnLeaf(width, height)
        })
      },
    })
  }

  // 반딧불이: 아래에서 위로 둥실둥실
  private spawnFirefly(width: number, height: number) {
    const startX = Phaser.Math.Between(width * 0.05, width * 0.95)
    const startY = Phaser.Math.Between(height * 0.5, height + 10)
    const duration = Phaser.Math.Between(3500, 6500)

    const dot = this.add.graphics().setDepth(9)
    dot.fillStyle(0xffee88, 1)
    dot.fillCircle(0, 0, Phaser.Math.FloatBetween(1.5, 3))
    dot.x = startX
    dot.y = startY
    dot.setAlpha(0)

    // 위로 떠오르면서 좌우 흔들
    this.tweens.add({
      targets: dot,
      y: startY - Phaser.Math.Between(150, 300),
      x: startX + Phaser.Math.Between(-60, 60),
      duration,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        dot.destroy()
        this.time.delayedCall(Phaser.Math.Between(300, 2000), () => {
          this.spawnFirefly(width, height)
        })
      },
    })

    // 깜빡이며 나타났다 사라짐
    this.tweens.add({
      targets: dot,
      alpha: 0.9,
      duration: 600,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: Math.floor(duration / 1200),
    })
  }
}
