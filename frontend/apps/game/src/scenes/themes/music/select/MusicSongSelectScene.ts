import Phaser from 'phaser'
import { playSceneBgm } from '@/game/systems/sceneBgm'
import { getMyBestMusicResults, type MusicBestResult } from '@wish/api-client'
import { assetPath } from '@/game/assets/assetPath'
import { fadeToScene } from '@/game/systems/sceneTransition'
import { addCoverBackground } from '@/game/world/background'
import { ALL_RHYTHM_CHARTS, type RhythmChart } from '../play/rhythmCharts'
import { MusicRankingOverlay } from './MusicRankingOverlay'

const FONT_FAMILY = '"Pretendard", "Inter", "Noto Sans KR", "Malgun Gothic", sans-serif'

type SongMeta = {
  chart: RhythmChart
  coverKey: string
  coverPath: string
  accent: number
  tag: string
  coverOffsetY?: number // vertical nudge to reframe the cover crop
}

type SongCardView = {
  meta: SongMeta
  container: Phaser.GameObjects.Container
  panel: Phaser.GameObjects.Graphics
  glow: Phaser.GameObjects.Graphics
  rankBtn: Phaser.GameObjects.Graphics
  rankLabel: Phaser.GameObjects.Text
  index: number
  width: number
  height: number
  bestResult?: MusicBestResult
}

const SONG_META: SongMeta[] = [
  {
    chart: ALL_RHYTHM_CHARTS[0], // 아기상어
    coverKey: 'song-cover-baby-shark',
    coverPath: 'images/themes/music/ui/babyshark_thum.png',
    accent: 0x65d8ff,
    tag: '동요 · POP',
    coverOffsetY: -20, // shift up slightly so fish characters sit in upper area
  },
  {
    chart: ALL_RHYTHM_CHARTS[1], // 작은별
    coverKey: 'song-cover-twinkle',
    coverPath: 'images/themes/music/ui/littlestart_thum.png',
    accent: 0xc8b6ff,
    tag: '클래식 · 입문',
    coverOffsetY: -30, // pull up so the star character is more centered in card
  },
  {
    chart: ALL_RHYTHM_CHARTS[2], // 캐논
    coverKey: 'song-cover-canon',
    coverPath: 'images/themes/music/ui/canon_thum.png',
    accent: 0xffb86b,
    tag: '클래식 · 챌린지',
    coverOffsetY: -20,
  },
]

const YOUTUBE_CARD_INDEX = SONG_META.length // 3 — always the last card

export class MusicSongSelectScene extends Phaser.Scene {
  private cards: SongCardView[] = []
  private selectedIndex = 0
  private hoveredIndex: number | null = null
  private isLeaving = false

  constructor() {
    super({ key: 'MusicSongSelectScene' })
  }

  preload() {
    this.load.image('music-background', assetPath('images/themes/music/background/background.png'))
    SONG_META.forEach(meta => {
      this.load.image(meta.coverKey, assetPath(meta.coverPath))
    })
  }

  create() {
    playSceneBgm(this)
    this.cards = []
    this.selectedIndex = 0
    this.hoveredIndex = null
    this.isLeaving = false

    const { width: vw, height: vh } = this.scale
    addCoverBackground(this, 'music-background')
    this.createBackdrop(vw, vh)

    this.createHeader(vw, vh)
    this.createCards(vw, vh)
    this.createBackButton(vw, vh)
    this.createHint(vw, vh)
    this.bindInput()

    this.refreshCardStates()
    this.cameras.main.fadeIn(220, 0, 0, 0)

    this.fetchBestResults()
  }

  private fetchBestResults() {
    getMyBestMusicResults()
      .then(({ data }) => {
        const byChartId = new Map(data.map(result => [result.chartId, result]))
        this.cards.forEach(card => {
          card.bestResult = byChartId.get(card.meta.chart.id)
        })
      })
      .catch(error => {
        console.warn('[MusicSongSelectScene] failed to fetch best results', error)
      })
  }

