import Phaser from 'phaser'
import type { ArtConfirmDialog, ArtConfirmDialogButtonRole } from './artConfirmDialog'

// 게임 전체 톤이 flat 이라 화려한 3D/광택은 피하고, 둥근 코너 + 파스텔 + 작은 움직임으로
// 아이들에게 친근하게.

type CommonButtonStyle = {
  fill: number
  stroke: number
  hoverFill: number
  textColor: string
}

const PRIMARY_GREEN: CommonButtonStyle = {
  fill: 0x65a843,
  stroke: 0x3f752a,
  hoverFill: 0x77be4f,
  textColor: '#ffffff',
}

const SECONDARY_CREAM: CommonButtonStyle = {
  fill: 0xfffbf1,
  stroke: 0xaa875b,
  hoverFill: 0xfff2d6,
  textColor: '#5f3b22',
}

type QuizDialogButton = {
  role: ArtConfirmDialogButtonRole
  bounds: Phaser.Geom.Rectangle
  setHover: (isHovered: boolean) => void
  select: () => void
}

type DialogBuildContext = {
  scene: Phaser.Scene
  depth: number
  panelX: number
  panelY: number
  panelWidth: number
  panelHeight: number
}

export type QuizIntroOptions = {
  scene: Phaser.Scene
  depth: number
  prompt: string
  onStart: () => void
  onExit: () => void
}

export type QuizResultOptions = {
  scene: Phaser.Scene
  depth: number
  isCorrect: boolean
  prompt: string
  aiGuess: string | null
  isFallback: boolean
  onNext: () => void
  onExit: () => void
}

/**
 * 라운드 시작 인트로 다이얼로그. 제시어를 크고 통통 튀게 보여주고 "시작!" / "그만하기" 버튼 제공.
 * artConfirmDialog 의 hand-tracking 통합과 호환되도록 같은 인터페이스 반환.
 */
export function createQuizRoundIntroDialog({
  scene,
  depth,
  prompt,
  onStart,
  onExit,
}: QuizIntroOptions): ArtConfirmDialog {
  const ctx = createDialogContext(scene, depth, { hero: true })
  const objects: Phaser.GameObjects.GameObject[] = []
  const tweens: Phaser.Tweens.Tween[] = []

  buildBackdrop(ctx, objects)
  buildPanel(ctx, objects, 0xfff6e8, 0xb88a4c)

  // 상단 스티커형 태그 (살짝 기울어진 분홍 알약) — "오늘의 단어 ✏️"
  buildTagSticker(scene, objects, tweens, {
    depth,
    x: ctx.panelX + ctx.panelWidth / 2,
    y: ctx.panelY + 8,
    text: '오늘의 단어 ✏️',
  })

  // 단어 뒤 하이라이트 띠 (마커 칠한 느낌의 노란 파스텔)
  const wordCenterY = ctx.panelY + ctx.panelHeight * 0.5 - 14
  const highlight = scene.add.graphics()
  const highlightWidth = Math.min(ctx.panelWidth - 80, prompt.length * 48 + 60)
  highlight.fillStyle(0xffe8a1, 0.85)
  highlight.fillRoundedRect(
    ctx.panelX + ctx.panelWidth / 2 - highlightWidth / 2,
    wordCenterY - 6,
    highlightWidth,
    36,
    18,
  )
  highlight
    .setDepth(depth + 1.6)
    .setScale(0, 1)
    .setAlpha(0)
  objects.push(highlight)
  tweens.push(
    scene.tweens.add({
      targets: highlight,
      scaleX: 1,
      alpha: 1,
      duration: 360,
      delay: 80,
      ease: 'Cubic.Out',
    }),
  )

  // 큰 제시어 (통통 튀며 등장)
  const wordText = scene.add
    .text(ctx.panelX + ctx.panelWidth / 2, wordCenterY, prompt, {
      fontFamily: 'sans-serif',
      fontSize: '60px',
      color: '#3f2615',
      fontStyle: 'bold',
    })
    .setOrigin(0.5)
    .setDepth(depth + 2)
    .setScale(0)
  objects.push(wordText)
  tweens.push(
    scene.tweens.add({
      targets: wordText,
      scale: 1,
      duration: 420,
      delay: 180,
      ease: 'Back.Out',
    }),
  )

  // 버튼 두 개
  const buttons: QuizDialogButton[] = []
  buttons.push(
    buildDialogButton(scene, objects, tweens, {
      depth,
      role: 'secondary',
      x: ctx.panelX + ctx.panelWidth * 0.32,
      y: ctx.panelY + ctx.panelHeight - 54,
      width: 160,
      height: 52,
      label: '그만하기',
      style: SECONDARY_CREAM,
      onSelect: onExit,
    }),
  )
  buttons.push(
    buildDialogButton(scene, objects, tweens, {
      depth,
      role: 'primary',
      x: ctx.panelX + ctx.panelWidth * 0.68,
      y: ctx.panelY + ctx.panelHeight - 54,
      width: 160,
      height: 52,
      label: '시작!',
      style: PRIMARY_GREEN,
      onSelect: onStart,
      pulse: true,
    }),
  )

  return buildDialogHandle(objects, tweens, buttons)
}

