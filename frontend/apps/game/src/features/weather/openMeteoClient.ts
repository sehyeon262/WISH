import { mapOpenMeteoWeatherCodeToCondition } from './weatherCodeMap'
import type { WeatherProvider, WeatherState } from './types'

const OPEN_METEO_BASE_URL = 'https://api.open-meteo.com/v1/forecast'

export const DEFAULT_WEATHER_LOCATION = {
  latitude: 35.1796,
  longitude: 129.0756,
  timezone: 'Asia/Seoul',
  label: 'default-busan',
} as const

type WeatherLocation = typeof DEFAULT_WEATHER_LOCATION

interface OpenMeteoCurrentResponse {
  current?: {
    time?: string
    temperature_2m?: number
    relative_humidity_2m?: number
    precipitation?: number
    rain?: number
    snowfall?: number
    weather_code?: number
    cloud_cover?: number
    wind_speed_10m?: number
    is_day?: number
  }
}

export function buildOpenMeteoCurrentWeatherUrl(
  location: WeatherLocation = DEFAULT_WEATHER_LOCATION,
) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'precipitation',
      'rain',
      'snowfall',
      'weather_code',
      'cloud_cover',
      'wind_speed_10m',
      'is_day',
    ].join(','),
    timezone: location.timezone,
  })

  return `${OPEN_METEO_BASE_URL}?${params.toString()}`
}

export async function fetchOpenMeteoCurrentWeather(
  location: WeatherLocation = DEFAULT_WEATHER_LOCATION,
): Promise<WeatherState> {
  const response = await fetch(buildOpenMeteoCurrentWeatherUrl(location), {
    method: 'GET',
  })

  if (!response.ok) {
    throw new Error(`Open-Meteo weather fetch failed: ${response.status}`)
  }

  const body = (await response.json()) as OpenMeteoCurrentResponse
  const current = body.current

  if (!current) {
    throw new Error('Open-Meteo current weather is empty.')
  }

  const condition = mapOpenMeteoWeatherCodeToCondition({
    weatherCode: current.weather_code,
    precipitation: current.precipitation,
    rain: current.rain,
    snowfall: current.snowfall,
    windSpeed: current.wind_speed_10m,
    cloudCover: current.cloud_cover,
  })

  return {
    condition,
    temperatureC: current.temperature_2m,
    humidity: current.relative_humidity_2m,
    windSpeed: current.wind_speed_10m,
    precipitation: current.precipitation,
    cloudCover: current.cloud_cover,
    isDay: current.is_day === 1,
    observedAt: current.time ?? new Date().toISOString(),
    fetchedAt: Date.now(),
    source: 'open-meteo',
  }
}

export function getFallbackWeather(): WeatherState {
  return {
    condition: 'CLEAR',
    temperatureC: undefined,
    humidity: undefined,
    windSpeed: undefined,
    precipitation: 0,
    cloudCover: 0,
    isDay: true,
    observedAt: new Date().toISOString(),
    fetchedAt: Date.now(),
    source: 'fallback',
    isFallback: true,
  }
}

export const openMeteoWeatherProvider: WeatherProvider = {
  getCurrentWeather: fetchOpenMeteoCurrentWeather,
}
