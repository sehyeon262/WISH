import type { WeatherCondition } from './types'

interface MapWeatherCodeParams {
  weatherCode?: number
  precipitation?: number
  rain?: number
  snowfall?: number
  windSpeed?: number
  cloudCover?: number
}

const rainWeatherCodes = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82])
const heavyRainWeatherCodes = new Set([65, 82])
const snowWeatherCodes = new Set([71, 73, 75, 77, 85, 86])
const thunderWeatherCodes = new Set([95, 96, 99])

export function mapOpenMeteoWeatherCodeToCondition({
  weatherCode,
  precipitation = 0,
  rain = 0,
  snowfall = 0,
  windSpeed = 0,
  cloudCover = 0,
}: MapWeatherCodeParams): WeatherCondition {
  if (snowfall > 0) return 'SNOW'

  if (rain >= 4 || precipitation >= 5) {
    return 'HEAVY_RAIN'
  }

  if (rain > 0 || precipitation > 0) {
    return 'RAIN'
  }

  if (weatherCode === 0) return 'CLEAR'
  if (weatherCode === 1 || weatherCode === 2) return 'PARTLY_CLOUDY'
  if (weatherCode === 3) return 'CLOUDY'
  if (weatherCode === 45 || weatherCode === 48) return 'FOG'
  if (rainWeatherCodes.has(weatherCode ?? -1)) {
    return heavyRainWeatherCodes.has(weatherCode ?? -1) ? 'HEAVY_RAIN' : 'RAIN'
  }
  if (snowWeatherCodes.has(weatherCode ?? -1)) return 'SNOW'
  if (thunderWeatherCodes.has(weatherCode ?? -1)) return 'THUNDER'

  if (windSpeed >= 35) return 'WIND'
  if (cloudCover >= 85) return 'CLOUDY'
  if (cloudCover >= 35) return 'PARTLY_CLOUDY'

  return 'UNKNOWN'
}
