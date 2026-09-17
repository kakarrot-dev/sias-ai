import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: resolve('prototypes/macos-client-v2'),
  base: './',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, fs: { allow: [resolve('.')] } },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { outDir: resolve('dist'), emptyOutDir: true }
})
