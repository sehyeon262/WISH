import { apiClient } from './client'
import type { ApiResponse } from './artworks'

export type AdminDashboardSummary = {
  totalUsers: number
  guardianUsers: number
  adminUsers: number
  totalPatients: number
  todayActivePatients: number
  todayTotalSeconds: number
  periodTotalSeconds: number
  averageDailySeconds: number
  periodActivePatients: number
  atRiskPatients: number
  newUsersToday: number
  newPatientsToday: number
}

export type AdminDashboardPreviousPeriodSummary = {
  from: string
  to: string
  periodTotalSeconds: number
  averageDailySeconds: number
  periodActivePatients: number
}

export type AdminDashboardDailyUsage = {
  date: string
  login: number
  art: number
  music: number
  taekwondo: number
  gymnastics: number
  total: number
  activePatients: number
}

export type AdminDashboardContentShare = {
  contentType: string
  label: string
  totalSeconds: number
  percentage: number
}

export type AdminDashboardPatientStatus = 'ACTIVE' | 'NORMAL' | 'RISK'

export type AdminDashboardPatientActivity = {
  patientId: number
  patientName: string
  patientNickname: string
  guardianEmail: string
  todaySeconds: number
  periodSeconds: number
  favoriteContent: string
  lastActiveDate: string | null
  status: AdminDashboardPatientStatus
}

export type AdminDashboardAlert = {
  type: string
  title: string
  description: string
  severity: 'normal' | 'info' | 'warning'
  count: number
}

export type AdminDashboard = {
  from: string
  to: string
  summary: AdminDashboardSummary
  previous: AdminDashboardPreviousPeriodSummary
  dailyUsage: AdminDashboardDailyUsage[]
  contentShares: AdminDashboardContentShare[]
  patientActivities: AdminDashboardPatientActivity[]
  alerts: AdminDashboardAlert[]
}

export type GetAdminDashboardParams = {
  from?: string
  to?: string
}

export type AdminPatientDashboardPatient = {
  patientId: number
  patientName: string
  patientNickname: string
  gender: 'MALE' | 'FEMALE' | 'OTHER'
  birthDate: string
  createdAt: string
  guardianEmail: string
}

export type AdminPatientDashboardSummary = {
  todaySeconds: number
  periodSeconds: number
  contentSeconds: number
  averageDailySeconds: number
  activeDays: number
  lastActiveDate: string | null
  status: AdminDashboardPatientStatus
  favoriteContent: string
  contentSkewed: boolean
  riskInactiveDays: number
}

export type AdminPatientDashboardDailyUsage = {
  date: string
  login: number
  art: number
  music: number
  taekwondo: number
  gymnastics: number
  total: number
  active: boolean
}

export type AdminPatientHeatmapCell = {
  weekday: number
  hour: number
  totalSeconds: number
}

export type AdminPatientHourlyHeatmap = {
  maxSeconds: number
  cells: AdminPatientHeatmapCell[]
}

export type AdminPatientDashboard = {
  from: string
  to: string
  patient: AdminPatientDashboardPatient
  summary: AdminPatientDashboardSummary
  dailyUsage: AdminPatientDashboardDailyUsage[]
  contentShares: AdminDashboardContentShare[]
  heatmap: AdminPatientHourlyHeatmap
}

export type GuardianNotificationType = 'RISK' | 'CONTENT_SKEW' | 'CHECK_IN'

export type GuardianNotificationRequest = {
  patientId: number
  type: GuardianNotificationType
  message: string
}

export type GuardianNotificationResponse = {
  patientId: number
  patientName: string
  guardianEmail: string
  type: GuardianNotificationType
  message: string
  sentAt: string
}

export async function notifyGuardian(request: GuardianNotificationRequest) {
  const response = await apiClient.post<ApiResponse<GuardianNotificationResponse>>(
    '/admin/notifications/guardian',
    request,
  )
  return response.data
}

export async function getAdminDashboard(params?: GetAdminDashboardParams) {
  const response = await apiClient.get<ApiResponse<AdminDashboard>>('/admin/dashboard', {
    params,
  })
  return response.data
}

export async function getAdminPatientDashboard(
  patientId: number,
  params?: GetAdminDashboardParams,
) {
  const response = await apiClient.get<ApiResponse<AdminPatientDashboard>>(
    `/admin/dashboard/patients/${patientId}`,
    { params },
  )
  return response.data
}
