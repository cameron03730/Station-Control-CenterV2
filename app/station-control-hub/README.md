# Station Control Center (SCC)

Internal manufacturing operations tool for JLG Jefferson City — a visual prototype.
Four tabs: Station Rectification, AMR Rectification, Manual Assembly, and Work Order Reconciliation.

**Prototype only** — all data is mock/hardcoded, actions simulate via toasts + optimistic UI. No backend, database, or auth.

## Run locally
From the repository root:
```
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal, normally `http://localhost:5173/`.

For a production-style local preview:
```
npm run build
npm run preview
```

The original static-file option is also available:
```
npx serve app/station-control-hub
```

## GitHub Pages
Settings → Pages → deploy from branch (root). The app loads `index.html` and its `.jsx`
files (transpiled in-browser via Babel), so it runs as-is with no build step.

## Files
- `index.html` — shell: Tailwind config, palette (CSS-variable light/dark), fonts, script mounts
- `scc-data.jsx` — mock data + helpers
- `scc-primitives.jsx` — shared UI (buttons, pills, inputs, modal, toasts)
- `scc-tab-*.jsx` — the four tabs
- `scc-help.jsx` — help drawer
- `scc-app.jsx` — app root (header, tabs, theme toggle)
