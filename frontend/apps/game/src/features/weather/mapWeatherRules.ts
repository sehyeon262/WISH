import type { MapWeatherRule } from './types'

export const defaultMapWeatherRule: MapWeatherRule = {
  mapId: 'default',
  mode: 'INDOOR_SUBTLE',
  allowParticles: false,
  allowAmbientSound: false,
  allowLightingChange: true,
  maxEffectIntensity: 0.18,
}

const indoorSubtle = (mapId: string, maxEffectIntensity = 0.18): MapWeatherRule => ({
  mapId,
  mode: 'INDOOR_SUBTLE',
  allowParticles: false,
  allowAmbientSound: false,
  allowLightingChange: true,
  maxEffectIntensity,
})

const disabled = (mapId: string): MapWeatherRule => ({
  mapId,
  mode: 'DISABLED',
  allowParticles: false,
  allowAmbientSound: false,
  allowLightingChange: false,
  maxEffectIntensity: 0,
})

export const mapWeatherRules: Record<string, MapWeatherRule> = {
  village: {
    mapId: 'village',
    mode: 'OUTDOOR_FULL',
    allowParticles: true,
    allowAmbientSound: true,
    allowLightingChange: true,
    maxEffectIntensity: 0.6,
  },
  VillageScene: {
    mapId: 'VillageScene',
    mode: 'OUTDOOR_FULL',
    allowParticles: true,
    allowAmbientSound: true,
    allowLightingChange: true,
    maxEffectIntensity: 0.6,
  },
  ferry: {
    mapId: 'ferry',
    mode: 'OUTDOOR_FULL',
    allowParticles: true,
    allowAmbientSound: true,
    allowLightingChange: true,
    maxEffectIntensity: 0.6,
  },
  FerrySelectScene: {
    mapId: 'FerrySelectScene',
    mode: 'OUTDOOR_FULL',
    allowParticles: true,
    allowAmbientSound: true,
    allowLightingChange: true,
    maxEffectIntensity: 0.6,
  },
  lighthouse: {
    mapId: 'lighthouse',
    mode: 'OUTDOOR_FULL',
    allowParticles: true,
    allowAmbientSound: true,
    allowLightingChange: true,
    maxEffectIntensity: 0.78,
  },
  LighthouseSelectScene: {
    mapId: 'LighthouseSelectScene',
    mode: 'OUTDOOR_FULL',
    allowParticles: true,
    allowAmbientSound: true,
    allowLightingChange: true,
    maxEffectIntensity: 0.78,
  },
  forest: {
    mapId: 'forest',
    mode: 'OUTDOOR_FULL',
    allowParticles: true,
    allowAmbientSound: true,
    allowLightingChange: true,
    maxEffectIntensity: 0.55,
  },
  gymnasticsRoom: indoorSubtle('gymnasticsRoom', 0.18),
  GymnasticsSelectScene: indoorSubtle('GymnasticsSelectScene', 0.18),
  GymnasticsTopScene: indoorSubtle('GymnasticsTopScene', 0.18),
  GymnasticsDanielScene: indoorSubtle('GymnasticsDanielScene', 0.18),
  hospitalRoom: indoorSubtle('hospitalRoom', 0.12),
  ArtSelectScene: indoorSubtle('ArtSelectScene', 0.16),
  ArtAlbumScene: indoorSubtle('ArtAlbumScene', 0.12),
  ArtFreeDrawingScene: indoorSubtle('ArtFreeDrawingScene', 0.12),
  ArtColoringSelectScene: indoorSubtle('ArtColoringSelectScene', 0.12),
  ArtColoringScene: indoorSubtle('ArtColoringScene', 0.12),
  TaekwondoSelectScene: indoorSubtle('TaekwondoSelectScene', 0.16),
  TaekwondoPoomsaeSelectScene: indoorSubtle('TaekwondoPoomsaeSelectScene', 0.16),
  TaekwondoPoomsaePracticeScene: indoorSubtle('TaekwondoPoomsaePracticeScene', 0.12),
  MusicSelectScene: indoorSubtle('MusicSelectScene', 0.16),
  MusicSongSelectScene: indoorSubtle('MusicSongSelectScene', 0.14),
  MusicRhythmScene: disabled('MusicRhythmScene'),
  dreamScene: disabled('dreamScene'),
  StartScene: disabled('StartScene'),
}

export function getMapWeatherRule(mapId: string) {
  return mapWeatherRules[mapId] ?? defaultMapWeatherRule
}
