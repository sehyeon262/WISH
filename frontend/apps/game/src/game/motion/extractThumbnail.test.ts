import { describe, expect, it } from 'vitest'
import { extractThumbnailFromVideoBlob } from './extractThumbnail'

describe('extractThumbnailFromVideoBlob', () => {
  it('rejects when blob is empty', async () => {
    const empty = new Blob([], { type: 'video/mp4' })
    await expect(extractThumbnailFromVideoBlob(empty)).rejects.toThrow(/empty/)
  })

  it('rejects when atSec is negative', async () => {
    const blob = new Blob([new Uint8Array([0])], { type: 'video/mp4' })
    await expect(extractThumbnailFromVideoBlob(blob, { atSec: -1 })).rejects.toThrow(/atSec/)
  })
})
