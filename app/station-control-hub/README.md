# Station Control Center (SCC)

Internal manufacturing operations tool for JLG Jefferson City. This frontend is presentation-only: it calls the authenticated Ignition WebDev `api` resource with JSON and renders the server response. Business rules, gateway routing, tag access, named queries, and audit logging remain in `StationControl.SCC`.

## Features

- Station ComponentID Rectify
- AMR ComponentID Rectify
- Run Schedule Refresh
- Manual Assembly Schedule with server-side verification
- Work Order Reconciliation
- Machine Overview

## API contract

Reads use `{op: "read", action, args}` and commits use `{op: "commit", action, args}`. The API client derives `/system/webdev/<Project>/api` from the page URL; no gateway host is hardcoded. Every commit includes the user-entered `reason` and is routed through the server `runAction` dispatcher.

The UI refreshes only on initial screen load, selection/search, after a commit, or an explicit Refresh click. There is no gateway polling.

## Run locally

From the repository root:

```text
npm install
npm run dev
```

The Vite server is useful for layout work. Live data requires the authenticated Ignition WebDev mount and its `api` resource. Production output is created with `npm run build` and previewed with `npm run preview`.

## Files

- `index.html` — WebDev-compatible static shell and SCC palette
- `scc-api.jsx` — URL derivation, JSON requests, and response errors
- `scc-data.jsx` — presentation constants only
- `scc-primitives.jsx` — shared controls, dialogs, and toasts
- `scc-tab-*.jsx` — live feature screens
- `scc-help.jsx` — help drawer
- `scc-app.jsx` — app root and navigation
