import Phaser from 'phaser'

const TUTORIAL_KEY = 'tutorial_interaction_seen'

type NpcInteractionHintUiOptions = {
  depth?: number
}

export class NpcInteractionHintUi {
  private readonly scene: Phaser.Scene
  private readonly depth: number
  private readonly badge: Phaser.GameObjects.Container
  private readonly badgeBg: Phaser.GameObjects.Graphics
  private readonly keyText: Phaser.GameObjects.Text
  private readonly labelText: Phaser.GameObjects.Text
  private readonly helpBar: Phaser.GameObjects.Container
  private readonly helpBg: Phaser.GameObjects.Graphics
  private readonly helpKeyText: Phaser.GameObjects.Text
  private readonly helpText: Phaser.GameObjects.Text
  private readonly toast: Phaser.GameObjects.Container
  private readonly toastBg: Phaser.GameObjects.Graphics
  private toastTimer?: Phaser.Time.TimerEvent

  constructor(scene: Phaser.Scene, options: NpcInteractionHintUiOptions = {}) {
    this.scene = scene
    this.depth = options.depth ?? 60

    this.badge = scene.add.container(0, 0).setDepth(this.depth).setVisible(false)
    this.badgeBg = scene.add.graphics()
    this.keyText = scene.add
      .text(-35, -34, 'E', {
        fontFamily: 'Pretendard, "Noto Sans KR", sans-serif',
        fontSize: '18px',
        fontStyle: '900',
        color: '#ffffff',
      })
      .setOrigin(0.5)
    this.labelText = scene.add
      .text(8, -34, '대화', {
        fontFamily: 'Pretendard, "Noto Sans KR", sans-serif',
        fontSize: '18px',
        fontStyle: '900',
        color: '#3a2a1e',
      })
      .setOrigin(0.5)
    this.badge.add([this.badgeBg, this.keyText, this.labelText])
    this.drawBadge()

    scene.tweens.add({
      targets: this.badge,
      y: '+=4',
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    this.helpBar = scene.add
      .container(0, 0)
      .setDepth(this.depth)
      .setScrollFactor(0)
      .setVisible(false)
    this.helpBg = scene.add.graphics().setScrollFactor(0)
    this.helpKeyText = scene.add
      .text(0, 0, 'E', {
        fontFamily: 'Pretendard, "Noto Sans KR", sans-serif',
        fontSize: '20px',
        fontStyle: '900',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
    this.helpText = scene.add
      .text(0, 0, '', {
        fontFamily: 'Pretendard, "Noto Sans KR", sans-serif',
        fontSize: '20px',
        fontStyle: '800',
        color: '#fff4dc',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
    this.helpBar.add([this.helpBg, this.helpKeyText, this.helpText])

    this.toast = scene.add
      .container(0, 88)
      .setDepth(this.depth + 1)
      .setScrollFactor(0)
      .setVisible(false)
    this.toastBg = scene.add.graphics().setScrollFactor(0)
    const toastText = scene.add
      .text(0, 0, '가까이 다가가면 E 키로 대화할 수 있어요.', {
        fontFamily: 'Pretendard, "Noto Sans KR", sans-serif',
        fontSize: '22px',
        fontStyle: '800',
        color: '#3a2a1e',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
    this.toast.add([this.toastBg, toastText])
    this.drawToast()
    this.layoutFixedUi()

    scene.scale.on('resize', this.layoutFixedUi, this)
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy())
  }

  show(
    worldX: number,
    worldY: number,
    displayName: string,
    options: { badgeLabel?: string; helpMessage?: string } = {},
  ) {
    const badgeLabel = options.badgeLabel ?? '대화'
    const helpMessage = options.helpMessage ?? `E 또는 Enter로 ${displayName}와 대화하기`
    this.labelText.setText(badgeLabel)
    this.badge.setPosition(worldX, worldY - 26).setVisible(true)
    this.helpText.setText(helpMessage)
    this.drawHelpBar()
    this.helpBar.setVisible(true)
    this.showTutorialOnce()
  }

  hide() {
    this.badge.setVisible(false)
    this.helpBar.setVisible(false)
  }

  private showTutorialOnce() {
    if (localStorage.getItem(TUTORIAL_KEY) === 'true') return

    localStorage.setItem(TUTORIAL_KEY, 'true')
    this.toast.setVisible(true).setAlpha(0)
    this.scene.tweens.add({
      targets: this.toast,
      alpha: 1,
      duration: 160,
      ease: 'Sine.easeOut',
    })

    this.toastTimer?.remove(false)
    this.toastTimer = this.scene.time.delayedCall(3000, () => {
      this.scene.tweens.add({
        targets: this.toast,
        alpha: 0,
        duration: 180,
        ease: 'Sine.easeIn',
        onComplete: () => this.toast.setVisible(false),
      })
    })
  }

  private drawBadge() {
    this.badgeBg.clear()
    this.badgeBg.fillStyle(0x4a321e, 0.24)
    this.badgeBg.fillRoundedRect(-58, -51, 116, 40, 10)
    this.badgeBg.fillStyle(0xfff4dc, 0.96)
    this.badgeBg.fillRoundedRect(-60, -54, 116, 40, 10)
    this.badgeBg.lineStyle(2, 0x8b6a45, 1)
    this.badgeBg.strokeRoundedRect(-60, -54, 116, 40, 10)
    this.badgeBg.fillStyle(0x6f54e8, 1)
    this.badgeBg.fillRoundedRect(-49, -48, 28, 28, 6)
  }

  private drawHelpBar() {
    const width = Math.max(320, this.helpText.width + 78)
    const height = 46
    this.helpBg.clear()
    this.helpBg.fillStyle(0x231c18, 0.78)
    this.helpBg.fillRoundedRect(-width / 2, -height / 2, width, height, 23)
    this.helpBg.fillStyle(0x7b61ff, 1)
    this.helpBg.fillRoundedRect(-width / 2 + 12, -16, 32, 32, 8)
    this.helpKeyText.setPosition(-width / 2 + 28, 0)
    this.helpText.setPosition(24, 0)
    this.helpBar.setPosition(this.scene.scale.width / 2, this.scene.scale.height - 40)
  }

  private drawToast() {
    const width = 520
    const height = 58
    this.toastBg.clear()
    this.toastBg.fillStyle(0x4a321e, 0.2)
    this.toastBg.fillRoundedRect(-width / 2 + 4, -height / 2 + 6, width, height, 14)
    this.toastBg.fillStyle(0xfff4dc, 0.98)
    this.toastBg.fillRoundedRect(-width / 2, -height / 2, width, height, 14)
    this.toastBg.lineStyle(2, 0x8b6a45, 1)
    this.toastBg.strokeRoundedRect(-width / 2, -height / 2, width, height, 14)
  }

  private layoutFixedUi() {
    this.helpBar.setPosition(this.scene.scale.width / 2, this.scene.scale.height - 40)
    this.toast.setPosition(this.scene.scale.width / 2, 88)
  }

  destroy() {
    this.scene.scale.off('resize', this.layoutFixedUi, this)
    this.toastTimer?.remove(false)
    this.badge.destroy(true)
    this.helpBar.destroy(true)
    this.toast.destroy(true)
  }
}
