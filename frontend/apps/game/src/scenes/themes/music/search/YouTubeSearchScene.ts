import Phaser from 'phaser'
import { playSceneBgm } from '@/game/systems/sceneBgm'
import { assetPath } from '@/game/assets/assetPath'
import { addCoverBackground } from '@/game/world/background'
import { fadeToScene } from '@/game/systems/sceneTransition'
import { generateYouTubeChart, type YouTubeDifficulty } from '../play/rhythmCharts'

// 백엔드 프록시 경유 — API 키를 프론트에 노출하지 않음 (S14P31E103-781).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
const ACCESS_TOKEN_STORAGE_KEY = 'wish_access_token'

type VideoItem = {
  videoId: string
  title: string
  channelTitle: string
  thumbnailUrl: string
  durationMs: number
}

type YoutubeSearchApiResponse = {
  code: string
  message: string
  data: {
    items: VideoItem[]
  } | null
}

const DIFF_OPTIONS: { key: YouTubeDifficulty; label: string; hint: string }[] = [
  { key: 'easy', label: '쉬움', hint: '느린 속도 · 노트 적음' },
  { key: 'normal', label: '보통', hint: '기본 속도 · 적당한 밀도' },
  { key: 'hard', label: '어려움', hint: '빠른 속도 · 노트 많음' },
]

export class YouTubeSearchScene extends Phaser.Scene {
  private overlay: HTMLDivElement | null = null
  private selected: VideoItem | null = null
  private difficulty: YouTubeDifficulty = 'normal'
  private isLeaving = false

  constructor() {
    super({ key: 'YouTubeSearchScene' })
  }

  preload() {
    if (!this.textures.exists('music-background')) {
      this.load.image(
        'music-background',
        assetPath('images/themes/music/background/background.png'),
      )
    }
  }

