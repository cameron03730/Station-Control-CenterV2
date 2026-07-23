import React, { useState, useEffect } from 'react';
import { Icon, Pill, StatusPill, Btn, Card, CardHead, TextInput, SearchBox, Dropdown, Toggle, Segmented, ReasonField, MonoVal, ConfirmDialog, EmptyState } from '../primitives.jsx';
import { AREA_ORDER, areaOf, STATUS, nowStamp, validateSerial, classifyLookup, RECON_DB } from '../data.js';
import { SCC } from '../api.js';

// ===== TAB 3: Manual Assembly — Planned → Build Queue → Scheduled pipeline =====

let woCounter = 104590;

const ROW_STATES = {
  PENDING: { color: '#5B6675', label: 'Pending' },
  VERIFIED: { color: '#2F9E44', label: 'Verified' },
  INVALID: { color: '#E03131', label: 'Invalid' }
};

function StepTag({ n, children }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-scc-orange/15 text-scc-orangeDk text-[11px] font-bold">{n}</span>
      <span className="text-[13px] font-bold tracking-wide uppercase text-scc-text">{children}</span>
    </div>
  );
}

function PlannedRow({ p, queued, onQueue }) {
  return (
    <div className="group flex items-center justify-between gap-3 rounded-lg border border-scc-border bg-scc-card px-3 py-2.5 transition-all hover:border-scc-muted/50">
      <div className="min-w-0">
        <div className="font-mono text-[13.5px] font-bold text-scc-text">{p.serial}</div>
        <div className="text-[11.5px] text-scc-muted truncate"><span className="font-mono">{p.product}</span> · {p.machine} · plan {p.date}</div>
      </div>
      {queued
        ? <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-scc-muted flex-shrink-0"><Icon name="check" style={{ fontSize: 14 }} />Queued</span>
        : <Btn variant="outlineOrange" icon="add" className="!h-7 !px-2 text-[12px] flex-shrink-0" onClick={onQueue}>Queue</Btn>}
    </div>
  );
}

function BuilderRow({ row, onRemove }) {
  const st = ROW_STATES[row.status];
  return (
    <div className={`group flex items-center gap-3 rounded-lg border bg-scc-card px-3.5 h-12 transition-all hover:border-scc-muted/50 ${row.status === 'INVALID' ? 'border-scc-red/40' : 'border-scc-border'}`}>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: st.color, boxShadow: row.status === 'VERIFIED' ? `0 0 6px ${st.color}` : 'none' }} />
      <span className="font-mono text-[14px] font-bold text-scc-text">{row.serial}</span>
      <Pill color={st.color}>{st.label}</Pill>
      {row.reason && <span className="text-[12px] text-scc-red font-medium truncate">{row.reason}</span>}
      <span className="flex-1" />
      <button onClick={onRemove} title="Remove" className="text-scc-muted/50 hover:text-scc-red transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"><Icon name="close" style={{ fontSize: 19 }} /></button>
    </div>
  );
}

