export type RhythmLane = 0 | 1 | 2 | 3

export type RhythmNote = {
  id: string
  timeMs: number
  lane: RhythmLane
  durationMs?: number
}

export type RhythmChart = {
  id: string
  title: string
  subtitle: string
  bpm: number
  audioKey: string
  audioPath: string
  durationMs: number
  notes: RhythmNote[]
  // Override default note lead-in time (spawn → hit line). Higher = slower fall.
  noteLeadMs?: number
  // YouTube mode: skip Phaser audio, use IFrame player instead
  youtubeVideoId?: string
  youtubeThumbnailUrl?: string
}

type TimedLaneNote = {
  timeMs: number
  lane: RhythmLane
  durationMs?: number
}

type TwinkleStep = {
  lane: RhythmLane
  beats: number
}

const TWINKLE_BPM = 120
const TWINKLE_BEAT_MS = 60_000 / TWINKLE_BPM
const TWINKLE_START_MS = 1_800
const TWINKLE_DURATION_MS = 11_000

// 노래 박자(beats)는 그대로 유지하고, 레인만 4개로 골고루 흩뿌림.
// 같은 레인이 연속으로 오지 않도록 → 손가락 인식 기반 입력에 친화적.
// "반짝반짝 작은별 아름답게 빛나네" 한 줄만 사용.
const twinkleSteps: TwinkleStep[] = [
  // 반짝반짝 작은별 (도-도-솔-솔-라-라-솔)
  { lane: 0, beats: 1 },
  { lane: 2, beats: 1 },
  { lane: 1, beats: 1 },
  { lane: 3, beats: 1 },
  { lane: 0, beats: 1 },
  { lane: 2, beats: 1 },
  { lane: 1, beats: 2 },
  // 아름답게 빛나네 (파-파-미-미-레-레-도)
  { lane: 3, beats: 1 },
  { lane: 1, beats: 1 },
  { lane: 2, beats: 1 },
  { lane: 0, beats: 1 },
  { lane: 1, beats: 1 },
  { lane: 3, beats: 1 },
  { lane: 2, beats: 2 },
]

function createTwinkleNotes(): RhythmNote[] {
  let cursorMs = TWINKLE_START_MS

  return twinkleSteps.map((step, index) => {
    const note = {
      id: `twinkle-star-${String(index + 1).padStart(2, '0')}`,
      timeMs: cursorMs,
      lane: step.lane,
    }

    cursorMs += step.beats * TWINKLE_BEAT_MS

    return note
  })
}

const BABY_SHARK_BPM = 115
const BABY_SHARK_BEAT_MS = 60_000 / BABY_SHARK_BPM
const BABY_SHARK_GRID_OFFSET_MS = 420
const BABY_SHARK_DURATION_MS = 96_196
const BABY_SHARK_FIRST_MAIN_BEAT = 18
const BABY_SHARK_LAST_MAIN_BEAT = 182

const babySharkIntroNotes: TimedLaneNote[] = [
  { timeMs: 2_507, lane: 0 },
  { timeMs: 3_029, lane: 2 },
  { timeMs: 3_290, lane: 1 },
  { timeMs: 5_116, lane: 3 },
  { timeMs: 5_377, lane: 0 },
  { timeMs: 7_203, lane: 1 },
  { timeMs: 7_463, lane: 2 },
  { timeMs: 8_246, lane: 3 },
  { timeMs: 8_507, lane: 0 },
  { timeMs: 9_290, lane: 2 },
]

const babySharkLanePatterns: RhythmLane[][] = [
  [0, 1, 2, 3, 2, 1, 0, 1],
  [3, 2, 1, 0, 1, 2, 3, 2],
  [0, 2, 1, 3, 0, 1, 2, 3],
]

function createBabySharkNotes(): RhythmNote[] {
  const notes: TimedLaneNote[] = [...babySharkIntroNotes]

  for (
    let beatIndex = BABY_SHARK_FIRST_MAIN_BEAT;
    beatIndex <= BABY_SHARK_LAST_MAIN_BEAT;
    beatIndex += 1
  ) {
    const stepIndex = beatIndex - BABY_SHARK_FIRST_MAIN_BEAT
    const phraseIndex = Math.floor(stepIndex / 8)
    const pattern = babySharkLanePatterns[phraseIndex % babySharkLanePatterns.length]
    const lane = pattern[stepIndex % pattern.length]
    const timeMs = Math.round(BABY_SHARK_GRID_OFFSET_MS + beatIndex * BABY_SHARK_BEAT_MS)

    notes.push({ timeMs, lane })
  }

  return notes.map((note, index) => ({
    id: `baby-shark-${String(index + 1).padStart(3, '0')}`,
    ...note,
  }))
}

