import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

function normalizeBasePath(value: string | undefined) {
  if (!value) return '/'

  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    base: normalizeBasePath(env.VITE_APP_BASE_PATH),
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 3002,
      // 로컬 개발에서 백엔드 (localhost:8080) 로 프록시. 프로덕션 dev/prod 환경에선 nginx 가 처리하므로 영향 없음.
      // 원격 dev API (https://k14e103.p.ssafy.io) 를 가리키는 경우:
      //  - dev nginx 는 dev backend 를 /dev/api/v1/ 경로로 노출하므로 path rewrite 필요.
      //  - Set-Cookie 의 Domain 을 localhost 로 재작성하고 Secure 플래그를 제거해야 브라우저가
      //    http://localhost 에 쿠키를 저장할 수 있다.
      proxy: (() => {
        const target = env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080'
        const isRemoteDev = /k14e103\.p\.ssafy\.io/.test(target)
        return {
          '/api/v1': {
            target,
            changeOrigin: true,
            cookieDomainRewrite: 'localhost',
            ...(isRemoteDev
              ? { rewrite: (path: string) => path.replace(/^\/api\/v1/, '/dev/api/v1') }
              : {}),
            configure: proxy => {
              proxy.on('proxyRes', proxyRes => {
                const setCookie = proxyRes.headers['set-cookie']
                if (Array.isArray(setCookie)) {
                  proxyRes.headers['set-cookie'] = setCookie.map(cookie =>
                    cookie.replace(/;\s*Secure/gi, ''),
                  )
                }
              })
            },
          },
        }
      })(),
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: [],
      passWithNoTests: true,
    },
  }
})
