export type WeatherCondition =
  | 'CLEAR'
  | 'PARTLY_CLOUDY'
  | 'CLOUDY'
  | 'RAIN'
  | 'HEAVY_RAIN'
  | 'SNOW'
  | 'FOG'
  | 'WIND'
  | 'THUNDER'
  | 'UNKNOWN'

export interface WeatherState {
  condition: WeatherCondition
  temperatureC?: number
  humidity?: number
  windSpeed?: number
  precipitation?: number
  cloudCover?: number
  isDay?: boolean
  observedAt: string
  fetchedAt: number
  source: 'open-meteo' | 'fallback' | 'cache'
  isFallback?: boolean
  isStale?: boolean
}

export type MapWeatherMode = 'OUTDOOR_FULL' | 'INDOOR_SUBTLE' | 'DISABLED'

export interface MapWeatherRule {
  mapId: string
  mode: MapWeatherMode
  allowParticles: boolean
  allowAmbientSound: boolean
  allowLightingChange: boolean
  maxEffectIntensity: number
}

export interface WeatherEffectConfig {
  condition: WeatherCondition
  particleType: 'rain' | 'snow' | 'fog' | 'none'
  particleIntensity: number
  overlayOpacity: number
  backgroundDarken: number
  lightTint?: string
  ambientSound: 'rain_soft' | 'wind_soft' | 'none'
  windowEffect: 'rain_window' | 'soft_cloud_shadow' | 'none'
}

export interface WeatherProvider {
  getCurrentWeather(): Promise<WeatherState>
}
