import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true
      },
      '/login': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true
      },
      '/logout': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true
      },
      '/upload': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true
      },
      '/clear_data': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true
      }
    }
  }
})