/**
 * 라운드 결과 다이얼로그. 정답 / 오답 / fallback(AI 잠시 휴식) 케이스를 분기해서 표시.
 *
 * <p>정답 시: 별 파티클 burst + 점수 스티커. 오답: 따뜻한 격려 톤 + AI 추측 말풍선.
 */
export function createQuizResultDialog({
  scene,
  depth,
  isCorrect,
  prompt,
  aiGuess,
  isFallback,
  onNext,
  onExit,
}: QuizResultOptions): ArtConfirmDialog {
  const ctx = createDialogContext(scene, depth, { hero: false })
  const objects: Phaser.GameObjects.GameObject[] = []
  const tweens: Phaser.Tweens.Tween[] = []

  buildBackdrop(ctx, objects)
  buildPanel(ctx, objects, isCorrect ? 0xfff4dc : 0xfff6e8, isCorrect ? 0xe6a93a : 0xb88a4c)

  // 헤더 텍스트
  const headerText = isCorrect
    ? '정답이에요! 🎉'
    : isFallback
      ? '잘 그렸어요!'
      : '음... 거의 다 왔어!'
  const headerColor = isCorrect ? '#d97706' : '#6b4226'
  const header = scene.add
    .text(ctx.panelX + ctx.panelWidth / 2, ctx.panelY + 64, headerText, {
      fontFamily: 'sans-serif',
      fontSize: '32px',
      color: headerColor,
      fontStyle: 'bold',
    })
    .setOrigin(0.5)
    .setDepth(depth + 2)
    .setScale(0)
  objects.push(header)
  tweens.push(
    scene.tweens.add({
      targets: header,
      scale: 1,
      duration: 360,
      ease: 'Back.Out',
    }),
  )

  // 본문 — AI 추측 말풍선 (오답/fallback 시) 또는 정답 메시지 (정답)
  if (isCorrect) {
    const aiMessage = scene.add
      .text(
        ctx.panelX + ctx.panelWidth / 2,
        ctx.panelY + 150,
        aiGuess && !isFallback ? `AI: "${aiGuess}" 같아 보였대요!` : '잘 그렸어요!',
        {
          fontFamily: 'sans-serif',
          fontSize: '22px',
          color: '#6b4226',
          fontStyle: 'bold',
        },
      )
      .setOrigin(0.5)
      .setDepth(depth + 2)
    objects.push(aiMessage)

    // 정답 파티클 burst
    spawnConfetti(scene, objects, tweens, {
      depth: depth + 3,
      x: ctx.panelX + ctx.panelWidth / 2,
      y: ctx.panelY + 134,
    })
  } else {
    // 말풍선: "나는 X 같았어 🤔"
    const bubbleY = ctx.panelY + 136
    const bubbleMessage = isFallback
      ? 'AI가 잠시 쉬는 중...'
      : aiGuess
        ? `AI는 "${aiGuess}" 같았대요 🤔`
        : `정답은 "${prompt}"!`
    buildThoughtBubble(scene, objects, tweens, {
      depth,
      x: ctx.panelX + ctx.panelWidth / 2,
      y: bubbleY,
      text: bubbleMessage,
    })
    const promptLabel = scene.add
      .text(ctx.panelX + ctx.panelWidth / 2, ctx.panelY + 192, `정답: "${prompt}"`, {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: '#8a6b48',
      })
      .setOrigin(0.5)
      .setDepth(depth + 2)
    objects.push(promptLabel)
  }

  const buttons: QuizDialogButton[] = []
  buttons.push(
    buildDialogButton(scene, objects, tweens, {
      depth,
      role: 'secondary',
      x: ctx.panelX + ctx.panelWidth * 0.32,
      y: ctx.panelY + ctx.panelHeight - 54,
      width: 160,
      height: 52,
      label: '그만하기',
      style: SECONDARY_CREAM,
      onSelect: onExit,
    }),
  )
  buttons.push(
    buildDialogButton(scene, objects, tweens, {
      depth,
      role: 'primary',
      x: ctx.panelX + ctx.panelWidth * 0.68,
      y: ctx.panelY + ctx.panelHeight - 54,
      width: 160,
      height: 52,
      label: '다음',
      style: PRIMARY_GREEN,
      onSelect: onNext,
      pulse: true,
    }),
  )

  return buildDialogHandle(objects, tweens, buttons)
}

