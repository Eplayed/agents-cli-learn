import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // 应用由 FastAPI 挂载在 /ui 路径下，构建产物的资源路径需以 /ui/ 为前缀
  base: '/ui/',
  plugins: [vue()],
  build: {
    // 构建产物输出到 dist/（由 FastAPI 托管，提交进 git 保证零构建可用）
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})