  private createBackdrop(vw: number, vh: number) {
    // strong dim — let cards take all focus
    this.add.rectangle(vw / 2, vh / 2, vw, vh, 0x050507, 0.72).setDepth(1)

    // subtle bottom vignette for depth
    const scrim = this.add.graphics().setDepth(2)
    for (let i = 0; i < 14; i++) {
      scrim.fillStyle(0x000000, 0.018)
      scrim.fillRect(0, vh - (i + 1) * (vh / 14), vw, vh / 14)
    }
  }

  // ─────────────── header / footer ───────────────

  private createHeader(vw: number, vh: number) {
    this.add
      .text(vw / 2, vh * 0.085, '곡 선택', {
        fontFamily: FONT_FAMILY,
        fontSize: `${Phaser.Math.Clamp(vh * 0.047, 30, 46)}px`,
        fontStyle: 'bold',
        color: '#fffaf2',
        stroke: '#0b0b0c',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setShadow(0, 3, '#000000', 10, false, true)

    const ulW = Math.min(vw * 0.075, 86)
    const underline = this.add.graphics().setDepth(20)
    underline.fillStyle(0x65d8ff, 0.9)
    underline.fillRoundedRect(vw / 2 - ulW / 2, vh * 0.128, ulW, 2, 2)

    this.add
      .text(vw / 2, vh * 0.16, '플레이할 곡을 골라주세요', {
        fontFamily: FONT_FAMILY,
        fontSize: `${Phaser.Math.Clamp(vh * 0.02, 13, 17)}px`,
        fontStyle: 'bold',
        color: '#c9ced8',
        stroke: '#050506',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(20)
  }

  private createBackButton(vw: number, vh: number) {
    const btnW = Math.min(vw * 0.12, 140)
    const btnH = Math.min(vh * 0.055, 44)
    const x = vw * 0.04 + btnW / 2
    const y = vh * 0.93 - btnH / 2

    const container = this.add.container(x, y).setDepth(30)
    const bg = this.add.graphics()
    const draw = (hovered: boolean) => {
      bg.clear()
      bg.fillStyle(0x111114, hovered ? 0.88 : 0.66)
      bg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, btnH / 2)
      bg.lineStyle(1.5, hovered ? 0x65d8ff : 0xffffff, hovered ? 0.9 : 0.16)
      bg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, btnH / 2)
    }
    draw(false)

    const label = this.add
      .text(0, 0, '← 돌아가기', {
        fontFamily: FONT_FAMILY,
        fontSize: `${Phaser.Math.Clamp(vh * 0.022, 14, 18)}px`,
        fontStyle: 'bold',
        color: '#eef1f6',
        stroke: '#050506',
        strokeThickness: 2,
      })
      .setOrigin(0.5)

    const zone = this.add.zone(0, 0, btnW, btnH).setInteractive({ cursor: 'pointer' })
    zone.on('pointerover', () => draw(true))
    zone.on('pointerout', () => draw(false))
    zone.on('pointerdown', () => this.returnToHub())

    container.add([bg, label, zone])
  }

  private createHint(vw: number, vh: number) {
    this.add
      .text(vw / 2, vh * 0.95, '← →  곡 선택   ENTER  플레이   ESC  돌아가기', {
        fontFamily: FONT_FAMILY,
        fontSize: `${Phaser.Math.Clamp(vh * 0.018, 12, 15)}px`,
        fontStyle: 'bold',
        color: '#bfc3cc',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(30)
  }

  // ─────────────── cards ───────────────

  private createCards(vw: number, vh: number) {
    const count = SONG_META.length + 1 // +1 for YouTube card
    // slightly narrower cards to fit 4 in a row
    const cardW = Phaser.Math.Clamp(vw * 0.175, 190, 255)
    const cardH = Phaser.Math.Clamp(vh * 0.55, 340, 440)
    const gap = Phaser.Math.Clamp(vw * 0.016, 14, 26)
    const totalW = count * cardW + (count - 1) * gap
    const startX = vw * 0.5 - totalW / 2 + cardW / 2
    const centerY = vh * 0.55

    SONG_META.forEach((meta, index) => {
      const x = startX + index * (cardW + gap)
      this.cards.push(this.buildCard(meta, x, centerY, cardW, cardH, index))
    })

    // YouTube search card
    const ytX = startX + YOUTUBE_CARD_INDEX * (cardW + gap)
    this.buildYouTubeCard(ytX, centerY, cardW, cardH)
  }

  private buildCard(
    meta: SongMeta,
    x: number,
    y: number,
    w: number,
    h: number,
    index: number,
  ): SongCardView {
    const container = this.add.container(x, y).setDepth(24).setSize(w, h)

    const glow = this.add.graphics()
    container.add(glow)

    const panel = this.add.graphics()
    container.add(panel)

    // ── cover fills the ENTIRE card ──
    const cover = this.add.image(0, meta.coverOffsetY ?? 0, meta.coverKey)
    const src = cover.texture.getSourceImage() as HTMLImageElement
    const scale = Math.max(w / src.width, h / src.height)
    cover.setScale(scale)

    const maskShape = this.make.graphics({ x: 0, y: 0 }, false)
    maskShape.fillStyle(0xffffff)
    maskShape.fillRoundedRect(x - w / 2, y - h / 2, w, h, 16)
    cover.setMask(maskShape.createGeometryMask())
    container.add(cover)

    // dark gradient at bottom for text legibility
    const fade = this.add.graphics()
    const fadeH = Math.round(h * 0.5)
    for (let i = 0; i < 12; i++) {
      const t = i / 11
      fade.fillStyle(0x000000, 0.06)
      const stripH = fadeH * (1 - t * 0.85)
      fade.fillRect(-w / 2, h / 2 - stripH, w, stripH)
    }
    fade.setMask(maskShape.createGeometryMask())
    container.add(fade)

    // tag pill — minimal, dark glass
    const tagPad = 9
    const tagText = this.add
      .text(0, 0, meta.tag, {
        fontFamily: FONT_FAMILY,
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#f0f3f8',
      })
      .setLetterSpacing(0.5)
    const tagW = tagText.width + tagPad * 2
    const tagH = 20
    const tagX = -w / 2 + tagW / 2 + 18
    const tagY = -h / 2 + tagH / 2 + 18
    const tagBg = this.add.graphics()
    tagBg.fillStyle(0x000000, 0.52)
    tagBg.fillRoundedRect(tagX - tagW / 2, tagY - tagH / 2, tagW, tagH, tagH / 2)
    tagText.setPosition(tagX, tagY).setOrigin(0.5)
    container.add([tagBg, tagText])

    // ── title + meta overlaid on bottom of cover (inset from edges) ──
    const textPadX = 24
    const titleY = h / 2 - 62

    const title = this.add
      .text(-w / 2 + textPadX, titleY, meta.chart.title, {
        fontFamily: FONT_FAMILY,
        fontSize: `${Math.round(Phaser.Math.Clamp(h * 0.062, 22, 28))}px`,
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0, 0)
      .setShadow(0, 2, '#000000', 6, false, true)

    const noteCountText = `${meta.chart.notes.length}`
    const durationStr = formatDuration(meta.chart.durationMs)
    const meta1 = this.add
      .text(-w / 2 + textPadX, h / 2 - 28, `${durationStr}  ·  노트 ${noteCountText}`, {
        fontFamily: FONT_FAMILY,
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#c5cad4',
      })
      .setOrigin(0, 0)
      .setShadow(0, 1, '#000000', 4, false, true)

    container.add([title, meta1])

    // ── ranking pill (top-right "🏆 랭킹보기", lights up on hover) ──
    const rankPadX = 11
    const rankH = 28
    const rankBtn = this.add.graphics()
    const rankLabel = this.add
      .text(0, 0, '랭킹보기', {
        fontFamily: FONT_FAMILY,
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5)
    const rankW = Math.ceil(rankLabel.width) + rankPadX * 2
    const rankX = w / 2 - rankW / 2 - 16
    const rankY = -h / 2 + rankH / 2 + 16
    rankLabel.setPosition(rankX, rankY)
    container.add([rankBtn, rankLabel])

    container.setData('rankX', rankX)
    container.setData('rankY', rankY)
    container.setData('rankW', rankW)
    container.setData('rankH', rankH)

    // ── card-wide click zone (play) ──
    const zone = this.add.zone(0, 0, w, h).setInteractive({ cursor: 'pointer' })
    zone.on('pointerover', () => {
      this.hoveredIndex = index
      this.refreshCardStates()
    })
    zone.on('pointerout', () => {
      if (this.hoveredIndex === index) {
        this.hoveredIndex = null
        this.refreshCardStates()
      }
    })
    zone.on('pointerdown', () => {
      this.selectedIndex = index
      this.refreshCardStates()
      this.startSelectedSong()
    })
    container.add(zone)

    // ── ranking button click zone (stop propagation so card play doesn't fire) ──
    const rankZone = this.add
      .zone(rankX, rankY, rankW + 12, rankH + 12)
      .setInteractive({ cursor: 'pointer' })
    rankZone.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        this.openRanking(meta.chart.id, meta.chart.title, meta.accent)
      },
    )
    container.add(rankZone)

    return { meta, container, panel, glow, rankBtn, rankLabel, index, width: w, height: h }
  }

  private openRanking(chartId: string, chartTitle: string, accent: number) {
    new MusicRankingOverlay(this, chartId, chartTitle, accent).open()
  }

  private refreshCardStates() {
    this.cards.forEach((card, i) => {
      const isSelected = i === this.selectedIndex
      const isHovered = i === this.hoveredIndex
      this.drawPanel(card, isSelected, isHovered)
    })
    // YouTube card glow is handled via its own container data
    this.refreshYouTubeCardState()
  }

  private drawPanel(card: SongCardView, isSelected: boolean, isHovered: boolean) {
    const { panel, glow, rankBtn, rankLabel, width: w, height: h, meta } = card
    const active = isSelected || isHovered

    glow.clear()
    panel.clear()
    rankBtn.clear()

    // soft drop shadow under card
    panel.fillStyle(0x000000, 0.45)
    panel.fillRoundedRect(-w / 2 + 2, -h / 2 + 10, w, h, 16)

    // selected/hover glow — wider radius so selection is clear without scaling
    if (active) {
      const steps = 14
      const reach = isSelected ? 36 : 22
      const perStepAlpha = isSelected ? 0.022 : 0.014
      for (let g = 0; g < steps; g++) {
        glow.fillStyle(meta.accent, perStepAlpha)
        const inset = (g / steps) * reach
        glow.fillRoundedRect(
          -w / 2 - reach + inset,
          -h / 2 - reach + inset,
          w + reach * 2 - inset * 2,
          h + reach * 2 - inset * 2,
          22,
        )
      }
    }

    // single accent border (only when active)
    if (active) {
      panel.lineStyle(isSelected ? 2.2 : 1.5, meta.accent, isSelected ? 1 : 0.7)
      panel.strokeRoundedRect(-w / 2, -h / 2, w, h, 16)
    } else {
      panel.lineStyle(1, 0xffffff, 0.08)
      panel.strokeRoundedRect(-w / 2, -h / 2, w, h, 16)
    }

    // ── ranking pill ──
    const pX = card.container.getData('rankX') as number
    const pY = card.container.getData('rankY') as number
    const pW = card.container.getData('rankW') as number
    const pH = card.container.getData('rankH') as number
    const radius = pH / 2

    if (active) {
      rankBtn.fillStyle(meta.accent, 0.95)
      rankBtn.fillRoundedRect(pX - pW / 2, pY - pH / 2, pW, pH, radius)
      rankLabel.setColor('#0a0a0c').setAlpha(1)
    } else {
      rankBtn.fillStyle(0x000000, 0.6)
      rankBtn.fillRoundedRect(pX - pW / 2, pY - pH / 2, pW, pH, radius)
      rankBtn.lineStyle(1, 0xffffff, 0.22)
      rankBtn.strokeRoundedRect(pX - pW / 2, pY - pH / 2, pW, pH, radius)
      rankLabel.setColor('#ffffff').setAlpha(0.95)
    }
  }

  // ─────────────── input ───────────────

  private bindInput() {
    const keyboard = this.input.keyboard
    if (!keyboard) return

    keyboard.on('keydown-LEFT', () => this.moveSelection(-1))
    keyboard.on('keydown-RIGHT', () => this.moveSelection(1))
    keyboard.on('keydown-A', () => this.moveSelection(-1))
    keyboard.on('keydown-D', () => this.moveSelection(1))
    keyboard.on('keydown-ENTER', () => this.startSelectedSong())
    keyboard.on('keydown-SPACE', () => this.startSelectedSong())
    keyboard.on('keydown-ESC', () => this.returnToHub())
  }

  private moveSelection(delta: number) {
    const total = SONG_META.length + 1 // include YouTube card
    const next = (this.selectedIndex + delta + total) % total
    if (next === this.selectedIndex) return
    this.selectedIndex = next
    this.refreshCardStates()
  }

  private startSelectedSong() {
    if (this.isLeaving) return
    this.isLeaving = true

    if (this.selectedIndex === YOUTUBE_CARD_INDEX) {
      fadeToScene(this, 'YouTubeSearchScene', { duration: 220 })
      return
    }

    const card = this.cards[this.selectedIndex]
    if (!card) return
    fadeToScene(this, 'MusicRhythmScene', {
      duration: 220,
      data: { chartId: card.meta.chart.id },
    })
  }

  // ─────────────── YouTube card ───────────────

  private ytCardContainer: Phaser.GameObjects.Container | null = null
  private ytCardGlow: Phaser.GameObjects.Graphics | null = null
  private ytCardPanel: Phaser.GameObjects.Graphics | null = null

  private buildYouTubeCard(x: number, y: number, w: number, h: number) {
    const container = this.add.container(x, y).setDepth(24).setSize(w, h)

    const glow = this.add.graphics()
    const panel = this.add.graphics()
    container.add([glow, panel])

    // ── full-card dark gradient background with rounded mask ──
    const bgMask = this.make.graphics({ x: 0, y: 0 }, false)
    bgMask.fillStyle(0xffffff)
    bgMask.fillRoundedRect(x - w / 2, y - h / 2, w, h, 16)
    const maskGeom = bgMask.createGeometryMask()

    const bg = this.add.graphics()
    const bgSteps = 24
    for (let i = 0; i < bgSteps; i++) {
      const t = i / (bgSteps - 1)
      const r = Math.round(0x22 + (0x08 - 0x22) * t)
      const g = Math.round(0x06 + (0x02 - 0x06) * t)
      const b = Math.round(0x06 + (0x02 - 0x06) * t)
      bg.fillStyle((r << 16) | (g << 8) | b, 1)
      const stripH = h / bgSteps + 1
      bg.fillRect(-w / 2, -h / 2 + (h / bgSteps) * i, w, stripH)
    }
    bg.setMask(maskGeom)
    container.add(bg)

    // ── YouTube play button — centered in upper portion ──
    const logoCenterY = -h * 0.05
    const redW = Math.round(w * 0.6)
    const redH = Math.round(redW * 0.7)
    const logoBg = this.add.graphics()
    logoBg.fillStyle(0xff0000, 1)
    logoBg.fillRoundedRect(-redW / 2, logoCenterY - redH / 2, redW, redH, 14)
    container.add(logoBg)

    const playIcon = this.add
      .text(0, logoCenterY, '▶', {
        fontFamily: FONT_FAMILY,
        fontSize: `${Math.round(redH * 0.55)}px`,
        color: '#ffffff',
      })
      .setOrigin(0.5)
    container.add(playIcon)

    // ── dark fade at bottom for text legibility ──
    const fade = this.add.graphics()
    const fadeH = Math.round(h * 0.45)
    for (let i = 0; i < 12; i++) {
      const t = i / 11
      fade.fillStyle(0x000000, 0.06)
      const stripH = fadeH * (1 - t * 0.85)
      fade.fillRect(-w / 2, h / 2 - stripH, w, stripH)
    }
    fade.setMask(maskGeom)
    container.add(fade)

    // Tag pill
    const tagText = this.add
      .text(0, 0, 'YouTube', {
        fontFamily: FONT_FAMILY,
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#f0f3f8',
      })
      .setLetterSpacing(0.5)
    const tagPad = 9
    const tagW = tagText.width + tagPad * 2
    const tagH = 20
    const tagX = -w / 2 + tagW / 2 + 18
    const tagY = -h / 2 + tagH / 2 + 18
    const tagBg = this.add.graphics()
    tagBg.fillStyle(0xff0000, 0.7)
    tagBg.fillRoundedRect(tagX - tagW / 2, tagY - tagH / 2, tagW, tagH, tagH / 2)
    tagText.setPosition(tagX, tagY).setOrigin(0.5)
    container.add([tagBg, tagText])

    // Title text at bottom
    const titleY = h / 2 - 62
    const title = this.add
      .text(0, titleY, '유튜브로 찾기', {
        fontFamily: FONT_FAMILY,
        fontSize: `${Math.round(Phaser.Math.Clamp(h * 0.056, 18, 23))}px`,
        fontStyle: 'bold',
        color: '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5, 0)
      .setShadow(0, 2, '#000000', 6, false, true)

    const sub = this.add
      .text(0, h / 2 - 28, '원하는 노래를 검색하세요', {
        fontFamily: FONT_FAMILY,
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#c5cad4',
        align: 'center',
      })
      .setOrigin(0.5, 0)
      .setShadow(0, 1, '#000000', 4, false, true)

    container.add([title, sub])

    // Interaction zone
    const zone = this.add.zone(0, 0, w, h).setInteractive({ cursor: 'pointer' })
    zone.on('pointerover', () => {
      this.hoveredIndex = YOUTUBE_CARD_INDEX
      this.refreshCardStates()
    })
    zone.on('pointerout', () => {
      if (this.hoveredIndex === YOUTUBE_CARD_INDEX) {
        this.hoveredIndex = null
        this.refreshCardStates()
      }
    })
    zone.on('pointerdown', () => {
      this.selectedIndex = YOUTUBE_CARD_INDEX
      this.refreshCardStates()
      this.startSelectedSong()
    })
    container.add(zone)

    this.ytCardContainer = container
    this.ytCardGlow = glow
    this.ytCardPanel = panel

    this.refreshYouTubeCardState()
  }

  private refreshYouTubeCardState() {
    const glow = this.ytCardGlow
    const panel = this.ytCardPanel
    const container = this.ytCardContainer
    if (!glow || !panel || !container) return

    const w = container.width
    const h = container.height
    const isSelected = this.selectedIndex === YOUTUBE_CARD_INDEX
    const isHovered = this.hoveredIndex === YOUTUBE_CARD_INDEX
    const active = isSelected || isHovered
    const accent = 0xff4444

    glow.clear()
    panel.clear()

    // shadow
    panel.fillStyle(0x000000, 0.45)
    panel.fillRoundedRect(-w / 2 + 2, -h / 2 + 10, w, h, 16)

    if (active) {
      const steps = 14
      const reach = isSelected ? 36 : 22
      const perStepAlpha = isSelected ? 0.022 : 0.014
      for (let g = 0; g < steps; g++) {
        glow.fillStyle(accent, perStepAlpha)
        const inset = (g / steps) * reach
        glow.fillRoundedRect(
          -w / 2 - reach + inset,
          -h / 2 - reach + inset,
          w + reach * 2 - inset * 2,
          h + reach * 2 - inset * 2,
          22,
        )
      }
      panel.lineStyle(isSelected ? 2.2 : 1.5, accent, isSelected ? 1 : 0.7)
      panel.strokeRoundedRect(-w / 2, -h / 2, w, h, 16)
    } else {
      panel.lineStyle(1, 0xffffff, 0.08)
      panel.strokeRoundedRect(-w / 2, -h / 2, w, h, 16)
    }
  }

  // ─────────────────────────────────────────────

  private returnToHub() {
    if (this.isLeaving) return
    this.isLeaving = true
    fadeToScene(this, 'MusicSelectScene', { duration: 220 })
  }
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