// ── 내부 헬퍼 ──────────────────────────────────────────────────────────

function createDialogContext(
  scene: Phaser.Scene,
  depth: number,
  { hero }: { hero: boolean },
): DialogBuildContext {
  const { width: vw, height: vh } = scene.scale
  const panelWidth = Phaser.Math.Clamp(vw * (hero ? 0.42 : 0.34), 420, hero ? 600 : 520)
  const panelHeight = hero ? 340 : 300
  return {
    scene,
    depth,
    panelX: vw / 2 - panelWidth / 2,
    panelY: vh / 2 - panelHeight / 2,
    panelWidth,
    panelHeight,
  }
}

function buildBackdrop(
  { scene, depth, panelX, panelY, panelWidth, panelHeight }: DialogBuildContext,
  objects: Phaser.GameObjects.GameObject[],
) {
  const { width: vw, height: vh } = scene.scale
  const overlay = scene.add
    .rectangle(vw / 2, vh / 2, vw, vh, 0x000000, 0.42)
    .setDepth(depth)
    .setInteractive()
  overlay.on(
    'pointerdown',
    (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ) => event.stopPropagation(),
  )
  objects.push(overlay)
  // shadow under panel for depth
  const shadow = scene.add.graphics().setDepth(depth + 0.5)
  shadow.fillStyle(0x000000, 0.18)
  shadow.fillRoundedRect(panelX + 6, panelY + 10, panelWidth, panelHeight, 26)
  objects.push(shadow)
}

function buildPanel(
  { scene, depth, panelX, panelY, panelWidth, panelHeight }: DialogBuildContext,
  objects: Phaser.GameObjects.GameObject[],
  fill: number,
  stroke: number,
) {
  const panel = scene.add.graphics().setDepth(depth + 1)
  // base fill
  panel.fillStyle(fill, 1)
  panel.fillRoundedRect(panelX, panelY, panelWidth, panelHeight, 26)
  // 위쪽 살짝 밝은 띠 — 그라데이션 흉내
  panel.fillStyle(0xffffff, 0.18)
  panel.fillRoundedRect(panelX, panelY, panelWidth, Math.min(panelHeight * 0.35, 90), 26)
  panel.lineStyle(4, stroke, 1)
  panel.strokeRoundedRect(panelX, panelY, panelWidth, panelHeight, 26)
  objects.push(panel)
}

