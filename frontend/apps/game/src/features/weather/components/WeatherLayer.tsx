import type { WeatherEffectConfig } from '../types'

interface WeatherLayerProps {
  effect: WeatherEffectConfig
  disabled?: boolean
}

export function WeatherLayer({ effect, disabled }: WeatherLayerProps) {
  if (disabled) return null

  return (
    <div className="weather-layer" aria-hidden="true">
      <div
        className="weather-tint"
        style={{
          opacity: effect.overlayOpacity,
          backgroundColor: effect.lightTint ?? '#ffffff',
        }}
      />

      {effect.particleType === 'rain' && (
        <div
          className="weather-rain"
          style={{
            opacity: effect.particleIntensity,
          }}
        />
      )}

      {effect.particleType === 'snow' && (
        <div
          className="weather-snow"
          style={{
            opacity: effect.particleIntensity,
          }}
        />
      )}

      {effect.particleType === 'fog' && (
        <div
          className="weather-fog"
          style={{
            opacity: effect.particleIntensity,
          }}
        />
      )}
    </div>
  )
}
