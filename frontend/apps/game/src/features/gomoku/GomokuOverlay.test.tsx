import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  createGomokuRoom,
  getGomokuMessages,
  getGomokuRanking,
  getMyGomokuStats,
  getGomokuRooms,
  heartbeatGomokuRoom,
  leaveGomokuRoom,
  listPatientProfiles,
  rematchGomokuRoom,
  swapGomokuRoomStones,
  type GomokuChatMessage,
  type GomokuRanking,
  type GomokuRoom,
  type GomokuRoomPage,
  type GomokuStats,
} from '@wish/api-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GomokuOverlay } from './GomokuOverlay'

vi.mock('@wish/api-client', () => ({
  createGomokuRoom: vi.fn(),
  getGomokuMessages: vi.fn(),
  getGomokuRanking: vi.fn(),
  getGomokuRoom: vi.fn(),
  getMyGomokuStats: vi.fn(),
  getGomokuRooms: vi.fn(),
  heartbeatGomokuRoom: vi.fn(),
  joinGomokuRoom: vi.fn(),
  leaveGomokuRoom: vi.fn(),
  listPatientProfiles: vi.fn(),
  playGomokuMove: vi.fn(),
  rematchGomokuRoom: vi.fn(),
  resignGomokuRoom: vi.fn(),
  sendGomokuMessage: vi.fn(),
  startGomokuRoom: vi.fn(),
  swapGomokuRoomStones: vi.fn(),
}))

const ONLINE_LABEL = '\uC628\uB77C\uC778'
const COMPUTER_LABEL = '\uCEF4\uD4E8\uD130'
const LOCAL_LABEL = '2\uC778'
const CLOSE_LABEL = '\uB2EB\uAE30'
const CREATE_ROOM_LABEL = '\uBC29 \uB9CC\uB4E4\uAE30'
const NEXT_ONLINE_GAME_LABEL = '\uB2E4\uC74C \uB300\uAD6D'
const SWAP_STONES_LABEL = '\uD751\uBC31 \uBCC0\uACBD'
const RANKING_LABEL = '\uB7AD\uD0B9'
const GAME_END_LABEL = '\uB300\uAD6D \uC885\uB8CC'
const GAME_START_LABEL = '\uB300\uAD6D \uC2DC\uC791'
const RESTART_LABEL = '\uC0C8 \uB300\uAD6D'
const BEGINNER_LABEL = '\uCD08\uAE09'
const NO_OPPONENT_LABEL = '\uC544\uC9C1 \uC5C6\uC74C'
const COMPUTER_LEVEL_LABEL = '\uCEF4\uD4E8\uD130 \uB09C\uC774\uB3C4'
const RULE_LABEL = '\uB8F0'
const FREESTYLE_LABEL = '\uC790\uC720\uB8F0'
const WINS_LABEL = '\uC2B9'
const DRAWS_LABEL = '\uBB34'
const LOSSES_LABEL = '\uD328'
const AUTH_REQUIRED_MESSAGE =
  '\uC628\uB77C\uC778 \uB300\uC804\uC740 \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD574\uC694.'
const COMPUTER_CARD_PATTERN = /\uCEF4\uD4E8\uD130 \uB300\uC804/
const ONLINE_CARD_PATTERN = /\uC628\uB77C\uC778 \uB300\uC804/

function chooseCard(pattern: RegExp = COMPUTER_CARD_PATTERN) {
  fireEvent.click(screen.getByRole('button', { name: pattern }))
}

function apiResponse<T>(data: T) {
  return {
    code: 'OK',
    message: 'OK',
    data,
  }
}

function emptyRoomPage(): GomokuRoomPage {
  return {
    totalElements: 0,
    totalPages: 0,
    pageable: {
      unpaged: false,
      pageNumber: 0,
      paged: true,
      pageSize: 12,
      offset: 0,
      sort: { unsorted: true, sorted: false, empty: true },
    },
    numberOfElements: 0,
    first: true,
    last: true,
    size: 12,
    content: [],
    number: 0,
    sort: { unsorted: true, sorted: false, empty: true },
    empty: true,
  }
}