// ─────────────────────────────── Canon (Pachelbel) ───────────────────────────────
// 난이도 ↑: 16분 음표 연타 + 동시 누르기(코드) + 마지막 롱노트.
const CANON_BPM = 100
const CANON_BEAT_MS = 60_000 / CANON_BPM // 600ms
const CANON_EIGHTH_MS = CANON_BEAT_MS / 2 // 300ms
const CANON_SIXTEENTH_MS = CANON_BEAT_MS / 4 // 150ms
const CANON_START_MS = 1_800
const CANON_DURATION_MS = 49_876
const CANON_FINAL_HOLD_MS = 2_000

function createCanonNotes(): RhythmNote[] {
  const notes: TimedLaneNote[] = []
  let cursorMs = CANON_START_MS

  const tap = (lane: RhythmLane, chord?: RhythmLane) => {
    notes.push({ timeMs: Math.round(cursorMs), lane })
    if (chord !== undefined) {
      notes.push({ timeMs: Math.round(cursorMs), lane: chord })
    }
  }

  const run = (interval: number, lanes: readonly RhythmLane[]) => {
    lanes.forEach(lane => {
      tap(lane)
      cursorMs += interval
    })
  }

  // Phase 1 (1~4마디 · 16beat): 8분 음표 흐르는 테마
  run(CANON_EIGHTH_MS, [3, 2, 1, 0, 1, 2, 1, 0])
  run(CANON_EIGHTH_MS, [0, 1, 2, 3, 2, 1, 0, 1])
  run(CANON_EIGHTH_MS, [2, 3, 2, 1, 0, 1, 2, 3])
  run(CANON_EIGHTH_MS, [3, 2, 1, 0, 1, 2, 1, 0])

  // Phase 2 (5~8마디 · 16beat): 지그재그 8분 — 레인 이동 폭 확대
  run(CANON_EIGHTH_MS, [0, 2, 1, 3, 2, 0, 3, 1])
  run(CANON_EIGHTH_MS, [1, 3, 0, 2, 3, 1, 2, 0])
  run(CANON_EIGHTH_MS, [0, 1, 2, 3, 3, 2, 1, 0])
  run(CANON_EIGHTH_MS, [3, 2, 1, 0, 0, 1, 2, 3])

  // Phase 3 (9~12마디 · 16beat): 8분 위주 + 마디당 16분 러닝 1번씩
  const phase3Bars: readonly (readonly (readonly RhythmLane[])[])[] = [
    // 각 마디: [4 eighths, 4 sixteenths, 2 eighths] = 4*300 + 4*150 + 2*300 = 2400ms
    [
      [0, 1, 2, 3],
      [2, 1, 2, 3],
      [0, 1],
    ],
    [
      [3, 2, 1, 0],
      [1, 2, 1, 0],
      [3, 2],
    ],
    [
      [1, 2, 0, 3],
      [2, 3, 2, 1],
      [0, 1],
    ],
    [
      [3, 0, 2, 1],
      [1, 0, 1, 2],
      [3, 2],
    ],
  ]
  phase3Bars.forEach(([e1, s1, e2]) => {
    run(CANON_EIGHTH_MS, e1)
    run(CANON_SIXTEENTH_MS, s1)
    run(CANON_EIGHTH_MS, e2)
  })

  // Phase 4 (13~16마디 · 16beat): 클라이맥스 — 다운비트 코드 + 마디당 16분 러닝 1번
  for (let bar = 0; bar < 4; bar++) {
    const ascending = bar % 2 === 0
    // beat 1: 외곽 코드 + 단일 8분
    tap(0, 3) // 양 끝 동시 누르기
    cursorMs += CANON_EIGHTH_MS
    tap(ascending ? 2 : 1)
    cursorMs += CANON_EIGHTH_MS
    // beat 2: 2 eighths
    run(CANON_EIGHTH_MS, ascending ? [1, 2] : [2, 1])
    // beat 3: 16분 러닝 (한 마디에 한 번만)
    run(CANON_SIXTEENTH_MS, ascending ? [3, 2, 1, 0] : [0, 1, 2, 3])
    // beat 4: 회복용 8분 2개
    run(CANON_EIGHTH_MS, ascending ? [1, 3] : [2, 0])
  }

  // Phase 5 (17~20마디 · 16beat): 정리 8분 + 마지막 롱 코드
  run(CANON_EIGHTH_MS, [0, 1, 2, 3, 2, 1, 0, 1])
  run(CANON_EIGHTH_MS, [3, 2, 1, 0, 1, 2, 3, 2])
  run(CANON_EIGHTH_MS, [1, 0, 2, 3, 2, 0, 1, 3])
  // 마지막 마디: 양 끝 레인 동시 롱노트(약 2초)
  notes.push({ timeMs: Math.round(cursorMs), lane: 0, durationMs: CANON_FINAL_HOLD_MS })
  notes.push({ timeMs: Math.round(cursorMs), lane: 3, durationMs: CANON_FINAL_HOLD_MS })

  return notes.map((note, index) => ({
    id: `canon-${String(index + 1).padStart(3, '0')}`,
    ...note,
  }))
}

