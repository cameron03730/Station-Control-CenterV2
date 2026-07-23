// ===== TAB 1: Station Rectification — full-width list + run-schedule drawer =====
const { useState, useEffect } = React;

function StationRow({ row, selected, onClick }) {
  const next = row.runSchedule?.find(e => e.status !== 3);
  return (
    <tr onClick={onClick}
      className={`cursor-pointer border-b border-scc-borderLt transition-colors ${selected ? 'bg-scc-orange/[0.08]' : 'hover:bg-scc-bg'}`}>
      <td className="pl-3 pr-1 w-1.5"><span className="block w-1.5 h-8 rounded-full" style={{ background: selected ? '#E87722' : 'transparent' }} /></td>
      <td className="py-3.5 pr-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[14.5px] font-bold text-scc-text">{row.station}</span>
          {row.status === 2 && <span title="Actively building" className="inline-block w-2 h-2 rounded-full bg-scc-amber" style={{ boxShadow: '0 0 6px #E8920C' }} />}
        </div>
      </td>
      <td className="py-3.5 pr-3"><Pill color="#0C8599">{row.area}</Pill></td>
      <td className="py-3.5 pr-3"><MonoVal>{row.c1}</MonoVal></td>
      <td className="py-3.5 pr-3"><MonoVal>{row.c2}</MonoVal></td>
      <td className="py-3.5 pr-3">
        {next ? <div className="min-w-0"><span className="font-mono text-[12.5px] font-semibold text-scc-text">{next.tag}</span><div className="text-[11px] text-scc-muted truncate">{next.op}</div></div>
          : <span className="text-[12px] text-scc-muted/60 italic">—</span>}
      </td>
      <td className="py-3.5 pr-3 text-right"><Icon name="chevron_right" className={selected ? 'text-scc-orange align-middle' : 'text-scc-muted/40 align-middle'} style={{ fontSize: 20 }} /></td>
    </tr>
  );
}

