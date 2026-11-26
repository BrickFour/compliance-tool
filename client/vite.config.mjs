import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const envDir = path.join(here, '..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, '');
  const api = `http://127.0.0.1:${process.env.PORT || env.PORT || 8000}`;

  return {
    root: here,
    envDir,
    plugins: [react()],
    resolve: { alias: { '@shared': path.join(here, '..', 'shared') } },
    server: {
      port: 5173,
      fs: { allow: [path.join(here, '..')] },
      proxy: Object.fromEntries(['/api', '/auth', '/files', '/data', '/images', '/healthz'].map((p) => [p, { target: api, changeOrigin: false }]))
    },
    build: {
      outDir: path.join(here, 'dist'),
      emptyOutDir: true,
      rollupOptions: { input: { index: path.join(here, 'index.html'), app: path.join(here, 'app.html'), login: path.join(here, 'login.html') } }
    }
  }
});
