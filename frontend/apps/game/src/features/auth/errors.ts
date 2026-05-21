export function extractAuthErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const res = (
      err as { response?: { data?: { message?: string; errors?: Record<string, string> } } }
    ).response
    if (res?.data?.errors) {
      const joined = Object.values(res.data.errors).join(' / ')
      if (joined) return joined
    }
    if (res?.data?.message) return res.data.message
  }
  if (err instanceof Error) return err.message
  return fallback
}
