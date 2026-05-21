import { act, render } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LighthouseEmotionController } from './LighthouseEmotionController'

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as Response
}

describe('LighthouseEmotionController patient profile readiness', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('waits for a valid patient profile before starting the LLM session', async () => {
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        code: 'CREATED',
        message: 'created',
        data: {
          sessionId: 3,
          status: 'IN_PROGRESS',
          scene: {
            questionText: 'How are you today?',
            choices: [{ choiceIntentId: 'mood_okay', text: 'Okay' }],
            secondaryAction: null,
            shouldEndSession: false,
          },
        },
      }),
    )

    const { rerender } = render(
      <LighthouseEmotionController patientProfileId={0} isOpen onClose={vi.fn()} />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(fetchMock).not.toHaveBeenCalled()

    rerender(<LighthouseEmotionController patientProfileId={7} isOpen onClose={vi.fn()} />)

    await act(async () => {
      await Promise.resolve()
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/dialogue\/sessions$/),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"patientProfileId":7'),
      }),
    )
  })

  it('continues after the start response in React StrictMode', async () => {
    const fetchMock = vi.mocked(fetch)
    const onTextChange = vi.fn()

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        code: 'CREATED',
        message: 'created',
        data: {
          sessionId: 4,
          status: 'IN_PROGRESS',
          scene: {
            questionText: 'How are you today?',
            choices: [{ choiceIntentId: 'mood_okay', text: 'Okay' }],
            secondaryAction: null,
            shouldEndSession: false,
          },
        },
      }),
    )

    render(
      <StrictMode>
        <LighthouseEmotionController
          patientProfileId={7}
          isOpen
          onClose={vi.fn()}
          onTextChange={onTextChange}
        />
      </StrictMode>,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(onTextChange).toHaveBeenCalledWith('안녕, 반가워!')
  })
})
