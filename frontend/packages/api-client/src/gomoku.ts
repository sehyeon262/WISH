import { apiClient } from './client'
import type { ApiResponse, PageResponse } from './artworks'

export type GomokuStone = 'BLACK' | 'WHITE'
export type GomokuRuleSet = 'FREESTYLE' | 'RENJU_LITE'
export type GomokuMatchStatus = 'WAITING' | 'PLAYING' | 'FINISHED' | 'CANCELLED'
export type GomokuMatchResult = 'BLACK_WIN' | 'WHITE_WIN' | 'DRAW'
export type GomokuEndReason = 'FIVE' | 'RESIGN' | 'LEAVE' | 'TIMEOUT' | 'BOARD_FULL'
export type GomokuViewerRole = 'PLAYER' | 'SPECTATOR'

export type GomokuPlayer = {
  patientProfileId: number
  nickname: string
  textureKey: string
}

export type GomokuMoveRecord = {
  row: number
  col: number
  stone: GomokuStone
  playedAt: string
}

export type GomokuRoom = {
  id: number
  roomCode: string
  status: GomokuMatchStatus
  ruleSet: GomokuRuleSet
  timerSeconds: number
  blackPlayer: GomokuPlayer
  whitePlayer: GomokuPlayer | null
  currentTurn: GomokuStone
  myStone: GomokuStone | null
  viewerRole?: GomokuViewerRole
  result: GomokuMatchResult | null
  endReason: GomokuEndReason | null
  winner: GomokuPlayer | null
  moveCount: number
  moves: GomokuMoveRecord[]
  ranked: boolean
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export type GomokuRoomCreateRequest = {
  ruleSet: GomokuRuleSet
  timerSeconds: number
  textureKey?: string
}

export type GomokuRoomJoinRequest = {
  textureKey?: string
}

export type GomokuMoveRequest = {
  row: number
  col: number
}

export type GomokuMatchSummary = {
  id: number
  status: GomokuMatchStatus
  ruleSet: GomokuRuleSet
  myStone: GomokuStone | null
  opponentNickname: string | null
  result: GomokuMatchResult | null
  endReason: GomokuEndReason | null
  moveCount: number
  ranked: boolean
  playedAt: string
}

export type GomokuStats = {
  totalGames: number
  wins: number
  draws: number
  losses: number
  winRate: number
}

export type GomokuRankingEntry = {
  rank: number
  patientProfileId: number
  nickname: string
  totalGames: number
  wins: number
  draws: number
  losses: number
  winRate: number
  lastPlayedAt: string
  isMe: boolean
}

export type GomokuRanking = {
  totalPlayers: number
  minGames: number
  entries: GomokuRankingEntry[]
  me: GomokuRankingEntry | null
}

export type GomokuRoomPage = PageResponse<GomokuRoom>
export type GomokuMatchPage = PageResponse<GomokuMatchSummary>

export type GomokuPageParams = {
  page?: number
  size?: number
  sort?: string
}

export async function createGomokuRoom(request: GomokuRoomCreateRequest) {
  const response = await apiClient.post<ApiResponse<GomokuRoom>>('/gomoku/rooms', request)
  return response.data
}

export async function getWaitingGomokuRooms({
  page = 0,
  size = 12,
  sort = 'createdAt,desc',
}: GomokuPageParams = {}) {
  const response = await apiClient.get<ApiResponse<GomokuRoomPage>>('/gomoku/rooms/waiting', {
    params: { page, size, sort },
  })
  return response.data
}

export async function getGomokuRooms({
  page = 0,
  size = 12,
  sort = 'createdAt,desc',
}: GomokuPageParams = {}) {
  const response = await apiClient.get<ApiResponse<GomokuRoomPage>>('/gomoku/rooms', {
    params: { page, size, sort },
  })
  return response.data
}

export async function getGomokuRoom(roomId: number) {
  const response = await apiClient.get<ApiResponse<GomokuRoom>>(`/gomoku/rooms/${roomId}`)
  return response.data
}

export async function heartbeatGomokuRoom(roomId: number) {
  const response = await apiClient.post<ApiResponse<GomokuRoom>>(
    `/gomoku/rooms/${roomId}/heartbeat`,
  )
  return response.data
}

export async function joinGomokuRoom(roomId: number, request: GomokuRoomJoinRequest = {}) {
  const response = await apiClient.post<ApiResponse<GomokuRoom>>(
    `/gomoku/rooms/${roomId}/join`,
    request,
  )
  return response.data
}

export async function startGomokuRoom(roomId: number) {
  const response = await apiClient.post<ApiResponse<GomokuRoom>>(`/gomoku/rooms/${roomId}/start`)
  return response.data
}

export async function swapGomokuRoomStones(roomId: number) {
  const response = await apiClient.post<ApiResponse<GomokuRoom>>(
    `/gomoku/rooms/${roomId}/swap-stones`,
  )
  return response.data
}

export async function rematchGomokuRoom(roomId: number) {
  const response = await apiClient.post<ApiResponse<GomokuRoom>>(`/gomoku/rooms/${roomId}/rematch`)
  return response.data
}

export async function playGomokuMove(roomId: number, request: GomokuMoveRequest) {
  const response = await apiClient.post<ApiResponse<GomokuRoom>>(
    `/gomoku/rooms/${roomId}/moves`,
    request,
  )
  return response.data
}

export async function resignGomokuRoom(roomId: number) {
  const response = await apiClient.post<ApiResponse<GomokuRoom>>(`/gomoku/rooms/${roomId}/resign`)
  return response.data
}

export async function leaveGomokuRoom(roomId: number) {
  const response = await apiClient.post<ApiResponse<GomokuRoom>>(`/gomoku/rooms/${roomId}/leave`)
  return response.data
}

export async function getMyGomokuMatches({
  page = 0,
  size = 20,
  sort = 'playedAt,desc',
}: GomokuPageParams = {}) {
  const response = await apiClient.get<ApiResponse<GomokuMatchPage>>('/gomoku/matches/me', {
    params: { page, size, sort },
  })
  return response.data
}

export async function getMyGomokuStats() {
  const response = await apiClient.get<ApiResponse<GomokuStats>>('/gomoku/stats/me')
  return response.data
}

export async function getGomokuRanking(limit = 10, minGames = 1) {
  const response = await apiClient.get<ApiResponse<GomokuRanking>>('/gomoku/ranking', {
    params: { limit, minGames },
  })
  return response.data
}

export type GomokuChatMessage = {
  id: number
  senderPatientProfileId: number
  senderNickname: string
  senderRole?: GomokuViewerRole
  content: string
  createdAt: string
}

export type GomokuChatMessageSendRequest = {
  content: string
}

export async function sendGomokuMessage(roomId: number, request: GomokuChatMessageSendRequest) {
  const response = await apiClient.post<ApiResponse<GomokuChatMessage>>(
    `/gomoku/rooms/${roomId}/messages`,
    request,
  )
  return response.data
}

export async function getGomokuMessages(roomId: number) {
  const response = await apiClient.get<ApiResponse<GomokuChatMessage[]>>(
    `/gomoku/rooms/${roomId}/messages`,
  )
  return response.data
}
