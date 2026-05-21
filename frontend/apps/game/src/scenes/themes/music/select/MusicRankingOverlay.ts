import Phaser from 'phaser'
import { getChartRanking, type MusicChartRanking, type MusicRankingEntry } from '@wish/api-client'

const FONT_FAMILY = '"Pretendard", "Inter", "Noto Sans KR", "Malgun Gothic", sans-serif'

const RANK_MEDAL: Record<number, string> = {
  1: '🥇',
  2: '🥈',
  3: '🥉',
}

/**
 * 곡 카드 우상단 🏆 버튼에서 띄우는 랭킹 모달.
 * scrim + 중앙 패널로 구성. ESC / 바깥 클릭 / 닫기 버튼으로 닫힘.
 */
export class MusicRankingOverlay {
  private readonly scene: Phaser.Scene
  private readonly chartId: string
  private readonly chartTitle: string
  private readonly accent: number

  private scrim?: Phaser.GameObjects.Rectangle
  private panelContainer?: Phaser.GameObjects.Container
  private bodyContainer?: Phaser.GameObjects.Container
  private escHandler?: () => void
  private isClosing = false

  private panelW = 0
  private bodyTop = 0
  private bodyHeight = 0

  constructor(scene: Phaser.Scene, chartId: string, chartTitle: string, accent: number) {
    this.scene = scene
    this.chartId = chartId
    this.chartTitle = chartTitle
    this.accent = accent
  }