function RSField({ label, value, mono }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-bold uppercase tracking-wider text-scc-muted/80">{label}</div>
      <div className={`text-[11.5px] truncate text-scc-text ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function RSEntry({ e, expanded, onToggle, reason, onAct }) {
  const noReason = !reason.trim();
  return (
    <div className={`rounded-lg border bg-scc-card shadow-card transition-all ${expanded ? 'border-scc-orange ring-1 ring-scc-orange' : 'border-scc-border hover:border-scc-muted/50'}`}>
      <button onClick={onToggle} className="w-full text-left px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[13.5px] font-bold truncate text-scc-text">{e.tag}</span>
          <StatusPill code={e.status} />
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2">
          <RSField label="Operation" value={e.op} />
          <RSField label="Start" value={e.start} />
          <RSField label="Component" value={e.comp} mono />
          <RSField label="Serial" value={e.serial} mono />
        </div>
        <div className="text-[10.5px] mt-2 truncate text-scc-muted/70">{e.desc}</div>
      </button>
      {expanded && (
        <div className="px-3.5 pb-3.5 pt-2.5 border-t border-scc-borderLt">
          <div className="grid grid-cols-2 gap-2">
            <Btn variant="success" icon="check_circle" disabled={noReason || e.status === 3} className="!h-8 text-[12px]" onClick={() => onAct('complete')}>Mark Complete</Btn>
            <Btn variant="outlineOrange" icon="pending" disabled={noReason || e.status === 2} className="!h-8 text-[12px]" onClick={() => onAct('wip')}>Mark WIP</Btn>
          </div>
          {noReason && <div className="text-[11px] mt-2 flex items-center gap-1 text-scc-muted"><Icon name="info" style={{ fontSize: 14 }} />Enter a reason to enable actions.</div>}
        </div>
      )}
    </div>
  );
}

function CompEditor({ label, current, blocked, reason, onCommit, onBlank }) {
  const [val, setVal] = useState('');
  const noReason = !reason.trim();
  return (
    <div className="rounded-lg border border-scc-borderLt bg-scc-card p-3">
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-[12.5px] font-bold text-scc-text">{label}</div>
        <MonoVal>{current}</MonoVal>
      </div>
      <TextInput value={val} onChange={setVal} placeholder="Enter new component ID…" mono className="w-full mb-2" disabled={blocked} />
      <div className="flex gap-2">
        <Btn variant="primary" icon="save" disabled={blocked || noReason || !val.trim()} className="flex-1" onClick={() => onCommit(val.trim(), () => setVal(''))}>Commit</Btn>
        <Btn variant="secondary" icon="backspace" disabled={blocked || noReason || !current} onClick={() => onBlank()}>Set Blank</Btn>
      </div>
    </div>
  );
}

function TabStation() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [area, setArea] = useState('All Areas');
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState(null);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [openEntry, setOpenEntry] = useState(null);

  const areas = ['All Areas', ...AREA_ORDER.filter(a => stations.some(s => s.area === a))];
  const filtered = stations.filter(s =>
    (area === 'All Areas' || s.area === area) &&
    (s.station.toLowerCase().includes(q.toLowerCase()) || s.c1.toLowerCase().includes(q.toLowerCase()) || s.c2.toLowerCase().includes(q.toLowerCase())));
  const sel = stations.find(s => s.station === selId);
  const blocked = sel?.status === 2;
  const nWip = stations.filter(s => s.status === 2).length;
  const nextUp = sel?.runSchedule?.find(e => e.status !== 3);

  const loadStations = async () => {
    setLoading(true);
    try {
      const rows = await sccApi.read('getStationRows');
      setStations((rows || []).map(row => ({
        ...row,
        station: row.station || row.Station,
        area: row.area || row.Area || areaOf(row.station || row.Station || ''),
        c1: row.c1 ?? row.ComponentID ?? '',
        c2: row.c2 ?? row.ComponentID_2 ?? '',
        status: row.status ?? row.Status,
        runSchedule: row.runSchedule || []
      })));
    } catch (error) {
      showApiError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') setSelId(null); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    loadStations();
  }, []);

  const refresh = () => loadStations().then(() => window.sccToast('Station list refreshed from Ignition.', 'info'));
  const openStation = async (id) => {
    setSelId(id); setReason(''); setOpenEntry(null);
    try {
      const mismatch = await sccApi.read('stationComponentMismatch', { station: id });
      setStations(list => list.map(row => row.station === id ? { ...row, mismatch } : row));
    } catch (error) { showApiError(error); }
  };

  const commit = (field, label, newVal, clearInput, danger) => {
    const cur = sel[field] || '(blank)';
    const nxt = newVal || '(blank)';
    setConfirm({
      danger,
      title: danger ? `Clear ${label}?` : `Commit ${label}?`,
      confirmLabel: danger ? 'Set Blank' : 'Commit',
      body: <span>Set <b className="text-scc-text">{sel.station}</b> {label} from <span className="font-mono">{cur}</span> → <span className={`font-mono font-semibold ${danger ? 'text-scc-red' : 'text-scc-orangeDk'}`}>{nxt}</span>. This override will be recorded to the SupervisorOverrideLog.</span>,
      run: async () => {
        try {
          const leaf = field === 'c2' ? 'componentID_2' : 'componentID';
          const result = await sccApi.commit('setStationComponentId', { station: sel.station, newId: newVal, reason, leaf });
          if (result?.ok === false) throw new Error(result.message);
          await loadStations();
          window.sccToast(result?.message || <span><b>{sel.station}</b> {label} updated.</span>, 'success');
          clearInput?.(); setConfirm(null);
        } catch (error) { showApiError(error); }
      }
    });
  };

  const actEntry = (tag, kind) => {
    const e = sel.runSchedule?.find(x => x.tag === tag);
    sccApi.commit(kind === 'complete' ? 'markScheduleComplete' : 'markScheduleWip', {
      idText: e?.comp || e?.serial || '', item: e?.op || '', station: sel.station, reason
    }).then(async result => {
      if (result?.ok === false) throw new Error(result.message);
      await loadStations();
      window.sccToast(result?.message || 'Schedule updated.', kind === 'complete' ? 'success' : 'info');
    }).catch(showApiError);
  };

  return (
    <div>
      <Card>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-scc-borderLt flex-wrap">
          <div className="flex items-baseline gap-2 pr-1">
            <span className="text-[13px] font-bold tracking-wide uppercase text-scc-text">Stations</span>
            <span className="text-[12px] text-scc-muted">{filtered.length} of {stations.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-scc-border px-2.5 h-6 text-[11px] font-semibold text-scc-muted"><span className="w-1.5 h-1.5 rounded-full bg-scc-amber" />{nWip} building</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-scc-border px-2.5 h-6 text-[11px] font-semibold text-scc-muted"><span className="w-1.5 h-1.5 rounded-full bg-scc-green" />{stations.length - nWip} editable</span>
          </div>
          <span className="flex-1" />
          <Dropdown value={area} onChange={setArea} options={areas} className="w-40" />
          <SearchBox value={q} onChange={setQ} placeholder="Search station or component ID…" className="w-72" />
          <Btn variant="secondary" icon="refresh" onClick={refresh}>Refresh</Btn>
        </div>
        <div className="max-h-[calc(100vh-240px)] min-h-[420px] overflow-auto">
          {loading ? <EmptyState icon="progress_activity" title="Loading stations…" /> :
          filtered.length === 0 ? <EmptyState icon="search_off" title="No stations match" sub="Adjust the area filter or search." /> : (
            <table className="w-full text-[13px] border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="text-left">
                  <th className="w-1.5 bg-scc-card border-b border-scc-border" />
                  {['Station', 'Area', 'Comp ID 1', 'Comp ID 2', 'Next Up (Run Schedule)'].map(h =>
                    <th key={h} className="py-2.5 pr-3 font-bold text-[10.5px] uppercase tracking-wider text-scc-muted bg-scc-card border-b border-scc-border">{h}</th>)}
                  <th className="w-10 bg-scc-card border-b border-scc-border" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => <StationRow key={s.station} row={s} selected={s.station === selId} onClick={() => openStation(s.station)} />)}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-4 py-2.5 border-t border-scc-borderLt text-[11.5px] text-scc-muted flex items-center gap-1.5">
          <Icon name="info" style={{ fontSize: 14 }} />Nothing auto-refreshes — use Refresh to pull the latest state. Click a station to rectify it and manage its run schedule.
        </div>
      </Card>

      {/* Centered station popup */}
      {sel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(8,11,16,0.55)', backdropFilter: 'blur(2px)' }} onClick={() => setSelId(null)}>
          <div className="w-full max-w-[920px] max-h-[88vh] bg-scc-card border border-scc-border rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ animation: 'sccPopIn .2s ease-out' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 h-14 border-b border-scc-borderLt flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-[20px] font-bold text-scc-text leading-none">{sel.station}</span>
                <Pill color="#0C8599">{sel.area}</Pill>
                {blocked
                  ? <Pill color="#E8920C" solid><Icon name="lock" style={{ fontSize: 12, marginRight: 4 }} />Building</Pill>
                  : <Pill color="#2F9E44" solid><Icon name="check" style={{ fontSize: 12, marginRight: 4 }} />OK to edit</Pill>}
              </div>
              <button onClick={() => setSelId(null)} className="text-scc-muted hover:text-scc-text"><Icon name="close" style={{ fontSize: 22 }} /></button>
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-2">
              {/* Run schedule — recessed panel */}
              <div className="min-h-0 overflow-auto p-4 bg-scc-bg">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-scc-muted">Run Schedule</span>
                  <span className="text-[11px] text-scc-muted">{sel.runSchedule.filter(e => e.status !== 3).length} remaining</span>
                </div>
                {nextUp && (
                  <div className="rounded-xl p-4 mb-3 bg-scc-orange/10 border border-scc-orange/50">
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-1 text-scc-orangeDk">Next Component ID</div>
                    <div className="font-mono text-[19px] font-bold leading-tight mb-2.5 text-scc-text">{nextUp.tag}</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      <RSField label="Operation" value={nextUp.op} />
                      <RSField label="Start" value={nextUp.start} />
                      <RSField label="Component" value={nextUp.comp} mono />
                      <RSField label="Serial" value={nextUp.serial} mono />
                    </div>
                    <div className="text-[10.5px] mt-2 text-scc-muted">{nextUp.desc}</div>
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {sel.runSchedule.map(e => (
                    <RSEntry key={e.tag} e={e} expanded={openEntry === e.tag} reason={reason}
                      onToggle={() => setOpenEntry(openEntry === e.tag ? null : e.tag)}
                      onAct={k => actEntry(e.tag, k)} />
                  ))}
                </div>
              </div>

              {/* Controls */}
              <div className="min-h-0 overflow-auto border-l border-scc-borderLt flex flex-col">
                <div className="flex-1 p-4 flex flex-col gap-4">
                  {blocked && (
                    <div className="flex items-start gap-2 rounded-md bg-scc-amber/10 border border-scc-amber/30 px-3 py-2.5">
                      <Icon name="warning" className="text-scc-amber" style={{ fontSize: 18 }} />
                      <p className="text-[12.5px] text-scc-text m-0 leading-snug">This station is <b>actively building (WIP)</b>. Component ID edits are blocked; run-schedule actions remain available.</p>
                    </div>
                  )}
                  <ReasonField value={reason} onChange={setReason} />
                  <div>
                    <div className="text-[11.5px] font-bold uppercase tracking-wider text-scc-muted mb-2.5">Component ID Rectification</div>
                    <div className="flex flex-col gap-2.5">
                      <CompEditor label="Component ID 1" current={sel.c1} blocked={blocked} reason={reason}
                        onCommit={(v, clr) => commit('c1', 'Component ID 1', v, clr, false)}
                        onBlank={() => commit('c1', 'Component ID 1', '', null, true)} />
                      <CompEditor label="Component ID 2" current={sel.c2} blocked={blocked} reason={reason}
                        onCommit={(v, clr) => commit('c2', 'Component ID 2', v, clr, false)}
                        onBlank={() => commit('c2', 'Component ID 2', '', null, true)} />
                    </div>
                  </div>
                </div>
                <div className="p-4 border-t border-scc-borderLt">
                  <Btn variant="outlineOrange" icon="sync" disabled={!reason.trim()} className="w-full"
                    onClick={() => window.sccToast(<span>Next work order refreshed for <b>{sel.station}</b>.</span>, 'info')}>
                    Refresh Next Work Order
                  </Btn>
                  {!reason.trim() && <div className="text-[11px] text-scc-muted mt-2 flex items-center gap-1"><Icon name="info" style={{ fontSize: 14 }} />Enter a reason to enable run-schedule actions.</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!confirm} title={confirm?.title} body={confirm?.body} confirmLabel={confirm?.confirmLabel}
        confirmVariant={confirm?.danger ? 'danger' : 'primary'}
        onConfirm={() => confirm?.run()} onCancel={() => setConfirm(null)} />
    </div>
  );
}

window.TabStation = TabStation;
