import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createGomokuRoom,
  getGomokuMessages,
  getGomokuRanking,
  getGomokuRoom,
  getGomokuRooms,
  getMyGomokuStats,
  heartbeatGomokuRoom,
  joinGomokuRoom,
  leaveGomokuRoom,
  playGomokuMove,
  rematchGomokuRoom,
  resignGomokuRoom,
  sendGomokuMessage,
  startGomokuRoom,
  swapGomokuRoomStones,
  type GomokuChatMessage,
  type GomokuEndReason,
  type GomokuRanking,
  type GomokuRoom,
  type GomokuRuleSet as ApiGomokuRuleSet,
  type GomokuStats,
  type GomokuStone as ApiGomokuStone,
} from '@wish/api-client'
import { assetPath } from '@/game/assets/assetPath'
import {
  PLAYER_OUTFITS,
  getPlayerOutfit,
  getSelectedPlayerCharacterId,
  getSelectedPlayerOutfitId,
  type PlayerOutfit,
} from '@/game/entities/player'
import { hasValidAuthToken } from '../auth'
import { resolvePatientProfileIdOrFetch } from '../exerciseSessions/patientProfile'
import {
  GOMOKU_BOARD_SIZE,
  applyMove,
  chooseComputerMove,
  deriveStatusFromMoves,
  detectForbiddenMove,
  isSamePosition,
  opponentOf,
  type ComputerLevel,
  type GameStatus,
  type GomokuMove,
  type Position,
  type RuleSet,
  type Stone,
} from './gomokuRules'
import './GomokuOverlay.css'

type GomokuOverlayProps = {
  open: boolean
  onClose: () => void
  patientProfileId?: number
  onAuthRequired?: () => void
}

type GameMode = 'local' | 'computer' | 'online'
type OnlinePanelTab = 'rooms' | 'stats' | 'ranking'

const DEFAULT_MODE: GameMode = 'computer'
const DEFAULT_COMPUTER_LEVEL: ComputerLevel = 'intermediate'
const DEFAULT_RULE_SET: RuleSet = 'renju-lite'
const DEFAULT_TIMER_ENABLED = true
const DEFAULT_HUMAN_STONE: Stone = 'black'
const DEFAULT_TIMER_SECONDS = 30
const ONLINE_RULE_SET: RuleSet = 'renju-lite'
const ONLINE_AVATAR_SIZE = 54
const ONLINE_AVATAR_FRAME_SIZE = 78
const COMPUTER_THINK_DELAY_MS = 420
const ONLINE_POLL_INTERVAL_MS = 1500
const DEMO_AUTH_ENABLED = import.meta.env.VITE_ENABLE_DEMO_AUTH === 'true'
const GOMOKU_BOARD_IMAGE_PATH = assetPath('images/village/objects/gomoku-board.png')

const text = {
  title: '\uAD11\uC7A5 \uC624\uBAA9',
  subtitle: '\uBC14\uB451\uD310 \uC55E\uC5D0\uC11C \uBC14\uB85C \uD55C \uD310',
  close: '\uB2EB\uAE30',
  mode: '\uB300\uC804',
  local: '2\uC778',
  computer: '\uCEF4\uD4E8\uD130',
  online: '\uC628\uB77C\uC778',
  computerLevel: '\uCEF4\uD4E8\uD130 \uB09C\uC774\uB3C4',
  beginner: '\uCD08\uAE09',
  intermediate: '\uC911\uAE09',
  advanced: '\uACE0\uAE09',
  rule: '\uB8F0',
  freestyle: '\uC790\uC720\uB8F0',
  renju: '\uAE08\uC218\uB8F0',
  timer: '\uD0C0\uC774\uBA38',
  timerOn: '\uCF1C\uAE30',
  timerOff: '\uB044\uAE30',
  restart: '\uC0C8 \uB300\uAD6D',
  undo: '\uBB34\uB974\uAE30',
  hint: '\uCD94\uCC9C\uC218',
  history: '\uAE30\uBCF4',
  black: '\uD751',
  white: '\uBC31',
  current: '\uCC28\uB840',
  wins: '\uC2B9',
  draws: '\uBB34',
  losses: '\uD328',
  winRate: '\uC2B9\uB960',
  totalGames: '\uC804\uC801',
  computerThinking: '\uCEF4\uD4E8\uD130\uAC00 \uC218\uB97C \uACC4\uC0B0\uD558\uB294 \uC911',
  forbidden: '\uAE08\uC218\uC785\uB2C8\uB2E4.',
  emptyHistory: '\uC544\uC9C1 \uB450\uC5B4\uC9C4 \uC218\uAC00 \uC5C6\uC5B4\uC694.',
  blackWins: '\uD751\uC758 \uC2B9\uB9AC',
  whiteWins: '\uBC31\uC758 \uC2B9\uB9AC',
  draw: '\uBB34\uC2B9\uBD80',
  playing: '\uB300\uAD6D \uC9C4\uD589 \uC911',
  timeout: '\uC2DC\uAC04\uC774 \uB05D\uB0AC\uC5B4\uC694.',
  five: '5\uBAA9\uC744 \uC644\uC131\uD588\uC5B4\uC694.',
  lobby: '\uB85C\uBE44',
  createRoom: '\uBC29 \uB9CC\uB4E4\uAE30',
  nextOnlineGame: '\uB2E4\uC74C \uB300\uAD6D',
  refresh: '\uC0C8\uB85C\uACE0\uCE68',
  join: '\uC785\uC7A5',
  leaveRoom: '\uBC29 \uB098\uAC00\uAE30',
  resign: '\uAE30\uAD8C',
  roomList: '\uBC29 \uBAA9\uB85D',
  roomStatusWaiting: '\uB300\uAE30 \uC911',
  roomStatusPlaying: '\uAC8C\uC784 \uC911',
  spectate: '\uAD00\uC804',
  spectateMode: '\uAD00\uC804 \uBAA8\uB4DC',
  exitSpectate: '\uAD00\uC804 \uB098\uAC00\uAE30',
  spectatorBadge: '\uAD00\uC804',
  waiting: '\uB300\uAE30',
  waitingOpponent: '\uC0C1\uB300\uB97C \uAE30\uB2E4\uB9AC\uB294 \uC911',
  noOpponent: '\uC544\uC9C1 \uC5C6\uC74C',
  waitingHostStart:
    '\uBC29\uC7A5\uC774 \uB300\uAD6D\uC744 \uC2DC\uC791\uD560 \uB54C\uAE4C\uC9C0 \uB300\uAE30',
  readyToStart: '\uC0C1\uB300 \uC785\uC7A5 \uC644\uB8CC',
  startRoom: '\uAC8C\uC784 \uC2DC\uC791',
  swapStones: '\uD751\uBC31 \uBCC0\uACBD',
  noRooms: '\uC785\uC7A5\uD560 \uBC29\uC774 \uC5C6\uC5B4\uC694.',
  roomCode: '\uBC29 \uCF54\uB4DC',
  myStats: '\uB0B4 \uC804\uC801',
  ranking: '\uB7AD\uD0B9',
  onlineOnlyRanked:
    '\uC628\uB77C\uC778 \uB300\uAD6D\uB9CC \uB7AD\uD0B9\uC5D0 \uBC18\uC601\uB3FC\uC694.',
  onlineLoadingFailed:
    '\uC628\uB77C\uC778 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC5B4\uC694.',
  onlineActionFailed: '\uC694\uCCAD\uC744 \uCC98\uB9AC\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694.',
  onlinePreparing:
    '\uC628\uB77C\uC778 \uB300\uC804\uC744 \uC900\uBE44\uD558\uB294 \uC911\uC774\uC5D0\uC694.',
  onlineAuthRequired:
    '\uC628\uB77C\uC778 \uB300\uC804\uC740 \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD574\uC694.',
  onlineProfileRequired:
    '\uC628\uB77C\uC778 \uB300\uC804\uC744 \uD558\uB824\uBA74 \uD658\uC790 \uD504\uB85C\uD544\uC774 \uD544\uC694\uD574\uC694.',
  cancelled: '\uBC29\uC774 \uB2EB\uD614\uC5B4\uC694.',
  resigned: '\uAE30\uAD8C\uC73C\uB85C \uB300\uAD6D\uC774 \uB05D\uB0AC\uC5B4\uC694.',
  left: '\uC0C1\uB300\uAC00 \uB098\uAC14\uC5B4\uC694.',
  myTurn: '\uB0B4 \uCC28\uB840',
  opponentTurn: '\uC0C1\uB300 \uCC28\uB840',
  ranked: '\uB7AD\uD0B9 \uBC18\uC601',
  emptyRanking: '\uC544\uC9C1 \uB7AD\uD0B9\uC774 \uC5C6\uC5B4\uC694.',
  finishedRoomNextGame:
    '\uB300\uAD6D\uC774 \uB05D\uB0AC\uC5B4\uC694. \uB2E4\uC74C \uB300\uAD6D\uC740 \uD751\uBC31\uC744 \uBC14\uAFC0 \uAC70\uC608\uC694.',
  onlineMatch: '\uC628\uB77C\uC778 \uB300\uC804',
  onlineLobbyGuide: '\uC628\uB77C\uC778 \uB85C\uBE44 \uC900\uBE44 \uC644\uB8CC',
  gameStart: '\uB300\uAD6D \uC2DC\uC791',
  onlineGameStart: '\uC628\uB77C\uC778 \uB300\uAD6D \uC2DC\uC791',
  gameEnd: '\uB300\uAD6D \uC885\uB8CC',
  finished: '\uC885\uB8CC',
  me: '\uB098',
  opponent: '\uC0C1\uB300',
  versus: 'VS',
  modeBadgeComputer: '\uD83E\uDD16 \uCEF4\uD4E8\uD130 \uB300\uC804',
  modeBadgeLocal: '\uD83D\uDC65 \uB458\uC774\uC11C \uB300\uC804',
  modeBadgeOnline: '\uD83C\uDF10 \uC628\uB77C\uC778 \uB300\uC804',
  modeSelectTitle: '\uC624\uBAA9 \uC5B4\uB5BB\uAC8C \uB458\uB798\uC694?',
  modeSelectSubtitle: '\uB300\uC804 \uBC29\uC2DD\uC744 \uACE8\uB77C\uC8FC\uC138\uC694',
  modeCardComputerDesc:
    '\uCEF4\uD4E8\uD130\uC640 \uD55C \uD310. \uCD08\uAE09/\uC911\uAE09/\uACE0\uAE09 \uB09C\uC774\uB3C4',
  modeCardLocalDesc:
    '\uAC19\uC740 \uD654\uBA74\uC5D0\uC11C \uB458\uC774 \uBC88\uAC08\uC544 \uD55C \uD310',
  modeCardOnlineDesc:
    '\uC628\uB77C\uC778 \uCE5C\uAD6C\uC640 \uB300\uAD6D\uD558\uACE0 \uB7AD\uD0B9\uC5D0\uB3C4 \uBC18\uC601',
  chatTitle: '\uB300\uAD6D \uCC44\uD305',
  chatEmpty: '\uC544\uC9C1 \uBA54\uC2DC\uC9C0\uAC00 \uC5C6\uC5B4\uC694',
  chatPlaceholder: '\uBA54\uC2DC\uC9C0\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694',
  chatSend: '\uBCF4\uB0B4\uAE30',
  chatSendError:
    '\uBA54\uC2DC\uC9C0\uB97C \uBCF4\uB0B4\uC9C0 \uBABB\uD588\uC5B4\uC694. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694',
} as const

