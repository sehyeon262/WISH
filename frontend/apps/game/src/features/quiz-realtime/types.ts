import type {
  PromptAssignment,
  QuizMember,
  QuizRoomSnapshot,
  QuizRoomStatus,
  QuizStrokeMessage,
} from '@wish/api-client'

export type { PromptAssignment, QuizMember, QuizRoomSnapshot, QuizRoomStatus, QuizStrokeMessage }

export interface QuizMemberJoinedEvent {
  type: 'member_joined'
  member: QuizMember
}

export interface QuizMemberLeftEvent {
  type: 'member_left'
  userId: number
}

export interface QuizHostChangedEvent {
  type: 'host_changed'
  hostUserId: number
}

export interface QuizStatusChangedEvent {
  type: 'status_changed'
  status: QuizRoomStatus
}

export interface QuizRoomResetEvent {
  type: 'room_reset'
  status: 'WAITING'
  hostUserId: number
  roundNumber: number
  currentDrawerUserId: number
  message?: string
  members: QuizMember[]
}

export interface QuizRoundStartedEvent {
  type: 'round_started'
  status: QuizRoomStatus
  roundNumber: number
  currentDrawerUserId: number
  wordLength: number
  roundEndsAtEpochMillis: number
  totalRounds: number
}

export interface QuizStrokeEvent {
  type: 'stroke'
  userId: number
  stroke: QuizStrokeMessage
}

export interface QuizGuessSubmittedEvent {
  type: 'guess_submitted'
  userId: number
  nickname: string
  message: string
  correct: boolean
  correctUserId?: number
}

export interface QuizRoundEndedEvent {
  type: 'round_ended'
  status: QuizRoomStatus
  roundNumber: number
  correctUserId?: number
  word: string
  members: QuizMember[]
}

export interface QuizGameFinishedEvent {
  type: 'game_finished'
  status: 'FINISHED'
  members: QuizMember[]
}

export type QuizRoomEvent =
  | QuizMemberJoinedEvent
  | QuizMemberLeftEvent
  | QuizHostChangedEvent
  | QuizStatusChangedEvent
  | QuizRoomResetEvent
  | QuizRoundStartedEvent
  | QuizStrokeEvent
  | QuizGuessSubmittedEvent
  | QuizRoundEndedEvent
  | QuizGameFinishedEvent
