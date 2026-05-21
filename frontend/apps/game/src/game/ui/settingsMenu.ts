import Phaser from 'phaser'
import {
  ensurePlayerWalkAnimations,
  getPlayerOutfitTextureKey,
  getPlayerOutfits,
  getSelectedPlayerCharacterId,
  getSelectedPlayerOutfitId,
  PLAYER_CHARACTERS,
  setSelectedPlayerCharacterId,
  setSelectedPlayerOutfitId,
  type PlayerCharacterId,
  type PlayerOutfitId,
  type PlayerSprite,
} from '@/game/entities/player'
import {
  getGameSettings,
  type MoveSpeedMultiplier,
  updateGameSettings,
} from '@/game/settings/gameSettings'
import { syncSceneBgmVolume } from '@/game/systems/sceneBgm'
import {
  getCachedPatientNickname,
  prefetchPatientNickname,
} from '@/features/exerciseSessions/patientProfile'

type SettingsMenu = {
  isOpen: () => boolean
  toggleButton: () => void
  close: () => void
}

type SettingsMenuOptions = {
  onLogout: () => void
  onClose?: () => void
  getPlayer?: () => PlayerSprite | null
}

type ClickZone = {
  x: number
  y: number
  width: number
  height: number
  onClick: () => void
}

type SliderZone = {
  x: number
  y: number
  width: number
  height: number
  setValue: (pointerX: number) => void
}

const OVERLAY_DEPTH = 1000
const FONT_FAMILY = "'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
const PANEL_RADIUS = 8

const COLORS = {
  dim: 0x211b15,
  panel: 0xfffbf3,
  panelBorder: 0xc8b89d,
  panelShadow: 0x1c130b,
  surface: 0xfffdf8,
  surfaceBorder: 0xe5d9c7,
  title: 0x3b3026,
  text: 0x3b332b,
  mutedText: 0x7b7063,
  accent: 0x7f715d,
  accentDark: 0x665743,
  accentSoft: 0xf3eadc,
  control: 0xf6f0e7,
  controlBorder: 0xe0d5c4,
  controlActive: 0x82745f,
  controlActiveBorder: 0x665844,
  primary: 0x8b7a61,
  primaryBorder: 0x6c5c46,
  iconButton: 0x7d715e,
  iconButtonBorder: 0x625643,
  warm: 0xddc59d,
  warmDark: 0xa98454,
  danger: 0xc8846f,
  dangerDark: 0x9a5d4a,
  disabled: 0xe7dfd3,
  disabledText: 0x8b8174,
  track: 0xe7ddce,
  trackFill: 0x9b876b,
} as const

const LABELS = {
  title: '\uC124\uC815',
  nickname: '\uB2C9\uB124\uC784',
  nicknameEmpty: '\uC124\uC815 \uC548 \uB428',
  sound: '\uC0AC\uC6B4\uB4DC',
  bgm: '\uBC30\uACBD\uC74C\uC545',
  on: 'ON',
  off: 'OFF',
  speed: '\uC774\uB3D9 \uBC30\uC18D',
  profileOutfit: '\uD504\uB85C\uD544 / \uBCF5\uC7A5',
  change: '\uBCC0\uACBD',
  outfitTitle: '\uBCF5\uC7A5 \uC120\uD0DD',
  select: '\uC120\uD0DD',
  selected: '\uC120\uD0DD\uB428',
  close: 'X',
  logout: '\uB85C\uADF8\uC544\uC6C3',
}

