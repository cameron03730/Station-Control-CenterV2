// ===== SCC API client =====
// Bridges the React UI to the Ignition front-end WebDev `doPost` endpoint using the
// dynamic-dispatch contract:  POST { action:"<StationControl.SCC fn>", args:{...} }.
//
//   • LIVE  — an API endpoint is reachable. Resolved from (in order):
//               1. VITE_SCC_API_BASE  (baked in at build time by the deploy workflow) — use this
//                  when the UI is hosted on the reporting gateway but the doPost lives on the FE.
//               2. same-origin  /system/webdev/<project>/api  (when UI + doPost share a gateway).
//   • DEMO  — neither resolves (local `vite`, static host). Every helper falls back to the mock
//             seeds in data.js so the app still runs with no backend.
//
// Arg-key convention (matches the doPost dispatcher):
//   • reads  → the SCC function's real parameter names, sent as kwargs (fn(**args)).
//   • commits→ the short keys StationControl.SCC.runAction reads out of the dict.

import { seedStations, seedAmrs, seedScheduled, seedPlanned, RECON_DB, validateSerial, areaOf } from './data.js';

function detectApiBase() {
  const envBase = import.meta.env.VITE_SCC_API_BASE;
  if (envBase) return String(envBase).replace(/\/+$/, '');
  const parts = (window.location.pathname || '').split('/').filter(Boolean); // [system, webdev, <project>, …]
  const i = parts.indexOf('webdev');
  if (i >= 0 && parts.length > i + 1) return '/system/webdev/' + parts[i + 1] + '/api';
  return null; // no endpoint → DEMO
}

const API_URL = detectApiBase();
const MODE = API_URL ? 'LIVE' : 'DEMO';

async function call(action, args) {
  if (!API_URL) throw new Error('SCC is in DEMO mode (no gateway endpoint).');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // send the authenticated Ignition session cookie (works cross-origin too)
    body: JSON.stringify({ action, args: args || {} })
  });
  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  if (!res.ok || !body || body.ok === false) {
    const err = new Error((body && body.message) || ('Request failed (HTTP ' + res.status + ')'));
    err.body = body;
    throw err;
  }
  return body; // reads → { ok, data }   commits → { ok, message, ... }
}

const dataOf = (body) => (body && body.data !== undefined ? body.data : body);
const note = (what) => { if (MODE === 'LIVE') console.info('[SCC] ' + what + ' has no live endpoint yet — showing demo data.'); };
const toInt = (v) => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };
const str = (v) => (v === null || v === undefined ? '' : String(v));

// ---------------- STATIONS ----------------
const stations = {
  async list() {
    if (MODE === 'DEMO') return seedStations();
    const rows = dataOf(await call('getStationRows')) || [];
    return rows.map((r) => {
      const station = r.StationName || r.station || '';
      return { station, area: r.Area || areaOf(station), c1: str(r.ComponentID), c2: str(r.ComponentID_2), status: 0, runSchedule: [] };
    });
  },
  async next(station) {
    if (MODE === 'DEMO') return null;
    const m = dataOf(await call('stationComponentMismatch', { stationName: station })) || {};
    if (!m.expected && !m.current) return [];
    return [{
      tag: m.expected || m.current || '',
      comp: (m.expected || '').split(',')[0].trim() || m.current || '',
      serial: '', op: 'Next work order', start: '',
      desc: m.mismatched ? ('Station currently holds ' + (m.current || '(blank)')) : '',
      status: 1
    }];
  },
  async setComp(station, slot, value, reason) {
    const leaf = slot === 'c2' ? 'componentID_2' : 'componentID';
    if (MODE === 'DEMO') return { ok: true, message: '' };
    return await call('setStationComponentId', { station, newId: value, reason, leaf });
  },
  async markEntry(station, comp, kind, reason) {
    if (MODE === 'DEMO') return { ok: true, message: '' };
    const action = kind === 'complete' ? 'markScheduleComplete' : 'markScheduleWip';
    return await call(action, { idText: comp, item: '', station, reason });
  },
  async refreshNext(station, reason) {
    if (MODE === 'DEMO') return { ok: true, message: '' };
    return await call('pullNextWorkOrder', { station, reason });
  }
};

