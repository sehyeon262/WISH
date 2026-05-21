import { describe, expect, it } from 'vitest'

import {
  createTaekwondoBeltBoastEmoji,
  createVillageEmojisForBelt,
  getTaekwondoBeltColorFromBoastEmoji,
  isTaekwondoBeltBoastEmoji,
  isWhiteBeltBoastEmoji,
  VILLAGE_EMOJI_SLOT_COUNT,
} from './types'

describe('village realtime emote types', () => {
  it('shifts the palette after removing 힘내 and puts belt boast at 0 slot', () => {
    const emojis = createVillageEmojisForBelt('BLACK')

    expect(emojis).toHaveLength(VILLAGE_EMOJI_SLOT_COUNT)
    expect(emojis).toEqual([
      '안녕',
      '따라와',
      '좋아',
      '고마워',
      '😄',
      '😢',
      '👍',
      '❤️',
      '❓',
      'taekwondo-belt:BLACK',
    ])
  })

  it('detects taekwondo belt boast emotes', () => {
    const emote = createTaekwondoBeltBoastEmoji('RED')

    expect(emote).toBe('taekwondo-belt:RED')
    expect(isTaekwondoBeltBoastEmoji(emote)).toBe(true)
    expect(getTaekwondoBeltColorFromBoastEmoji(emote)).toBe('RED')
    expect(isTaekwondoBeltBoastEmoji('힘내')).toBe(false)
  })

  it('detects only white belt boast emotes for local promotion guidance', () => {
    expect(isWhiteBeltBoastEmoji(createTaekwondoBeltBoastEmoji('WHITE'))).toBe(true)
    expect(isWhiteBeltBoastEmoji(createTaekwondoBeltBoastEmoji('YELLOW'))).toBe(false)
    expect(isWhiteBeltBoastEmoji('안녕')).toBe(false)
  })
})
