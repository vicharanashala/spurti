import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    proxy: {
      '/spurti': {
        target: 'http://localhost:5292',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:5292',
        changeOrigin: true,
      },
    },
  },
})
