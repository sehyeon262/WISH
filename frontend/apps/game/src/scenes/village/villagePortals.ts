import Phaser from 'phaser'
import { createRatioRectangle, type RatioRect } from '@/game/world/portal'

export type VillagePortalKey = 'art' | 'taekwondo' | 'gymnastics' | 'music' | 'lighthouse' | 'ferry'

export type VillageThemePortal = RatioRect & {
  key: VillagePortalKey
  sceneKey: string
}

const VILLAGE_THEME_PORTAL_SIZE = {
  widthRatio: 0.02,
  heightRatio: 0.065,
} as const

function createVillageThemePortal(
  key: VillagePortalKey,
  sceneKey: string,
  xRatio: number,
  yRatio: number,
): VillageThemePortal {
  return {
    key,
    sceneKey,
    xRatio,
    yRatio,
    ...VILLAGE_THEME_PORTAL_SIZE,
  }
}

export const VILLAGE_THEME_PORTALS: VillageThemePortal[] = [
  createVillageThemePortal('art', 'ArtSelectScene', 0.364, 0.51),
  createVillageThemePortal('taekwondo', 'TaekwondoSelectScene', 0.437, 0.083),
  createVillageThemePortal('gymnastics', 'GymnasticsSelectScene', 0.724, 0.225),
  createVillageThemePortal('music', 'MusicSelectScene', 0.231, 0.15),
  createVillageThemePortal('lighthouse', 'LighthouseSelectScene', 0.688, 0.595),
  createVillageThemePortal('ferry', 'FerrySelectScene', 0.465, 0.79),
]

export function createInitialVillagePortalState(): Record<VillagePortalKey, boolean> {
  return VILLAGE_THEME_PORTALS.reduce(
    (state, portal) => {
      state[portal.key] = true
      return state
    },
    {} as Record<VillagePortalKey, boolean>,
  )
}

export function createVillagePortalRectangles(width: number, height: number) {
  return new Map<VillagePortalKey, Phaser.Geom.Rectangle>(
    VILLAGE_THEME_PORTALS.map(portal => [portal.key, createRatioRectangle(width, height, portal)]),
  )
}