export function createSettingsMenu(
  scene: Phaser.Scene,
  { onLogout, onClose, getPlayer }: SettingsMenuOptions,
): SettingsMenu {
  let settings = getGameSettings()
  let selectedCharacterId = getSelectedPlayerCharacterId()
  let selectedOutfitId = getSelectedPlayerOutfitId(selectedCharacterId)
  let outfitCarouselIndex = getOutfitIndex(selectedCharacterId, selectedOutfitId)
  let currentNickname = getCachedPatientNickname()
  let backdrop: Phaser.GameObjects.Rectangle | null = null
  let modal: Phaser.GameObjects.Container | null = null
  let clickZones: ClickZone[] = []
  let sliderZones: SliderZone[] = []
  let activeSlider: SliderZone | null = null
  let previousTopOnly: boolean | null = null

  const handleNicknameUpdated = (payload: { nickname: string }) => {
    currentNickname = payload.nickname
  }
  scene.game.events.on('settings:nickname-updated', handleNicknameUpdated)

  function toggleButton() {
    if (modal) {
      close()
      return
    }
    openSettings()
  }

  function close({ notify = true }: { notify?: boolean } = {}) {
    const wasOpen = Boolean(modal)
    backdrop?.destroy()
    modal?.destroy()
    backdrop = null
    modal = null
    clickZones = []
    sliderZones = []
    activeSlider = null

    if (previousTopOnly !== null) {
      scene.input.setTopOnly(previousTopOnly)
      previousTopOnly = null
    }

    if (wasOpen && notify) onClose?.()
  }

  function createOverlay() {
    close({ notify: false })

    const { width, height } = scene.scale
    previousTopOnly = scene.input.topOnly
    scene.input.setTopOnly(true)

    backdrop = scene.add
      .rectangle(width / 2, height / 2, width, height, COLORS.dim, 0.42)
      .setDepth(OVERLAY_DEPTH)
      .setScrollFactor(0)
      .setInteractive()
    backdrop.on(
      'pointerdown',
      (
        pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        handlePointerDown(pointer)
      },
    )
    backdrop.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      handlePointerMove(pointer)
    })
    backdrop.on('pointerup', () => {
      handlePointerUp()
    })

    const container = scene.add
      .container(0, 0)
      .setDepth(OVERLAY_DEPTH + 1)
      .setScrollFactor(0)
    modal = container

    return container
  }

  function openSettings() {
    settings = getGameSettings()
    selectedCharacterId = getSelectedPlayerCharacterId()
    selectedOutfitId = getSelectedPlayerOutfitId(selectedCharacterId)
    currentNickname = getCachedPatientNickname()

    void prefetchPatientNickname(nickname => {
      if (currentNickname === nickname) return
      currentNickname = nickname
      if (modal) openSettings()
    })

    const container = createOverlay()
    const { width, height } = scene.scale
    const { panelW, panelH } = getPanelSize(scene, 'settings')
    const panelX = width / 2
    const panelY = height / 2
    const panelLeft = panelX - panelW / 2
    const panelTop = panelY - panelH / 2
    const contentLeft = panelLeft + 44
    const contentW = panelW - 88
    const labelW = Math.min(132, contentW * 0.28)
    const rowH = 58
    const rowGap = 14
    const nicknameY = panelTop + 124
    const soundY = nicknameY + rowH + rowGap
    const bgmY = soundY + rowH + rowGap
    const speedY = bgmY + rowH + rowGap
    const outfitY = speedY + rowH + rowGap
    const logoutY = panelTop + panelH - 52
    const closeX = panelLeft + panelW - 34
    const closeY = panelTop + 34

    container.add(createPanel(scene, panelX, panelY, panelW, panelH))
    container.add(createHeader(scene, panelX, panelTop + 48, LABELS.title))
    container.add(
      createTextButton(scene, closeX, closeY, 34, 34, LABELS.close, {
        fillColor: COLORS.iconButton,
        borderColor: COLORS.iconButtonBorder,
        textColor: 0xffffff,
        fontSize: 19,
      }),
    )
    addClickZone(closeX, closeY, 34, 34, close)

    container.add(
      createNicknameRow(scene, contentLeft, nicknameY, contentW, rowH, labelW, currentNickname),
    )
    const nicknameButtonW = 104
    const nicknameButtonH = 40
    addClickZone(
      contentLeft + contentW - nicknameButtonW / 2 - 16,
      nicknameY,
      nicknameButtonW,
      nicknameButtonH,
      () => {
        close({ notify: false })
        scene.game.events.emit('settings:nickname-edit-open', { current: currentNickname })
      },
    )

    const masterSlider = createSlider(scene, {
      x: contentLeft,
      y: soundY,
      width: contentW,
      height: rowH,
      labelWidth: labelW,
      label: LABELS.sound,
      value: settings.masterVolume,
      onChange: value => {
        settings = updateGameSettings({ masterVolume: value })
        applyMasterVolume(scene, value)
      },
    })
    container.add(masterSlider.container)
    addSliderZone(masterSlider)

    container.add(createBgmRow(scene, contentLeft, bgmY, contentW, rowH, labelW, settings))
    addClickZone(contentLeft + contentW / 2, bgmY, contentW, rowH, () => {
      settings = updateGameSettings({ bgmEnabled: !settings.bgmEnabled })
      syncSceneBgmVolume()
      openSettings()
    })

    container.add(createSpeedRow(scene, contentLeft, speedY, contentW, rowH, labelW, settings))
    addSpeedClickZones(contentLeft, speedY, contentW, rowH, labelW)

    container.add(createOutfitRow(scene, contentLeft, outfitY, contentW, rowH))
    addClickZone(contentLeft + contentW / 2, outfitY, contentW, rowH, () => {
      openOutfitPicker(getOutfitIndex(selectedCharacterId, selectedOutfitId), selectedCharacterId)
    })

    const logoutW = Math.min(184, panelW * 0.34)
    const logoutH = 44
    container.add(
      createTextButton(scene, panelX, logoutY, logoutW, logoutH, LABELS.logout, {
        fillColor: COLORS.danger,
        borderColor: COLORS.dangerDark,
        textColor: 0xffffff,
        fontSize: 17,
      }),
    )
    addClickZone(panelX, logoutY, logoutW, logoutH, onLogout)
  }

  function openOutfitPicker(index = outfitCarouselIndex, characterId = selectedCharacterId) {
    selectedCharacterId = characterId
    selectedOutfitId = getSelectedPlayerOutfitId(selectedCharacterId)

    const outfits = getPlayerOutfits(selectedCharacterId)
    outfitCarouselIndex = wrapOutfitIndex(index, outfits)

    const container = createOverlay()
    const { width, height } = scene.scale
    const { panelW, panelH } = getPanelSize(scene, 'outfits')
    const panelX = width / 2
    const panelY = height / 2
    const panelLeft = panelX - panelW / 2
    const panelTop = panelY - panelH / 2
    const closeX = panelLeft + panelW - 34
    const closeY = panelTop + 34
    const backX = panelLeft + 34
    const backY = closeY
    const characterSwitchY = panelTop + 104
    const previewY = panelTop + panelH * 0.55
    const arrowY = previewY
    const arrowOffset = Math.min(214, panelW * 0.36)
    const outfit = outfits[outfitCarouselIndex]
    const isSelected = outfit.id === selectedOutfitId
    const selectY = panelTop + panelH - 54

    container.add(createPanel(scene, panelX, panelY, panelW, panelH))
    container.add(createHeader(scene, panelX, panelTop + 48, LABELS.outfitTitle))
    container.add(
      createCharacterSwitch(scene, panelX, characterSwitchY, panelW, selectedCharacterId),
    )
    addCharacterSwitchClickZones(panelX, characterSwitchY, panelW)

    container.add(
      createTextButton(scene, backX, backY, 34, 34, '\u2039', {
        fillColor: COLORS.iconButton,
        borderColor: COLORS.iconButtonBorder,
        textColor: 0xffffff,
        fontSize: 22,
      }),
    )
    addClickZone(backX, backY, 34, 34, openSettings)

    container.add(
      createTextButton(scene, closeX, closeY, 34, 34, LABELS.close, {
        fillColor: COLORS.iconButton,
        borderColor: COLORS.iconButtonBorder,
        textColor: 0xffffff,
        fontSize: 19,
      }),
    )
    addClickZone(closeX, closeY, 34, 34, close)

    container.add(createCarouselPreview(scene, panelX, previewY, outfit.id))
    container.add(
      createTextButton(scene, panelX - arrowOffset, arrowY, 48, 48, '\u2039', {
        fillColor: COLORS.control,
        borderColor: COLORS.controlBorder,
        textColor: COLORS.accentDark,
        fontSize: 30,
      }),
    )
    addClickZone(panelX - arrowOffset, arrowY, 48, 48, () => {
      openOutfitPicker(outfitCarouselIndex - 1)
    })

    container.add(
      createTextButton(scene, panelX + arrowOffset, arrowY, 48, 48, '\u203A', {
        fillColor: COLORS.control,
        borderColor: COLORS.controlBorder,
        textColor: COLORS.accentDark,
        fontSize: 30,
      }),
    )
    addClickZone(panelX + arrowOffset, arrowY, 48, 48, () => {
      openOutfitPicker(outfitCarouselIndex + 1)
    })

    container.add(
      createCarouselDots(scene, panelX, previewY + 122, outfitCarouselIndex, outfits.length),
    )

    const selectW = 150
    const selectFill = isSelected ? COLORS.disabled : COLORS.primary
    const selectBorder = isSelected ? COLORS.surfaceBorder : COLORS.primaryBorder
    const selectText = isSelected ? COLORS.disabledText : 0xffffff
    container.add(
      createTextButton(
        scene,
        panelX,
        selectY,
        selectW,
        44,
        isSelected ? LABELS.selected : LABELS.select,
        {
          fillColor: selectFill,
          borderColor: selectBorder,
          textColor: selectText,
          fontSize: 17,
        },
      ),
    )

    if (!isSelected) {
      addClickZone(panelX, selectY, selectW, 44, () => {
        selectedCharacterId = setSelectedPlayerCharacterId(outfit.characterId)
        selectedOutfitId = setSelectedPlayerOutfitId(outfit.id, selectedCharacterId)
        applyOutfitToPlayer(selectedOutfitId)
        openOutfitPicker(outfitCarouselIndex, selectedCharacterId)
      })
    }
  }

  function applyOutfitToPlayer(outfitId: PlayerOutfitId) {
    const player = getPlayer?.()
    if (!player?.active) return

    const textureKey = getPlayerOutfitTextureKey(outfitId)
    if (!scene.textures.exists(textureKey)) return

    ensurePlayerWalkAnimations(scene, textureKey)
    const currentFrame = Number(player.frame.name)
    player.anims.stop()
    player.setTexture(textureKey, Number.isFinite(currentFrame) ? currentFrame : 0)
  }

  function addClickZone(x: number, y: number, width: number, height: number, onClick: () => void) {
    clickZones.push({ x, y, width, height, onClick })
  }

  function addSliderZone(zone: SliderZone) {
    sliderZones.push(zone)
  }

  function addSpeedClickZones(
    x: number,
    y: number,
    width: number,
    height: number,
    labelWidth: number,
  ) {
    const values: MoveSpeedMultiplier[] = [1, 1.5, 2]
    const gap = 10
    const controlLeft = x + labelWidth + 18
    const controlW = width - labelWidth - 36
    const buttonW = (controlW - gap * 2) / 3
    const buttonH = Math.min(40, height * 0.72)
    const startX = controlLeft + buttonW / 2

    values.forEach((value, index) => {
      addClickZone(startX + index * (buttonW + gap), y, buttonW, buttonH, () => {
        settings = updateGameSettings({ moveSpeedMultiplier: value })
        openSettings()
      })
    })
  }

  function addCharacterSwitchClickZones(x: number, y: number, panelW: number) {
    const { switchW, buttonW, gap } = getCharacterSwitchLayout(panelW)

    PLAYER_CHARACTERS.forEach((character, index) => {
      addClickZone(x - switchW / 2 + buttonW / 2 + index * (buttonW + gap), y, buttonW, 38, () => {
        selectedCharacterId = setSelectedPlayerCharacterId(character.id)
        selectedOutfitId = getSelectedPlayerOutfitId(selectedCharacterId)
        outfitCarouselIndex = getOutfitIndex(selectedCharacterId, selectedOutfitId)
        applyOutfitToPlayer(selectedOutfitId)
        openOutfitPicker(outfitCarouselIndex, selectedCharacterId)
      })
    })
  }

  function handlePointerDown(pointer: Phaser.Input.Pointer) {
    if (!modal) return

    const sliderZone = findContainingZone(sliderZones, pointer.x, pointer.y)
    if (sliderZone) {
      activeSlider = sliderZone
      sliderZone.setValue(pointer.x)
      return
    }

    findContainingZone(clickZones, pointer.x, pointer.y)?.onClick()
  }

  function handlePointerMove(pointer: Phaser.Input.Pointer) {
    if (!activeSlider || !pointer.isDown) return
    activeSlider.setValue(pointer.x)
  }

  function handlePointerUp() {
    activeSlider = null
  }

  applyMasterVolume(scene, settings.masterVolume)
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.game.events.off('settings:nickname-updated', handleNicknameUpdated)
    close()
  })

  return {
    isOpen: () => Boolean(modal),
    toggleButton,
    close,
  }
}

