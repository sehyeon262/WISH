import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base: IconProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export function HomeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 11.5L12 4l8.5 7.5" />
      <path d="M5.5 10.5V20a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1v-9.5" />
    </svg>
  )
}

export function ClipboardIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="6" y="4" width="12" height="17" rx="2.5" />
      <path d="M9 4v-.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5V4" />
      <path d="M9 10h6M9 13.5h6M9 17h4" />
    </svg>
  )
}

export function HistoryIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 4v4h4" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  )
}

export function ExerciseIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 9.5v5M20 9.5v5M7 7.5v9M17 7.5v9" />
      <path d="M7 12h10" />
    </svg>
  )
}

export function GoalIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.4 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.4l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  )
}

export function BellIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 8a6 6 0 0 1 12 0c0 3 .8 5 2 6.5H4c1.2-1.5 2-3.5 2-6.5z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  )
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M14 6l-6 6 6 6" />
    </svg>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M10 6l6 6-6 6" />
    </svg>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function MinusIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12h14" />
    </svg>
  )
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 12a7.5 7.5 0 0 1 13-5.2L20 9" />
      <path d="M20 4v5h-5" />
      <path d="M19.5 12a7.5 7.5 0 0 1-13 5.2L4 15" />
      <path d="M4 20v-5h5" />
    </svg>
  )
}

export function PersonIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 21c0-3.5 3-6 7-6s7 2.5 7 6" />
    </svg>
  )
}

export function PersonDimIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8" r="3.5" strokeDasharray="2 2" />
      <path d="M5 20.5c0-3 3-5.5 7-5.5s7 2.5 7 5.5" strokeDasharray="2 2" />
    </svg>
  )
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  )
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  )
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  )
}

export function InfoIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8.5v.01" />
    </svg>
  )
}

export function SparkleIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3l1.5 5L18 9.5 13.5 11 12 16l-1.5-5L6 9.5 10.5 8z" />
    </svg>
  )
}

export function ChatIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 5.5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4 3.5v-3.5H4.5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z" />
      <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" />
    </svg>
  )
}

export function ActivityIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 12h3.5l2-6 4 12 2-6h5" />
    </svg>
  )
}

export function PaletteIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3a9 9 0 1 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.4-.16-.76-.42-1.04-.27-.28-.45-.66-.45-1.07 0-.83.67-1.5 1.5-1.5h1.85A4.52 4.52 0 0 0 21 11.5C21 6.81 16.97 3 12 3z" />
      <circle cx="7.5" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function PaletteColorIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M12 2.5C6.2 2.5 1.5 6.7 1.5 12s4.7 9.5 10.5 9.5c1.5 0 2.65-1.15 2.65-2.65 0-.42-.16-.78-.43-1.07-.28-.3-.47-.7-.47-1.13 0-.88.72-1.6 1.6-1.6h1.95c3.13 0 5.2-2.4 5.2-5.55 0-3.95-3.95-7-10.5-7z"
        fill="#C9B8FF"
      />
      <circle cx="7.4" cy="10.6" r="1.55" fill="#FF7BA9" />
      <circle cx="12" cy="7.3" r="1.55" fill="#FFC93C" />
      <circle cx="16.6" cy="10.6" r="1.55" fill="#6BCB77" />
      <circle cx="8.5" cy="15.2" r="1.55" fill="#4D96FF" />
    </svg>
  )
}

export function StarFilledIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" {...props}>
      <defs>
        <linearGradient id="starGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#FFD66B" />
          <stop offset="100%" stopColor="#F5A524" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.5l2.92 5.92 6.53.95-4.72 4.6 1.11 6.5L12 17.4l-5.84 3.07 1.11-6.5L2.55 9.37l6.53-.95L12 2.5z"
        fill="url(#starGrad)"
        stroke="#E89B0F"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function LiveIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
      <path d="M7.4 7.4a6.5 6.5 0 0 0 0 9.2" />
      <path d="M16.6 7.4a6.5 6.5 0 0 1 0 9.2" />
      <path d="M4 4a11 11 0 0 0 0 16" />
      <path d="M20 4a11 11 0 0 1 0 16" />
    </svg>
  )
}

export function FuelIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="4" width="10" height="16" rx="1.8" />
      <path d="M5.5 8.5h6" />
      <path d="M13.5 9h2.5a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 0 3 0V9.5l-2-2.5" />
      <path d="M16.5 5l2 2.5" />
    </svg>
  )
}

export function LogoutIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15" />
      <path d="M10 8l-4 4 4 4" />
      <path d="M6 12h11" />
    </svg>
  )
}
