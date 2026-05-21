// BE 토큰 subject claim 에 userId 가 문자열로 들어있다 (JwtTokenProvider). 마을 광장 클라가 자기 자신을
// 식별하려면 토큰에서 한 번 꺼내면 충분 — 별도 API 호출 회피.

interface JwtPayload {
  sub?: string
}

function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    return JSON.parse(atob(padded)) as JwtPayload
  } catch {
    return null
  }
}

export function extractUserIdFromToken(token: string): number | null {
  const payload = decodeJwtPayload(token)
  if (!payload?.sub) return null
  const parsed = Number(payload.sub)
  return Number.isFinite(parsed) ? parsed : null
}
