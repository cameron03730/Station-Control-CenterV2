# SCC v2 — Server (Ignition front-end) deployment

The web UI (`app/station-control-hub`) is presentation only. It talks to a JSON API on the
**front-end gateway (FE1/FE2)** that dynamically runs `StationControl.SCC` functions. This folder is
the server half.

```
Browser (SCC web app)  --POST {action,args}-->  FE WebDev "api" doPost  --dynamic dispatch-->  StationControl.SCC.*
                                                                              |-- system.tag.*  (TAGIO1/TAGIO2, remote providers on the FE)
                                                                              |-- system.db.runNamedQuery(project="FactoryControl")  (local)
                                                                              `-- system.util.sendRequest -> BE1/BE2 (FactoryGatewayEvents)
```

Because the API runs on the FE — which already hosts FactoryControl, the SCC script, and the tag
providers — **the server logic runs unchanged.** Nothing needs re-homing.

## Files here
- **`StationControl_SCC_code.py`** — the one SCC script. Deploy to the FE script library at
  `StationControl/SCC/code.py`. (Same as the v1 script + two additive helpers for this UI —
  `getScheduledAssembly` read and `resendAmrPayload` commit — see the "WEB-UI ADDITIONS" block at the
  bottom of the file. Both only compose existing queries/functions; no new named query.)
- **`api_doPost.py`** — paste into the `doPost` tab of a WebDev Python resource named `api`.

## Deploy steps (FE1, then FE2)
1. **Script library:** in Designer → Scripting, open `StationControl/SCC` and replace its `code.py`
   with `StationControl_SCC_code.py`. (If `StationControl/SCC` doesn't exist yet, create it.)
2. **Named query (once):** ensure `station-control-center/getActiveStations` exists in FactoryControl
   (scalar, param `StationName`, DB SCADA). All other queries the tool uses already exist.
3. **WebDev — HTML:** deploy the built `dist/` via the GitHub Actions workflow (push to `test`/`main`)
   or by copying `dist/` to the gateway. It is served by a WebDev **mounted-folder resource** at
   `/system/webdev/Station-Control-Interactions/dist/ui-station-control-center/react/`. See the repo root
   [`README.md`](../README.md) "Ignition WebDev hosting" section for the route ↔ `base` ↔ folder
   pairing (this is the static-hosting half, handled by the deploy workflow — not this folder).
4. **WebDev — API:** create a WebDev **Python** resource named `api` on the FE gateway that hosts
   `FactoryControl`. Paste `api_doPost.py` into its `doPost` tab. On its **Security** tab:
   **Require Authentication = on**, required roles `Engineering`, `Supervisor`, `Scheduler`.
   - The web app targets this endpoint via the build-time env var **`VITE_SCC_API_BASE`** (set per
     environment in the deploy workflow), e.g. `https://<fe-host>/system/webdev/FactoryControl/api`.
     If the UI and the `api` resource share a gateway, you may omit `VITE_SCC_API_BASE` and the app
     falls back to the same-origin `/system/webdev/<project>/api`.
   - Cross-origin note: if the UI (reporting gateway) and `api` (FE gateway) are different hosts, the
     `doPost` responses need CORS headers allowing the UI origin **with credentials** (the client
     sends `credentials: include` for the auth cookie).
5. Open the WebDev URL. Actions commit to `SupervisorOverrideLog`; if the audit user shows `scc-web`,
   authentication isn't enforced on the `api` resource (fix step 4).

## LIVE vs DEMO
The app auto-detects. **LIVE** when served under `/system/webdev/<project>/…` (or a `scc-api` meta
override); **DEMO** otherwise (local `vite`, GitHub Pages, `npx serve`) — every read/commit falls
back to the mock seeds so the prototype still runs for design review. The badge in the header shows
which mode is active.

## What's fully live vs degraded
| Feature | Live status |
|---|---|
| Station list, component-ID set/clear, Refresh Next Work Order, run-schedule Mark Complete/WIP | **Full** (`getStationRows`, `stationComponentMismatch`, `setStationComponentId`, `pullNextWorkOrder`, `markScheduleComplete/Wip`) |
| AMR fleet list, component-ID set/unassign, Send Payload | **Full** (`getAmrFleet`, `setAmrComponentId`, `resendAmrPayload`). AMR **state + battery** are not in `getAmrFleet` → shown as *Unknown / n/a* until `getAmrFleet` is extended to also read `fromNavithor/State` + `BatteryLevel`. |
| Manual Assembly: scheduled grid, Verify, Schedule | **Full** (`getScheduledAssembly`, `verifySerials`, `scheduleSerials`). The **Planned Machines** column has no backend feed — empty in LIVE; scan/enter serials into the build queue directly. |
| Work Order Reconciliation: lookup, swimlane/rows, Mark Complete/WIP, Sched Pre-Paint / Pre-Assembly | **Full** (`lookupComponent`, `getMachineFlow`, `markScheduleComplete/Wip`, `scheduleNwgPrePaint`, `scheduleNwgPreAssembly`) |

## Audit user (important)
The SCC commit functions record `SupervisorOverrideLog.OverrideUser` from a Perspective session,
which doesn't exist in a WebDev `doPost`. `api_doPost.py` resolves the **authenticated servlet user**
and wraps it in a shim so those functions work unchanged. If you ever see `scc-web` in the audit log,
authentication isn't enforced on the `api` resource — fix step 4.

## The contract, by example
```
POST /system/webdev/<Project>/api
{ "action": "getStationRows", "args": {} }
→ { "ok": true, "data": [ { "StationName": "TF0010", "Area": "Main Line", "ComponentID": "0160153042", ... } ] }

{ "action": "setStationComponentId",
  "args": { "station": "TF0010", "newId": "0160153099", "reason": "mis-scan", "leaf": "componentID" } }
→ { "ok": true, "message": "Committed: TF0010 ComponentID: 0160153042 -> 0160153099" }
```
Reads send the function's real parameter names; commits send the short keys `runAction` reads
(`station`, `newId`, `idText`, `amrId`, `serials`, `legacy`, `reason`).