const emptyStats: GomokuStats = {
  totalGames: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  winRate: 0,
}

const emptyRanking: GomokuRanking = {
  totalPlayers: 0,
  minGames: 1,
  entries: [],
  me: null,
}

const createdRoom: GomokuRoom = {
  id: 10,
  roomCode: 'ABC123',
  status: 'WAITING',
  ruleSet: 'RENJU_LITE',
  timerSeconds: 30,
  blackPlayer: {
    patientProfileId: 7,
    nickname: 'black',
    textureKey: 'character',
  },
  whitePlayer: null,
  currentTurn: 'BLACK',
  myStone: 'BLACK',
  result: null,
  endReason: null,
  winner: null,
  moveCount: 0,
  moves: [],
  ranked: false,
  createdAt: '2026-05-15T00:00:00',
  startedAt: null,
  finishedAt: null,
}

const cancelledRoom: GomokuRoom = {
  ...createdRoom,
  status: 'CANCELLED',
  myStone: null,
}

const finishedRoom: GomokuRoom = {
  ...createdRoom,
  id: 11,
  roomCode: 'FIN123',
  status: 'FINISHED',
  whitePlayer: {
    patientProfileId: 8,
    nickname: 'white',
    textureKey: 'character-outfit-girl1',
  },
  result: 'BLACK_WIN',
  endReason: 'FIVE',
  winner: createdRoom.blackPlayer,
  moveCount: 9,
  ranked: true,
  startedAt: '2026-05-15T00:01:00',
  finishedAt: '2026-05-15T00:05:00',
}

const readyRoom: GomokuRoom = {
  ...createdRoom,
  id: 12,
  roomCode: 'RDY123',
  whitePlayer: {
    patientProfileId: 8,
    nickname: 'white',
    textureKey: 'character-outfit-girl1',
  },
}

const swappedRoom: GomokuRoom = {
  ...readyRoom,
  blackPlayer: readyRoom.whitePlayer!,
  whitePlayer: readyRoom.blackPlayer,
  myStone: 'WHITE',
}

const rematchRoom: GomokuRoom = {
  ...readyRoom,
  id: 13,
  roomCode: 'REM123',
  blackPlayer: finishedRoom.whitePlayer!,
  whitePlayer: finishedRoom.blackPlayer,
  myStone: 'WHITE',
}

