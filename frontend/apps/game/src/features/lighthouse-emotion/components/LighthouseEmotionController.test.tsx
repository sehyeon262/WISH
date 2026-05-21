import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LighthouseEmotionController } from './LighthouseEmotionController'

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as Response
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve()
  })
}

async function advanceOpeningToEntry() {
  fireEvent.keyDown(window, { key: 'Enter' })
  await flushPromises()
  fireEvent.keyDown(window, { key: 'Enter' })
  await flushPromises()
}

describe('LighthouseEmotionController', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shows the fixed opening lines before the entry question is reached', async () => {
    const fetchMock = vi.mocked(fetch)
    const onTextChange = vi.fn()

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        code: 'CREATED',
        message: 'created',
        data: {
          sessionId: 1,
          status: 'IN_PROGRESS',
          scene: null,
        },
      }),
    )

    render(
      <LighthouseEmotionController
        patientProfileId={7}
        isOpen
        onClose={vi.fn()}
        onTextChange={onTextChange}
      />,
    )

    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/dialogue\/sessions$/),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          patientProfileId: 7,
          npcId: 'lighthouse_keeper',
          npcName: 'YEONGCHEOL',
          mode: 'LIGHTHOUSE_LLM',
        }),
      }),
    )
    expect(onTextChange).toHaveBeenCalledWith('안녕, 반가워!')
    expect(screen.queryByRole('group', { name: '말하기' })).toBeNull()
  })

  it('renders the STT overlay once the entry question is shown', async () => {
    const fetchMock = vi.mocked(fetch)
    const onTextChange = vi.fn()

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        code: 'CREATED',
        message: 'created',
        data: {
          sessionId: 2,
          status: 'IN_PROGRESS',
          scene: null,
        },
      }),
    )

    render(
      <LighthouseEmotionController
        patientProfileId={7}
        isOpen
        onClose={vi.fn()}
        onTextChange={onTextChange}
      />,
    )

    await flushPromises()
    await advanceOpeningToEntry()

    expect(onTextChange).toHaveBeenCalledWith('오늘은 기분이 어때?')
    expect(screen.getByRole('group', { name: '말하기' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '쉬고 싶어요' })).toBeNull()
  })

  it('shows a child-safe error message when start API fails', async () => {
    const fetchMock = vi.mocked(fetch)
    const onTextChange = vi.fn()

    fetchMock.mockResolvedValueOnce(jsonResponse({}, false))

    render(
      <LighthouseEmotionController
        patientProfileId={7}
        isOpen
        onClose={vi.fn()}
        onTextChange={onTextChange}
      />,
    )

    await flushPromises()

    expect(onTextChange).toHaveBeenCalled()
    expect(screen.queryByRole('group', { name: '말하기' })).toBeNull()
  })
})
