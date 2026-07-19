import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/spurti/',
  plugins: [react()],
  server: {
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
