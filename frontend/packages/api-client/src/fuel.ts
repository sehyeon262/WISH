import { apiClient } from './client'
import type { ApiResponse } from './artworks'

export type FuelEvent = {
  id: number
  amount: number
  message: string
  createdAt: string
  consumedAt: string | null
}

export type FuelStatus = {
  percentage: number
  totalAmount: number
  completed: boolean
  events: FuelEvent[]
}

export type FuelInboxEvent = {
  id: number
  amount: number
  message: string
  createdAt: string
}

export type FuelSendRequest = {
  amount: number
  message: string
}

export type FuelConsumeRequest = {
  ids: number[]
}

export type FuelConsumeResponse = {
  count: number
}

export async function getFuelStatus() {
  const response = await apiClient.get<ApiResponse<FuelStatus>>('/fuel/status')
  return response.data
}

export async function getFuelInbox() {
  const response = await apiClient.get<ApiResponse<FuelInboxEvent[]>>('/fuel/inbox')
  return response.data
}

export async function sendFuel(request: FuelSendRequest) {
  const response = await apiClient.post<ApiResponse<FuelEvent>>('/fuel', request)
  return response.data
}

export async function consumeFuel(request: FuelConsumeRequest) {
  const response = await apiClient.post<ApiResponse<FuelConsumeResponse>>('/fuel/consume', request)
  return response.data
}