function getPanelSize(scene: Phaser.Scene, mode: 'settings' | 'outfits') {
  const maxW = mode === 'settings' ? 620 : 580
  const maxH = mode === 'settings' ? 580 : 520
  return {
    panelW: Math.min(maxW, scene.scale.width * 0.82),
    panelH: Math.min(maxH, scene.scale.height * 0.84),
  }
}

function createPanel(scene: Phaser.Scene, x: number, y: number, width: number, height: number) {
  const graphics = scene.add.graphics()
  graphics.fillStyle(COLORS.panelShadow, 0.24)
  graphics.fillRoundedRect(x - width / 2 + 6, y - height / 2 + 8, width, height, PANEL_RADIUS)
  graphics.fillStyle(COLORS.panel, 1)
  graphics.fillRoundedRect(x - width / 2, y - height / 2, width, height, PANEL_RADIUS)
  graphics.lineStyle(3, COLORS.panelBorder, 1)
  graphics.strokeRoundedRect(x - width / 2, y - height / 2, width, height, PANEL_RADIUS)
  return graphics
}

function createHeader(scene: Phaser.Scene, x: number, y: number, title: string) {
  const container = scene.add.container(0, 0)
  const titleText = scene.add
    .text(x, y, title, {
      fontFamily: FONT_FAMILY,
      fontSize: '28px',
      color: colorString(COLORS.title),
      fontStyle: 'bold',
    })
    .setOrigin(0.5)
  container.add(titleText)
  return container
}