describe('GomokuOverlay online room creation', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.mocked(getGomokuRooms).mockResolvedValue(apiResponse(emptyRoomPage()))
    vi.mocked(getMyGomokuStats).mockResolvedValue(apiResponse(emptyStats))
    vi.mocked(getGomokuRanking).mockResolvedValue(apiResponse(emptyRanking))
    vi.mocked(heartbeatGomokuRoom).mockResolvedValue(apiResponse(createdRoom))
    vi.mocked(listPatientProfiles).mockResolvedValue(apiResponse([]))
    vi.mocked(getGomokuMessages).mockResolvedValue(apiResponse([] as GomokuChatMessage[]))
  })

  afterEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it('creates an online room when a patient profile is ready', async () => {
    vi.mocked(createGomokuRoom).mockResolvedValue(apiResponse(createdRoom))

    render(<GomokuOverlay open onClose={vi.fn()} patientProfileId={7} />)
    chooseCard()

    fireEvent.click(screen.getByRole('button', { name: LOCAL_LABEL }))
    fireEvent.click(screen.getByRole('button', { name: FREESTYLE_LABEL }))
    fireEvent.click(screen.getByRole('button', { name: ONLINE_LABEL }))
    fireEvent.click(screen.getByRole('button', { name: CREATE_ROOM_LABEL }))

    await waitFor(() => {
      expect(createGomokuRoom).toHaveBeenCalledWith({
        ruleSet: 'RENJU_LITE',
        timerSeconds: 30,
        textureKey: 'character',
      })
    })
    expect(await screen.findByText('ABC123')).toBeTruthy()
    expect(screen.getByText(NO_OPPONENT_LABEL)).toBeTruthy()
  })

  it('leaves the online room and resets state when the overlay closes', async () => {
    const onClose = vi.fn()
    vi.mocked(createGomokuRoom).mockResolvedValueOnce(apiResponse(createdRoom))
    vi.mocked(leaveGomokuRoom).mockResolvedValueOnce(apiResponse(cancelledRoom))

    render(<GomokuOverlay open onClose={onClose} patientProfileId={7} />)
    chooseCard(ONLINE_CARD_PATTERN)

    fireEvent.click(screen.getByRole('button', { name: CREATE_ROOM_LABEL }))

    expect(await screen.findByText('ABC123')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: CLOSE_LABEL }))

    expect(onClose).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(leaveGomokuRoom).toHaveBeenCalledWith(createdRoom.id)
    })
    await waitFor(() => {
      expect(screen.queryByText('ABC123')).toBeNull()
    })
    expect(screen.getByRole('button', { name: COMPUTER_LABEL }).className).toContain('active')
  })

  it('sends heartbeat while an online room is open', async () => {
    vi.mocked(createGomokuRoom).mockResolvedValueOnce(apiResponse(createdRoom))
    vi.mocked(heartbeatGomokuRoom).mockResolvedValue(apiResponse(createdRoom))

    render(<GomokuOverlay open onClose={vi.fn()} patientProfileId={7} />)
    chooseCard(ONLINE_CARD_PATTERN)

    fireEvent.click(screen.getByRole('button', { name: CREATE_ROOM_LABEL }))

    expect(await screen.findByText('ABC123')).toBeTruthy()

    await waitFor(
      () => {
        expect(heartbeatGomokuRoom).toHaveBeenCalledWith(createdRoom.id)
      },
      { timeout: 2500 },
    )
  })

  it('requests authentication instead of creating a room without a patient profile', async () => {
    const onAuthRequired = vi.fn()

    render(<GomokuOverlay open onClose={vi.fn()} onAuthRequired={onAuthRequired} />)
    chooseCard(ONLINE_CARD_PATTERN)

    fireEvent.click(screen.getByRole('button', { name: CREATE_ROOM_LABEL }))

    await waitFor(() => {
      expect(onAuthRequired).toHaveBeenCalledTimes(1)
    })
    expect(createGomokuRoom).not.toHaveBeenCalled()
    expect(screen.getAllByText(AUTH_REQUIRED_MESSAGE).length).toBeGreaterThan(0)
  })

  it('hides rule and computer difficulty controls in online mode', async () => {
    render(<GomokuOverlay open onClose={vi.fn()} patientProfileId={7} />)
    chooseCard(ONLINE_CARD_PATTERN)

    await waitFor(() => {
      expect(getGomokuRooms).toHaveBeenCalled()
    })
    expect(screen.queryByText(COMPUTER_LEVEL_LABEL)).toBeNull()
    expect(screen.queryByText(RULE_LABEL)).toBeNull()
  })

  it('finishes a computer match on five-in-a-row and restarts with an empty board', async () => {
    vi.useFakeTimers()
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)

    try {
      render(<GomokuOverlay open onClose={vi.fn()} patientProfileId={7} />)
      chooseCard()

      fireEvent.click(screen.getByRole('button', { name: BEGINNER_LABEL }))

      for (const cellName of ['11, 4', '11, 5', '11, 6', '11, 7']) {
        fireEvent.click(screen.getByRole('gridcell', { name: cellName }))
        await act(async () => {
          await vi.advanceTimersByTimeAsync(500)
        })
        expect(
          (screen.getByRole('gridcell', { name: '11, 8' }) as HTMLButtonElement).disabled,
        ).toBe(false)
      }

      fireEvent.click(screen.getByRole('gridcell', { name: '11, 8' }))

      expect(screen.getAllByText(GAME_END_LABEL).length).toBeGreaterThan(0)

      fireEvent.click(screen.getByRole('button', { name: RESTART_LABEL }))

      expect(screen.getAllByText(GAME_START_LABEL).length).toBeGreaterThan(0)
      expect(screen.getByRole('button', { name: COMPUTER_LABEL }).className).toContain('active')
    } finally {
      randomSpy.mockRestore()
      vi.useRealTimers()
    }
  }, 20000)

  it('lets the player swap stones against the computer and makes the computer open as black', async () => {
    vi.useFakeTimers()

    try {
      render(<GomokuOverlay open onClose={vi.fn()} patientProfileId={7} />)
      chooseCard()

      fireEvent.click(screen.getByRole('button', { name: SWAP_STONES_LABEL }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })

      expect(screen.getByRole('gridcell', { name: '8, 8' }).className).toContain('stone-black')
      expect((screen.getByRole('gridcell', { name: '8, 9' }) as HTMLButtonElement).disabled).toBe(
        false,
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('creates the next online match as a swapped rematch after a room finishes', async () => {
    vi.mocked(createGomokuRoom).mockResolvedValueOnce(apiResponse(finishedRoom))
    vi.mocked(rematchGomokuRoom).mockResolvedValueOnce(apiResponse(rematchRoom))

    render(<GomokuOverlay open onClose={vi.fn()} patientProfileId={7} />)
    chooseCard(ONLINE_CARD_PATTERN)

    fireEvent.click(screen.getByRole('button', { name: CREATE_ROOM_LABEL }))

    expect(await screen.findByText('FIN123')).toBeTruthy()
    expect(screen.getAllByText(GAME_END_LABEL).length).toBeGreaterThan(0)

    const createNextRoomButton = screen.getAllByRole('button', { name: NEXT_ONLINE_GAME_LABEL })[0]
    expect((createNextRoomButton as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(createNextRoomButton)

    await waitFor(() => {
      expect(rematchGomokuRoom).toHaveBeenCalledWith(finishedRoom.id)
    })
    expect(createGomokuRoom).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('REM123')).toBeTruthy()
    expect(screen.getAllByText('white').length).toBeGreaterThan(0)
  })

  it('lets the host swap black and white before starting an online room', async () => {
    vi.mocked(createGomokuRoom).mockResolvedValueOnce(apiResponse(readyRoom))
    vi.mocked(swapGomokuRoomStones).mockResolvedValueOnce(apiResponse(swappedRoom))

    render(<GomokuOverlay open onClose={vi.fn()} patientProfileId={7} />)
    chooseCard(ONLINE_CARD_PATTERN)

    fireEvent.click(screen.getByRole('button', { name: CREATE_ROOM_LABEL }))

    expect(await screen.findByText('RDY123')).toBeTruthy()
    const swapButton = screen.getByRole('button', { name: SWAP_STONES_LABEL })
    expect((swapButton as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(swapButton)

    await waitFor(() => {
      expect(swapGomokuRoomStones).toHaveBeenCalledWith(readyRoom.id)
    })
  })

  it('shows online ranking on the ranking tab', async () => {
    vi.mocked(getGomokuRanking).mockResolvedValue(
      apiResponse({
        ...emptyRanking,
        totalPlayers: 1,
        entries: [
          {
            rank: 1,
            patientProfileId: 9,
            nickname: 'ranker',
            totalGames: 5,
            wins: 4,
            draws: 0,
            losses: 1,
            winRate: 0.8,
            lastPlayedAt: '2026-05-15T00:00:00',
            isMe: false,
          },
        ],
      }),
    )

    render(<GomokuOverlay open onClose={vi.fn()} patientProfileId={7} />)
    chooseCard(ONLINE_CARD_PATTERN)

    fireEvent.click(screen.getByRole('button', { name: RANKING_LABEL }))

    expect(await screen.findByText('ranker')).toBeTruthy()
    expect(screen.getByText(`4${WINS_LABEL} 0${DRAWS_LABEL} 1${LOSSES_LABEL}`)).toBeTruthy()
    expect(screen.getByText('80%')).toBeTruthy()
  })
})
