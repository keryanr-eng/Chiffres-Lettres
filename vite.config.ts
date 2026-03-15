import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const repoName = 'Chiffres-Lettres';
const isGhPages = process.env.GITHUB_ACTIONS === 'true';

export default defineConfig({
  base: isGhPages ? `/${repoName}/` : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Duo Chiffres & Lettres',
        short_name: 'Duo C&L',
        description: 'Jeu duo asynchrone type Des chiffres et des lettres.',
        theme_color: '#020617',
        background_color: '#020617',
        display: 'standalone',
        start_url: '.',
        icons: [
          {
            src: 'icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
});
