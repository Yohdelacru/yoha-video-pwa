import { defineConfig } from 'vite';
// base relativa: funciona en https://usuario.github.io/yoha-video-pwa/ y en cualquier subcarpeta.
export default defineConfig({
  base: './',
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  worker: { format: 'es' },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2020', sourcemap: false },
});
