import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      },
      '/login': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        // Bypass Vite proxy for GET requests to /login so React Router renders the page
        bypass: (req) => {
          if (req.method === 'GET') return '/index.html';
        }
      },
      '/logout': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      },
      '/upload': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      },
      '/clear_data': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      }
    }
  }
})
