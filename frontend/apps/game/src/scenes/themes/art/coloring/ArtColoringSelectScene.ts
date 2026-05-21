import Phaser from 'phaser'
import { playSceneBgm } from '@/game/systems/sceneBgm'
import { assetPath } from '@/game/assets/assetPath'
import { createSceneWeatherLayer } from '@/features/weather/phaserWeatherLayer'
import { coloringOptions, type ColoringOption } from './coloringOptions'

const ART_ROOM_RETURN_SPAWN = { xRatio: 0.5, yRatio: 0.76 }
const DELETE_BUTTON_SIZE = { width: 344, height: 336 }

type ArtColoringSelectSceneData = {
  suppressIntroDialog?: boolean
}

export class ArtColoringSelectScene extends Phaser.Scene {
  private isTransitioning = false
  private suppressIntroDialog = false
  private currentIndex = 0
  private cardCenterY = 0
  private cardContainer: Phaser.GameObjects.Container | null = null
  private pageText!: Phaser.GameObjects.Text

  private readonly handleEscDown = () => {
    this.returnToArtRoom()
  }

  private readonly handleLeftDown = () => {
    this.showPreviousOption()
  }

  private readonly handleRightDown = () => {
    this.showNextOption()
  }

  constructor() {
    super({ key: 'ArtColoringSelectScene' })
  }

  preload() {
    this.load.image('art-room-background', assetPath('images/themes/art/background/background.png'))
    this.load.image('art-ui-delete-btn', assetPath('images/themes/art/ui/delete_btn.png'))
    coloringOptions.forEach(option => {
      this.load.image(option.assetKey, option.imagePath)
    })
  }

