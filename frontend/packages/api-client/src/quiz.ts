import { apiClient } from './client'
import type { ApiResponse } from './artworks'

export type QuizRoomStatus = 'WAITING' | 'PLAYING' | 'FINISHED'

export type QuizMember = {
  userId: number
  nickname: string
  joinOrder: number
  score: number
  isHost: boolean
}

export type QuizRoomSnapshot = {
  roomId: string
  code: string
  status: QuizRoomStatus
  hostUserId: number
  minPlayers: number
  maxPlayers: number
  members: QuizMember[]
  stompRoomKey: string
  roundNumber: number
  currentDrawerUserId: number
  roundEndsAtEpochMillis: number | null
  totalRounds: number
}

export type PromptAssignment = {
  roundNumber: number
  word: string
}

export type QuizStrokeKind = 'begin' | 'move' | 'end' | 'clear'

export type QuizStrokeMessage = {
  kind: QuizStrokeKind
  strokeId?: string
  x?: number
  y?: number
  color?: string
  size?: number
  eraser?: boolean
}

export type QuizGameStartedResponse = {
  snapshot: QuizRoomSnapshot
  prompt: PromptAssignment
}

export type StartQuizRoomRequest = {
  totalRounds?: 3 | 6 | 9 | 12 | 15
}

export type QuizRoomListItem = {
  roomId: string
  hostNickname: string
  memberCount: number
  maxPlayers: number
}

export async function createQuizRoom(): Promise<QuizRoomSnapshot> {
  const response = await apiClient.post<ApiResponse<QuizRoomSnapshot>>('/quiz/rooms')
  return response.data.data
}

export async function joinQuizRoom(code: string): Promise<QuizRoomSnapshot> {
  const response = await apiClient.post<ApiResponse<QuizRoomSnapshot>>('/quiz/rooms/join', {
    code,
  })
  return response.data.data
}

export async function leaveQuizRoom(): Promise<void> {
  await apiClient.post<ApiResponse<void>>('/quiz/rooms/leave')
}

export async function getQuizRoom(roomId: string): Promise<QuizRoomSnapshot> {
  const response = await apiClient.get<ApiResponse<QuizRoomSnapshot>>(
    `/quiz/rooms/${encodeURIComponent(roomId)}`,
  )
  return response.data.data
}

export async function getWaitingQuizRooms(): Promise<QuizRoomListItem[]> {
  const response = await apiClient.get<ApiResponse<QuizRoomListItem[]>>('/quiz/rooms/waiting')
  return response.data.data
}

export async function startQuizRoom(
  roomId: string,
  request: StartQuizRoomRequest = {},
): Promise<QuizGameStartedResponse> {
  const response = await apiClient.post<ApiResponse<QuizGameStartedResponse>>(
    `/quiz/rooms/${encodeURIComponent(roomId)}/start`,
    request,
  )
  return response.data.data
}
