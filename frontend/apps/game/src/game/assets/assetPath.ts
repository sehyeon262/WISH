function normalizeBaseUrl(baseUrl: string | undefined) {
  if (!baseUrl) return '/'

  const withLeadingSlash = baseUrl.startsWith('/') ? baseUrl : `/${baseUrl}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

export function assetPath(path: string) {
  const normalizedBaseUrl = normalizeBaseUrl(import.meta.env.BASE_URL)
  const normalizedPath = path.replace(/^\/+/, '')
  const assetRelativePath = normalizedPath.startsWith('assets/')
    ? normalizedPath
    : `assets/${normalizedPath}`

  return `${normalizedBaseUrl}${assetRelativePath}`
}
