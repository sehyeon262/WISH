import { useEffect } from 'react'
import {
  LocalVideoTrack,
  type RemoteParticipant,
  type RemoteTrack,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client'
import {
  requestGameLivekitToken,
  subscribeGamePresence,
  type GamePresenceEvent,
} from '@wish/api-client'
import { useLoginSessionStore } from '../../stores/loginSessionStore'

const GUARDIAN_IDENTITY_PREFIX = 'guardian-'
const PUBLISH_MAX_BITRATE = 3_000_000
const PUBLISH_FRAMERATE = 30
const PRESENCE_RETRY_DELAY_MS = 3_000

export function useRealtimePublisher(canvas: HTMLCanvasElement | null) {
  const loginSessionId = useLoginSessionStore(state => state.loginSessionId)

  useEffect(() => {
    if (loginSessionId === null || canvas === null) return

    let cancelled = false
    let desiredConnected = false
    let connecting = false
    let connectVersion = 0
    let lastAppliedOccurredAtMs = Number.NEGATIVE_INFINITY
    let room: Room | null = null
    let videoTrack: LocalVideoTrack | null = null
    let presenceAbortController: AbortController | null = null
    const attachedAudioElements: HTMLAudioElement[] = []

    const isGuardian = (participant: RemoteParticipant) =>
      participant.identity.startsWith(GUARDIAN_IDENTITY_PREFIX)

    const guardiansPresent = (targetRoom: Room) =>
      Array.from(targetRoom.remoteParticipants.values()).some(isGuardian)

    const removeAudioElement = (audioEl: HTMLAudioElement) => {
      audioEl.remove()
      const index = attachedAudioElements.indexOf(audioEl)
      if (index !== -1) attachedAudioElements.splice(index, 1)
    }

    const removeAttachedAudioElements = () => {
      while (attachedAudioElements.length > 0) {
        const audioEl = attachedAudioElements.pop()
        audioEl?.remove()
      }
    }

    const stopPublishing = async (targetRoom: Room | null) => {
      const track = videoTrack
      if (!track) return
      videoTrack = null
      try {
        if (targetRoom) {
          await targetRoom.localParticipant.unpublishTrack(track, true)
        } else {
          track.stop()
        }
      } catch (error) {
        console.warn('Game LiveKit unpublish failed', error)
        track.stop()
      }
    }

    const ensurePublishing = async (targetRoom: Room) => {
      if (targetRoom !== room || videoTrack || cancelled || !desiredConnected) return
      const stream = canvas.captureStream(PUBLISH_FRAMERATE)
      const [mediaTrack] = stream.getVideoTracks()
      if (!mediaTrack) return
      const localTrack = new LocalVideoTrack(mediaTrack)
      try {
        await targetRoom.localParticipant.publishTrack(localTrack, {
          source: Track.Source.Camera,
          videoCodec: 'h264',
          simulcast: false,
          videoEncoding: {
            maxBitrate: PUBLISH_MAX_BITRATE,
            maxFramerate: PUBLISH_FRAMERATE,
          },
        })

        if (targetRoom !== room || cancelled || !desiredConnected) {
          await targetRoom.localParticipant.unpublishTrack(localTrack, true)
          return
        }

        videoTrack = localTrack
      } catch (error) {
        console.warn('Game LiveKit publish failed', error)
        localTrack.stop()
      }
    }

    const handleSubscribedTrack = (track: RemoteTrack, participant: RemoteParticipant) => {
      if (track.kind !== Track.Kind.Audio || !isGuardian(participant)) return
      const audioEl = track.attach() as HTMLAudioElement
      audioEl.dataset.realtime = 'guardian-audio'
      document.body.appendChild(audioEl)
      attachedAudioElements.push(audioEl)
    }

    const handleUnsubscribedTrack = (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return
      const detached = track.detach() as HTMLAudioElement[]
      detached.forEach(removeAudioElement)
    }

    const createRoom = () => {
      const targetRoom = new Room()

      targetRoom.on(RoomEvent.ParticipantConnected, participant => {
        if (targetRoom === room && isGuardian(participant)) void ensurePublishing(targetRoom)
      })
      targetRoom.on(RoomEvent.ParticipantDisconnected, participant => {
        if (targetRoom === room && isGuardian(participant) && !guardiansPresent(targetRoom)) {
          void stopPublishing(targetRoom)
        }
      })
      targetRoom.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (targetRoom === room) handleSubscribedTrack(track, participant)
      })
      targetRoom.on(RoomEvent.TrackUnsubscribed, track => {
        if (targetRoom === room) handleUnsubscribedTrack(track)
      })

      return targetRoom
    }

    const disconnectLiveKit = async () => {
      desiredConnected = false
      connectVersion += 1
      connecting = false

      const targetRoom = room
      room = null
      await stopPublishing(targetRoom)
      removeAttachedAudioElements()

      if (targetRoom) {
        try {
          await targetRoom.disconnect()
        } catch (error) {
          console.warn('Game LiveKit disconnect failed', error)
        }
      }
    }

    const ensureConnected = async () => {
      if (cancelled || !desiredConnected || connecting || room) return

      const attemptVersion = ++connectVersion
      const nextRoom = createRoom()
      connecting = true

      try {
        const response = await requestGameLivekitToken(loginSessionId)
        if (cancelled || !desiredConnected || attemptVersion !== connectVersion) {
          await nextRoom.disconnect()
          return
        }

        const { livekitUrl, token } = response.data
        await nextRoom.connect(livekitUrl, token)
        if (cancelled || !desiredConnected || attemptVersion !== connectVersion) {
          await nextRoom.disconnect()
          return
        }

        room = nextRoom
        if (guardiansPresent(nextRoom)) await ensurePublishing(nextRoom)
      } catch (error) {
        if (!cancelled && desiredConnected && attemptVersion === connectVersion) {
          console.warn('Game LiveKit publisher connection failed', error)
        }
      } finally {
        if (attemptVersion === connectVersion) connecting = false
      }
    }

    const handlePresenceEvent = (event: GamePresenceEvent) => {
      if (event.loginSessionId !== loginSessionId) return

      const occurredAtMs = Date.parse(event.occurredAt)
      const comparableOccurredAtMs = Number.isNaN(occurredAtMs) ? Date.now() : occurredAtMs
      if (comparableOccurredAtMs < lastAppliedOccurredAtMs) return
      lastAppliedOccurredAtMs = comparableOccurredAtMs

      if (event.watcherCount > 0) {
        desiredConnected = true
        void ensureConnected()
        return
      }

      void disconnectLiveKit()
    }

    const waitBeforeRetry = () =>
      new Promise<void>(resolve => {
        window.setTimeout(resolve, PRESENCE_RETRY_DELAY_MS)
      })

    const subscribePresence = async () => {
      while (!cancelled) {
        const abortController = new AbortController()
        presenceAbortController = abortController

        try {
          await subscribeGamePresence(loginSessionId, {
            signal: abortController.signal,
            onEvent: handlePresenceEvent,
            onError: error => {
              if (!abortController.signal.aborted) {
                console.warn('Game presence SSE message failed', error)
              }
            },
          })
        } catch (error) {
          if (abortController.signal.aborted || cancelled) break
          console.warn('Game presence SSE disconnected, will retry.', error)
        } finally {
          if (presenceAbortController === abortController) presenceAbortController = null
        }

        if (!cancelled) {
          await disconnectLiveKit()
          await waitBeforeRetry()
        }
      }
    }

    void subscribePresence()

    return () => {
      cancelled = true
      presenceAbortController?.abort()
      void disconnectLiveKit()
    }
  }, [loginSessionId, canvas])
}