export const TWINKLE_STAR_RHYTHM_CHART: RhythmChart = {
  id: 'twinkle-star',
  title: '작은별',
  subtitle: '밝은 실로폰 리듬',
  bpm: TWINKLE_BPM,
  audioKey: 'music-rhythm-twinkle-star',
  audioPath: 'sounds/themes/music/twinkle-star.wav',
  durationMs: TWINKLE_DURATION_MS,
  notes: createTwinkleNotes(),
}

export const BABY_SHARK_RHYTHM_CHART: RhythmChart = {
  id: 'baby-shark',
  title: '아기상어',
  subtitle: 'BPM 115 리듬 차트',
  bpm: BABY_SHARK_BPM,
  audioKey: 'music-rhythm-baby-shark',
  audioPath: 'sounds/themes/music/babyshark.wav',
  durationMs: BABY_SHARK_DURATION_MS,
  notes: createBabySharkNotes(),
}

export const CANON_RHYTHM_CHART: RhythmChart = {
  id: 'canon',
  title: '캐논',
  subtitle: '16분 음표 · 코드 챌린지',
  bpm: CANON_BPM,
  audioKey: 'music-rhythm-canon',
  audioPath: 'sounds/themes/music/canon.wav',
  durationMs: CANON_DURATION_MS,
  notes: createCanonNotes(),
}

export const DEFAULT_RHYTHM_CHART = BABY_SHARK_RHYTHM_CHART

export const ALL_RHYTHM_CHARTS: RhythmChart[] = [
  BABY_SHARK_RHYTHM_CHART,
  TWINKLE_STAR_RHYTHM_CHART,
  CANON_RHYTHM_CHART,
]

export function getRhythmChart(id?: string | null): RhythmChart {
  if (!id) return DEFAULT_RHYTHM_CHART
  return (
    ALL_RHYTHM_CHARTS.find(chart => chart.id === id) ??
    DYNAMIC_CHARTS.get(id) ??
    DEFAULT_RHYTHM_CHART
  )
}

// ── Dynamic YouTube charts ─────────────────────────────────────────────────

const DYNAMIC_CHARTS = new Map<string, RhythmChart>()

export type YouTubeDifficulty = 'easy' | 'normal' | 'hard'

// 난이도가 BPM(밀도) + 낙하 속도(반응 시간) 둘 다 결정.
const DIFFICULTY_PRESETS: Record<YouTubeDifficulty, { bpm: number; leadMs: number }> = {
  easy: { bpm: 80, leadMs: 2200 },
  normal: { bpm: 120, leadMs: 1800 },
  hard: { bpm: 160, leadMs: 1300 },
}

export function generateYouTubeChart(params: {
  videoId: string
  title: string
  channelTitle: string
  durationMs: number
  difficulty: YouTubeDifficulty
}): RhythmChart {
  const { videoId, title, channelTitle, durationMs, difficulty } = params
  const preset = DIFFICULTY_PRESETS[difficulty]
  const chart: RhythmChart = {
    id: `youtube-${videoId}`,
    title,
    subtitle: channelTitle,
    bpm: preset.bpm,
    audioKey: '',
    audioPath: '',
    durationMs,
    notes: buildYouTubeNotes(durationMs, preset.bpm, difficulty),
    noteLeadMs: preset.leadMs,
    youtubeVideoId: videoId,
    youtubeThumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  }
  DYNAMIC_CHARTS.set(chart.id, chart)
  return chart
}

function buildYouTubeNotes(
  durationMs: number,
  bpm: number,
  difficulty: YouTubeDifficulty,
): RhythmNote[] {
  const beatMs = 60_000 / bpm
  // easy/normal: 매 비트, hard: 반 비트(8분음표) 간격
  const stepMs = difficulty === 'hard' ? beatMs * 0.5 : beatMs

  // Lane patterns (no consecutive same lane, spread across all 4)
  const PATTERNS: Record<YouTubeDifficulty, RhythmLane[]> = {
    easy: [0, 2, 1, 3, 0, 3, 1, 2],
    normal: [0, 2, 1, 3, 2, 0, 3, 1, 0, 3, 2, 1, 3, 0, 1, 2],
    hard: [
      0, 1, 2, 3, 1, 0, 3, 2, 2, 3, 0, 1, 3, 2, 1, 0, 0, 2, 3, 1, 2, 0, 1, 3, 1, 3, 2, 0, 3, 1, 0,
      2,
    ],
  }

  const pattern = PATTERNS[difficulty]
  const notes: RhythmNote[] = []
  let t = 1_500
  let i = 0

  while (t <= durationMs - 1_500) {
    notes.push({
      id: `yt-${String(i).padStart(4, '0')}`,
      timeMs: Math.round(t),
      lane: pattern[i % pattern.length],
    })
    t += stepMs
    i++
  }

  return notes
}
