import {
  DEFAULT_TAEKWONDO_BELT_COLOR,
  TAEKWONDO_BELT_COLORS,
  type TaekwondoBeltColor,
} from '@wish/api-client'

// BE 마을 광장 STOMP DTO (com.comong.backend.domain.village.realtime.dto) 와 미러.
// 스키마가 바뀌면 양쪽 같이 손봐야 한다.

export type PlayerDirection = 'up' | 'down' | 'left' | 'right'

export interface PositionPacket {
  x: number
  y: number
  dir: PlayerDirection
  moving: boolean
  textureKey: string
}

export interface VillageJoinEvent {
  type: 'join'
  userId: number
  nickname: string
  textureKey: string
  x: number
  y: number
  dir: PlayerDirection
}

export interface VillageMoveEvent {
  type: 'move'
  userId: number
  textureKey?: string
  x: number
  y: number
  dir: PlayerDirection
  moving: boolean
}

export interface VillageLeaveEvent {
  type: 'leave'
  userId: number
}

export interface VillageEmoteEvent {
  type: 'emote'
  userId: number
  emoji: string
}

export type VillageEvent =
  | VillageJoinEvent
  | VillageMoveEvent
  | VillageLeaveEvent
  | VillageEmoteEvent

export interface EmotePacket {
  emoji: string
}

/**
 * BE VillageEmojis.ALLOWED 와 동기. 변경 시 BE 화이트리스트도 같이.
 *
 * <p>S14P31E103-769: 이모지뿐 아니라 짧은 한글 메시지도 슬롯에 포함 — 또래 환자 간 간단한 소통. 키맵은 1\~9, 0 순서.
 * <p>S14P31E103-858: 5번 `힘내` 제거 후 0번에 현재 태권도 띠 자랑 슬롯을 둔다.
 */
export const TAEKWONDO_BELT_LABELS: Record<TaekwondoBeltColor, string> = {
  WHITE: '흰 띠',
  YELLOW: '노란 띠',
  ORANGE: '주황 띠',
  GREEN: '초록 띠',
  BLUE: '파란 띠',
  PURPLE: '보라 띠',
  BROWN: '갈색 띠',
  RED: '빨간 띠',
  BLACK: '검은 띠',
}

const TAEKWONDO_BELT_BOAST_PREFIX = 'taekwondo-belt:' as const
export const WHITE_BELT_PROMOTION_GUIDE_MESSAGE = '태권도 게임으로 승급해보세요'

export type TaekwondoBeltBoastEmoji = `${typeof TAEKWONDO_BELT_BOAST_PREFIX}${string}`

export const VILLAGE_BASE_EMOJIS = [
  '안녕',
  '따라와',
  '좋아',
  '고마워',
  '😄',
  '😢',
  '👍',
  '❤️',
  '❓',
] as const

export type VillageBaseEmoji = (typeof VILLAGE_BASE_EMOJIS)[number]
export type VillageEmoji = VillageBaseEmoji | TaekwondoBeltBoastEmoji

export function getTaekwondoBeltLabel(beltColor: TaekwondoBeltColor) {
  return TAEKWONDO_BELT_LABELS[beltColor]
}

export function createTaekwondoBeltBoastEmoji(
  beltColor: TaekwondoBeltColor,
): TaekwondoBeltBoastEmoji {
  return `${TAEKWONDO_BELT_BOAST_PREFIX}${beltColor}`
}

export const TAEKWONDO_BELT_BOAST_EMOJIS = TAEKWONDO_BELT_COLORS.map(createTaekwondoBeltBoastEmoji)
const TAEKWONDO_BELT_BOAST_EMOJI_SET = new Set<string>(TAEKWONDO_BELT_BOAST_EMOJIS)

export function isTaekwondoBeltBoastEmoji(emoji: string): emoji is TaekwondoBeltBoastEmoji {
  return TAEKWONDO_BELT_BOAST_EMOJI_SET.has(emoji)
}

export function getTaekwondoBeltColorFromBoastEmoji(emoji: string): TaekwondoBeltColor | null {
  return TAEKWONDO_BELT_COLORS.find(color => createTaekwondoBeltBoastEmoji(color) === emoji) ?? null
}

export function isWhiteBeltBoastEmoji(emoji: string) {
  return getTaekwondoBeltColorFromBoastEmoji(emoji) === 'WHITE'
}

export function createVillageEmojisForBelt(
  beltColor: TaekwondoBeltColor = DEFAULT_TAEKWONDO_BELT_COLOR,
): readonly VillageEmoji[] {
  return [...VILLAGE_BASE_EMOJIS, createTaekwondoBeltBoastEmoji(beltColor)]
}

export const VILLAGE_EMOJIS = createVillageEmojisForBelt()
export const VILLAGE_EMOJI_SLOT_COUNT = VILLAGE_EMOJIS.length

export interface SnapshotMember {
  userId: number
  nickname: string
  textureKey: string
  x: number
  y: number
  dir: PlayerDirection
}

export interface VillageSnapshot {
  members: SnapshotMember[]
}