  create(data: ArtColoringSelectSceneData = {}) {
    playSceneBgm(this)
    this.isTransitioning = false
    this.suppressIntroDialog = Boolean(data.suppressIntroDialog)
    this.currentIndex = 0
    const { width: vw, height: vh } = this.scale

    const background = this.add.image(vw / 2, vh / 2, 'art-room-background')
    const source = background.texture.getSourceImage() as HTMLImageElement
    const scale = Math.max(vw / source.width, vh / source.height)
    background.setScale(scale).setDepth(0)

    this.add.rectangle(vw / 2, vh / 2, vw, vh, 0x1d120b, 0.58).setDepth(1)
    createSceneWeatherLayer(this)
    this.createHeader(vw)
    this.createExitButton(vw)
    this.createCarousel(vw, vh)
    this.renderCurrentOption()

    this.input.keyboard!.on('keydown-ESC', this.handleEscDown)
    this.input.keyboard!.on('keydown-LEFT', this.handleLeftDown)
    this.input.keyboard!.on('keydown-RIGHT', this.handleRightDown)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', this.handleEscDown)
      this.input.keyboard?.off('keydown-LEFT', this.handleLeftDown)
      this.input.keyboard?.off('keydown-RIGHT', this.handleRightDown)
    })

    this.cameras.main.fadeIn(220, 0, 0, 0)
  }

  private createHeader(vw: number) {
    this.add
      .text(vw * 0.09, 54, '색칠할 도안을 골라봐', {
        fontFamily: 'sans-serif',
        fontSize: `${Math.max(30, Math.round(vw * 0.022))}px`,
        color: '#fff8ec',
        stroke: '#59361d',
        strokeThickness: 6,
      })
      .setDepth(5)
      .setOrigin(0, 0)

    this.add
      .text(vw * 0.09, 106, '좌우 화살표로 넘기고, 마음에 드는 도안을 눌러봐.', {
        fontFamily: 'sans-serif',
        fontSize: `${Math.max(17, Math.round(vw * 0.011))}px`,
        color: '#fff2df',
        stroke: '#5f4129',
        strokeThickness: 4,
      })
      .setDepth(5)
      .setOrigin(0, 0)
  }

  private createExitButton(vw: number) {
    const buttonHeight = Math.max(44, Math.round(vw * 0.028))
    const buttonWidth = Math.round(
      buttonHeight * (DELETE_BUTTON_SIZE.width / DELETE_BUTTON_SIZE.height),
    )
    const button = this.add
      .image(vw - 32 - buttonWidth / 2, 32 + buttonHeight / 2, 'art-ui-delete-btn')
      .setDepth(10)
      .setDisplaySize(buttonWidth, buttonHeight)
      .setInteractive({ useHandCursor: true })

    button.on('pointerover', () => button.setTint(0xf9f1d9))
    button.on('pointerout', () => button.clearTint())
    button.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        this.returnToArtRoom()
      },
    )
  }

  private createCarousel(vw: number, vh: number) {
    this.cardCenterY = vh * 0.555
    const arrowSize = Math.min(vw * 0.06, 88)
    this.createArrowButton(vw * 0.245, this.cardCenterY, arrowSize, '‹', () =>
      this.showPreviousOption(),
    )
    this.createArrowButton(vw * 0.755, this.cardCenterY, arrowSize, '›', () =>
      this.showNextOption(),
    )

    this.pageText = this.add
      .text(vw / 2, vh * 0.905, '', {
        fontFamily: 'sans-serif',
        fontSize: `${Math.max(18, Math.round(vw * 0.012))}px`,
        color: '#fff6ea',
        stroke: '#5f4129',
        strokeThickness: 4,
      })
      .setDepth(6)
      .setOrigin(0.5)
  }

  private createArrowButton(
    x: number,
    y: number,
    size: number,
    label: string,
    onClick: () => void,
  ) {
    const hitArea = this.add
      .rectangle(x, y, size * 1.25, size * 1.3, 0xffffff, 0.001)
      .setDepth(6)
      .setInteractive({ useHandCursor: true })
    const text = this.add
      .text(x, y - 4, label, {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(size * 0.9)}px`,
        color: '#fff8ec',
        align: 'center',
        stroke: '#5b351e',
        strokeThickness: 4,
      })
      .setDepth(7)
      .setOrigin(0.5)

    hitArea.on('pointerover', () => {
      text.setScale(1.08)
      text.setColor('#fff3d7')
    })
    hitArea.on('pointerout', () => {
      text.setScale(1)
      text.setColor('#fff8ec')
    })
    hitArea.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        onClick()
      },
    )
  }

  private renderCurrentOption(direction: number = 0) {
    const option = coloringOptions[this.currentIndex]
    const { width: vw, height: vh } = this.scale
    const cardWidth = Math.min(vw * 0.44, 620)
    const cardHeight = Math.min(vh * 0.66, 610)
    const slideDistance = direction === 0 ? 0 : 26
    const previousCard = this.cardContainer

    if (previousCard) {
      this.tweens.killTweensOf(previousCard)
      previousCard.destroy(true)
    }

    const card = this.add
      .rectangle(0, 0, cardWidth, cardHeight, 0xffffff, 1)
      .setStrokeStyle(6, 0x8b6039, 1)
      .setInteractive({ useHandCursor: true })

    const image = this.add.image(0, 0, option.assetKey)
    const source = image.texture.getSourceImage() as HTMLImageElement
    const imageScale = Math.min(
      (cardWidth * 0.66) / source.width,
      (cardHeight * 0.78) / source.height,
    )
    image.setDisplaySize(source.width * imageScale, source.height * imageScale)

    card.on('pointerover', () => card.setStrokeStyle(7, 0x6f4526, 1))
    card.on('pointerout', () => card.setStrokeStyle(6, 0x8b6039, 1))
    card.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        this.startColoring(option)
      },
    )

    const nextCard = this.add
      .container(vw / 2 + direction * slideDistance, this.cardCenterY, [card, image])
      .setDepth(5)
      .setAlpha(1)
    this.cardContainer = nextCard

    this.tweens.add({
      targets: nextCard,
      x: vw / 2,
      duration: direction === 0 ? 0 : 120,
      ease: 'Quad.easeOut',
    })
    this.pageText.setText(`${this.currentIndex + 1} / ${coloringOptions.length}`)
  }

  private showPreviousOption() {
    if (this.isTransitioning) {
      return
    }

    this.currentIndex = (this.currentIndex - 1 + coloringOptions.length) % coloringOptions.length
    this.renderCurrentOption(-1)
  }

  private showNextOption() {
    if (this.isTransitioning) {
      return
    }

    this.currentIndex = (this.currentIndex + 1) % coloringOptions.length
    this.renderCurrentOption(1)
  }

  private startColoring(option: ColoringOption) {
    if (this.isTransitioning) {
      return
    }

    this.isTransitioning = true
    this.cameras.main.fadeOut(180, 0, 0, 0)
    this.time.delayedCall(180, () => {
      this.scene.start('ArtColoringScene', {
        coloringId: option.id,
        suppressIntroDialog: this.suppressIntroDialog,
      })
    })
  }

  private returnToArtRoom() {
    if (this.isTransitioning) {
      return
    }

    this.isTransitioning = true
    this.cameras.main.fadeOut(180, 0, 0, 0)
    this.time.delayedCall(180, () => {
      this.scene.start('ArtSelectScene', {
        spawn: ART_ROOM_RETURN_SPAWN,
        suppressRumiDialog: true,
      })
    })
  }
}
