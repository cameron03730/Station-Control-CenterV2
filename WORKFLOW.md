# SCC v2 — Deployment & Dev Workflow

Your end-to-end path: **push code to GitHub → pull on the VDI/laptop → run it → deploy to the test
reporting server**. This doc walks the whole thing, calls out the one-time server setup, and marks
every value you have to fill in.

> **Status right now:** the workflows and all app code exist in this repo folder but are **NOT on
> GitHub yet** — pushing them is Phase 1. Nothing auto-deploys until the code is on GitHub *and* the
> server-side pieces (Phase 2) exist.

---

## 0. The big picture

```
   YOUR MACHINE / VDI                 GITHUB                 TEST REPORTING SERVER            FE GATEWAY (FactoryControl)
   ┌────────────────┐   push   ┌──────────────┐  self-hosted ┌────────────────────┐         ┌────────────────────────┐
   │ edit + npm run │ ───────▶ │ repo + Actions│ ──runner────▶│ build dist/ + copy │         │ api doPost + SCC script │
   │ dev (DEMO)     │  git     │ deploy-test   │   builds on  │ to WebDev folder;  │  fetch  │ + FactoryControl queries│
   └────────────────┘          │ deploy (prod) │   the server │ Ignition serves it │◀────────│ + tags + BE1/BE2 calls  │
                               └──────────────┘              └────────────────────┘  JSON   └────────────────────────┘
                                                              serves the static UI            runs the real logic
```

**Who hosts what**
| Piece | Where it lives | Set up by |
|---|---|---|
| Static UI (`dist/`) | Test reporting server → Station-Control-Interactions WebDev mounted folder | GitHub Action (auto) — but the *folder resource* is one-time manual |
| `api` doPost + `StationControl.SCC` script | FE gateway that hosts FactoryControl | One-time manual (Designer) |
| Build + copy | GitHub Actions self-hosted runner **on the reporting server** | Runner must be online |

The browser calls **one** endpoint (`api`). That doPost is what reaches the gateways (tags,
FactoryControl queries, and `sendRequest` to BE1/BE2). The UI never calls BE1/BE2 directly.

---

## Phase 1 — Get the code onto GitHub (one time)

The workflows must be on GitHub for Actions to run them. Do this from a machine with write access to
the repo (your VDI is the natural place — corp GitHub auth).

**If you already have a clone of the repo:**
```bash
# copy the contents of this Station-Control-CenterV2-main folder into your clone, then:
git checkout -b test          # if the test branch doesn't exist yet
git add -A
git commit -m "SCC v2: Vite React build + gateway API wiring + TEST/PROD deploy workflows"
git push -u origin test       # this triggers the TEST deploy (once Phase 2 is done)
git checkout main && git merge test && git push origin main   # later, for PROD
```

**If you don't have a clone yet** (you downloaded the zip):
```bash
git clone <your-repo-url> scc-v2
# copy this folder's contents into scc-v2/ (overwrite), then commit + push as above
```

