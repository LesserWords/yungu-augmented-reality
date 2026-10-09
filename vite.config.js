import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { resolve } from 'node:path';

const root = import.meta.dirname;

export default defineConfig(({ mode }) => ({
  // relative paths: the built site works on any domain or sub-folder (e.g. site.com/yungu/)
  base: './',
  // `npm run dev:phone` serves over HTTPS so a phone on the same Wi-Fi can open AR
  plugins: mode === 'phone' ? [basicSsl()] : [],
  // allowedHosts: lets a cloudflared tunnel reach the dev server (docs/TESTING-ON-PHONE.md, option C)
  server: { host: true, allowedHosts: ['.trycloudflare.com'] },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        play: resolve(root, 'play.html'),
        qr: resolve(root, 'tools/qr.html'),
      },
    },
  },
}));
