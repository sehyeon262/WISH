import { Client, type IFrame, type StompSubscription } from '@stomp/stompjs'

import type { PromptAssignment, QuizRoomEvent, QuizRoomSnapshot, QuizStrokeMessage } from './types'

const TOPIC_PREFIX = '/topic/quiz/'
const USER_QUEUE_PREFIX = '/user/queue/quiz/'
const SNAPSHOT_SUFFIX = '/snapshot'
const PROMPT_SUFFIX = '/prompt'
const APP_READY_PREFIX = '/app/quiz/'
const APP_READY_SUFFIX = '/ready'
const APP_STROKE_SUFFIX = '/stroke'
const APP_GUESS_SUFFIX = '/guess'
const RECONNECT_DELAY_MS = 5_000

export interface QuizRealtimeClientHandlers {
  onEvent: (event: QuizRoomEvent) => void
  onSnapshot: (snapshot: QuizRoomSnapshot) => void
  onPrompt?: (prompt: PromptAssignment) => void
  onReady?: () => void
  onDisconnect?: () => void
  onError?: (error: Error) => void
}

export interface QuizRealtimeClientOptions extends QuizRealtimeClientHandlers {
  roomId: string
  stompRoomKey: string
  url?: string
  getAccessToken: () => Promise<string | null>
}

export class QuizRealtimeClient {
  private readonly client: Client
  private readonly topic: string
  private readonly userSnapshotQueue: string
  private readonly userPromptQueue: string
  private readonly appReady: string
  private readonly appStroke: string
  private readonly appGuess: string
  private handlers: QuizRealtimeClientHandlers
  private topicSubscription: StompSubscription | null = null
  private snapshotSubscription: StompSubscription | null = null
  private promptSubscription: StompSubscription | null = null

  constructor(private readonly options: QuizRealtimeClientOptions) {
    this.topic = `${TOPIC_PREFIX}${options.roomId}`
    this.userSnapshotQueue = `${USER_QUEUE_PREFIX}${options.roomId}${SNAPSHOT_SUFFIX}`
    this.userPromptQueue = `${USER_QUEUE_PREFIX}${options.roomId}${PROMPT_SUFFIX}`
    this.appReady = `${APP_READY_PREFIX}${options.roomId}${APP_READY_SUFFIX}`
    this.appStroke = `${APP_READY_PREFIX}${options.roomId}${APP_STROKE_SUFFIX}`
    this.appGuess = `${APP_READY_PREFIX}${options.roomId}${APP_GUESS_SUFFIX}`
    this.handlers = { ...options }

    this.client = new Client({
      brokerURL: options.url ?? defaultBrokerUrl(),
      reconnectDelay: RECONNECT_DELAY_MS,
      beforeConnect: () => this.refreshConnectHeaders(),
      onConnect: () => this.handleConnect(),
      onStompError: frame => this.handleStompError(frame),
      onWebSocketError: e => this.handlers.onError?.(coerceError(e)),
      onDisconnect: () => this.handlers.onDisconnect?.(),
    })
  }

  connect(): void {
    this.client.activate()
  }

  setHandlers(handlers: Partial<QuizRealtimeClientHandlers>): void {
    this.handlers = { ...this.handlers, ...handlers }
  }

  publishStroke(stroke: QuizStrokeMessage): void {
    if (!this.client.connected) return
    this.client.publish({ destination: this.appStroke, body: JSON.stringify(stroke) })
  }

  publishGuess(text: string): void {
    if (!this.client.connected) return
    this.client.publish({ destination: this.appGuess, body: JSON.stringify({ text }) })
  }

  async disconnect(): Promise<void> {
    this.topicSubscription?.unsubscribe()
    this.snapshotSubscription?.unsubscribe()
    this.promptSubscription?.unsubscribe()
    this.topicSubscription = null
    this.snapshotSubscription = null
    this.promptSubscription = null
    await this.client.deactivate()
  }

  private async refreshConnectHeaders(): Promise<void> {
    const token = await this.options.getAccessToken()
    if (!token) {
      void this.client.deactivate()
      this.handlers.onError?.(new Error('No access token available for quiz WS connect.'))
      return
    }
    this.client.connectHeaders = {
      Authorization: `Bearer ${token}`,
      Room: this.options.stompRoomKey,
    }
  }

  private handleConnect(): void {
    this.snapshotSubscription = this.client.subscribe(this.userSnapshotQueue, frame => {
      this.handlers.onSnapshot(JSON.parse(frame.body) as QuizRoomSnapshot)
    })
    this.promptSubscription = this.client.subscribe(this.userPromptQueue, frame => {
      this.handlers.onPrompt?.(JSON.parse(frame.body) as PromptAssignment)
    })
    this.topicSubscription = this.client.subscribe(this.topic, frame => {
      this.handlers.onEvent(JSON.parse(frame.body) as QuizRoomEvent)
    })
    this.client.publish({ destination: this.appReady, body: '' })
    this.handlers.onReady?.()
  }

  private handleStompError(frame: IFrame): void {
    const message = frame.headers['message'] ?? 'stomp error'
    this.handlers.onError?.(new Error(message))
  }
}

function defaultBrokerUrl(): string {
  const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (apiBase) {
    return apiBase.replace(/^http/, 'ws') + '/ws/quiz'
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/v1/ws/quiz`
}

function coerceError(e: unknown): Error {
  if (e instanceof Error) return e
  return new Error('websocket error')
}
