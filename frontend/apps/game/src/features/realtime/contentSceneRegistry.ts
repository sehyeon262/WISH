import type { RealtimeContentType } from '@wish/api-client'

// 콘텐츠 라이프사이클 알림 대상 scene 목록.
// scene key (Phaser 의 scene.key 와 정확히 일치) → 보호자앱에 노출할 contentType.
//
// 등록되지 않은 scene 은 콘텐츠로 간주하지 않으므로 마을/셀렉트/대화 진입 시 보호자
// 마이크 권한이 켜지지 않는다. 새 콘텐츠 scene 을 추가했다면 여기에도 추가해야 한다.
export const CONTENT_SCENE_REGISTRY: Readonly<Record<string, RealtimeContentType>> = {
  MusicRhythmScene: 'MUSIC',
  GymnasticsTopScene: 'GYMNASTICS',
  GymnasticsDanielScene: 'GYMNASTICS',
  TaekwondoPoomsaePracticeScene: 'TAEKWONDO',
  ArtFreeDrawingScene: 'ART',
  ArtColoringScene: 'ART',
}

export function getContentTypeForSceneKey(sceneKey: string): RealtimeContentType | null {
  return CONTENT_SCENE_REGISTRY[sceneKey] ?? null
}

export function isContentScene(sceneKey: string): boolean {
  return sceneKey in CONTENT_SCENE_REGISTRY
}
