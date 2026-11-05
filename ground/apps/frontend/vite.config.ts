import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ command }) => ({
  plugins: [vue()],
  base: command === 'build' ? '/middle-static/' : '/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@mammoth/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5202,
    clearScreen: false,
    strictPort: true,
    hmr: {
      protocol: 'ws',
      clientPort: 5201,
    },
    proxy: {
      '/console/api': {
        target: 'http://127.0.0.1:3100',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/console\/api/, '/api'),
      },
      '/middle/api': {
        target: 'http://127.0.0.1:3100',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/middle\/api/, '/api'),
      },
    },
  },
}));
