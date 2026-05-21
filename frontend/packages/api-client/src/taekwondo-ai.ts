import axios from 'axios'

const AI_BASE_URL = (import.meta.env.VITE_AI_BASE_URL ?? 'http://localhost:8001/api/v1').replace(
  /\/$/,
  '',
)

export const aiApiClient = axios.create({
  baseURL: AI_BASE_URL,
  timeout: 20_000,
})

export type TaegeukAnalyzeRequest = {
  session_id?: string
  movement_name: string
  sequence: number[][][]
  input_normalized: boolean
  pass_threshold?: number
}

export type TaegeukAnalyzeResponse = {
  session_id: string | null
  target_movement_index: number
  target_movement_name: string
  score: number
  pass_threshold: number
  passed: boolean
  scoring_method: string
  worst_joint: string
  weakest_body_part: string
  feedback_summary: string
}

export async function analyzeTaegeuk1Motion(
  payload: TaegeukAnalyzeRequest,
): Promise<TaegeukAnalyzeResponse> {
  const response = await aiApiClient.post<TaegeukAnalyzeResponse>(
    '/taekwondo/taegeuk1/analyze',
    payload,
    {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    },
  )
  return response.data
}