// ---------------- AMR FLEET ----------------
const amrs = {
  async list() {
    if (MODE === 'DEMO') return seedAmrs();
    const rows = dataOf(await call('getAmrFleet')) || [];
    return rows.map((r) => ({
      amr: str(r.AMR || r.amr),
      c1: str(r.ComponentID),
      c2: str(r.ComponentID2),
      state: str(r.State) || 'Unknown',
      batt: (r.BatteryLevel === undefined || r.BatteryLevel === null) ? null : toInt(r.BatteryLevel)
    }));
  },
  async setComp(amr, slot, value, reason) {
    const leaf = slot === 'c2' ? 'componentID2' : 'componentID';
    if (MODE === 'DEMO') return { ok: true, message: '' };
    return await call('setAmrComponentId', { amrId: amr, newId: value, reason, leaf });
  },
  async sendPayload(amr, reason) {
    if (MODE === 'DEMO') return { ok: true, message: '' };
    return await call('resendAmrPayload', { amrId: amr, reason: reason || 'Manual payload resend (SCC)' });
  }
};

// ---------------- MANUAL ASSEMBLY ----------------
const assembly = {
  async scheduled() {
    if (MODE === 'DEMO') return seedScheduled();
    const rows = dataOf(await call('getScheduledAssembly')) || [];
    let typeByCode = {};
    try { typeByCode = dataOf(await call('machineTypeByProductCode')) || {}; } catch (e) { /* optional */ }
    return rows.map((r) => ({
      serial: str(r.SerialNumber), product: str(r.ProductCode),
      machine: typeByCode[r.ProductCode] || '—', status: toInt(r.Status),
      wo: str(r.OrderNumber), ts: str(r.ScheduledTimestamp), legacy: false
    }));
  },
  async planned() {
    if (MODE === 'DEMO') return seedPlanned();
    note('assembly.planned'); // no dedicated "planned machines" feed — scan/enter serials directly
    return [];
  },
  async verify(serials) {
    if (MODE === 'DEMO') {
      return { ok: true, results: serials.map((s) => { const r = validateSerial(s, []); return { serial: s, ok: r.status === 'VERIFIED', reason: r.reason }; }) };
    }
    const res = await call('verifySerials', { serials });
    return { ok: res.ok, message: res.message, results: (res.results || []) };
  },
  async schedule(serials, legacy, reason) {
    if (MODE === 'DEMO') return { ok: true, message: '', scheduled: serials, skipped: [] };
    return await call('scheduleSerials', { serials, legacy, reason });
  }
};

// ---------------- WORK ORDER RECONCILIATION ----------------
const recon = {
  async lookup(q) {
    if (MODE === 'DEMO') { const d = RECON_DB[q]; return d ? Object.assign({ found: true }, d) : { found: false }; }
    const info = dataOf(await call('lookupComponent', { idText: q })) || {};
    if (!info.found) return { found: false };
    const flow = dataOf(await call('getMachineFlow', { idText: q })) || [];
    const rows = flow.map((r) => ({
      station: str(r.Station), status: toInt(r.Status), item: str(r.Item),
      sched: str(r.ScheduledTimestamp), wip: str(r.WIPTimestamp), done: str(r.CompletedTimestamp)
    }));
    const components = (info.associations || []).map((a) => ({ section: str(a.ItemName), id: str(a.ComponentID) }));
    return {
      found: true, kind: info.isNWG ? 'NWG' : 'WG',
      product: str(info.itemName) || '—', machine: info.isNWG ? 'Fabrication Component' : 'Whole Good',
      wo: str(info.serial || info.itemNumber || ''), rows, components
    };
  },
  async act(idText, station, item, kind, reason) {
    if (MODE === 'DEMO') return { ok: true, message: '' };
    if (kind === 'complete') return await call('markScheduleComplete', { idText, item, station, reason });
    if (kind === 'wip') return await call('markScheduleWip', { idText, item, station, reason });
    if (kind === 'prepaint') return await call('scheduleNwgPrePaint', { componentID: idText, itemName: item, reason });
    if (kind === 'preassembly') return await call('scheduleNwgPreAssembly', { componentID: idText, reason });
    throw new Error('Unknown recon action: ' + kind);
  }
};

export const SCC = { mode: MODE, apiUrl: API_URL, call, stations, amrs, assembly, recon };
if (typeof window !== 'undefined') window.SCC = SCC; // debugging convenience
