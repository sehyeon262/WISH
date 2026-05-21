/// <reference types="node" />

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
  const aiProxyPrefix = env.VITE_AI_PROXY_PREFIX || '/api/v1'
  const deployedAiProxyTarget = env.VITE_DEPLOYED_AI_PROXY_TARGET || 'https://k14e103.p.ssafy.io'
  const apiProxyTarget = env.VITE_API_PROXY_TARGET

  return {
    base: normalizeBasePath(env.VITE_APP_BASE_PATH),
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 3001,
      proxy: {
        ...(apiProxyTarget
          ? {
              '/api/v1': {
                target: apiProxyTarget,
                changeOrigin: true,
                secure: false,
                configure: proxy => {
                  proxy.on('proxyReq', (_proxyReq, req) => {
                    console.log('[proxy →]', req.method, req.url)
                  })
                  proxy.on('proxyRes', (proxyRes, req) => {
                    console.log('[proxy ←]', proxyRes.statusCode, req.url)
                  })
                  proxy.on('error', (err, req) => {
                    console.error('[proxy ✖]', req.url, err.message)
                  })
                },
              },
            }
          : {}),
        '/ai-api': {
          target: env.VITE_AI_PROXY_TARGET || 'http://localhost:8001',
          changeOrigin: true,
          secure: false,
          rewrite: path => path.replace(/^\/ai-api/, aiProxyPrefix),
        },
        '/dev/ai/api/v1': {
          target: deployedAiProxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: [],
      passWithNoTests: true,
    },
  }
})
