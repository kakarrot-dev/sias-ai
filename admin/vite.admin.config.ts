import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
export default defineConfig({
  root: resolve('src/admin'),
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5180, strictPort: true, fs: { allow: [resolve('.')] } },
  preview: { host: '127.0.0.1', port: 4180, strictPort: true },
  build: { outDir: resolve('dist/admin'), emptyOutDir: true }
})