function buildTagSticker(
  scene: Phaser.Scene,
  objects: Phaser.GameObjects.GameObject[],
  tweens: Phaser.Tweens.Tween[],
  { depth, x, y, text }: { depth: number; x: number; y: number; text: string },
) {
  const labelText = scene.add
    .text(0, 0, text, {
      fontFamily: 'sans-serif',
      fontSize: '18px',
      color: '#7c4a03',
      fontStyle: 'bold',
    })
    .setOrigin(0.5)

  const padX = 18
  const padY = 8
  const width = labelText.width + padX * 2
  const height = labelText.height + padY * 2
  const radius = height / 2

  const bg = scene.add.graphics()
  // 분홍 톤 스티커 + 갈색 외곽선
  bg.fillStyle(0xffe1ec, 1)
  bg.fillRoundedRect(-width / 2, -height / 2, width, height, radius)
  bg.lineStyle(2, 0xc97889, 1)
  bg.strokeRoundedRect(-width / 2, -height / 2, width, height, radius)

  const container = scene.add
    .container(x, y, [bg, labelText])
    .setDepth(depth + 2)
    .setAngle(-4)
    .setScale(0)
  objects.push(container)
  tweens.push(
    scene.tweens.add({
      targets: container,
      scale: 1,
      duration: 320,
      ease: 'Back.Out',
    }),
  )
}

type DialogButtonOptions = {
  depth: number
  role: ArtConfirmDialogButtonRole
  x: number
  y: number
  width: number
  height: number
  label: string
  style: CommonButtonStyle
  onSelect: () => void
  pulse?: boolean
}

function buildDialogButton(
  scene: Phaser.Scene,
  objects: Phaser.GameObjects.GameObject[],
  tweens: Phaser.Tweens.Tween[],
  options: DialogButtonOptions,
): QuizDialogButton {
  const { depth, role, x, y, width, height, label, style, onSelect, pulse } = options
  const radius = height / 2

  const labelText = scene.add
    .text(0, 0, label, {
      fontFamily: 'sans-serif',
      fontSize: '20px',
      color: style.textColor,
      fontStyle: 'bold',
    })
    .setOrigin(0.5)

  const background = scene.add.graphics()
  const drawBackground = (fill: number) => {
    background.clear()
    background.fillStyle(fill, 1)
    background.fillRoundedRect(-width / 2, -height / 2, width, height, radius)
    background.lineStyle(3, style.stroke, 1)
    background.strokeRoundedRect(-width / 2, -height / 2, width, height, radius)
  }
  drawBackground(style.fill)

  const container = scene.add.container(x, y, [background, labelText]).setDepth(depth + 2)
  container.setSize(width, height)
  container.setInteractive({
    hitArea: new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
    hitAreaCallback: Phaser.Geom.Rectangle.Contains,
    useHandCursor: true,
  })

  const bounds = new Phaser.Geom.Rectangle(x - width / 2, y - height / 2, width, height)
  let isHovered = false

  const applyHover = (hovered: boolean) => {
    isHovered = hovered
    drawBackground(hovered ? style.hoverFill : style.fill)
    container.setScale(hovered ? 1.06 : 1)
  }

  container.on('pointerover', () => applyHover(true))
  container.on('pointerout', () => applyHover(false))
  container.on(
    'pointerdown',
    (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ) => {
      event.stopPropagation()
      onSelect()
    },
  )

  objects.push(container)

  if (pulse) {
    tweens.push(
      scene.tweens.add({
        targets: container,
        scale: { from: 1, to: 1.04 },
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      }),
    )
  }

  return {
    role,
    bounds,
    setHover: applyHover,
    select: () => {
      onSelect()
    },
  }

  // 주의: isHovered 는 hand-tracking selectButton 시 시각 동기화를 위해 보존만 함
  void isHovered
}

function buildDialogHandle(
  objects: Phaser.GameObjects.GameObject[],
  tweens: Phaser.Tweens.Tween[],
  buttons: QuizDialogButton[],
): ArtConfirmDialog {
  return {
    getButtonAt: (point: Phaser.Math.Vector2) => {
      const hit = buttons.find(button => button.bounds.contains(point.x, point.y))
      return hit?.role ?? null
    },
    selectButton: (role: ArtConfirmDialogButtonRole) => {
      buttons.find(button => button.role === role)?.select()
    },
    setButtonHover: (role: ArtConfirmDialogButtonRole | null) => {
      buttons.forEach(button => button.setHover(button.role === role))
    },
    destroy: () => {
      tweens.forEach(tween => tween.stop())
      objects.forEach(object => object.destroy())
    },
  }
}

