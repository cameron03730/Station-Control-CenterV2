# Station Control Center (SCC) v2

Internal manufacturing operations tool for JLG Jefferson City — a **React + Vite** app served by
**Ignition WebDev** as static files, calling the gateway through a JSON API. Four screens: Station
Rectification, AMR Rectification, Manual Assembly, Work Order Reconciliation.

Built to match the plant's existing "React app in Ignition WebDev" hosting + deploy model (same
pattern as the Fleet Control Center).

## Architecture
```
Browser (static dist/, served by WebDev)
        │  POST { action, args }  (JSON, credentials: include)
        ▼
FE WebDev "api" doPost  ──dynamic dispatch──▶  StationControl.SCC.*
        └─ tag reads/writes · FactoryControl named queries · sendRequest → BE1/BE2
```
The UI is presentation only; all logic stays in `StationControl.SCC` (see [`server/`](server/)).
When no API endpoint is reachable (local dev / static host) it runs in **DEMO** mode against mock
seed data so the app still renders.

## Project layout
```
index.html              Vite entry
src/
  main.jsx              bootstraps React
  App.jsx               sidebar shell (nav, header, theme, JLG logo)
  api.js                SCC API client (dynamic dispatch + DEMO fallback)
  data.js               mock seeds + shared constants (status legend, area map)
  primitives.jsx        shared UI (buttons, pills, inputs, modal, toasts)
  help.jsx              help drawer
  tabs/                 station.jsx · amr.jsx · assembly.jsx · recon.jsx
  index.css            Tailwind + theme CSS variables + self-hosted fonts
server/                 Ignition side: api_doPost.py + StationControl_SCC_code.py + deploy notes
.github/workflows/      deploy-test.yml (test branch) · deploy.yml (main branch)
```

## Local development
```
npm install
npm run dev        # http://localhost:5173  (base '/', DEMO mode)
npm run build      # → dist/index.html + dist/assets/  (production base)
npm run preview    # serves the production build
```

## Ignition WebDev hosting
Served as a static `dist/` behind a WebDev **mounted-folder resource**. The Vite production `base`
**must** match the WebDev route:

- Route:  `/system/webdev/Station-Control-Interactions/dist/ui-station-control-center/react/`
- Mounted folder target:  `…\Station-Control-Interactions\com.inductiveautomation.webdev\resources\dist\ui-station-control-center\dist`

Both derive from `PROJECT` + `APP` in [`vite.config.js`](vite.config.js). Change them there and keep
the workflow `DEPLOY_TARGET` aligned.

## Deployment (self-hosted runners)
Push-to-branch triggers a build + copy to the gateway `dist` folder (mirrors the FCC model):

| Branch | Workflow | Runner label | Env |
|---|---|---|---|
| `test` | `.github/workflows/deploy-test.yml` | `test-report` | TEST |
| `main` | `.github/workflows/deploy.yml` | `prod-report` | PROD |

Each workflow: Node 22 check → `npm ci` → `npm test` → `npm run build` → wipe old `dist` → copy new
`dist` to `DEPLOY_TARGET` → verify.

### Values to set before first deploy
- **`vite.config.js`** — `PROJECT` / `APP` if your reporting project or app-name differ.
- **`.github/workflows/*.yml`** — `DEPLOY_TARGET` (keep aligned with `base`), and
  **`VITE_SCC_API_BASE`** = the URL where the SCC `api` doPost is reachable (the FE gateway hosting
  the `FactoryControl` `api` WebDev resource), e.g. `https://<fe-host>/system/webdev/FactoryControl/api`.
  Delete `VITE_SCC_API_BASE` to fall back to same-origin (only correct if the doPost is co-hosted with
  the UI). Confirm the runner labels (`test-report` / `prod-report`) match your runners.
- Deploy the **server** pieces per [`server/README.md`](server/README.md) (SCC script + `api`
  resource with Require-Authentication + roles). The frontend workflow does **not** deploy those.

## Notes
- No CDNs / no in-browser Babel — React, Tailwind (PostCSS), and fonts (Inter + Material Symbols) are
  all bundled, so it works on an offline plant gateway.
- No polling; data refreshes on demand (screen change / click / after a commit / Refresh button).
- Every commit requires a reason and writes a `SupervisorOverrideLog` row (enforced server-side).
