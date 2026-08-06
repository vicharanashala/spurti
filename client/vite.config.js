import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    allowedHosts: true,
    proxy: {
      '/spurti': {
        target: 'http://localhost:5290',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:5290',
        changeOrigin: true,
      },
    },
  },
})