function buildThoughtBubble(
  scene: Phaser.Scene,
  objects: Phaser.GameObjects.GameObject[],
  tweens: Phaser.Tweens.Tween[],
  { depth, x, y, text }: { depth: number; x: number; y: number; text: string },
) {
  const padding = 18
  const labelText = scene.add
    .text(0, 0, text, {
      fontFamily: 'sans-serif',
      fontSize: '18px',
      color: '#5f3b22',
    })
    .setOrigin(0.5)

  const width = labelText.width + padding * 2
  const height = labelText.height + padding * 1.2
  const radius = height / 2

  const bubble = scene.add.graphics()
  bubble.fillStyle(0xffffff, 0.95)
  bubble.fillRoundedRect(-width / 2, -height / 2, width, height, radius)
  bubble.lineStyle(2, 0xb88a4c, 1)
  bubble.strokeRoundedRect(-width / 2, -height / 2, width, height, radius)
  // 말풍선 꼬리
  bubble.fillStyle(0xffffff, 0.95)
  bubble.fillTriangle(-10, height / 2 - 2, 10, height / 2 - 2, 0, height / 2 + 10)
  bubble.lineStyle(2, 0xb88a4c, 1)
  bubble.lineBetween(-10, height / 2 - 2, 0, height / 2 + 10)
  bubble.lineBetween(0, height / 2 + 10, 10, height / 2 - 2)

  const container = scene.add
    .container(x, y, [bubble, labelText])
    .setDepth(depth + 2)
    .setScale(0)
  objects.push(container)
  tweens.push(
    scene.tweens.add({
      targets: container,
      scale: 1,
      duration: 320,
      delay: 100,
      ease: 'Back.Out',
    }),
  )
}

function spawnConfetti(
  scene: Phaser.Scene,
  objects: Phaser.GameObjects.GameObject[],
  tweens: Phaser.Tweens.Tween[],
  { depth, x, y }: { depth: number; x: number; y: number },
) {
  const colors = [0xfbbf24, 0xff7eb3, 0x65a843, 0x36b7ff, 0xff9f43, 0xa78bfa]
  const count = 14
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3
    const distance = 80 + Math.random() * 60
    const color = colors[i % colors.length]
    const size = 6 + Math.random() * 4
    const isStar = i % 3 === 0
    const piece = isStar
      ? drawStar(scene, x, y, size, color)
      : scene.add.graphics().fillStyle(color, 1).fillCircle(0, 0, size).setPosition(x, y)
    piece.setDepth(depth)
    objects.push(piece)
    const targetX = x + Math.cos(angle) * distance
    const targetY = y + Math.sin(angle) * distance + 20 // 살짝 아래로 떨어지는 느낌
    tweens.push(
      scene.tweens.add({
        targets: piece,
        x: targetX,
        y: targetY,
        alpha: { from: 1, to: 0 },
        angle: { from: 0, to: (Math.random() - 0.5) * 360 },
        duration: 700 + Math.random() * 300,
        ease: 'Cubic.Out',
        onComplete: () => piece.destroy(),
      }),
    )
  }
}

function drawStar(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  color: number,
): Phaser.GameObjects.Graphics {
  const points: number[] = []
  const outer = size
  const inner = size * 0.45
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? outer : inner
    const angle = (Math.PI / 5) * i - Math.PI / 2
    points.push(Math.cos(angle) * r, Math.sin(angle) * r)
  }
  const star = scene.add.graphics()
  star.fillStyle(color, 1)
  star.beginPath()
  star.moveTo(points[0], points[1])
  for (let i = 2; i < points.length; i += 2) {
    star.lineTo(points[i], points[i + 1])
  }
  star.closePath()
  star.fillPath()
  star.setPosition(x, y)
  return star
}