  create() {
    playSceneBgm(this)
    this.isLeaving = false
    this.selected = null
    this.difficulty = 'normal'

    // Phaser 키보드 플러그인이 window keydown 을 가로채면 input 에 글자가 안 들어감.
    // 검색 화면이 떠 있는 동안은 게임 키 입력을 꺼둔다.
    if (this.input.keyboard) {
      this.input.keyboard.enabled = false
    }

    addCoverBackground(this, 'music-background')
    this.add
      .rectangle(
        this.scale.width / 2,
        this.scale.height / 2,
        this.scale.width,
        this.scale.height,
        0x050507,
        0.78,
      )
      .setDepth(1)

    this.cameras.main.fadeIn(220, 0, 0, 0)
    this.mountOverlay()

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unmountOverlay()
      if (this.input.keyboard) {
        this.input.keyboard.enabled = true
      }
    })
  }

  // ── DOM overlay ──────────────────────────────────────────────────────────

  private mountOverlay() {
    injectStyles()

    const div = document.createElement('div')
    div.id = 'yt-search-root'
    div.innerHTML = `
      <div class="yts-wrap">
        <div class="yts-header">
          <div class="yts-header-inner">
            <button class="yts-back">← 돌아가기</button>
            <div class="yts-title-row">
              <span class="yts-logo">▶</span>
              <h2 class="yts-title">유튜브로 노래 찾기</h2>
            </div>
          </div>
        </div>
        <div class="yts-scroll">
          <div class="yts-body" id="yts-body">
            ${searchPanelHTML()}
          </div>
        </div>
      </div>
    `
    document.body.appendChild(div)
    this.overlay = div

    div.querySelector('.yts-back')!.addEventListener('click', () => this.goBack())
    this.bindSearchHandlers()
  }

  private unmountOverlay() {
    this.overlay?.remove()
    this.overlay = null
  }

  private bindSearchHandlers() {
    const root = this.overlay
    if (!root) return
    const input = root.querySelector<HTMLInputElement>('.yts-input')!
    const btn = root.querySelector<HTMLButtonElement>('.yts-search-btn')!
    const run = () => {
      const q = input.value.trim()
      if (q) void this.search(q)
    }
    btn.addEventListener('click', run)
    // 게임 키 바인딩으로 새지 않도록 입력 이벤트를 input 안에서 막는다.
    const stop = (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Enter') run()
    }
    input.addEventListener('keydown', stop)
    input.addEventListener('keyup', e => e.stopPropagation())
    input.addEventListener('keypress', e => e.stopPropagation())
    input.focus()
  }

  // ── YouTube Data API ──────────────────────────────────────────────────────

  private async search(query: string) {
    const resultsEl = this.overlay?.querySelector<HTMLDivElement>('#yts-results')
    if (!resultsEl) return
    resultsEl.innerHTML = '<p class="yts-msg">검색 중...</p>'

    try {
      const token = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
      const url = `${API_BASE_URL}/music/youtube/search?q=${encodeURIComponent(query)}&limit=8`
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      if (!res.ok) {
        const message =
          res.status === 503
            ? '유튜브 검색이 현재 비활성화되어 있어요.'
            : '검색 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.'
        resultsEl.innerHTML = `<p class="yts-msg">${message}</p>`
        return
      }

      const payload = (await res.json()) as YoutubeSearchApiResponse
      const items = payload.data?.items ?? []

      if (items.length === 0) {
        resultsEl.innerHTML = '<p class="yts-msg">검색 결과가 없어요.</p>'
        return
      }

      this.renderResults(items)
    } catch (err) {
      console.error('[YouTubeSearchScene] search error', err)
      resultsEl.innerHTML =
        '<p class="yts-msg">검색 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.</p>'
    }
  }

  private renderResults(items: VideoItem[]) {
    const el = this.overlay?.querySelector<HTMLDivElement>('#yts-results')
    if (!el) return

    el.innerHTML = items
      .map(
        (v, i) => `
        <div class="yts-card" data-idx="${i}">
          <img class="yts-thumb" src="${v.thumbnailUrl}" alt="" loading="lazy" />
          <div class="yts-card-info">
            <p class="yts-card-title">${escapeHtml(v.title)}</p>
            <p class="yts-card-ch">${escapeHtml(v.channelTitle)} · ${msDuration(v.durationMs)}</p>
          </div>
        </div>`,
      )
      .join('')

    el.querySelectorAll<HTMLDivElement>('.yts-card').forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.idx ?? '0', 10)
        this.selected = items[idx]
        this.showConfig(items[idx])
      })
    })
  }

  // ── Config panel ──────────────────────────────────────────────────────────

  private showConfig(video: VideoItem) {
    const body = this.overlay?.querySelector<HTMLDivElement>('#yts-body')
    if (!body) return

    body.innerHTML = `
      <div class="yts-cfg">
        <button class="yts-cfg-back">← 검색으로 돌아가기</button>

        <div class="yts-selected">
          <img src="${video.thumbnailUrl}" class="yts-sel-thumb" alt="" />
          <div class="yts-sel-info">
            <p class="yts-sel-title">${escapeHtml(video.title)}</p>
            <p class="yts-sel-ch">${escapeHtml(video.channelTitle)} · ${msDuration(video.durationMs)}</p>
          </div>
        </div>

        <div class="yts-diff-row">
          ${DIFF_OPTIONS.map(
            d => `
            <button class="yts-diff-card${d.key === 'normal' ? ' active' : ''}" data-diff="${d.key}">
              <span class="yts-diff-label">${d.label}</span>
              <span class="yts-diff-hint">${d.hint}</span>
            </button>`,
          ).join('')}
        </div>

        <div class="yts-start-row">
          <button class="yts-start">▶  시작하기</button>
        </div>
      </div>
    `

    body.querySelector('.yts-cfg-back')!.addEventListener('click', () => this.resetToSearch())

    body.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.difficulty = btn.dataset.diff as YouTubeDifficulty
        body.querySelectorAll('[data-diff]').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
      })
    })

    body.querySelector('.yts-start')!.addEventListener('click', () => this.launch())
  }

  private resetToSearch() {
    const body = this.overlay?.querySelector<HTMLDivElement>('#yts-body')
    if (!body) return
    body.innerHTML = searchPanelHTML()
    this.bindSearchHandlers()
  }

  // ── Scene transition ──────────────────────────────────────────────────────

  private launch() {
    if (this.isLeaving || !this.selected) return
    this.isLeaving = true

    const chart = generateYouTubeChart({
      videoId: this.selected.videoId,
      title: this.selected.title,
      channelTitle: this.selected.channelTitle,
      durationMs: this.selected.durationMs,
      difficulty: this.difficulty,
    })

    fadeToScene(this, 'MusicRhythmScene', {
      duration: 220,
      data: { chartId: chart.id },
    })
  }

  private goBack() {
    if (this.isLeaving) return
    this.isLeaving = true
    fadeToScene(this, 'MusicSongSelectScene', { duration: 220 })
  }
}

