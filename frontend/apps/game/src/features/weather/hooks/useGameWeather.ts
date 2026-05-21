import { useEffect, useState } from 'react'
import { getFallbackWeather } from '../openMeteoClient'
import { getGameWeather } from '../weatherStore'
import type { WeatherState } from '../types'

export function useGameWeather() {
  const [weather, setWeather] = useState<WeatherState>(() => getFallbackWeather())
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)

      try {
        const nextWeather = await getGameWeather()

        if (!cancelled) {
          setWeather(nextWeather)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    load()

    const intervalId = window.setInterval(load, 10 * 60 * 1000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [])

  return {
    weather,
    isLoading,
  }
}
