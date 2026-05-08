import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@assets': path.resolve(__dirname, './src/assets'),
      '@common': path.resolve(__dirname, './src/common'),
      '@features': path.resolve(__dirname, './src/features'),
    },
  },
  optimizeDeps: {
    include: ['antd'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'antd-vendor': ['antd'],
          'antd-icons': ['@ant-design/icons'],
        },
      },
    },
  },
  server: {
    headers: {
      'Cache-Control': 'no-cache',
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8004',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'ws://localhost:8004',
        ws: true,
        changeOrigin: true,
      },
      '/media': {
        target: 'http://localhost:8004',
        changeOrigin: true,
      },
    },
  },
})