function TabAssembly() {
  const [planned, setPlanned] = useState([]);
  const [plannedQ, setPlannedQ] = useState('');
  const [input, setInput] = useState('');
  const [rows, setRows] = useState([]);
  const [reason, setReason] = useState('');
  const [legacy, setLegacy] = useState(false);
  const [scheduled, setScheduled] = useState([]);
  const [schedQ, setSchedQ] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [pl, sc] = await Promise.all([SCC.assembly.planned(), SCC.assembly.scheduled()]);
      setPlanned(pl); setScheduled(sc);
    } catch (e) { window.sccToast('Could not load assembly data: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const nVerified = rows.filter(r => r.status === 'VERIFIED').length;
  const counts = ['PENDING', 'VERIFIED', 'INVALID'].map(s => ({ s, n: rows.filter(r => r.status === s).length }));
  const filteredPlanned = planned.filter(p => p.serial.includes(plannedQ) || p.product.toLowerCase().includes(plannedQ.toLowerCase()));

  const addSerial = (s) => {
    if (!s) return;
    if (rows.some(r => r.serial === s)) { window.sccToast('That serial is already in the build queue.', 'warn'); return; }
    setRows(r => [...r, { serial: s, status: 'PENDING', reason: '' }]);
  };

  const verifyAll = async () => {
    if (SCC.mode === 'DEMO') {
      const already = scheduled.map(s => s.serial);
      setRows(rs => {
        const seen = [...already];
        return rs.map(r => {
          let res = validateSerial(r.serial, seen);
          if (res.status === 'VERIFIED' && !planned.some(p => p.serial === r.serial.trim())) {
            res = { status: 'INVALID', reason: 'not in planned machines' };
          }
          if (res.status === 'VERIFIED') seen.push(r.serial.trim());
          return { ...r, ...res };
        });
      });
      window.sccToast('Verification complete.', 'info');
      return;
    }
    const serials = rows.map(r => r.serial.trim()).filter(Boolean);
    if (!serials.length) return;
    try {
      const res = await SCC.assembly.verify(serials);
      const bySerial = {};
      (res.results || []).forEach(x => { bySerial[String(x.serial).trim()] = x; });
      setRows(rs => rs.map(r => {
        const x = bySerial[r.serial.trim()];
        if (!x) return { ...r, status: 'INVALID', reason: 'not verified' };
        return { ...r, status: x.ok ? 'VERIFIED' : 'INVALID', reason: x.ok ? '' : (x.reason || 'invalid') };
      }));
      window.sccToast(res.message || 'Verification complete.', 'info');
    } catch (e) { window.sccToast(e.message || 'Verify failed.', 'error'); }
  };

  const scheduleAll = async () => {
    const valid = rows.filter(r => r.status === 'VERIFIED');
    const skipped = rows.length - valid.length;
    if (valid.length === 0) { window.sccToast('No verified serials to schedule. Run Verify All first.', 'warn'); return; }
    const serials = valid.map(r => r.serial.trim());

    if (SCC.mode === 'DEMO') {
      const additions = valid.map(r => {
        const p = planned.find(x => x.serial === r.serial.trim());
        return { serial: r.serial.trim(), product: p?.product || '—', machine: p?.machine || '—', status: 1, wo: `WG-${woCounter++}`, ts: nowStamp(0), legacy };
      });
      setScheduled(s => [...additions, ...s]);
      setPlanned(pl => pl.filter(p => !valid.some(v => v.serial.trim() === p.serial)));
      setRows(rs => rs.filter(r => r.status !== 'VERIFIED'));
      window.sccToast(<span>Scheduled <b>{valid.length}</b> of {rows.length}{skipped ? <>; skipped <b>{skipped}</b></> : ''}{legacy ? ' (Legacy)' : ''}. Removed from planned machines.</span>, 'success');
      return;
    }
    try {
      const res = await SCC.assembly.schedule(serials, legacy, reason);
      if (res && res.ok === false) { window.sccToast(res.message || 'Scheduling rejected.', 'error'); return; }
      const okSet = new Set((res.scheduled || serials).map(s => String(s).trim()));
      setRows(rs => rs.filter(r => !okSet.has(r.serial.trim())));
      window.sccToast(res.message || `Scheduled ${okSet.size} machine(s).`, 'success');
      await load();
    } catch (e) { window.sccToast(e.message || 'Scheduling failed.', 'error'); }
  };

  const filteredSched = scheduled.filter(s => s.serial.includes(schedQ) || s.wo.toLowerCase().includes(schedQ.toLowerCase()) || s.product.toLowerCase().includes(schedQ.toLowerCase()));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[360px_minmax(0,1fr)] gap-4 items-start">
        {/* STEP 1 — Planned machines */}
        <Card>
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-scc-borderLt">
            <StepTag n="1">Planned Machines</StepTag>
            <span className="text-[12px] text-scc-muted">{planned.length} planned</span>
          </div>
          <div className="px-3 pt-3">
            <SearchBox value={plannedQ} onChange={setPlannedQ} placeholder="Search planned…" />
          </div>
          <div className="p-3 flex flex-col gap-2 max-h-[520px] overflow-auto">
            {filteredPlanned.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-scc-border py-8 text-center px-4">
                <Icon name="event_available" className="text-scc-border" style={{ fontSize: 28 }} />
                <span className="text-[12.5px] text-scc-muted mt-2">{planned.length === 0 ? 'All planned machines have been scheduled.' : 'No planned machines match.'}</span>
              </div>
            )}
            {filteredPlanned.map(p => <PlannedRow key={p.serial} p={p} queued={rows.some(r => r.serial === p.serial)} onQueue={() => addSerial(p.serial)} />)}
          </div>
          <div className="px-4 py-2.5 border-t border-scc-borderLt text-[11.5px] text-scc-muted flex items-center gap-1.5">
            <Icon name="info" style={{ fontSize: 14 }} />Only planned machines can be scheduled.
          </div>
        </Card>

        {/* STEP 2 — Build queue */}
        <Card>
          <div className="flex items-center gap-3 px-4 py-3 border-b border-scc-borderLt flex-wrap">
            <StepTag n="2">Build Queue</StepTag>
            <div className="flex items-center gap-1.5">
              {counts.filter(c => c.n > 0).map(({ s, n }) => (
                <span key={s} className="inline-flex items-center gap-1.5 rounded-full border border-scc-border px-2.5 h-6 text-[11px] font-semibold text-scc-muted">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: ROW_STATES[s].color }} />{n} {ROW_STATES[s].label}
                </span>
              ))}
            </div>
            <span className="flex-1" />
            <Btn variant="secondary" icon="fact_check" onClick={verifyAll} disabled={rows.length === 0}>Verify All</Btn>
          </div>
          <div className="p-4">
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <Icon name="qr_code_scanner" className="absolute left-3 top-1/2 -translate-y-1/2 text-scc-muted" style={{ fontSize: 19 }} />
                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { addSerial(input.trim()); setInput(''); } }}
                  placeholder="Scan or enter a 10-digit whole-good serial…"
                  className="w-full h-11 pl-10 pr-3 rounded-lg border border-scc-border bg-scc-bg font-mono text-[14px] text-scc-text placeholder:text-scc-muted/70 placeholder:font-sans focus:border-scc-orange focus:ring-2 focus:ring-scc-orange/20 focus:bg-scc-card transition-colors" />
              </div>
              <Btn variant="primary" icon="add" className="!h-11 px-5" onClick={() => { addSerial(input.trim()); setInput(''); }}>Add</Btn>
            </div>
            <div className="flex flex-col gap-2 mb-4">
              {rows.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-scc-border py-10">
                  <Icon name="barcode_reader" className="text-scc-border" style={{ fontSize: 32 }} />
                  <span className="text-[13px] text-scc-muted mt-2">Queue is empty — scan a serial or pick from Planned Machines.</span>
                </div>
              )}
              {rows.map((r, i) => <BuilderRow key={r.serial + i} row={r} onRemove={() => setRows(rs => rs.filter((_, j) => j !== i))} />)}
            </div>
            <div className="rounded-xl border border-scc-borderLt bg-scc-bg p-3.5">
              <div className="flex items-end gap-4 flex-wrap">
                <div className="flex-1 min-w-[240px]"><ReasonField value={reason} onChange={setReason} /></div>
                <div className="flex items-center gap-4 pb-1">
                  <Toggle checked={legacy} onChange={setLegacy} label="Legacy" />
                  <Btn variant="primary" icon="playlist_add_check" onClick={scheduleAll} disabled={!reason.trim() || nVerified === 0}>
                    Schedule All{nVerified > 0 && <span className="ml-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-white/20 text-[11px] font-bold">{nVerified}</span>}
                  </Btn>
                </div>
              </div>
              {(!reason.trim() || nVerified === 0) && (
                <div className="text-[11.5px] text-scc-muted mt-2 flex items-center gap-1.5">
                  <Icon name="info" style={{ fontSize: 15 }} />
                  {nVerified === 0 ? 'Run Verify All — only verified serials can be scheduled.' : 'A reason is required before scheduling.'}
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* STEP 3 — Scheduled */}
      <Card>
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-scc-borderLt flex-wrap">
          <div className="flex items-center gap-3">
            <StepTag n="3">Scheduled Serials</StepTag>
            <span className="text-[12px] text-scc-muted">{filteredSched.length} entries</span>
          </div>
          <div className="flex items-center gap-2.5">
            <SearchBox value={schedQ} onChange={setSchedQ} placeholder="Search…" className="w-56" />
            <Btn variant="secondary" icon="refresh" onClick={async () => { await load(); window.sccToast('Scheduled serials and planned machines refreshed.', 'info'); }}>Refresh</Btn>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="text-left">
                {['Serial', 'Product', 'Machine Type', 'Status', 'Work Order', 'Scheduled'].map(h =>
                  <th key={h} className="px-4 py-2.5 font-bold text-[10.5px] uppercase tracking-wider text-scc-muted bg-scc-bg border-b border-scc-border">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filteredSched.map((s, i) => (
                <tr key={s.serial + i} className="border-b border-scc-borderLt hover:bg-scc-bg transition-colors">
                  <td className="px-4 py-2.5 font-mono font-semibold">{s.serial}{s.legacy && <Pill color="#6741D9" className="ml-2">Legacy</Pill>}</td>
                  <td className="px-4 py-2.5 font-mono text-scc-muted">{s.product}</td>
                  <td className="px-4 py-2.5">{s.machine}</td>
                  <td className="px-4 py-2.5"><StatusPill code={s.status} /></td>
                  <td className="px-4 py-2.5 font-mono text-scc-muted">{s.wo}</td>
                  <td className="px-4 py-2.5 text-scc-muted">{s.ts}</td>
                </tr>
              ))}
              {filteredSched.length === 0 && <tr><td colSpan={6}><EmptyState icon="inbox" title="No scheduled serials" /></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default TabAssembly;
