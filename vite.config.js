import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const base = process.env.VITE_BASE_PATH
  || (process.env.GITHUB_ACTIONS ? '/OneEngine/' : '/')
const apiProxyTarget = String(process.env.VITE_API_PROXY_TARGET || '').trim()

export default defineConfig({
  plugins: [react()],
  base,
  server: apiProxyTarget ? {
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: true,
        headers: {
          Origin: 'https://onesolutions-ahuja.github.io',
        },
      },
    },
  } : undefined,
})
