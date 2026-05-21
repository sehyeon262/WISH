import { useEffect } from 'react'
import Phaser from 'phaser'
import { endContent, startContent } from '@wish/api-client'
import { useLoginSessionStore } from '../../stores/loginSessionStore'
import { CONTENT_SCENE_REGISTRY } from './contentSceneRegistry'

// 등록된 콘텐츠 scene 의 CREATE / SHUTDOWN 이벤트에 라이프사이클 API 호출을 붙인다.
// CREATE: scene 의 create() 가 호출되는 시점 — 매번 진입할 때 발화
// SHUTDOWN: scene 이 stop 되는 시점 — 다른 scene 으로 이동하거나 게임 종료 시 발화
//
// BE 의 RealtimeContentStateService 가 같은 contentType 의 중복 start 를 dedupe 하므로
// FE 는 contentType 동일성과 무관하게 호출만 보내면 된다 — 같은 음악 콘텐츠 재진입에서
// SHUTDOWN→CREATE 가 나도 BE 가 changed() 가드로 한 번만 이벤트 발행.
export function useContentLifecycleSync(game: Phaser.Game | null) {
  useEffect(() => {
    if (!game) return

    const detachers: Array<() => void> = []

    for (const [sceneKey, contentType] of Object.entries(CONTENT_SCENE_REGISTRY)) {
      const scene = game.scene.getScene(sceneKey)
      if (!scene) continue

      const handleCreate = () => {
        const sessionId = useLoginSessionStore.getState().loginSessionId
        if (sessionId === null) return
        void startContent(sessionId, { contentType }).catch(error => {
          console.warn(`startContent(${contentType}) failed`, error)
        })
      }

      const handleShutdown = () => {
        const sessionId = useLoginSessionStore.getState().loginSessionId
        if (sessionId === null) return
        void endContent(sessionId).catch(error => {
          console.warn('endContent failed', error)
        })
      }

      scene.events.on(Phaser.Scenes.Events.CREATE, handleCreate)
      scene.events.on(Phaser.Scenes.Events.SHUTDOWN, handleShutdown)
      detachers.push(() => {
        scene.events.off(Phaser.Scenes.Events.CREATE, handleCreate)
        scene.events.off(Phaser.Scenes.Events.SHUTDOWN, handleShutdown)
      })
    }

    return () => {
      detachers.forEach(detach => detach())
    }
  }, [game])
}