  open() {
    const { width: vw, height: vh } = this.scene.scale

    // ── scrim ──
    const scrim = this.scene.add
      .rectangle(vw / 2, vh / 2, vw, vh, 0x05060a, 0.78)
      .setDepth(100)
      .setInteractive()
    scrim.on('pointerdown', () => this.close())
    this.scrim = scrim

    // ── panel sizing ──
    const panelW = Phaser.Math.Clamp(vw * 0.42, 460, 540)
    const panelH = Phaser.Math.Clamp(vh * 0.78, 480, 640)
    this.panelW = panelW

    const panelContainer = this.scene.add.container(vw / 2, vh / 2).setDepth(101)
    this.panelContainer = panelContainer

    // panel background — dark glass
    const panelBg = this.scene.add.graphics()
    panelBg.fillStyle(0x0d0e12, 0.96)
    panelBg.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 22)
    panelBg.lineStyle(1, 0xffffff, 0.08)
    panelBg.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 22)
    panelContainer.add(panelBg)

    // block clicks inside panel from passing to scrim
    const panelHit = this.scene.add.zone(0, 0, panelW, panelH).setInteractive({ cursor: 'default' })
    panelHit.on(
      'pointerdown',
      (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation()
      },
    )
    panelContainer.add(panelHit)

    // header
    const trophy = this.scene.add
      .text(-panelW / 2 + 28, -panelH / 2 + 38, '🏆', {
        fontFamily: FONT_FAMILY,
        fontSize: '26px',
      })
      .setOrigin(0, 0.5)
    const title = this.scene.add
      .text(-panelW / 2 + 66, -panelH / 2 + 38, this.chartTitle, {
        fontFamily: FONT_FAMILY,
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0, 0.5)
    const subtitle = this.scene.add
      .text(-panelW / 2 + 66, -panelH / 2 + 64, '랭킹', {
        fontFamily: FONT_FAMILY,
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#9aa3b2',
      })
      .setOrigin(0, 0.5)
      .setLetterSpacing(1.5)
    panelContainer.add([trophy, title, subtitle])

    // close button
    const closeBtn = this.scene.add
      .text(panelW / 2 - 22, -panelH / 2 + 22, '✕', {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        color: '#c5cad4',
      })
      .setOrigin(0.5)
      .setInteractive({ cursor: 'pointer' })
    closeBtn.on('pointerover', () => closeBtn.setColor('#ffffff'))
    closeBtn.on('pointerout', () => closeBtn.setColor('#c5cad4'))
    closeBtn.on(
      'pointerdown',
      (_p: unknown, _x: unknown, _y: unknown, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation()
        this.close()
      },
    )
    panelContainer.add(closeBtn)

    // body container (where list + me-row goes)
    this.bodyTop = -panelH / 2 + 92
    this.bodyHeight = panelH - 92 - 16
    const bodyContainer = this.scene.add.container(0, 0)
    panelContainer.add(bodyContainer)
    this.bodyContainer = bodyContainer

    // enter animation
    panelContainer.setScale(0.92).setAlpha(0)
    this.scene.tweens.add({
      targets: panelContainer,
      scale: 1,
      alpha: 1,
      duration: 180,
      ease: 'Cubic.easeOut',
    })

    // ESC to close
    const keyboard = this.scene.input.keyboard
    if (keyboard) {
      const handler = () => this.close()
      keyboard.on('keydown-ESC', handler)
      this.escHandler = handler
    }

    // loading state, then fetch
    this.renderLoading()
    this.fetchAndRender()
  }

  private renderLoading() {
    const body = this.bodyContainer
    if (!body) return
    body.removeAll(true)
    const loading = this.scene.add
      .text(0, this.bodyTop + this.bodyHeight / 2, '랭킹을 불러오는 중…', {
        fontFamily: FONT_FAMILY,
        fontSize: '14px',
        color: '#9aa3b2',
      })
      .setOrigin(0.5)
    body.add(loading)
  }

  private fetchAndRender() {
    getChartRanking(this.chartId, 10)
      .then(({ data }) => {
        if (!this.panelContainer || this.isClosing) return
        this.renderRanking(data)
      })
      .catch(error => {
        console.warn('[MusicRankingOverlay] failed to load ranking', error)
        if (!this.panelContainer || this.isClosing) return
        this.renderError()
      })
  }

  private renderError() {
    const body = this.bodyContainer
    if (!body) return
    body.removeAll(true)
    const msg = this.scene.add
      .text(
        0,
        this.bodyTop + this.bodyHeight / 2,
        '랭킹을 불러오지 못했어요.\n잠시 후 다시 시도해주세요.',
        {
          fontFamily: FONT_FAMILY,
          fontSize: '13px',
          color: '#c5cad4',
          align: 'center',
        },
      )
      .setOrigin(0.5)
    body.add(msg)
  }

  private renderRanking(data: MusicChartRanking) {
    const body = this.bodyContainer
    if (!body) return
    body.removeAll(true)

    const panelW = this.panelW
    const listX = -panelW / 2 + 24
    const listW = panelW - 48
    const meRowH = 64
    const meRowGap = 12
    const listAreaH = this.bodyHeight - meRowH - meRowGap

    // total players line
    const summary = this.scene.add
      .text(listX, this.bodyTop, `전체 ${data.totalPlayers}명 참여`, {
        fontFamily: FONT_FAMILY,
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#9aa3b2',
      })
      .setOrigin(0, 0)
    body.add(summary)

    const listTop = this.bodyTop + 28
    const entries = data.entries

    if (entries.length === 0) {
      const empty = this.scene.add
        .text(0, listTop + listAreaH / 2, '아직 기록이 없어요.\n첫 번째 도전자가 되어보세요!', {
          fontFamily: FONT_FAMILY,
          fontSize: '13px',
          color: '#c5cad4',
          align: 'center',
        })
        .setOrigin(0.5)
      body.add(empty)
    } else {
      const rowH = Math.min(40, (listAreaH - 8) / Math.max(entries.length, 1))
      entries.forEach((entry, i) => {
        const rowY = listTop + i * rowH
        this.buildEntryRow(body, entry, listX, rowY, listW, rowH - 4)
      })
    }

    // me row at bottom
    const meY = this.bodyTop + this.bodyHeight - meRowH
    this.buildMeRow(body, data, listX, meY, listW, meRowH)
  }

  private buildEntryRow(
    body: Phaser.GameObjects.Container,
    entry: MusicRankingEntry,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    const rowBg = this.scene.add.graphics()
    if (entry.isMe) {
      rowBg.fillStyle(this.accent, 0.18)
      rowBg.fillRoundedRect(x, y, w, h, 10)
      rowBg.lineStyle(1, this.accent, 0.7)
      rowBg.strokeRoundedRect(x, y, w, h, 10)
    } else if (entry.rank <= 3) {
      rowBg.fillStyle(0xffffff, 0.04)
      rowBg.fillRoundedRect(x, y, w, h, 10)
    }
    body.add(rowBg)

    const medal = RANK_MEDAL[entry.rank]
    const rankText = medal
      ? this.scene.add.text(x + 14, y + h / 2, medal, {
          fontFamily: FONT_FAMILY,
          fontSize: '20px',
        })
      : this.scene.add.text(x + 18, y + h / 2, `${entry.rank}`, {
          fontFamily: FONT_FAMILY,
          fontSize: '15px',
          fontStyle: 'bold',
          color: '#9aa3b2',
        })
    rankText.setOrigin(0, 0.5)
    body.add(rankText)

    const nickColor = entry.isMe ? '#ffffff' : '#eef1f6'
    const nickname = this.scene.add
      .text(x + 50, y + h / 2, entry.nickname, {
        fontFamily: FONT_FAMILY,
        fontSize: '14px',
        fontStyle: 'bold',
        color: nickColor,
      })
      .setOrigin(0, 0.5)
    body.add(nickname)

    if (entry.isMe) {
      const meBadge = this.scene.add
        .text(x + 50 + nickname.width + 8, y + h / 2, 'ME', {
          fontFamily: FONT_FAMILY,
          fontSize: '10px',
          fontStyle: 'bold',
          color: '#0a0a0c',
          backgroundColor: this.toHex(this.accent),
          padding: { x: 5, y: 2 },
        })
        .setOrigin(0, 0.5)
      body.add(meBadge)
    }

    const score = this.scene.add
      .text(x + w - 14, y + h / 2, `${entry.score.toLocaleString()}점`, {
        fontFamily: FONT_FAMILY,
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(1, 0.5)
    body.add(score)

    const accuracyPct = Math.round(entry.accuracy * 1000) / 10
    const detail = this.scene.add
      .text(x + w - 14, y + h / 2 + 12, `${accuracyPct}% · 콤보 ${entry.maxCombo}`, {
        fontFamily: FONT_FAMILY,
        fontSize: '10px',
        color: '#9aa3b2',
      })
      .setOrigin(1, 0.5)
    body.add(detail)
  }

  private buildMeRow(
    body: Phaser.GameObjects.Container,
    data: MusicChartRanking,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    const rowBg = this.scene.add.graphics()
    rowBg.fillStyle(0xffffff, 0.05)
    rowBg.fillRoundedRect(x, y, w, h, 12)
    rowBg.lineStyle(1, this.accent, 0.45)
    rowBg.strokeRoundedRect(x, y, w, h, 12)
    body.add(rowBg)

    const label = this.scene.add
      .text(x + 14, y + 10, '내 기록', {
        fontFamily: FONT_FAMILY,
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#9aa3b2',
      })
      .setOrigin(0, 0)
      .setLetterSpacing(1)
    body.add(label)

    const me = data.me
    if (me.bestScore == null) {
      const empty = this.scene.add
        .text(x + 14, y + h / 2 + 6, '아직 이 곡 기록이 없어요. 한 번 도전해볼까요?', {
          fontFamily: FONT_FAMILY,
          fontSize: '13px',
          color: '#eef1f6',
        })
        .setOrigin(0, 0.5)
      body.add(empty)
      return
    }

    const rankText = me.rank != null ? `${me.rank}위` : '-'
    const totalText = `/ ${data.totalPlayers}명`
    const rankLabel = this.scene.add
      .text(x + 14, y + h / 2 + 6, rankText, {
        fontFamily: FONT_FAMILY,
        fontSize: '22px',
        fontStyle: 'bold',
        color: this.toHex(this.accent),
      })
      .setOrigin(0, 0.5)
    body.add(rankLabel)

    const total = this.scene.add
      .text(x + 14 + rankLabel.width + 6, y + h / 2 + 10, totalText, {
        fontFamily: FONT_FAMILY,
        fontSize: '12px',
        color: '#9aa3b2',
      })
      .setOrigin(0, 0.5)
    body.add(total)

    const accuracyPct = me.bestAccuracy != null ? Math.round(me.bestAccuracy * 1000) / 10 : 0
    const score = this.scene.add
      .text(x + w - 14, y + h / 2 - 2, `${(me.bestScore ?? 0).toLocaleString()}점`, {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(1, 0.5)
    body.add(score)

    const detail = this.scene.add
      .text(
        x + w - 14,
        y + h / 2 + 14,
        `${me.bestRankGrade ?? '-'} · ${accuracyPct}% · 콤보 ${me.bestMaxCombo ?? 0}`,
        {
          fontFamily: FONT_FAMILY,
          fontSize: '10px',
          color: '#9aa3b2',
        },
      )
      .setOrigin(1, 0.5)
    body.add(detail)
  }

  private toHex(color: number): string {
    return `#${color.toString(16).padStart(6, '0')}`
  }

  close() {
    if (this.isClosing) return
    this.isClosing = true

    const keyboard = this.scene.input.keyboard
    if (keyboard && this.escHandler) {
      keyboard.off('keydown-ESC', this.escHandler)
      this.escHandler = undefined
    }

    const targets: Phaser.GameObjects.GameObject[] = []
    if (this.panelContainer) targets.push(this.panelContainer)
    if (this.scrim) targets.push(this.scrim)

    if (targets.length === 0) return
    this.scene.tweens.add({
      targets,
      alpha: 0,
      duration: 140,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        this.panelContainer?.destroy()
        this.scrim?.destroy()
        this.panelContainer = undefined
        this.scrim = undefined
        this.bodyContainer = undefined
      },
    })
  }
}