// ── helpers ───────────────────────────────────────────────────────────────

function msDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function searchPanelHTML(): string {
  return `
    <div class="yts-search-bar">
      <input class="yts-input" type="text" placeholder="노래 제목이나 아티스트를 검색하세요" autocomplete="off" />
      <button class="yts-search-btn">검색</button>
    </div>
    <div id="yts-results" class="yts-results">
      <div class="yts-empty">
        <div class="yts-empty-icon">♪</div>
        <p class="yts-empty-text">원하는 노래를 검색하면<br>유튜브에서 찾아드려요</p>
      </div>
    </div>
  `
}

let _stylesInjected = false
function injectStyles() {
  if (_stylesInjected) return
  _stylesInjected = true

  const style = document.createElement('style')
  style.textContent = `
    #yt-search-root {
      position: fixed; inset: 0; z-index: 500;
      font-family: 'Pretendard', 'Noto Sans KR', 'Malgun Gothic', sans-serif;
      color: #f0f3f8;
    }
    .yts-wrap {
      width: 100%; height: 100%;
      display: flex; flex-direction: column;
      background: rgba(8,8,20,.95);
      box-sizing: border-box;
    }

    /* ── header (full-width bar) ── */
    .yts-header {
      flex-shrink: 0;
      border-bottom: 1px solid rgba(255,255,255,.07);
      padding: 26px 28px;
    }
    .yts-header-inner {
      max-width: 960px; margin: 0 auto;
      position: relative;
      display: flex; align-items: center; justify-content: center;
    }
    .yts-back {
      position: absolute; left: 0;
      background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.14);
      color: #c9ced8; padding: 7px 15px; border-radius: 20px;
      cursor: pointer; font-size: 13px; font-family: inherit;
      transition: background .15s, color .15s; white-space: nowrap;
    }
    .yts-back:hover { background: rgba(255,255,255,.14); color: #fff; }
    .yts-title-row { display: flex; align-items: center; gap: 12px; }
    .yts-logo {
      width: 40px; height: 28px; background: #ff0000;
      border-radius: 7px; display: flex; align-items: center;
      justify-content: center; font-size: 14px; color: #fff; flex-shrink: 0;
    }
    .yts-title { font-size: 22px; font-weight: 700; margin: 0; color: #fffaf2; }

    /* ── scrollable content ── */
    .yts-scroll {
      flex: 1; overflow-y: auto; overflow-x: hidden;
    }
    .yts-scroll::-webkit-scrollbar { width: 4px; }
    .yts-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 2px; }

    /* ── body: max-width centered ── */
    .yts-body {
      max-width: 960px; margin: 0 auto;
      padding: 24px 28px 32px;
      display: flex; flex-direction: column; gap: 18px;
    }

    /* ── search bar ── */
    .yts-search-bar { display: flex; gap: 10px; }
    .yts-input {
      flex: 1; padding: 12px 18px;
      background: rgba(255,255,255,.07); border: 1.5px solid rgba(255,255,255,.13);
      border-radius: 12px; color: #f0f3f8; font-size: 15px;
      font-family: inherit; outline: none; transition: border-color .15s;
    }
    .yts-input:focus { border-color: rgba(255,68,68,.75); }
    .yts-input::placeholder { color: rgba(255,255,255,.28); }
    .yts-search-btn {
      padding: 12px 26px; background: #e03333; border: none;
      border-radius: 12px; color: #fff; font-size: 14px; font-weight: 700;
      font-family: inherit; cursor: pointer; transition: opacity .15s; white-space: nowrap;
    }
    .yts-search-btn:hover { opacity: .88; }

    /* ── empty state ── */
    .yts-empty {
      grid-column: 1 / -1;
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 12px; padding: 56px 0;
    }
    .yts-empty-icon {
      font-size: 44px; color: rgba(255,255,255,.12); line-height: 1;
    }
    .yts-empty-text {
      font-size: 14px; color: #5a6280; text-align: center;
      line-height: 1.7; margin: 0; word-break: keep-all;
    }

    /* ── loading msg ── */
    .yts-msg { grid-column: 1 / -1; color: #5a6280; text-align: center; padding: 48px 0; font-size: 14px; margin: 0; }

    /* ── results grid ── */
    .yts-results {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
    }
    @media (max-width: 900px) { .yts-results { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 640px) { .yts-results { grid-template-columns: repeat(2, 1fr); } }
    .yts-card {
      display: flex; flex-direction: column;
      background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08);
      border-radius: 12px; overflow: hidden; cursor: pointer;
      transition: background .15s, border-color .15s, transform .15s;
    }
    .yts-card:hover {
      background: rgba(255,255,255,.09); border-color: rgba(255,68,68,.45);
      transform: translateY(-3px);
    }
    .yts-thumb { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; }
    .yts-card-info { padding: 10px 12px 12px; }
    .yts-card-title {
      font-size: 13px; font-weight: 600; color: #e8ecf4; margin: 0 0 5px;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      overflow: hidden; line-height: 1.45; word-break: keep-all;
    }
    .yts-card-ch {
      font-size: 11px; color: #6870a0; margin: 0;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    /* ── config panel ── */
    .yts-cfg { display: flex; flex-direction: column; gap: 22px; }
    .yts-cfg-back {
      align-self: flex-start; background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.11); color: #8890b0;
      padding: 7px 15px; border-radius: 20px; cursor: pointer;
      font-size: 13px; font-family: inherit; transition: all .15s;
    }
    .yts-cfg-back:hover { background: rgba(255,255,255,.12); color: #f0f3f8; }
    .yts-selected {
      display: flex; gap: 16px; align-items: flex-start;
      background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08);
      border-radius: 14px; padding: 16px;
    }
    .yts-sel-thumb {
      width: 200px; height: 113px; object-fit: cover;
      border-radius: 8px; flex-shrink: 0;
    }
    .yts-sel-info { flex: 1; min-width: 0; padding-top: 2px; }
    .yts-sel-title {
      font-size: 16px; font-weight: 700; color: #fffaf2;
      margin: 0 0 8px; line-height: 1.4; word-break: keep-all;
    }
    .yts-sel-ch { font-size: 13px; color: #6870a0; margin: 0; }

    .yts-diff-row {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;
    }
    .yts-diff-card {
      display: flex; flex-direction: column; align-items: center;
      gap: 6px; padding: 18px 14px;
      background: rgba(255,255,255,.05); border: 1.5px solid rgba(255,255,255,.11);
      border-radius: 14px; color: #c0c8d8;
      font-family: inherit; cursor: pointer; transition: all .15s;
    }
    .yts-diff-card:hover { background: rgba(255,255,255,.1); border-color: rgba(255,255,255,.22); }
    .yts-diff-card.active {
      background: rgba(101,216,255,.13); border-color: #65d8ff; color: #65d8ff;
    }
    .yts-diff-label { font-size: 17px; font-weight: 700; letter-spacing: 1px; }
    .yts-diff-hint { font-size: 12px; opacity: .75; }

    .yts-start-row { display: flex; justify-content: center; padding-top: 8px; }
    .yts-start {
      padding: 15px 52px;
      background: linear-gradient(135deg, #ff6fbd, #c85fff);
      border: none; border-radius: 28px; color: #fff;
      font-size: 17px; font-weight: 700; font-family: inherit;
      cursor: pointer; letter-spacing: 2px;
      transition: transform .15s, opacity .15s;
      box-shadow: 0 6px 24px rgba(200,95,255,.4);
    }
    .yts-start:hover { transform: scale(1.04); opacity: .92; }
  `
  document.head.appendChild(style)
}
