import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

// ── Ignition WebDev hosting ───────────────────────────────────────────────
// The production `base` MUST exactly match the WebDev route the built app is served from:
//     /system/webdev/<ProjectName>/dist/<app-name>/react/
// (the `react` mounted-folder resource serves its sibling `dist/` folder).
// Change PROJECT / APP if your reporting project or app-name differ; the CI deploy
// target folder in .github/workflows/*.yml must stay aligned with these two values.
const PROJECT = 'Station-Control-Interactions';
const APP = 'ui-station-control-center';
const PROD_BASE = `/system/webdev/${PROJECT}/dist/${APP}/react/`;

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? PROD_BASE : '/',
  css: { postcss: { plugins: [tailwindcss(), autoprefixer()] } },
  server: { host: 'localhost', port: 5173, strictPort: true },
  preview: { host: 'localhost', port: 4173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
}));
