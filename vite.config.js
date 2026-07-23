import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const appRoot = resolve(projectRoot, 'app/station-control-hub');
const runtimeScripts = [
  'scc-data.jsx',
  'scc-api.jsx',
  'scc-primitives.jsx',
  'scc-tab-station.jsx',
  'scc-tab-amr.jsx',
  'scc-tab-assembly.jsx',
  'scc-tab-recon.jsx',
  'scc-tab-schedule.jsx',
  'scc-tab-overview.jsx',
  'scc-help.jsx',
  'scc-app.jsx',
];

export default defineConfig({
  root: appRoot,
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
  },
  build: {
    outDir: resolve(projectRoot, 'dist'),
    emptyOutDir: true,
  },
  plugins: [
    {
      name: 'copy-babel-runtime-scripts',
      closeBundle() {
        const outputDir = resolve(projectRoot, 'dist');
        mkdirSync(outputDir, { recursive: true });
        for (const script of runtimeScripts) {
          copyFileSync(resolve(appRoot, script), resolve(outputDir, script));
        }
      },
    },
  ],
});
