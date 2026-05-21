import Phaser from 'phaser'

export type CuteCardState = 'default' | 'hover' | 'selected'

export type CuteCardPalette = {
  /** Pastel accent for tag pills, borders, and the action button. */
  accent: number
  /** Same accent as a hex string for `Text.color`. */
  accentHex: string
  /** Soft drop-shadow color (usually a desaturated dark). */
  shadow: number
}

// Shared warm-paper surface + warm-wood border so the cards read as a
// physical, storybook-style card on top of any of the warm/wood themed
// backgrounds (music, art, gymnastics, taekwondo). All cards share the same
// outer frame; per-theme variation only lives in tag pills + buttons.
const SURFACE_TOP = 0xfcf8f0
const SURFACE_BOTTOM = 0xf3ecdd
const INNER_STROKE = 0xddd0b8
const BORDER_COLOR = 0xa8845a

/** Accent presets — picked from the warm autumn / storybook palette. */
export const CUTE_CARD_PALETTES = {
  rose: {
    accent: 0xc98477,
    accentHex: '#a85b4d',
    shadow: 0x3d1d1d,
  },
  sage: {
    accent: 0x9ab186,
    accentHex: '#5b7349',
    shadow: 0x223021,
  },
  butter: {
    accent: 0xe6b86a,
    accentHex: '#8a5a1a',
    shadow: 0x3d2f1d,
  },
  clay: {
    accent: 0xb88a6a,
    accentHex: '#6b4326',
    shadow: 0x2e1c12,
  },
} as const satisfies Record<string, CuteCardPalette>

/**
 * Draws a bright, kid-friendly card panel onto the supplied Graphics object.
 * The panel is anchored at (0, 0) so it works well inside a Container.
 *
 * Visual ingredients:
 *   1. soft drop shadow (offset down)
 *   2. cream surface with vertical gradient
 *   3. inner top highlight band (light source from above)
 *   4. accent border (thicker / brighter when active)
 *
 * The same helper is used for the music select cards but is intentionally
 * theme-agnostic so it can be reused across other scenes (e.g., gymnastics
 * mode picker, art picker, mini-game lobby).
 */
export function drawCuteCardPanel(
  panel: Phaser.GameObjects.Graphics,
  width: number,
  height: number,
  palette: CuteCardPalette,
  state: CuteCardState = 'default',
  cornerRadius = 28,
) {
  const w = width
  const h = height
  const r = cornerRadius
  const active = state !== 'default'

  panel.clear()

  // 1. drop shadow — soft, offset slightly downward
  const shadowSteps = 8
  for (let i = 0; i < shadowSteps; i++) {
    const spread = (shadowSteps - i) * 1.5
    panel.fillStyle(palette.shadow, 0.025)
    panel.fillRoundedRect(
      -w / 2 - spread + 1,
      -h / 2 - spread + 6,
      w + spread * 2,
      h + spread * 2,
      r + spread * 0.4,
    )
  }

  // 2. warm cream paper surface — flat, no banded highlight so the card reads
  // as a single uninterrupted surface
  panel.fillStyle(SURFACE_TOP, 1)
  panel.fillRoundedRect(-w / 2, -h / 2, w, h, r)

  // 3. very subtle warm tint at the bottom — gives a hint of paper depth
  // without splitting the card into visible bands
  const tintSteps = 8
  const tintH = Math.min(h * 0.35, h - 12)
  for (let i = 0; i < tintSteps; i++) {
    const t = i / (tintSteps - 1)
    panel.fillStyle(SURFACE_BOTTOM, 0.05 * t)
    panel.fillRoundedRect(
      -w / 2 + 8,
      h / 2 - tintH + i * (tintH / tintSteps),
      w - 16,
      tintH / tintSteps + 1,
      r - 6,
    )
  }

  // 5. inner beige stroke — gives the storybook "drawn" outline a bit of weight
  panel.lineStyle(1.5, INNER_STROKE, 0.55)
  panel.strokeRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, r - 4)

  // 6. unified warm-wood border — same on every card so the row reads as one set
  const borderAlpha = active ? 1 : 0.9
  const borderWidth = active ? 4 : 3
  panel.lineStyle(borderWidth, BORDER_COLOR, borderAlpha)
  panel.strokeRoundedRect(-w / 2, -h / 2, w, h, r)

  // active glow halo — uses the per-card accent so selection state still pops
  if (active) {
    const halo = state === 'selected' ? 12 : 7
    for (let i = 0; i < halo; i++) {
      panel.lineStyle(1, palette.accent, 0.05 - i * 0.0035)
      panel.strokeRoundedRect(-w / 2 - i, -h / 2 - i, w + i * 2, h + i * 2, r + i)
    }
  }
}

/**
 * Draws a chunky pastel pill button (matches `drawCuteCardPanel`).
 * Fills the supplied Graphics object; the button is centered around (cx, cy).
 */
export function drawCutePillButton(
  graphics: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  width: number,
  height: number,
  palette: CuteCardPalette,
  state: CuteCardState = 'default',
) {
  const x = cx - width / 2
  const y = cy - height / 2
  const radius = height / 2

  graphics.clear()

  // outer glow when active
  if (state !== 'default') {
    const glowSteps = state === 'selected' ? 8 : 6
    for (let i = 0; i < glowSteps; i++) {
      graphics.fillStyle(palette.accent, 0.04)
      graphics.fillRoundedRect(
        x - 5 + i,
        y - 5 + i,
        width + 10 - i * 2,
        height + 10 - i * 2,
        radius + 5,
      )
    }
  }

  // solid pastel fill
  graphics.fillStyle(palette.accent, state === 'default' ? 0.92 : 1)
  graphics.fillRoundedRect(x, y, width, height, radius)
  // top inner gloss (lighter band)
  graphics.fillStyle(0xffffff, state === 'default' ? 0.28 : 0.38)
  graphics.fillRoundedRect(x + 3, y + 3, width - 6, height / 2, radius)
  // crisp white border
  graphics.lineStyle(1.5, 0xffffff, state === 'default' ? 0.85 : 1)
  graphics.strokeRoundedRect(x, y, width, height, radius)
}
