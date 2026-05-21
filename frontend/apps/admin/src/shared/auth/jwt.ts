/**
 * JWT 페이로드를 디코드한다. 서명 검증은 하지 않는다 (그건 백엔드 책임). role / exp 같은 claim 만 읽는 용도.
 */
export type JwtPayload = {
  sub?: string
  email?: string
  role?: string
  exp?: number
}

export function decodeJwt(token: string): JwtPayload | null {
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

export function isJwtExpired(payload: JwtPayload, marginMs = 30_000): boolean {
  if (typeof payload.exp !== 'number') return false
  return payload.exp * 1000 <= Date.now() + marginMs
}
