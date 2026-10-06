import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const base = process.env.VITE_BASE_PATH
  || (process.env.GITHUB_ACTIONS ? '/OneEngine/' : '/')

const devApiProxyTarget = String(process.env.ONEPOS_DEV_API_PROXY_TARGET || '').replace(/\/$/, '')
const devApiProxyOrigin = String(process.env.ONEPOS_DEV_API_PROXY_ORIGIN || 'https://onesolutions-ahuja.github.io').replace(/\/$/, '')

export default defineConfig({
  plugins: [react()],
  base,
  server: devApiProxyTarget ? {
    proxy: {
      '/api': {
        target: devApiProxyTarget,
        changeOrigin: true,
        secure: true,
        headers: { Origin: devApiProxyOrigin },
      },
    },
  } : undefined,
})
