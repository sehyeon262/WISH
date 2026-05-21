type Props = {
  value: number
  size?: number
  strokeWidth?: number
  trackColor?: string
  ringColor?: string
  gradientId?: string
  gradientFrom?: string
  gradientTo?: string
  fontSize?: number
  fontWeight?: number
  unit?: string
  showUnit?: boolean
  className?: string
}

export function ScoreRing({
  value,
  size = 56,
  strokeWidth = 6,
  trackColor = '#ECE9F5',
  ringColor,
  gradientId,
  gradientFrom = '#A892FF',
  gradientTo = '#7C5CFF',
  fontSize = 16,
  fontWeight = 700,
  unit = '/100',
  showUnit = true,
  className,
}: Props) {
  const r = (size - strokeWidth) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, value))
  const dash = c * (clamped / 100)
  const id = gradientId ?? `score-grad-${Math.round(value * 1000)}-${size}`
  const stroke = ringColor ?? `url(#${id})`

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
      >
        {!ringColor && (
          <defs>
            <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={gradientFrom} />
              <stop offset="100%" stopColor={gradientTo} />
            </linearGradient>
          </defs>
        )}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <span
        style={{
          position: 'absolute',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          lineHeight: 1,
          fontWeight,
          color: '#15122a',
        }}
      >
        <span style={{ fontSize }}>{Math.round(clamped)}</span>
        {showUnit && (
          <span
            style={{
              fontSize: Math.max(8, fontSize * 0.42),
              fontWeight: 500,
              color: '#8b89a6',
              marginTop: 2,
            }}
          >
            {unit}
          </span>
        )}
      </span>
    </div>
  )
}