Do **not** commit `node_modules/` or `dist/` — they're already in `.gitignore` (the runner rebuilds
`dist/`). Do commit `package-lock.json` (the runner's `npm ci` needs it).

**Before the first push, set these placeholders:**
- `.github/workflows/deploy-test.yml` and `deploy.yml` → `VITE_SCC_API_BASE`
  (`https://<fe-host>/system/webdev/FactoryControl/api`) and confirm the runner label + `DEPLOY_TARGET`.
- `vite.config.js` → `PROJECT` / `APP` only if your reporting project or app-name differ from
  `Station-Control-Interactions` / `ui-station-control-center`. If you change these, keep `DEPLOY_TARGET` in the
  workflows aligned (they must point at the same folder).

---

## Phase 2 — One-time server setup

### 2A. FE gateway (FactoryControl) — the API + logic
In the Designer connected to the **FE gateway** (the one that hosts FactoryControl):
1. **Script library:** create/replace `StationControl/SCC/code.py` with
   [`server/StationControl_SCC_code.py`](server/StationControl_SCC_code.py).
2. **Named query:** ensure `station-control-center/getActiveStations` exists (scalar, param
   `StationName`, DB SCADA). Fail-safes to 0 if absent, so optional-but-recommended.
3. **WebDev `api` resource:** create a WebDev **Python** resource named `api`. Paste
   [`server/api_doPost.py`](server/api_doPost.py) into its `doPost` tab. On its **Security** tab:
   **Require Authentication = ON**, roles Engineering / Supervisor / Scheduler.
4. Save & publish the FactoryControl project. Confirm the endpoint responds:
   `https://<fe-host>/system/webdev/FactoryControl/api` (a GET will 405/redirect; that's fine — the
   app POSTs to it). That URL is your `VITE_SCC_API_BASE`.

> Cross-origin note: the UI is served from the reporting server but the `api` lives on the FE
> gateway — same cross-gateway pattern FCC already uses. If the browser blocks it, the doPost must
> return CORS headers allowing the reporting-server origin **with credentials** (the client sends the
> auth cookie). See `server/README.md`.

### 2B. Test reporting server — the runner + the path
Remote into the **test reporting server**:
1. **Self-hosted runner:** confirm a GitHub Actions runner with label **`test-report`** is installed
   and **Online** for this repo, and that its Node.js is **22.x**. If FCC already deploys to this same
   reporting server, that runner likely already exists — you can reuse it (a runner can serve multiple
   repos). If not, install one (GitHub → repo → Settings → Actions → Runners → New self-hosted runner,
   labels `self-hosted, Windows, X64, test-report`).
2. **WebDev mounted-folder resource (this is "your path"):** in the **Station-Control-Interactions** project, create a
   WebDev **mounted-folder resource** named `react` under `dist/ui-station-control-center/` whose
   `folder-path` points at its sibling `dist` folder:
   ```
   D:\Program Files\Inductive Automation\Ignition\data\projects\Station-Control-Interactions\com.inductiveautomation.webdev\resources\dist\ui-station-control-center\dist
   ```
   Resulting URL: `/system/webdev/Station-Control-Interactions/dist/ui-station-control-center/react/`
   (This exactly matches the Vite `base` and the workflow `DEPLOY_TARGET`.) Create the empty `dist`
   folder if it doesn't exist yet — the Action fills it on first deploy.
3. Save & publish the Station-Control-Interactions project.

> The `react` node is the URL endpoint; the sibling `dist` folder holds the built files. Keep that
> pairing straight (it's the same pattern as FCC's `ui-ops-fleet-map/react` → `.../dist`).

---

## Phase 3 — Everyday development (VDI / Scott's laptop)

```bash
git pull                # get latest
npm install             # first time, or when deps change
npm run dev             # http://localhost:5173  — runs in DEMO mode (mock data), no gateway needed
```
- `npm run dev` = "fire it up" locally. It renders fully on mock data so you can work on the UI
  offline. It will **not** hit the gateway from the laptop (that's expected — DEMO mode).
- `npm run build` → produces `dist/` locally if you want to inspect the production bundle.
- To point local dev at a real gateway (rare), create a `.env.local` with
  `VITE_SCC_API_BASE=https://<fe-host>/system/webdev/FactoryControl/api` — but the laptop must be able
  to reach that host and satisfy its auth/CORS.

---

## Phase 4 — Deploy to TEST

Once Phase 1 + 2 are done, deploying is just a push:
```bash
git checkout test
git merge <your-feature-branch>     # or commit directly on test
git push origin test
```
That triggers **Deploy to TEST Ignition Server**. It runs on the `test-report` runner and:
Node-22 check → `npm ci` → `npm test` → `npm run build` (with `VITE_SCC_API_BASE`) → delete old
`dist` → copy new `dist` to the WebDev folder → verify.

You can also trigger it manually: GitHub → Actions → *Deploy to TEST Ignition Server* → Run workflow →
pick `test`.

---

## Phase 5 — Validate in the browser
Open `https://<reporting-server>/system/webdev/Station-Control-Interactions/dist/ui-station-control-center/react/` and confirm:
- [ ] The app loads (not a blank screen).
- [ ] Browser dev tools: **no 404s** for `/assets/...` (if there are, the Vite `base` and the WebDev
      route don't match — Phase 1/2B).
- [ ] It shows **real data** (not the demo seeds). If it's demo data, the app couldn't reach the `api`
      endpoint — check `VITE_SCC_API_BASE` and Phase 2A.
- [ ] A test commit (e.g. set a component ID with a reason) succeeds and writes a
      `SupervisorOverrideLog` row with **your username** (if it logs `scc-web`, auth isn't enforced on
      the `api` resource — Phase 2A step 3).

---

## Phase 6 — Promote to PROD (later)
After TEST is validated, and after any FE-gateway changes are also on the PROD FE gateway:
```bash
git checkout main && git merge test && git push origin main
```
Runs **Deploy to PROD Ignition Server** on the `prod-report` runner with the PROD `VITE_SCC_API_BASE`.
Set the PROD FE host + confirm the PROD runner + PROD Station-Control-Interactions mounted folder first (Phase 2 for PROD).

---

## Troubleshooting
| Symptom | Cause | Fix |
|---|---|---|
| Blank page / JS+CSS 404 | Vite `base` ≠ WebDev route | Align `PROJECT`/`APP` in `vite.config.js` with the mounted-folder route (2B) |
| App loads but shows **demo data** | UI can't reach the `api` endpoint | Set `VITE_SCC_API_BASE`; verify the `api` resource exists + is reachable (2A); check CORS if cross-gateway |
| 404 at the root route / old build shows | Mounted folder points at the wrong dir, or project not published | Point `folder-path` at the built `dist`; save & publish Station-Control-Interactions (2B) |
| Action fails at "Validate runner Node.js" | Runner Node ≠ 22.x | Install/repair Node 22 on the runner |
| Action fails at "Run tests" | `npm test` errored | `npm test` is a pass-through stub here; a failure means a dependency/lockfile issue — check `npm ci` |
| Deploy succeeds, hosted app unchanged | Pushed to the repo but not the mapped branch, or runner offline | Push to `test`/`main`; confirm the runner is Online |
| Audit user logs `scc-web` | Auth not enforced on `api` | Turn on Require Authentication + roles on the `api` resource (2A) |

## Master checklist
**GitHub (once):** push repo · `test` + `main` branches · `VITE_SCC_API_BASE` set in both workflows ·
runner label/`DEPLOY_TARGET` confirmed.
**FE gateway (once):** SCC script deployed · `getActiveStations` query · `api` doPost + auth · project published.
**Reporting server (once):** `test-report` runner online (Node 22) · WebDev `react` mounted folder →
sibling `dist` · project published.
**Each release:** merge to `test` → push → validate → merge to `main` → push → validate.