function createSlider(
  scene: Phaser.Scene,
  {
    x,
    y,
    width,
    height,
    labelWidth,
    label,
    value,
    onChange,
  }: {
    x: number
    y: number
    width: number
    height: number
    labelWidth: number
    label: string
    value: number
    onChange: (value: number) => void
  },
) {
  const container = scene.add.container(0, 0)
  const bg = createRowBackground(scene, x, y, width, height)
  const labelText = scene.add
    .text(x + 22, y, label, {
      fontFamily: FONT_FAMILY,
      fontSize: '18px',
      color: colorString(COLORS.text),
      fontStyle: 'bold',
    })
    .setOrigin(0, 0.5)
  const trackX = x + labelWidth + 18
  const trackY = y
  const valueX = x + width - 24
  const sliderWidth = Math.max(120, valueX - trackX - 44)
  const track = scene.add
    .rectangle(trackX, trackY, sliderWidth, 8, COLORS.track, 1)
    .setOrigin(0, 0.5)
  const fill = scene.add
    .rectangle(trackX, trackY, sliderWidth * value, 8, COLORS.trackFill, 1)
    .setOrigin(0, 0.5)
  const knob = scene.add.circle(trackX + sliderWidth * value, trackY, 12, COLORS.warm)
  knob.setStrokeStyle(3, COLORS.warmDark, 1)
  const valueText = scene.add
    .text(valueX, trackY, `${Math.round(value * 100)}`, {
      fontFamily: FONT_FAMILY,
      fontSize: '16px',
      color: colorString(COLORS.mutedText),
      fontStyle: 'bold',
    })
    .setOrigin(1, 0.5)

  const setValue = (pointerX: number) => {
    const next = Phaser.Math.Clamp((pointerX - trackX) / sliderWidth, 0, 1)
    fill.width = sliderWidth * next
    knob.x = trackX + sliderWidth * next
    valueText.setText(`${Math.round(next * 100)}`)
    onChange(next)
  }

  container.add([bg, labelText, track, fill, knob, valueText])
  return {
    container,
    x: trackX + sliderWidth / 2,
    y: trackY,
    width: sliderWidth + 36,
    height: 38,
    setValue,
  }
}

