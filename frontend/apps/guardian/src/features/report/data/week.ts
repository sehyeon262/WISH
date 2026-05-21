import type { WeekRange } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function startOfMonday(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const offset = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + offset)
  return d
}

export function buildWeekRange(reference: Date = new Date()): WeekRange {
  const today = new Date(reference)
  today.setHours(0, 0, 0, 0)
  const start = startOfMonday(today)
  const end = new Date(start.getTime() + 6 * DAY_MS)
  const todayStart = startOfMonday(today).getTime()
  const isCurrentWeek = todayStart === start.getTime()
  const daysElapsed = isCurrentWeek
    ? Math.min(7, Math.floor((today.getTime() - start.getTime()) / DAY_MS) + 1)
    : 7
  return {
    start: toISODate(start),
    end: toISODate(end),
    isCurrentWeek,
    daysElapsed,
  }
}

export function shiftWeek(week: WeekRange, weeks: number): WeekRange {
  const startDate = new Date(week.start)
  startDate.setDate(startDate.getDate() + weeks * 7)
  return buildWeekRange(startDate)
}

export function formatWeekLabel(week: WeekRange): string {
  const start = new Date(week.start)
  const end = new Date(week.end)
  const sm = start.getMonth() + 1
  const sd = start.getDate()
  const em = end.getMonth() + 1
  const ed = end.getDate()
  if (sm === em) return `${sm}월 ${sd}일 ~ ${ed}일`
  return `${sm}월 ${sd}일 ~ ${em}월 ${ed}일`
}
