import { afterEach, describe, expect, it, vi } from 'vitest'
import { pickSupportedMimeType, recordCanvas } from './canvasRecorder'

const originalMediaRecorder = (globalThis as { MediaRecorder?: unknown }).MediaRecorder

afterEach(() => {
  if (originalMediaRecorder === undefined) {
    delete (globalThis as { MediaRecorder?: unknown }).MediaRecorder
  } else {
    ;(globalThis as { MediaRecorder?: unknown }).MediaRecorder = originalMediaRecorder
  }
  vi.restoreAllMocks()
})

function stubMediaRecorder(supported: (mime: string) => boolean) {
  ;(globalThis as { MediaRecorder?: unknown }).MediaRecorder = {
    isTypeSupported: vi.fn(supported),
  }
}

describe('pickSupportedMimeType', () => {
  it('returns null when MediaRecorder is unavailable', () => {
    delete (globalThis as { MediaRecorder?: unknown }).MediaRecorder
    expect(pickSupportedMimeType()).toBeNull()
  })

  it('prefers mp4/h264 over webm', () => {
    stubMediaRecorder(() => true)
    expect(pickSupportedMimeType()).toBe('video/mp4;codecs=h264')
  })

  it('falls back to webm/vp9 when mp4 is not supported', () => {
    stubMediaRecorder(mime => mime.startsWith('video/webm'))
    expect(pickSupportedMimeType()).toBe('video/webm;codecs=vp9')
  })

  it('falls back to webm/vp8 when only vp8 is supported', () => {
    stubMediaRecorder(mime => mime === 'video/webm;codecs=vp8' || mime === 'video/webm')
    expect(pickSupportedMimeType()).toBe('video/webm;codecs=vp8')
  })

  it('returns null when no candidate MIME is supported', () => {
    stubMediaRecorder(() => false)
    expect(pickSupportedMimeType()).toBeNull()
  })
})

describe('recordCanvas', () => {
  it('rejects with non-positive duration', async () => {
    stubMediaRecorder(() => true)
    const canvas = document.createElement('canvas')
    await expect(recordCanvas(canvas, { durationMs: 0 })).rejects.toThrow(/durationMs/)
  })

  it('rejects when no MIME is supported', async () => {
    stubMediaRecorder(() => false)
    const canvas = document.createElement('canvas')
    await expect(recordCanvas(canvas, { durationMs: 1000 })).rejects.toThrow(/MediaRecorder/)
  })

  it('rejects when canvas.captureStream is unavailable', async () => {
    stubMediaRecorder(() => true)
    // jsdom 의 HTMLCanvasElement 에는 captureStream 이 없음 → 그대로 사용
    const canvas = document.createElement('canvas')
    await expect(recordCanvas(canvas, { durationMs: 1000 })).rejects.toThrow(/captureStream/)
  })
})