function createBgmRow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  labelWidth: number,
  settings: ReturnType<typeof getGameSettings>,
) {
  const container = scene.add.container(0, 0)
  const switchW = Math.min(126, width - labelWidth - 48)
  const switchH = Math.min(38, height * 0.7)
  const switchX = x + width - switchW / 2 - 18
  const isEnabled = settings.bgmEnabled

  container.add(createRowBackground(scene, x, y, width, height))
  container.add(
    scene.add
      .text(x + 22, y, LABELS.bgm, {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        color: colorString(COLORS.text),
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5),
  )

  const switchBg = scene.add.graphics()
  switchBg.fillStyle(0x000000, 0.12)
  switchBg.fillRoundedRect(
    switchX - switchW / 2 + 3,
    y - switchH / 2 + 4,
    switchW,
    switchH,
    switchH / 2,
  )
  switchBg.fillStyle(isEnabled ? COLORS.warm : COLORS.disabled, 1)
  switchBg.fillRoundedRect(switchX - switchW / 2, y - switchH / 2, switchW, switchH, switchH / 2)
  switchBg.lineStyle(2, isEnabled ? COLORS.warmDark : COLORS.surfaceBorder, 1)
  switchBg.strokeRoundedRect(switchX - switchW / 2, y - switchH / 2, switchW, switchH, switchH / 2)

  const knobRadius = switchH / 2 - 5
  const knobX = switchX + (isEnabled ? switchW / 2 - switchH / 2 : -switchW / 2 + switchH / 2)
  const knob = scene.add.circle(knobX, y, knobRadius, 0xffffff, 1)
  knob.setStrokeStyle(2, isEnabled ? COLORS.warmDark : COLORS.surfaceBorder, 1)
  const stateText = scene.add
    .text(switchX + (isEnabled ? -18 : 18), y, isEnabled ? LABELS.on : LABELS.off, {
      fontFamily: FONT_FAMILY,
      fontSize: '14px',
      color: colorString(isEnabled ? COLORS.text : COLORS.disabledText),
      fontStyle: 'bold',
    })
    .setOrigin(0.5)

  container.add([switchBg, knob, stateText])
  return container
}

function createSpeedRow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  labelWidth: number,
  settings: ReturnType<typeof getGameSettings>,
) {
  const container = scene.add.container(0, 0)
  container.add(createRowBackground(scene, x, y, width, height))
  container.add(
    scene.add
      .text(x + 22, y, LABELS.speed, {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        color: colorString(COLORS.text),
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5),
  )

  const values: MoveSpeedMultiplier[] = [1, 1.5, 2]
  const gap = 10
  const controlLeft = x + labelWidth + 18
  const controlW = width - labelWidth - 36
  const buttonW = (controlW - gap * 2) / 3
  const buttonH = Math.min(40, height * 0.72)
  const startX = controlLeft + buttonW / 2

  values.forEach((value, index) => {
    const selected = settings.moveSpeedMultiplier === value
    container.add(
      createTextButton(scene, startX + index * (buttonW + gap), y, buttonW, buttonH, `${value}x`, {
        fillColor: selected ? COLORS.controlActive : COLORS.control,
        borderColor: selected ? COLORS.controlActiveBorder : COLORS.controlBorder,
        textColor: selected ? 0xffffff : COLORS.accentDark,
        fontSize: 16,
      }),
    )
  })

  return container
}

function createNicknameRow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  labelWidth: number,
  nickname: string | null,
) {
  const container = scene.add.container(0, 0)
  const buttonW = 104
  const buttonH = 40
  container.add(createRowBackground(scene, x, y, width, height))
  container.add(
    scene.add
      .text(x + 22, y, LABELS.nickname, {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        color: colorString(COLORS.text),
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5),
  )
  const valueLeft = x + labelWidth + 18
  const valueRight = x + width - buttonW - 28
  const valueWidth = Math.max(40, valueRight - valueLeft)
  const displayValue = nickname ?? LABELS.nicknameEmpty
  container.add(
    scene.add
      .text(valueLeft, y, displayValue, {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        color: colorString(nickname ? COLORS.accentDark : COLORS.mutedText),
        fontStyle: 'bold',
        fixedWidth: valueWidth,
      })
      .setOrigin(0, 0.5),
  )
  container.add(
    createTextButton(scene, x + width - buttonW / 2 - 16, y, buttonW, buttonH, LABELS.change, {
      fillColor: COLORS.primary,
      borderColor: COLORS.primaryBorder,
      textColor: 0xffffff,
      fontSize: 16,
    }),
  )
  return container
}

function createOutfitRow(scene: Phaser.Scene, x: number, y: number, width: number, height: number) {
  const container = scene.add.container(0, 0)
  const buttonW = 104
  const buttonH = 40
  container.add(createRowBackground(scene, x, y, width, height))
  container.add(
    scene.add
      .text(x + 22, y, LABELS.profileOutfit, {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        color: colorString(COLORS.text),
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5),
  )
  container.add(
    createTextButton(scene, x + width - buttonW / 2 - 16, y, buttonW, buttonH, LABELS.change, {
      fillColor: COLORS.primary,
      borderColor: COLORS.primaryBorder,
      textColor: 0xffffff,
      fontSize: 16,
    }),
  )
  return container
}

function createCharacterSwitch(
  scene: Phaser.Scene,
  x: number,
  y: number,
  panelW: number,
  selectedCharacterId: PlayerCharacterId,
) {
  const container = scene.add.container(0, 0)
  const { switchW, buttonW, gap } = getCharacterSwitchLayout(panelW)
  const buttonH = 38

  PLAYER_CHARACTERS.forEach((character, index) => {
    const selected = character.id === selectedCharacterId
    const buttonX = x - switchW / 2 + buttonW / 2 + index * (buttonW + gap)
    container.add(
      createTextButton(scene, buttonX, y, buttonW, buttonH, character.label, {
        fillColor: selected ? COLORS.controlActive : COLORS.control,
        borderColor: selected ? COLORS.controlActiveBorder : COLORS.controlBorder,
        textColor: selected ? 0xffffff : COLORS.accentDark,
        fontSize: 16,
      }),
    )
  })

  return container
}

function createCarouselPreview(
  scene: Phaser.Scene,
  x: number,
  y: number,
  outfitId: PlayerOutfitId,
) {
  const textureKey = getPlayerOutfitTextureKey(outfitId)
  const container = scene.add.container(x, y)

  if (scene.textures.exists(textureKey)) {
    const sprite = scene.add.image(0, 4, textureKey, 0)
    sprite.setDisplaySize(220, 220)
    container.add(sprite)
  }

  return container
}

function createCarouselDots(
  scene: Phaser.Scene,
  x: number,
  y: number,
  activeIndex: number,
  count: number,
) {
  const container = scene.add.container(0, 0)
  const gap = 13
  const startX = x - ((count - 1) * gap) / 2

  Array.from({ length: count }).forEach((_, index) => {
    const active = index === activeIndex
    container.add(
      scene.add.circle(
        startX + index * gap,
        y,
        active ? 4 : 3,
        active ? COLORS.accent : COLORS.track,
      ),
    )
  })

  return container
}

function createRowBackground(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const bg = scene.add.graphics()
  bg.fillStyle(COLORS.surface, 0.98)
  bg.fillRoundedRect(x, y - height / 2, width, height, PANEL_RADIUS)
  bg.lineStyle(2, COLORS.surfaceBorder, 1)
  bg.strokeRoundedRect(x, y - height / 2, width, height, PANEL_RADIUS)
  return bg
}

function createTextButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  {
    fillColor,
    borderColor,
    textColor,
    fontSize = 17,
  }: {
    fillColor: number
    borderColor: number
    textColor: number
    fontSize?: number
  },
) {
  const container = scene.add.container(x, y)
  const bg = scene.add.graphics()
  const radius = Math.min(9, height / 3)
  bg.fillStyle(0x000000, 0.08)
  bg.fillRoundedRect(-width / 2 + 2, -height / 2 + 3, width, height, radius)
  bg.fillStyle(fillColor, 1)
  bg.fillRoundedRect(-width / 2, -height / 2, width, height, radius)
  bg.lineStyle(1.5, borderColor, 1)
  bg.strokeRoundedRect(-width / 2, -height / 2, width, height, radius)
  bg.lineStyle(1, 0xffffff, 0.18)
  bg.strokeRoundedRect(
    -width / 2 + 2,
    -height / 2 + 2,
    width - 4,
    height - 4,
    Math.max(2, radius - 2),
  )
  const text = scene.add
    .text(0, 0, label, {
      fontFamily: FONT_FAMILY,
      fontSize: `${fontSize}px`,
      color: colorString(textColor),
      fontStyle: 'bold',
    })
    .setOrigin(0.5)
  container.add([bg, text])
  return container
}

function findContainingZone<T extends { x: number; y: number; width: number; height: number }>(
  zones: T[],
  x: number,
  y: number,
) {
  for (let index = zones.length - 1; index >= 0; index -= 1) {
    const zone = zones[index]
    if (isPointInZone(x, y, zone)) return zone
  }
  return null
}

function isPointInZone(
  x: number,
  y: number,
  zone: { x: number; y: number; width: number; height: number },
) {
  return (
    x >= zone.x - zone.width / 2 &&
    x <= zone.x + zone.width / 2 &&
    y >= zone.y - zone.height / 2 &&
    y <= zone.y + zone.height / 2
  )
}

function getCharacterSwitchLayout(panelW: number) {
  const switchW = Math.min(220, panelW * 0.44)
  const gap = 12
  return {
    switchW,
    gap,
    buttonW: (switchW - gap * (PLAYER_CHARACTERS.length - 1)) / PLAYER_CHARACTERS.length,
  }
}

function getOutfitIndex(characterId: PlayerCharacterId, outfitId: PlayerOutfitId) {
  const index = getPlayerOutfits(characterId).findIndex(outfit => outfit.id === outfitId)
  return index >= 0 ? index : 0
}

function wrapOutfitIndex(index: number, outfits: Array<{ id: PlayerOutfitId }>) {
  const count = outfits.length
  return ((index % count) + count) % count
}

function applyMasterVolume(scene: Phaser.Scene, value: number) {
  scene.sound.volume = Phaser.Math.Clamp(value, 0, 1)
  syncSceneBgmVolume()
}

function colorString(color: number) {
  return `#${color.toString(16).padStart(6, '0')}`
}