const MODE_BADGE_LABEL: Record<GameMode, string> = {
  computer: text.modeBadgeComputer,
  local: text.modeBadgeLocal,
  online: text.modeBadgeOnline,
}

const timerOptions = [
  { label: '15\uCD08', value: 15 },
  { label: '30\uCD08', value: 30 },
  { label: '60\uCD08', value: 60 },
] as const

const starPoints = new Set(['3:3', '3:11', '7:7', '11:3', '11:11'])

export function GomokuOverlay({
  open,
  onClose,
  patientProfileId,
  onAuthRequired,
}: GomokuOverlayProps) {
  const [mode, setMode] = useState<GameMode>(DEFAULT_MODE)
  const [hasChosenMode, setHasChosenMode] = useState(false)
  useEffect(() => {
    if (!open) {
      setHasChosenMode(false)
    }
  }, [open])
  const [computerLevel, setComputerLevel] = useState<ComputerLevel>(DEFAULT_COMPUTER_LEVEL)
  const [ruleSet, setRuleSet] = useState<RuleSet>(DEFAULT_RULE_SET)
  const [timerEnabled, setTimerEnabled] = useState(DEFAULT_TIMER_ENABLED)
  const [timerSeconds, setTimerSeconds] = useState(DEFAULT_TIMER_SECONDS)
  const [moves, setMoves] = useState<GomokuMove[]>([])
  const [timers, setTimers] = useState<Record<Stone, number>>({
    black: DEFAULT_TIMER_SECONDS,
    white: DEFAULT_TIMER_SECONDS,
  })
  const [statusMessage, setStatusMessage] = useState('')
  const [timeoutWinner, setTimeoutWinner] = useState<Stone | null>(null)
  const [isComputerThinking, setIsComputerThinking] = useState(false)
  const [computerHumanStone, setComputerHumanStone] = useState<Stone>(DEFAULT_HUMAN_STONE)
  const [hintMove, setHintMove] = useState<Position | null>(null)
  const [scoreboard, setScoreboard] = useState({ black: 0, white: 0, draw: 0 })
  const [onlineRoom, setOnlineRoom] = useState<GomokuRoom | null>(null)
  const [lobbyRooms, setLobbyRooms] = useState<GomokuRoom[]>([])
  const [onlineStats, setOnlineStats] = useState<GomokuStats | null>(null)
  const [onlineRanking, setOnlineRanking] = useState<GomokuRanking | null>(null)
  const [onlineBusy, setOnlineBusy] = useState(false)
  const [onlineError, setOnlineError] = useState('')
  const [resolvedPatientProfileId, setResolvedPatientProfileId] = useState<number | undefined>()
  const [isResolvingOnlineProfile, setIsResolvingOnlineProfile] = useState(false)
  const [onlineTick, setOnlineTick] = useState(() => Date.now())
  const [selectedOnlineOutfit, setSelectedOnlineOutfit] = useState(() => getSelectedOnlineOutfit())
  const recordedResultRef = useRef<string | null>(null)
  const syncedOnlineResultRef = useRef<number | null>(null)
  const closeHandledRef = useRef(false)
  const wasOpenRef = useRef(open)
  const leavingRoomIdsRef = useRef(new Set<number>())

  const effectivePatientProfileId = isValidPatientProfileId(patientProfileId)
    ? patientProfileId
    : resolvedPatientProfileId
  const hasOnlinePatientProfile = isValidPatientProfileId(effectivePatientProfileId)

  const onlineMoves = useMemo(() => onlineRoom?.moves.map(toLocalMove) ?? [], [onlineRoom])
  const activeMoves = mode === 'online' ? onlineMoves : moves
  const activeRuleSet =
    mode === 'online' && onlineRoom ? fromApiRuleSet(onlineRoom.ruleSet) : ruleSet

  const { board, status } = useMemo(
    () => deriveStatusFromMoves(activeMoves, activeRuleSet, GOMOKU_BOARD_SIZE),
    [activeMoves, activeRuleSet],
  )
  const currentTurn: Stone =
    mode === 'online'
      ? onlineRoom
        ? fromApiStone(onlineRoom.currentTurn)
        : 'black'
      : moves.length % 2 === 0
        ? 'black'
        : 'white'
  const lastMove = activeMoves.at(-1)?.position ?? null
  const onlineGameStatus = useMemo(
    () => (onlineRoom ? getOnlineGameStatus(onlineRoom, status) : null),
    [onlineRoom, status],
  )
  const effectiveStatus = useMemo(
    () => onlineGameStatus ?? withTimeoutStatus(status, timeoutWinner),
    [onlineGameStatus, status, timeoutWinner],
  )
  const onlineRoomId = onlineRoom?.id ?? null
  const onlineRoomStatus = onlineRoom?.status ?? null
  const myOnlineStone = onlineRoom?.myStone ? fromApiStone(onlineRoom.myStone) : null
  const isOnlineSpectator = onlineRoom?.viewerRole === 'SPECTATOR'
  const onlineStatusMessage = onlineRoom
    ? getOnlineStatusMessage(onlineRoom, myOnlineStone, currentTurn)
    : ''
  const onlineProfileNotice = hasOnlinePatientProfile
    ? ''
    : isResolvingOnlineProfile
      ? text.onlinePreparing
      : getOnlineRequirementMessage()
  const computerStone = opponentOf(computerHumanStone)
  const canHumanPlay =
    mode === 'online'
      ? Boolean(
          onlineRoom &&
          onlineRoom.status === 'PLAYING' &&
          myOnlineStone === currentTurn &&
          effectiveStatus.phase === 'playing',
        )
      : effectiveStatus.phase === 'playing' &&
        (mode === 'local' || currentTurn === computerHumanStone)
  const onlineTimers = useMemo(
    () =>
      onlineRoom
        ? calculateOnlineTimers(onlineRoom, onlineTick || Date.now())
        : { black: timerSeconds, white: timerSeconds },
    [onlineRoom, onlineTick, timerSeconds],
  )
  const resetGame = useCallback(() => {
    setMoves([])
    setTimers({ black: timerSeconds, white: timerSeconds })
    setStatusMessage('')
    setTimeoutWinner(null)
    setHintMove(null)
    setIsComputerThinking(false)
    recordedResultRef.current = null
  }, [timerSeconds])

  const resetOverlayState = useCallback(() => {
    setMode(DEFAULT_MODE)
    setComputerLevel(DEFAULT_COMPUTER_LEVEL)
    setRuleSet(DEFAULT_RULE_SET)
    setTimerEnabled(DEFAULT_TIMER_ENABLED)
    setTimerSeconds(DEFAULT_TIMER_SECONDS)
    setMoves([])
    setTimers({ black: DEFAULT_TIMER_SECONDS, white: DEFAULT_TIMER_SECONDS })
    setStatusMessage('')
    setTimeoutWinner(null)
    setIsComputerThinking(false)
    setComputerHumanStone(DEFAULT_HUMAN_STONE)
    setHintMove(null)
    setScoreboard({ black: 0, white: 0, draw: 0 })
    setOnlineRoom(null)
    setLobbyRooms([])
    setOnlineStats(null)
    setOnlineRanking(null)
    setOnlineBusy(false)
    setOnlineError('')
    setResolvedPatientProfileId(undefined)
    setIsResolvingOnlineProfile(false)
    setOnlineTick(Date.now())
    setSelectedOnlineOutfit(getSelectedOnlineOutfit())
    recordedResultRef.current = null
    syncedOnlineResultRef.current = null
  }, [])

  const leaveOnlineRoomSilently = useCallback((room: GomokuRoom | null) => {
    if (!room || room.status === 'FINISHED' || room.status === 'CANCELLED') return
    if (room.viewerRole === 'SPECTATOR') return
    if (leavingRoomIdsRef.current.has(room.id)) return

    leavingRoomIdsRef.current.add(room.id)
    void Promise.resolve(leaveGomokuRoom(room.id))
      .catch(() => undefined)
      .finally(() => {
        leavingRoomIdsRef.current.delete(room.id)
      })
  }, [])

  const handleClose = useCallback(() => {
    closeHandledRef.current = true
    leaveOnlineRoomSilently(onlineRoom)
    resetOverlayState()
    onClose()
  }, [leaveOnlineRoomSilently, onClose, onlineRoom, resetOverlayState])

  useEffect(() => {
    if (!open) return
    setSelectedOnlineOutfit(getSelectedOnlineOutfit())
  }, [open])

  const loadOnlineDashboard = useCallback(async () => {
    try {
      const [roomsResponse, statsResponse, rankingResponse] = await Promise.all([
        getGomokuRooms({ size: 12 }),
        getMyGomokuStats(),
        getGomokuRanking(10, 1),
      ])
      setLobbyRooms(roomsResponse.data?.content ?? [])
      setOnlineStats(statsResponse.data ?? null)
      setOnlineRanking(rankingResponse.data ?? null)
      setOnlineError('')
    } catch (error) {
      setOnlineError(getApiErrorMessage(error, text.onlineLoadingFailed))
    }
  }, [])

  const refreshOnlineRoom = useCallback(async (roomId: number, asSpectator: boolean) => {
    try {
      const response = asSpectator ? await getGomokuRoom(roomId) : await heartbeatGomokuRoom(roomId)
      if (!response.data) {
        throw new Error(text.onlineLoadingFailed)
      }
      const roomPatientProfileId = getMyPatientProfileIdFromRoom(response.data)
      if (roomPatientProfileId) {
        setResolvedPatientProfileId(roomPatientProfileId)
      }
      setOnlineRoom(response.data)
      setOnlineError('')
    } catch (error) {
      setOnlineError(getApiErrorMessage(error, text.onlineLoadingFailed))
    }
  }, [])

  const handleModeChange = useCallback((nextMode: GameMode) => {
    setMode(nextMode)
    if (nextMode === 'online') {
      setTimerEnabled(true)
      setRuleSet(ONLINE_RULE_SET)
    }
  }, [])

  const ensureOnlinePatientProfile = useCallback(async () => {
    if (hasOnlinePatientProfile) return true

    setIsResolvingOnlineProfile(true)
    try {
      const resolvedId = await resolvePatientProfileIdOrFetch()
      if (isValidPatientProfileId(resolvedId)) {
        setResolvedPatientProfileId(resolvedId)
        setOnlineError('')
        return true
      }

      if (DEMO_AUTH_ENABLED && !hasValidAuthToken()) {
        return true
      }

      const message = getOnlineRequirementMessage()
      setOnlineError(message)
      if (!hasValidAuthToken()) {
        onAuthRequired?.()
      }
      return false
    } finally {
      setIsResolvingOnlineProfile(false)
    }
  }, [hasOnlinePatientProfile, onAuthRequired])

  const handleOnlineCreate = useCallback(async () => {
    setOnlineBusy(true)
    try {
      if (!(await ensureOnlinePatientProfile())) return
      const response = await createGomokuRoom({
        ruleSet: toApiRuleSet(ONLINE_RULE_SET),
        timerSeconds,
        textureKey: selectedOnlineOutfit.textureKey,
      })
      if (!response.data) {
        throw new Error(text.onlineActionFailed)
      }
      const roomPatientProfileId = getMyPatientProfileIdFromRoom(response.data)
      if (roomPatientProfileId) {
        setResolvedPatientProfileId(roomPatientProfileId)
      }
      setOnlineRoom(response.data)
      setOnlineError('')
      await loadOnlineDashboard()
    } catch (error) {
      setOnlineError(getApiErrorMessage(error, text.onlineActionFailed))
    } finally {
      setOnlineBusy(false)
    }
  }, [
    ensureOnlinePatientProfile,
    loadOnlineDashboard,
    selectedOnlineOutfit.textureKey,
    timerSeconds,
  ])

  const handleOnlineRefresh = useCallback(async () => {
    setOnlineBusy(true)
    try {
      if (!(await ensureOnlinePatientProfile())) return
      await loadOnlineDashboard()
      if (onlineRoomId) {
        await refreshOnlineRoom(onlineRoomId, isOnlineSpectator)
      }
    } finally {
      setOnlineBusy(false)
    }
  }, [
    ensureOnlinePatientProfile,
    isOnlineSpectator,
    loadOnlineDashboard,
    onlineRoomId,
    refreshOnlineRoom,
  ])

  const handleOnlineJoin = useCallback(
    async (roomId: number) => {
      setOnlineBusy(true)
      try {
        if (!(await ensureOnlinePatientProfile())) return
        const response = await joinGomokuRoom(roomId, {
          textureKey: selectedOnlineOutfit.textureKey,
        })
        if (!response.data) {
          throw new Error(text.onlineActionFailed)
        }
        const roomPatientProfileId = getMyPatientProfileIdFromRoom(response.data)
        if (roomPatientProfileId) {
          setResolvedPatientProfileId(roomPatientProfileId)
        }
        setOnlineRoom(response.data)
        setOnlineError('')
        await loadOnlineDashboard()
      } catch (error) {
        setOnlineError(getApiErrorMessage(error, text.onlineActionFailed))
      } finally {
        setOnlineBusy(false)
      }
    },
    [ensureOnlinePatientProfile, loadOnlineDashboard, selectedOnlineOutfit.textureKey],
  )

  const handleOnlineSpectate = useCallback(
    async (roomId: number) => {
      setOnlineBusy(true)
      try {
        if (!(await ensureOnlinePatientProfile())) return
        const response = await getGomokuRoom(roomId)
        if (!response.data) {
          throw new Error(text.onlineActionFailed)
        }
        setOnlineRoom(response.data)
        setOnlineError('')
      } catch (error) {
        setOnlineError(getApiErrorMessage(error, text.onlineActionFailed))
      } finally {
        setOnlineBusy(false)
      }
    },
    [ensureOnlinePatientProfile],
  )

  const handleOnlineStart = useCallback(async () => {
    if (!onlineRoomId) return
    setOnlineBusy(true)
    try {
      const response = await startGomokuRoom(onlineRoomId)
      if (!response.data) {
        throw new Error(text.onlineActionFailed)
      }
      setOnlineRoom(response.data)
      setOnlineError('')
      await loadOnlineDashboard()
    } catch (error) {
      setOnlineError(getApiErrorMessage(error, text.onlineActionFailed))
    } finally {
      setOnlineBusy(false)
    }
  }, [loadOnlineDashboard, onlineRoomId])

  const handleOnlineSwapStones = useCallback(async () => {
    if (!onlineRoomId) return
    setOnlineBusy(true)
    try {
      const response = await swapGomokuRoomStones(onlineRoomId)
      if (!response.data) {
        throw new Error(text.onlineActionFailed)
      }
      setOnlineRoom(response.data)
      setOnlineError('')
      await loadOnlineDashboard()
    } catch (error) {
      setOnlineError(getApiErrorMessage(error, text.onlineActionFailed))
    } finally {
      setOnlineBusy(false)
    }
  }, [loadOnlineDashboard, onlineRoomId])

  const handleOnlineRematch = useCallback(async () => {
    if (!onlineRoomId) return
    setOnlineBusy(true)
    try {
      const response = await rematchGomokuRoom(onlineRoomId)
      if (!response.data) {
        throw new Error(text.onlineActionFailed)
      }
      const roomPatientProfileId = getMyPatientProfileIdFromRoom(response.data)
      if (roomPatientProfileId) {
        setResolvedPatientProfileId(roomPatientProfileId)
      }
      setOnlineRoom(response.data)
      setOnlineError('')
      await loadOnlineDashboard()
    } catch (error) {
      setOnlineError(getApiErrorMessage(error, text.onlineActionFailed))
    } finally {
      setOnlineBusy(false)
    }
  }, [loadOnlineDashboard, onlineRoomId])

  const handleOnlineResign = useCallback(async () => {
    if (!onlineRoomId) return
    setOnlineBusy(true)
    try {
      const response = await resignGomokuRoom(onlineRoomId)
      if (!response.data) {
        throw new Error(text.onlineActionFailed)
      }
      setOnlineRoom(response.data)
      setOnlineError('')
      await loadOnlineDashboard()
    } catch (error) {
      setOnlineError(getApiErrorMessage(error, text.onlineActionFailed))
    } finally {
      setOnlineBusy(false)
    }
  }, [loadOnlineDashboard, onlineRoomId])

  const handleOnlineLeave = useCallback(async () => {
    if (!onlineRoomId) return
    if (onlineRoom?.viewerRole === 'SPECTATOR') {
      setOnlineRoom(null)
      await loadOnlineDashboard()
      return
    }
    if (onlineRoom?.status === 'FINISHED' || onlineRoom?.status === 'CANCELLED') {
      setOnlineRoom(null)
      await loadOnlineDashboard()
      return
    }

    setOnlineBusy(true)
    try {
      const response = await leaveGomokuRoom(onlineRoomId)
      if (!response.data) {
        throw new Error(text.onlineActionFailed)
      }
      setOnlineRoom(null)
      setOnlineError('')
      await loadOnlineDashboard()
    } catch (error) {
      setOnlineError(getApiErrorMessage(error, text.onlineActionFailed))
    } finally {
      setOnlineBusy(false)
    }
  }, [loadOnlineDashboard, onlineRoom, onlineRoomId])

  const handleOnlineCellClick = useCallback(
    async (position: Position) => {
      if (!onlineRoomId || !canHumanPlay) return
      if (board[position.row][position.col]) return

      const forbidden = detectForbiddenMove(board, position, currentTurn, activeRuleSet)
      if (forbidden) {
        setOnlineError(forbidden.message)
        return
      }

      setOnlineBusy(true)
      try {
        const response = await playGomokuMove(onlineRoomId, position)
        if (!response.data) {
          throw new Error(text.onlineActionFailed)
        }
        setOnlineRoom(response.data)
        setOnlineError('')
        if (response.data.status === 'FINISHED') {
          await loadOnlineDashboard()
        }
      } catch (error) {
        setOnlineError(getApiErrorMessage(error, text.onlineActionFailed))
      } finally {
        setOnlineBusy(false)
      }
    },
    [activeRuleSet, board, canHumanPlay, currentTurn, loadOnlineDashboard, onlineRoomId],
  )

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        handleClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [handleClose, open])

  useEffect(() => {
    if (open) {
      closeHandledRef.current = false
      wasOpenRef.current = true
      return
    }

    if (wasOpenRef.current) {
      if (!closeHandledRef.current) {
        closeHandledRef.current = true
        leaveOnlineRoomSilently(onlineRoom)
      }
      resetOverlayState()
    }
    wasOpenRef.current = false
  }, [leaveOnlineRoomSilently, onlineRoom, open, resetOverlayState])

  useEffect(() => {
    if (open || !onlineRoom) return
    leaveOnlineRoomSilently(onlineRoom)
    resetOverlayState()
  }, [leaveOnlineRoomSilently, onlineRoom, open, resetOverlayState])

  useEffect(() => {
    if (
      !open ||
      mode === 'online' ||
      !timerEnabled ||
      effectiveStatus.phase !== 'playing' ||
      isComputerThinking
    ) {
      return
    }

    const intervalId = window.setInterval(() => {
      setTimers(previous => {
        const nextValue = Math.max(0, previous[currentTurn] - 1)
        const nextTimers = { ...previous, [currentTurn]: nextValue }
        if (nextValue === 0) {
          setTimeoutWinner(opponentOf(currentTurn))
        }
        return nextTimers
      })
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [currentTurn, effectiveStatus.phase, isComputerThinking, mode, open, timerEnabled])

  useEffect(() => {
    if (
      !open ||
      mode !== 'computer' ||
      currentTurn !== computerStone ||
      effectiveStatus.phase !== 'playing'
    ) {
      setIsComputerThinking(false)
      return
    }

    setIsComputerThinking(true)
    const timeoutId = window.setTimeout(() => {
      const nextMove = chooseComputerMove(board, computerLevel, computerStone, ruleSet)
      setMoves(previousMoves => {
        if (!nextMove || previousMoves.length !== moves.length) return previousMoves
        return [...previousMoves, { position: nextMove, stone: computerStone, source: 'computer' }]
      })
      setStatusMessage('')
      setHintMove(null)
      setIsComputerThinking(false)
    }, COMPUTER_THINK_DELAY_MS)

    return () => window.clearTimeout(timeoutId)
  }, [
    board,
    computerLevel,
    computerStone,
    currentTurn,
    effectiveStatus.phase,
    mode,
    moves.length,
    open,
    ruleSet,
  ])

  useEffect(() => {
    if (mode === 'online') return

    if (effectiveStatus.phase === 'playing') {
      recordedResultRef.current = null
      return
    }

    const resultKey =
      effectiveStatus.phase === 'draw'
        ? `draw:${moves.length}`
        : `${effectiveStatus.winner}:${effectiveStatus.reason}:${moves.length}`
    if (recordedResultRef.current === resultKey) return

    recordedResultRef.current = resultKey
    setScoreboard(previous => {
      if (effectiveStatus.phase === 'draw') {
        return { ...previous, draw: previous.draw + 1 }
      }
      return { ...previous, [effectiveStatus.winner]: previous[effectiveStatus.winner] + 1 }
    })
  }, [effectiveStatus, mode, moves.length])

  useEffect(() => {
    if (mode !== 'online') {
      resetGame()
    }
  }, [mode, resetGame, ruleSet, timerSeconds])

  useEffect(() => {
    if (!open || mode === 'online' || !timerEnabled || effectiveStatus.phase !== 'playing') {
      return
    }
    setTimers(previous => ({ ...previous, [currentTurn]: timerSeconds }))
  }, [currentTurn, effectiveStatus.phase, mode, open, timerEnabled, timerSeconds])

  useEffect(() => {
    if (!open || mode !== 'online' || !hasOnlinePatientProfile) return
    void loadOnlineDashboard()
  }, [hasOnlinePatientProfile, loadOnlineDashboard, mode, open])

  useEffect(() => {
    if (!open) {
      setResolvedPatientProfileId(undefined)
      setIsResolvingOnlineProfile(false)
      return
    }

    if (mode !== 'online' || hasOnlinePatientProfile) {
      setIsResolvingOnlineProfile(false)
      return
    }

    let isCancelled = false
    setIsResolvingOnlineProfile(true)

    void resolvePatientProfileIdOrFetch()
      .then(resolvedId => {
        if (isCancelled) return
        if (isValidPatientProfileId(resolvedId)) {
          setResolvedPatientProfileId(resolvedId)
          setOnlineError('')
          return
        }
        if (!(DEMO_AUTH_ENABLED && !hasValidAuthToken())) {
          setOnlineError(getOnlineRequirementMessage())
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsResolvingOnlineProfile(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [hasOnlinePatientProfile, mode, open])

  useEffect(() => {
    if (
      !open ||
      mode !== 'online' ||
      onlineRoomId === null ||
      (onlineRoomStatus !== 'WAITING' && onlineRoomStatus !== 'PLAYING')
    ) {
      return
    }

    const intervalId = window.setInterval(() => {
      void refreshOnlineRoom(onlineRoomId, isOnlineSpectator)
    }, ONLINE_POLL_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [isOnlineSpectator, mode, onlineRoomId, onlineRoomStatus, open, refreshOnlineRoom])

  useEffect(() => {
    if (!open || mode !== 'online' || onlineRoomStatus !== 'PLAYING') return
    setOnlineTick(Date.now())
    const intervalId = window.setInterval(() => setOnlineTick(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [mode, onlineRoomStatus, open])

  useEffect(() => {
    if (
      mode !== 'online' ||
      onlineRoomId === null ||
      (onlineRoomStatus !== 'FINISHED' && onlineRoomStatus !== 'CANCELLED') ||
      syncedOnlineResultRef.current === onlineRoomId
    ) {
      return
    }
    syncedOnlineResultRef.current = onlineRoomId
    void loadOnlineDashboard()
  }, [loadOnlineDashboard, mode, onlineRoomId, onlineRoomStatus])

  if (!open) return null

  const canStartOnlineRoom =
    mode === 'online' &&
    onlineRoom?.status === 'WAITING' &&
    Boolean(onlineRoom.whitePlayer) &&
    myOnlineStone === 'black'
  const canSwapOnlineStones =
    mode === 'online' &&
    onlineRoom?.status === 'WAITING' &&
    Boolean(onlineRoom.whitePlayer) &&
    myOnlineStone === 'black'
  const canRematchOnlineRoom =
    mode === 'online' && Boolean(onlineRoom?.status === 'FINISHED' && onlineRoom.whitePlayer)

  const handleCellClick = (position: Position) => {
    if (mode === 'online') {
      void handleOnlineCellClick(position)
      return
    }

    if (!canHumanPlay) return
    if (board[position.row][position.col]) return

    const forbidden = detectForbiddenMove(board, position, currentTurn, ruleSet)
    if (forbidden) {
      setStatusMessage(forbidden.message)
      return
    }

    try {
      applyMove(board, position, currentTurn)
    } catch {
      return
    }

    setMoves(previous => [...previous, { position, stone: currentTurn, source: 'human' }])
    setStatusMessage('')
    setHintMove(null)
  }

  const handleUndo = () => {
    if (mode === 'online') return
    setMoves(previous =>
      previous.slice(0, Math.max(0, previous.length - (mode === 'computer' ? 2 : 1))),
    )
    setStatusMessage('')
    setHintMove(null)
    setTimeoutWinner(null)
    recordedResultRef.current = null
  }

  const handleSwapComputerStones = () => {
    if (mode !== 'computer') return
    setComputerHumanStone(previous => opponentOf(previous))
    resetGame()
  }

  const handleHint = () => {
    if (mode === 'online' || effectiveStatus.phase !== 'playing') return
    const move = chooseComputerMove(board, 'advanced', currentTurn, ruleSet)
    setHintMove(move)
    setStatusMessage(
      move
        ? `${formatMoveNumber(move)} ${text.hint}`
        : '\uCD94\uCC9C\uD560 \uC218\uAC00 \uC5C6\uC5B4\uC694.',
    )
  }

  return (
    <div className="gomoku-backdrop" role="dialog" aria-modal="true" aria-label={text.title}>
      <section className={`gomoku-shell ${hasChosenMode ? `mode-${mode}` : 'mode-select'}`}>
        <header className={`gomoku-topbar ${hasChosenMode ? `mode-${mode}` : 'mode-select'}`}>
          <div className="gomoku-topbar-title">
            {hasChosenMode ? (
              <span className={`gomoku-mode-badge mode-${mode}`}>{MODE_BADGE_LABEL[mode]}</span>
            ) : null}
            <div>
              <h1>{text.title}</h1>
              <p>{text.subtitle}</p>
            </div>
          </div>
          <button type="button" className="gomoku-close-button" onClick={handleClose}>
            {text.close}
          </button>
        </header>

        {hasChosenMode ? (
          <main className="gomoku-layout">
            <section className="gomoku-board-zone" aria-label={text.title}>
              <StatusBanner
                status={effectiveStatus}
                currentTurn={currentTurn}
                isComputerThinking={mode === 'computer' && isComputerThinking}
                mode={mode}
                room={onlineRoom}
                myOnlineStone={myOnlineStone}
                moveCount={activeMoves.length}
                message={
                  mode === 'online'
                    ? onlineError ||
                      (isResolvingOnlineProfile ? text.onlinePreparing : onlineStatusMessage)
                    : statusMessage
                }
              />
              <div className="gomoku-board-wrap">
                <div className="gomoku-board" role="grid" aria-label="15 x 15 gomoku board">
                  {board.map((row, rowIndex) =>
                    row.map((cell, colIndex) => {
                      const position = { row: rowIndex, col: colIndex }
                      const winning = effectiveStatus.winningLine?.some(linePosition =>
                        isSamePosition(linePosition, position),
                      )
                      const last = isSamePosition(lastMove, position)
                      const hinted = mode !== 'online' && isSamePosition(hintMove, position)
                      const className = [
                        'gomoku-cell',
                        cell ? `stone-${cell}` : '',
                        winning ? 'winning' : '',
                        last ? 'last' : '',
                        hinted ? 'hinted' : '',
                        !cell && starPoints.has(`${rowIndex}:${colIndex}`) ? 'star' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')

                      return (
                        <button
                          key={`${rowIndex}:${colIndex}`}
                          type="button"
                          role="gridcell"
                          style={{
                            left: `${(colIndex / (GOMOKU_BOARD_SIZE - 1)) * 100}%`,
                            top: `${(rowIndex / (GOMOKU_BOARD_SIZE - 1)) * 100}%`,
                          }}
                          className={className}
                          aria-label={`${rowIndex + 1}, ${colIndex + 1}`}
                          disabled={
                            !canHumanPlay || Boolean(cell) || (mode === 'online' && onlineBusy)
                          }
                          onClick={() => handleCellClick(position)}
                        >
                          {cell ? <span className="gomoku-stone" aria-hidden="true" /> : null}
                        </button>
                      )
                    }),
                  )}
                </div>
                <BoardPhaseOverlay
                  status={effectiveStatus}
                  mode={mode}
                  room={onlineRoom}
                  currentTurn={currentTurn}
                  myOnlineStone={myOnlineStone}
                  moveCount={activeMoves.length}
                  message={mode === 'online' ? onlineStatusMessage : statusMessage}
                />
              </div>
            </section>

            <aside className="gomoku-side">
              <ModePanel mode={mode} onModeChange={handleModeChange} />
              {mode !== 'online' ? (
                <ControlPanel
                  mode={mode}
                  computerLevel={computerLevel}
                  ruleSet={ruleSet}
                  timerEnabled={timerEnabled}
                  timerSeconds={timerSeconds}
                  onComputerLevelChange={setComputerLevel}
                  onRuleSetChange={setRuleSet}
                  onTimerEnabledChange={setTimerEnabled}
                  onTimerSecondsChange={setTimerSeconds}
                />
              ) : null}
              {mode === 'online' ? (
                <>
                  <OnlinePanel
                    room={onlineRoom}
                    lobbyRooms={lobbyRooms}
                    stats={onlineStats}
                    ranking={onlineRanking}
                    busy={onlineBusy}
                    profileNotice={onlineProfileNotice}
                    onCreateRoom={handleOnlineCreate}
                    onRematchRoom={handleOnlineRematch}
                    onRefreshRooms={handleOnlineRefresh}
                    onJoinRoom={handleOnlineJoin}
                    onSpectateRoom={handleOnlineSpectate}
                  />
                  <OnlineVersusPanel
                    room={onlineRoom}
                    currentTurn={currentTurn}
                    myOnlineStone={myOnlineStone}
                    selectedOutfit={selectedOnlineOutfit}
                    timers={onlineTimers}
                  />
                  {onlineRoom ? (
                    <ChatPanel
                      roomId={onlineRoom.id}
                      myPatientProfileId={resolvedPatientProfileId}
                    />
                  ) : null}
                </>
              ) : null}
              {mode !== 'online' ? (
                <PracticeVersusPanel
                  mode={mode}
                  currentTurn={currentTurn}
                  timers={timers}
                  scoreboard={scoreboard}
                  timerEnabled={timerEnabled}
                  computerLevel={computerLevel}
                  humanStone={computerHumanStone}
                  selectedOutfit={selectedOnlineOutfit}
                />
              ) : null}
              {mode === 'online' ? (
                <ControlPanel
                  mode={mode}
                  computerLevel={computerLevel}
                  ruleSet={ruleSet}
                  timerEnabled={timerEnabled}
                  timerSeconds={timerSeconds}
                  onComputerLevelChange={setComputerLevel}
                  onRuleSetChange={setRuleSet}
                  onTimerEnabledChange={setTimerEnabled}
                  onTimerSecondsChange={setTimerSeconds}
                />
              ) : null}
              <MoveHistory moves={activeMoves} />
              {mode === 'online' ? (
                <div className="gomoku-actions" aria-label="\uB300\uAD6D \uBA85\uB839">
                  {isOnlineSpectator ? (
                    <>
                      <span className="gomoku-spectator-badge">{text.spectateMode}</span>
                      <button type="button" onClick={handleOnlineRefresh} disabled={onlineBusy}>
                        {text.refresh}
                      </button>
                      <button
                        type="button"
                        onClick={handleOnlineLeave}
                        disabled={!onlineRoom || onlineBusy}
                      >
                        {text.exitSpectate}
                      </button>
                    </>
                  ) : (
                    <>
                      {canRematchOnlineRoom ? (
                        <button type="button" onClick={handleOnlineRematch} disabled={onlineBusy}>
                          {text.nextOnlineGame}
                        </button>
                      ) : null}
                      <button type="button" onClick={handleOnlineRefresh} disabled={onlineBusy}>
                        {text.refresh}
                      </button>
                      {!canRematchOnlineRoom ? (
                        <button
                          type="button"
                          onClick={handleOnlineStart}
                          disabled={!canStartOnlineRoom || onlineBusy}
                        >
                          {text.startRoom}
                        </button>
                      ) : null}
                      {canSwapOnlineStones ? (
                        <button
                          type="button"
                          onClick={handleOnlineSwapStones}
                          disabled={onlineBusy}
                        >
                          {text.swapStones}
                        </button>
                      ) : null}
                      {onlineRoom?.status === 'PLAYING' ? (
                        <button type="button" onClick={handleOnlineResign} disabled={onlineBusy}>
                          {text.resign}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={handleOnlineLeave}
                        disabled={!onlineRoom || onlineBusy}
                      >
                        {text.leaveRoom}
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="gomoku-actions" aria-label="\uB300\uAD6D \uBA85\uB839">
                  <button type="button" onClick={resetGame}>
                    {text.restart}
                  </button>
                  {mode === 'computer' ? (
                    <button type="button" onClick={handleSwapComputerStones}>
                      {text.swapStones}
                    </button>
                  ) : null}
                  <button type="button" onClick={handleUndo} disabled={moves.length === 0}>
                    {text.undo}
                  </button>
                  <button
                    type="button"
                    onClick={handleHint}
                    disabled={effectiveStatus.phase !== 'playing'}
                  >
                    {text.hint}
                  </button>
                </div>
              )}
            </aside>
          </main>
        ) : (
          <ModeSelectionScreen
            onSelect={picked => {
              handleModeChange(picked)
              setHasChosenMode(true)
            }}
          />
        )}
      </section>
    </div>
  )
}

function ChatPanel({
  roomId,
  myPatientProfileId,
}: {
  roomId: number
  myPatientProfileId?: number
}) {
  const [messages, setMessages] = useState<GomokuChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    async function tick() {
      try {
        const result = await getGomokuMessages(roomId)
        if (cancelled) return
        setMessages(result.data)
      } catch {
        // 다음 폴링에서 다시 시도
      }
      if (cancelled) return
      timer = setTimeout(tick, 2000)
    }
    tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [roomId])

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  async function handleSend(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed || sending) return
    setSending(true)
    setError('')
    try {
      const result = await sendGomokuMessage(roomId, { content: trimmed })
      const saved = result.data
      setMessages(previous => {
        if (previous.some(message => message.id === saved.id)) {
          return previous
        }
        return [...previous, saved]
      })
      setDraft('')
    } catch {
      setError(text.chatSendError)
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="gomoku-panel gomoku-chat-panel" aria-label={text.chatTitle}>
      <header className="gomoku-chat-panel-heading">
        <h3>{text.chatTitle}</h3>
      </header>
      <div ref={listRef} className="gomoku-chat-list">
        {messages.length === 0 ? (
          <p className="gomoku-chat-empty">{text.chatEmpty}</p>
        ) : (
          messages.map(message => (
            <div
              key={message.id}
              className={`gomoku-chat-message ${
                message.senderPatientProfileId === myPatientProfileId ? 'mine' : 'opponent'
              }${message.senderRole === 'SPECTATOR' ? ' is-spectator' : ''}`}
            >
              <span className="gomoku-chat-message-author">
                {message.senderNickname}
                {message.senderRole === 'SPECTATOR' ? (
                  <em className="gomoku-chat-message-role-badge">{text.spectatorBadge}</em>
                ) : null}
              </span>
              <span className="gomoku-chat-message-content">{message.content}</span>
            </div>
          ))
        )}
      </div>
      <form className="gomoku-chat-form" onSubmit={handleSend}>
        <input
          type="text"
          value={draft}
          onChange={event => setDraft(event.target.value.slice(0, 200))}
          placeholder={text.chatPlaceholder}
          maxLength={200}
          disabled={sending}
        />
        <button type="submit" disabled={sending || !draft.trim()}>
          {text.chatSend}
        </button>
      </form>
      <p className="gomoku-chat-counter">{draft.length}/200</p>
      {error ? <p className="gomoku-chat-error">{error}</p> : null}
    </section>
  )
}

function ModeSelectionScreen({ onSelect }: { onSelect: (mode: GameMode) => void }) {
  return (
    <div className="gomoku-mode-select">
      <section className="gomoku-mode-select-hero">
        <div className="gomoku-mode-select-copy">
          <span className="gomoku-mode-select-kicker">{text.title}</span>
          <h2>{text.modeSelectTitle}</h2>
          <p>{text.modeSelectSubtitle}</p>
        </div>
        <div className="gomoku-mode-select-preview" aria-hidden="true">
          <img src={GOMOKU_BOARD_IMAGE_PATH} alt="" />
        </div>
      </section>
      <div className="gomoku-mode-select-grid">
        <button
          type="button"
          className="gomoku-mode-select-card mode-computer"
          onClick={() => onSelect('computer')}
        >
          <span className="gomoku-mode-select-card-art" aria-hidden="true">
            <span className="gomoku-card-stone black" />
            <span className="gomoku-card-stone white" />
            <span className="gomoku-card-line" />
          </span>
          <span className="gomoku-mode-select-card-copy">
            <strong>{text.modeBadgeComputer}</strong>
            <span>{text.modeCardComputerDesc}</span>
          </span>
        </button>
        <button
          type="button"
          className="gomoku-mode-select-card mode-local"
          onClick={() => onSelect('local')}
        >
          <span className="gomoku-mode-select-card-art" aria-hidden="true">
            <span className="gomoku-card-stone black" />
            <span className="gomoku-card-stone white" />
            <span className="gomoku-card-line" />
          </span>
          <span className="gomoku-mode-select-card-copy">
            <strong>{text.modeBadgeLocal}</strong>
            <span>{text.modeCardLocalDesc}</span>
          </span>
        </button>
        <button
          type="button"
          className="gomoku-mode-select-card mode-online"
          onClick={() => onSelect('online')}
        >
          <span className="gomoku-mode-select-card-art" aria-hidden="true">
            <span className="gomoku-card-stone black" />
            <span className="gomoku-card-stone white" />
            <span className="gomoku-card-line" />
          </span>
          <span className="gomoku-mode-select-card-copy">
            <strong>{text.modeBadgeOnline}</strong>
            <span>{text.modeCardOnlineDesc}</span>
          </span>
        </button>
      </div>
    </div>
  )
}

function ModePanel({
  mode,
  onModeChange,
}: {
  mode: GameMode
  onModeChange: (mode: GameMode) => void
}) {
  return (
    <section className="gomoku-panel gomoku-mode-panel" aria-label={text.mode}>
      <span>{text.mode}</span>
      <div className="gomoku-segmented gomoku-mode-segmented">
        <button
          type="button"
          className={mode === 'computer' ? 'active' : ''}
          onClick={() => onModeChange('computer')}
        >
          {text.computer}
        </button>
        <button
          type="button"
          className={mode === 'local' ? 'active' : ''}
          onClick={() => onModeChange('local')}
        >
          {text.local}
        </button>
        <button
          type="button"
          className={mode === 'online' ? 'active' : ''}
          onClick={() => onModeChange('online')}
        >
          {text.online}
        </button>
      </div>
    </section>
  )
}

function ControlPanel({
  mode,
  computerLevel,
  ruleSet,
  timerEnabled,
  timerSeconds,
  onComputerLevelChange,
  onRuleSetChange,
  onTimerEnabledChange,
  onTimerSecondsChange,
}: {
  mode: GameMode
  computerLevel: ComputerLevel
  ruleSet: RuleSet
  timerEnabled: boolean
  timerSeconds: number
  onComputerLevelChange: (level: ComputerLevel) => void
  onRuleSetChange: (ruleSet: RuleSet) => void
  onTimerEnabledChange: (enabled: boolean) => void
  onTimerSecondsChange: (seconds: number) => void
}) {
  return (
    <section className="gomoku-panel">
      {mode !== 'online' ? (
        <div className="gomoku-control-group">
          <span>{text.computerLevel}</span>
          <div className="gomoku-segmented">
            {(['beginner', 'intermediate', 'advanced'] as const).map(level => (
              <button
                key={level}
                type="button"
                className={computerLevel === level ? 'active' : ''}
                disabled={mode !== 'computer'}
                onClick={() => onComputerLevelChange(level)}
              >
                {level === 'beginner'
                  ? text.beginner
                  : level === 'intermediate'
                    ? text.intermediate
                    : text.advanced}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {mode !== 'online' ? (
        <div className="gomoku-control-group">
          <span>{text.rule}</span>
          <div className="gomoku-segmented">
            <button
              type="button"
              className={ruleSet === 'renju-lite' ? 'active' : ''}
              onClick={() => onRuleSetChange('renju-lite')}
            >
              {text.renju}
            </button>
            <button
              type="button"
              className={ruleSet === 'freestyle' ? 'active' : ''}
              onClick={() => onRuleSetChange('freestyle')}
            >
              {text.freestyle}
            </button>
          </div>
        </div>
      ) : null}

      <div className="gomoku-control-group">
        <span>{text.timer}</span>
        <div className="gomoku-segmented">
          <button
            type="button"
            className={timerEnabled ? 'active' : ''}
            onClick={() => onTimerEnabledChange(true)}
          >
            {text.timerOn}
          </button>
          <button
            type="button"
            className={!timerEnabled ? 'active' : ''}
            disabled={mode === 'online'}
            onClick={() => onTimerEnabledChange(false)}
          >
            {text.timerOff}
          </button>
        </div>
      </div>

      <div className="gomoku-timer-options">
        {timerOptions.map(option => (
          <button
            key={option.value}
            type="button"
            className={timerSeconds === option.value ? 'active' : ''}
            disabled={!timerEnabled}
            onClick={() => onTimerSecondsChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  )
}

const computerOpponents: Record<ComputerLevel, { name: string; imagePath: string }> = {
  beginner: {
    name: '\uCF54\uBABD',
    imagePath: assetPath('images/village/background/character/komonge.png'),
  },
  intermediate: {
    name: '\uC870\uC740',
    imagePath: assetPath('images/village/background/character/joeun.png'),
  },
  advanced: {
    name: '\uC138\uD604',
    imagePath: assetPath('images/village/background/character/sehyun.png'),
  },
}

function PracticeVersusPanel({
  mode,
  currentTurn,
  timers,
  scoreboard,
  timerEnabled,
  computerLevel,
  humanStone,
  selectedOutfit,
}: {
  mode: Exclude<GameMode, 'online'>
  currentTurn: Stone
  timers: Record<Stone, number>
  scoreboard: Record<Stone, number> & { draw: number }
  timerEnabled: boolean
  computerLevel: ComputerLevel
  humanStone: Stone
  selectedOutfit: PlayerOutfit
}) {
  const opponent = computerOpponents[computerLevel]
  const blackIsHuman = mode === 'computer' ? humanStone === 'black' : true
  const whiteIsHuman = mode === 'computer' ? humanStone === 'white' : false

  return (
    <section className="gomoku-panel gomoku-online-versus gomoku-practice-versus">
      <div className="gomoku-online-versus-heading">
        <h2>{mode === 'computer' ? text.computer : text.local}</h2>
        <span>
          {text.current}: {currentTurn === 'black' ? text.black : text.white}
        </span>
      </div>
      <div className="gomoku-versus-grid">
        <PracticePlayerCard
          stone="black"
          name={mode === 'computer' ? (blackIsHuman ? text.me : opponent.name) : text.black}
          isTurn={currentTurn === 'black'}
          timerLabel={timerEnabled ? formatTime(timers.black) : '--:--'}
          resultLabel={`${scoreboard.black}${text.wins}`}
          outfit={blackIsHuman ? selectedOutfit : undefined}
          imagePath={mode === 'computer' && !blackIsHuman ? opponent.imagePath : undefined}
        />
        <span className="gomoku-versus-mark">{text.versus}</span>
        <PracticePlayerCard
          stone="white"
          name={mode === 'computer' ? (whiteIsHuman ? text.me : opponent.name) : text.white}
          isTurn={currentTurn === 'white'}
          timerLabel={timerEnabled ? formatTime(timers.white) : '--:--'}
          resultLabel={`${scoreboard.white}${text.wins} / ${scoreboard.draw}${text.draw}`}
          outfit={whiteIsHuman ? selectedOutfit : undefined}
          imagePath={mode === 'computer' && !whiteIsHuman ? opponent.imagePath : undefined}
        />
      </div>
    </section>
  )
}

function PracticePlayerCard({
  stone,
  name,
  isTurn,
  timerLabel,
  resultLabel,
  outfit,
  imagePath,
}: {
  stone: Stone
  name: string
  isTurn: boolean
  timerLabel: string
  resultLabel: string
  outfit?: PlayerOutfit
  imagePath?: string
}) {
  const stoneLabel = stone === 'black' ? text.black : text.white

  return (
    <div className={`gomoku-versus-player ${stone} ${isTurn ? 'active' : ''}`}>
      <div className="gomoku-versus-avatar">
        {outfit ? (
          <img
            className="gomoku-versus-avatar-sheet"
            src={outfit.sheetPath}
            alt=""
            aria-hidden="true"
            style={{
              width: `${ONLINE_AVATAR_FRAME_SIZE * 4}px`,
              height: `${ONLINE_AVATAR_FRAME_SIZE * 4}px`,
              transform: `translate(${(ONLINE_AVATAR_SIZE - ONLINE_AVATAR_FRAME_SIZE) / 2}px, 0)`,
            }}
          />
        ) : imagePath ? (
          <img className="gomoku-versus-npc-image" src={imagePath} alt="" aria-hidden="true" />
        ) : (
          <span className={`gomoku-versus-stone ${stone}`} aria-hidden="true" />
        )}
      </div>
      <div>
        <span>{stoneLabel}</span>
        <strong>{name}</strong>
        <em>{isTurn ? text.current : resultLabel}</em>
        <time>{timerLabel}</time>
      </div>
    </div>
  )
}

function OnlinePanel({
  room,
  lobbyRooms,
  stats,
  ranking,
  busy,
  onCreateRoom,
  onRematchRoom,
  onRefreshRooms,
  onJoinRoom,
  onSpectateRoom,
  profileNotice,
}: {
  room: GomokuRoom | null
  lobbyRooms: GomokuRoom[]
  stats: GomokuStats | null
  ranking: GomokuRanking | null
  busy: boolean
  profileNotice: string
  onCreateRoom: () => void
  onRematchRoom: () => void
  onRefreshRooms: () => void
  onJoinRoom: (roomId: number) => void
  onSpectateRoom: (roomId: number) => void
}) {
  const [activeTab, setActiveTab] = useState<OnlinePanelTab>('rooms')
  const canChooseNextRoom = !room || isClosedOnlineRoom(room)
  const canRematchRoom = Boolean(room?.status === 'FINISHED' && room.whitePlayer)

  return (
    <section className="gomoku-panel gomoku-online-panel">
      <div className="gomoku-panel-heading">
        <h2>{text.online}</h2>
        <span>{text.onlineOnlyRanked}</span>
      </div>

      {room ? (
        <div className="gomoku-current-room">
          <div>
            <span>{text.roomCode}</span>
            <strong>{room.roomCode}</strong>
          </div>
          <em>{formatRoomStatus(room)}</em>
        </div>
      ) : null}

      <div className="gomoku-online-tabs" role="tablist" aria-label={text.online}>
        <button
          type="button"
          className={activeTab === 'rooms' ? 'active' : ''}
          aria-pressed={activeTab === 'rooms'}
          onClick={() => setActiveTab('rooms')}
        >
          {text.lobby}
        </button>
        <button
          type="button"
          className={activeTab === 'stats' ? 'active' : ''}
          aria-pressed={activeTab === 'stats'}
          onClick={() => setActiveTab('stats')}
        >
          {text.myStats}
        </button>
        <button
          type="button"
          className={activeTab === 'ranking' ? 'active' : ''}
          aria-pressed={activeTab === 'ranking'}
          onClick={() => setActiveTab('ranking')}
        >
          {text.ranking}
        </button>
      </div>

      <div className="gomoku-online-tab-panel">
        {activeTab === 'rooms' ? (
          !canChooseNextRoom && room ? (
            <p className="gomoku-online-message">
              {room.status === 'WAITING'
                ? room.whitePlayer
                  ? text.readyToStart
                  : text.waitingOpponent
                : formatRoomStatus(room)}
            </p>
          ) : (
            <>
              {room ? (
                <p className="gomoku-online-message">
                  {canRematchRoom ? text.finishedRoomNextGame : formatRoomStatus(room)}
                </p>
              ) : null}
              <div className="gomoku-online-actions">
                <button
                  type="button"
                  onClick={canRematchRoom ? onRematchRoom : onCreateRoom}
                  disabled={busy}
                >
                  {canRematchRoom ? text.nextOnlineGame : text.createRoom}
                </button>
                <button type="button" onClick={onRefreshRooms} disabled={busy}>
                  {text.refresh}
                </button>
              </div>
              {profileNotice ? <p className="gomoku-online-message">{profileNotice}</p> : null}

              <div className="gomoku-room-list" aria-label={text.roomList}>
                <h3>{text.roomList}</h3>
                {lobbyRooms.length === 0 ? (
                  <p>{text.noRooms}</p>
                ) : (
                  lobbyRooms.map(lobbyRoom => {
                    const isPlaying = lobbyRoom.status === 'PLAYING'
                    const opponentNickname = lobbyRoom.whitePlayer?.nickname ?? null
                    return (
                      <div
                        className={`gomoku-room-row${isPlaying ? ' is-playing' : ''}`}
                        key={lobbyRoom.id}
                      >
                        <div>
                          <strong>
                            {lobbyRoom.blackPlayer.nickname}
                            {opponentNickname ? ` vs ${opponentNickname}` : ''}
                          </strong>
                          <span>
                            <em
                              className={`gomoku-room-status-badge ${
                                isPlaying ? 'is-playing' : 'is-waiting'
                              }`}
                            >
                              {isPlaying ? text.roomStatusPlaying : text.roomStatusWaiting}
                            </em>
                            {' · '}
                            {lobbyRoom.roomCode}
                            {' · '}
                            {formatRuleSet(fromApiRuleSet(lobbyRoom.ruleSet))}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            isPlaying ? onSpectateRoom(lobbyRoom.id) : onJoinRoom(lobbyRoom.id)
                          }
                          disabled={busy}
                        >
                          {isPlaying ? text.spectate : text.join}
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            </>
          )
        ) : null}

        {activeTab === 'stats' ? (
          <div className="gomoku-stats-grid">
            <div>
              <span>{text.totalGames}</span>
              <strong>{stats?.totalGames ?? 0}</strong>
            </div>
            <div>
              <span>{text.wins}</span>
              <strong>{stats?.wins ?? 0}</strong>
            </div>
            <div>
              <span>{text.draws}</span>
              <strong>{stats?.draws ?? 0}</strong>
            </div>
            <div>
              <span>{text.losses}</span>
              <strong>{stats?.losses ?? 0}</strong>
            </div>
            <div>
              <span>{text.winRate}</span>
              <strong>{formatPercent(stats?.winRate ?? 0)}</strong>
            </div>
          </div>
        ) : null}

        {activeTab === 'ranking' ? (
          <div className="gomoku-ranking">
            <h3>{text.ranking}</h3>
            {ranking && ranking.entries.length > 0 ? (
              <ol>
                {ranking.entries.map(entry => (
                  <li key={entry.patientProfileId} className={entry.isMe ? 'me' : ''}>
                    <span>{entry.rank}</span>
                    <div className="gomoku-ranking-player">
                      <strong>{entry.nickname}</strong>
                      <span>{`${entry.wins}${text.wins} ${entry.draws}${text.draws} ${entry.losses}${text.losses}`}</span>
                    </div>
                    <em>{formatPercent(entry.winRate)}</em>
                  </li>
                ))}
              </ol>
            ) : (
              <p>{text.emptyRanking}</p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function OnlineVersusPanel({
  room,
  currentTurn,
  myOnlineStone,
  selectedOutfit,
  timers,
}: {
  room: GomokuRoom | null
  currentTurn: Stone
  myOnlineStone: Stone | null
  selectedOutfit: PlayerOutfit
  timers: Record<Stone, number>
}) {
  const blackPlayer = room?.blackPlayer ?? null
  const whitePlayer = room?.whitePlayer ?? null
  const isPlaying = room?.status === 'PLAYING'
  const blackIsMe = myOnlineStone === 'black' || !room
  const whiteIsMe = myOnlineStone === 'white'

  return (
    <section className="gomoku-panel gomoku-online-versus">
      <div className="gomoku-online-versus-heading">
        <h2>{text.onlineMatch}</h2>
        <span>{room ? `${text.roomCode} ${room.roomCode}` : text.onlineLobbyGuide}</span>
      </div>
      <div className="gomoku-versus-grid">
        <OnlinePlayerCard
          stone="black"
          player={blackPlayer}
          fallbackName={room ? text.black : text.me}
          outfit={blackIsMe ? selectedOutfit : getOnlinePlayerOutfit(blackPlayer, 0)}
          isMe={blackIsMe}
          isTurn={isPlaying && currentTurn === 'black'}
          statusLabel={getOnlinePlayerStateLabel(room, 'black', currentTurn)}
          timerLabel={getOnlinePlayerTimerLabel(room, timers, 'black')}
        />
        <span className="gomoku-versus-mark">{text.versus}</span>
        <OnlinePlayerCard
          stone="white"
          player={whitePlayer}
          fallbackName={room ? text.noOpponent : text.opponent}
          outfit={whiteIsMe ? selectedOutfit : getOnlinePlayerOutfit(whitePlayer, 1)}
          isMe={whiteIsMe}
          isTurn={isPlaying && currentTurn === 'white'}
          isWaiting={Boolean(room && !whitePlayer)}
          statusLabel={getOnlinePlayerStateLabel(room, 'white', currentTurn)}
          timerLabel={getOnlinePlayerTimerLabel(room, timers, 'white')}
        />
      </div>
    </section>
  )
}

function OnlinePlayerCard({
  stone,
  player,
  fallbackName,
  outfit,
  isMe,
  isTurn: isActiveTurn,
  statusLabel,
  timerLabel,
  isWaiting = false,
}: {
  stone: Stone
  player: GomokuRoom['blackPlayer'] | null
  fallbackName: string
  outfit: PlayerOutfit
  isMe: boolean
  isTurn: boolean
  statusLabel: string
  timerLabel: string
  isWaiting?: boolean
}) {
  const stoneLabel = `${stone === 'black' ? text.black : text.white} / ${statusLabel}`

  return (
    <div
      className={[
        'gomoku-versus-player',
        stone,
        isMe ? 'me' : '',
        isActiveTurn ? 'active' : '',
        isWaiting ? 'waiting' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="gomoku-versus-avatar">
        <img
          className="gomoku-versus-avatar-sheet"
          src={outfit.sheetPath}
          alt=""
          aria-hidden="true"
          style={{
            width: `${ONLINE_AVATAR_FRAME_SIZE * 4}px`,
            height: `${ONLINE_AVATAR_FRAME_SIZE * 4}px`,
            transform: `translate(${(ONLINE_AVATAR_SIZE - ONLINE_AVATAR_FRAME_SIZE) / 2}px, 0)`,
          }}
        />
      </div>
      <div>
        <span>{isMe ? text.me : text.opponent}</span>
        <strong>{player?.nickname ?? fallbackName}</strong>
        <em>{stoneLabel}</em>
        <time>{timerLabel}</time>
      </div>
    </div>
  )
}

function StatusBanner({
  status,
  currentTurn,
  isComputerThinking,
  mode,
  room,
  myOnlineStone,
  moveCount,
  message,
}: {
  status: GameStatus
  currentTurn: Stone
  isComputerThinking: boolean
  mode: GameMode
  room: GomokuRoom | null
  myOnlineStone: Stone | null
  moveCount: number
  message: string
}) {
  const presentation = getStatusPresentation({
    status,
    currentTurn,
    isComputerThinking,
    mode,
    room,
    myOnlineStone,
    moveCount,
    message,
  })

  return (
    <div className={`gomoku-status ${presentation.tone}`}>
      <div className="gomoku-status-copy">
        <em>{presentation.label}</em>
        <strong>{presentation.headline}</strong>
      </div>
      <p>{presentation.detail}</p>
    </div>
  )
}

function BoardPhaseOverlay({
  status,
  mode,
  room,
  currentTurn,
  myOnlineStone,
  moveCount,
  message,
}: {
  status: GameStatus
  mode: GameMode
  room: GomokuRoom | null
  currentTurn: Stone
  myOnlineStone: Stone | null
  moveCount: number
  message: string
}) {
  const shouldShow =
    status.phase !== 'playing' ||
    moveCount === 0 ||
    (mode === 'online' && (!room || room.status !== 'PLAYING'))

  if (!shouldShow) return null

  const presentation = getStatusPresentation({
    status,
    currentTurn,
    isComputerThinking: false,
    mode,
    room,
    myOnlineStone,
    moveCount,
    message,
  })

  return (
    <div className={`gomoku-board-phase ${presentation.tone}`}>
      <span>{presentation.label}</span>
      <strong>{presentation.headline}</strong>
      <em>{presentation.detail}</em>
    </div>
  )
}

function getStatusPresentation({
  status,
  currentTurn,
  isComputerThinking,
  mode,
  room,
  myOnlineStone,
  moveCount,
  message,
}: {
  status: GameStatus
  currentTurn: Stone
  isComputerThinking: boolean
  mode: GameMode
  room: GomokuRoom | null
  myOnlineStone: Stone | null
  moveCount: number
  message: string
}) {
  const turnDetail =
    mode === 'online' && myOnlineStone
      ? myOnlineStone === currentTurn
        ? text.myTurn
        : text.opponentTurn
      : `${currentTurn === 'black' ? text.black : text.white} ${text.current}`

  if (mode === 'online' && !room) {
    return {
      tone: 'online',
      label: text.onlineMatch,
      headline: text.lobby,
      detail: text.onlineLobbyGuide,
    } as const
  }

  if (room?.status === 'CANCELLED') {
    return {
      tone: 'ended',
      label: text.finished,
      headline: text.cancelled,
      detail: text.finishedRoomNextGame,
    } as const
  }

  if (status.phase === 'won') {
    const winner = status.winner === 'black' ? text.blackWins : text.whiteWins
    const reason = message || (status.reason === 'timeout' ? text.timeout : text.five)
    return {
      tone: 'ended',
      label: text.finished,
      headline: text.gameEnd,
      detail: `${winner} · ${reason}`,
    } as const
  }

  if (status.phase === 'draw') {
    return {
      tone: 'ended',
      label: text.finished,
      headline: text.gameEnd,
      detail: `${text.draw} · ${message || '\uBC14\uB451\uD310\uC774 \uAC00\uB4DD \uCC3C\uC5B4\uC694.'}`,
    } as const
  }

  if (mode === 'online' && room?.status === 'WAITING') {
    const waitingDetail = room.whitePlayer
      ? myOnlineStone === 'black'
        ? text.readyToStart
        : text.waitingHostStart
      : text.onlineLobbyGuide
    return {
      tone: 'online',
      label: `${text.roomCode} ${room.roomCode}`,
      headline: room.whitePlayer ? text.readyToStart : text.waitingOpponent,
      detail: waitingDetail,
    } as const
  }

  if (mode === 'online' && room?.status === 'PLAYING') {
    return {
      tone: 'online',
      label: `${text.roomCode} ${room.roomCode}`,
      headline: moveCount === 0 ? text.onlineGameStart : text.playing,
      detail: message || turnDetail,
    } as const
  }

  return {
    tone: 'playing',
    label: mode === 'computer' ? text.computer : text.local,
    headline: moveCount === 0 ? text.gameStart : text.playing,
    detail: isComputerThinking ? text.computerThinking : message || turnDetail,
  } as const
}

function getSelectedOnlineOutfit() {
  const characterId = getSelectedPlayerCharacterId()
  return getPlayerOutfit(getSelectedPlayerOutfitId(characterId))
}

function getOnlinePlayerOutfit(player: GomokuRoom['blackPlayer'] | null, fallbackIndex: number) {
  const selectedOutfit = PLAYER_OUTFITS.find(outfit => outfit.textureKey === player?.textureKey)
  if (selectedOutfit) {
    return selectedOutfit
  }
  return getOnlineFallbackOutfit(player?.patientProfileId, fallbackIndex)
}

function getOnlineFallbackOutfit(patientProfileId: number | undefined, fallbackIndex: number) {
  const outfitIndex = patientProfileId === undefined ? fallbackIndex : Math.abs(patientProfileId)
  return PLAYER_OUTFITS[outfitIndex % PLAYER_OUTFITS.length] ?? getSelectedOnlineOutfit()
}

function MoveHistory({ moves }: { moves: GomokuMove[] }) {
  return (
    <section className="gomoku-panel gomoku-history">
      <h2>{text.history}</h2>
      {moves.length === 0 ? (
        <p>{text.emptyHistory}</p>
      ) : (
        <ol>
          {moves.map((move, index) => (
            <li key={`${move.position.row}:${move.position.col}:${index}`}>
              <span>{index + 1}</span>
              <strong>{move.stone === 'black' ? text.black : text.white}</strong>
              <em>{formatMoveNumber(move.position)}</em>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function isValidPatientProfileId(value: number | undefined) {
  return Number.isInteger(value) && (value ?? 0) > 0
}

function getOnlineRequirementMessage() {
  if (DEMO_AUTH_ENABLED && !hasValidAuthToken()) return ''
  if (!hasValidAuthToken() && !DEMO_AUTH_ENABLED) return text.onlineAuthRequired
  return text.onlineProfileRequired
}

function getMyPatientProfileIdFromRoom(room: GomokuRoom) {
  if (room.myStone === 'BLACK') return room.blackPlayer.patientProfileId
  if (room.myStone === 'WHITE') return room.whitePlayer?.patientProfileId
  return undefined
}

function withTimeoutStatus(status: GameStatus, timeoutWinner: Stone | null): GameStatus {
  if (!timeoutWinner || status.phase !== 'playing') return status
  return {
    phase: 'won',
    winner: timeoutWinner,
    winningLine: [],
    reason: 'timeout',
  }
}

function getOnlineGameStatus(room: GomokuRoom, fallback: GameStatus): GameStatus {
  if (room.status !== 'FINISHED') return room.status === 'PLAYING' ? fallback : { phase: 'playing' }
  if (room.result === 'DRAW') return { phase: 'draw', reason: 'board-full' }

  const winner: Stone = room.result === 'BLACK_WIN' ? 'black' : 'white'
  return {
    phase: 'won',
    winner,
    winningLine: fallback.phase === 'won' && fallback.winner === winner ? fallback.winningLine : [],
    reason: room.endReason === 'TIMEOUT' ? 'timeout' : 'five',
  }
}

function getOnlineStatusMessage(room: GomokuRoom, myStone: Stone | null, currentTurn: Stone) {
  if (room.status === 'WAITING') {
    if (!room.whitePlayer) return text.waitingOpponent
    return myStone === 'black' ? text.readyToStart : text.waitingHostStart
  }
  if (room.status === 'CANCELLED') return text.cancelled
  if (room.status === 'FINISHED') return formatEndReason(room.endReason)
  if (myStone === null) return currentTurn === 'black' ? text.black : text.white
  return myStone === currentTurn ? text.myTurn : text.opponentTurn
}

function getOnlinePlayerStateLabel(room: GomokuRoom | null, stone: Stone, currentTurn: Stone) {
  if (!room) return text.onlineLobbyGuide
  if (room.status === 'WAITING') {
    if (!room.whitePlayer) return stone === 'white' ? text.waitingOpponent : text.waiting
    return stone === 'black' ? text.readyToStart : text.waitingHostStart
  }
  if (room.status === 'PLAYING') return stone === currentTurn ? text.current : text.waiting
  return formatRoomStatus(room)
}

function getOnlinePlayerTimerLabel(
  room: GomokuRoom | null,
  timers: Record<Stone, number>,
  stone: Stone,
) {
  if (!room) return ''
  if (room.status === 'PLAYING') return formatTime(timers[stone])
  if (room.status === 'WAITING') return `${room.timerSeconds}\uCD08`
  return ''
}

function formatEndReason(reason: GomokuEndReason | null) {
  if (reason === 'RESIGN') return text.resigned
  if (reason === 'LEAVE') return text.left
  if (reason === 'TIMEOUT') return text.timeout
  if (reason === 'BOARD_FULL') return text.draw
  return text.five
}

function calculateOnlineTimers(room: GomokuRoom, now: number): Record<Stone, number> {
  const timers: Record<Stone, number> = {
    black: room.timerSeconds,
    white: room.timerSeconds,
  }
  const startedAt = toTimestamp(room.startedAt)
  if (!startedAt) return timers

  let turnStartedAt = startedAt
  for (const move of room.moves) {
    const playedAt = toTimestamp(move.playedAt)
    if (!playedAt) continue
    turnStartedAt = playedAt
  }

  if (room.status === 'PLAYING') {
    const current = fromApiStone(room.currentTurn)
    timers[current] = Math.max(0, room.timerSeconds - Math.floor((now - turnStartedAt) / 1000))
  }

  return timers
}

function toLocalMove(move: GomokuRoom['moves'][number]): GomokuMove {
  return {
    position: { row: move.row, col: move.col },
    stone: fromApiStone(move.stone),
    source: 'human',
  }
}

function fromApiStone(stone: ApiGomokuStone): Stone {
  return stone === 'BLACK' ? 'black' : 'white'
}

function toApiRuleSet(rule: RuleSet): ApiGomokuRuleSet {
  return rule === 'renju-lite' ? 'RENJU_LITE' : 'FREESTYLE'
}

function fromApiRuleSet(rule: ApiGomokuRuleSet): RuleSet {
  return rule === 'RENJU_LITE' ? 'renju-lite' : 'freestyle'
}

function formatRoomStatus(room: GomokuRoom) {
  if (room.status === 'WAITING') return text.waiting
  if (room.status === 'PLAYING') return text.playing
  if (room.status === 'CANCELLED') return text.cancelled
  if (room.result === 'DRAW') return text.draw
  return room.winner?.nickname ?? text.five
}

function isClosedOnlineRoom(room: GomokuRoom) {
  return room.status === 'FINISHED' || room.status === 'CANCELLED'
}

function formatRuleSet(rule: RuleSet) {
  return rule === 'renju-lite' ? text.renju : text.freestyle
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function toTimestamp(value: string | null | undefined) {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

type ApiErrorShape = {
  response?: {
    data?: {
      message?: string
    }
  }
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as ApiErrorShape).response
    if (response?.data?.message) return response.data.message
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function formatMoveNumber(position: Position) {
  return `${String.fromCharCode(65 + position.col)}${position.row + 1}`
}

function formatTime(seconds: number) {
  if (seconds < 60) return `${seconds}\uCD08`
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}
