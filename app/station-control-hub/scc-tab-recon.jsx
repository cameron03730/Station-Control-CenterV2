// ===== TAB 4: Work Order Reconciliation =====
const { useState, useEffect } = React;

function StationActions({ station, kind, reason, onAct, compact }) {
  const disabled = !reason.trim();
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Btn variant="success" icon="check_circle" disabled={disabled} onClick={() => onAct('complete')}>Mark Complete</Btn>
        <Btn variant="outlineOrange" icon="pending" disabled={disabled} onClick={() => onAct('wip')}>Mark WIP</Btn>
      </div>
      {kind === 'NWG' && (
        <div className="grid grid-cols-2 gap-2">
          <Btn variant="outlineOrange" icon="format_paint" disabled={disabled} onClick={() => onAct('prepaint')}>Sched. Pre-Paint</Btn>
          <Btn variant="outlineOrange" icon="build" disabled={disabled} onClick={() => onAct('preassembly')}>Sched. Pre-Assembly</Btn>
        </div>
      )}
      {disabled && <div className="text-[11px] text-scc-muted flex items-center gap-1"><Icon name="info" style={{ fontSize: 14 }} />Enter a reason to enable actions.</div>}
    </div>
  );
}

function SwimlaneNode({ node, selected, onClick }) {
  const s = STATUS[node.status];
  const glow = node.status === 2;
  return (
    <button onClick={onClick}
      className={`relative w-[158px] flex-shrink-0 text-left rounded-lg border bg-scc-card px-3 py-2.5 transition-all hover:-translate-y-0.5 shadow-card ${selected ? 'border-scc-orange ring-1 ring-scc-orange' : 'border-scc-border hover:border-scc-muted/50'}`}
      style={glow ? { animation: 'sccGlow 1.8s ease-in-out infinite' } : undefined}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[13px] font-bold text-scc-text">{node.station}</span>
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color, boxShadow: glow ? `0 0 7px ${s.color}` : 'none' }} />
      </div>
      <div className="text-[11px] text-scc-muted truncate mb-1.5">{node.item}</div>
      <StatusPill code={node.status} />
    </button>
  );
}

function MiniStamp({ label, value }) {
  return (
    <div className="flex items-center justify-between text-[11.5px]">
      <span className="text-scc-muted font-semibold uppercase tracking-wide text-[10px]">{label}</span>
      <span className={value ? 'text-scc-text font-medium' : 'text-scc-muted/60 italic'}>{value || '—'}</span>
    </div>
  );
}

function TabRecon() {
  const [query, setQuery] = useState('0160153042');
  const [submitted, setSubmitted] = useState('0160153042');
  const [view, setView] = useState('chart');
  const [data, setData] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [rows, setRows] = useState([]);
  const [selStation, setSelStation] = useState(null);
  const [reason, setReason] = useState('');
  const [popover, setPopover] = useState(null); // {station,x,y}

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') setPopover(null); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const search = async () => {
    const q = query.trim();
    setSubmitted(q);
    setSelStation(null); setReason(''); setPopover(null);
    if (!q) return;
    try {
      const found = await sccApi.read('lookupComponent', { idText: q });
      if (!found || found.found === false) throw new Error(`No schedule found for ${q}.`);
      const schedule = await sccApi.read('getScheduleEntries', { idText: q });
      const flow = await sccApi.read('getMachineFlow', { idText: q });
      const sourceRows = flow?.length ? flow : schedule;
      const normalizedRows = (sourceRows || []).map(row => ({
        ...row,
        station: row.station || row.Station,
        status: row.status ?? row.Status,
        item: row.item || row.Item || '',
        sched: row.sched || row.ScheduledTimestamp || '',
        wip: row.wip || row.WIPTimestamp || '',
        done: row.done || row.CompletedTimestamp || '',
        area: row.area || row.Area || areaOf(row.station || row.Station || '')
      }));
      setNotFound(false);
      setData({ ...found, kind: found.isNWG ? 'NWG' : 'WG', product: found.itemName || found.itemNumber || '', machine: '', wo: found.serial || '', components: found.associations || [] });
      setRows(normalizedRows);
      window.sccToast(<span>Loaded schedule for <b className="font-mono">{q}</b> · {normalizedRows.length} stations.</span>, 'info');
    } catch (error) {
      setNotFound(true); setData(null); setRows([]); showApiError(error);
    }
  };

  const act = async (station, kind) => {
    const actions = {
      complete: ['markScheduleComplete', { idText: submitted, station }],
      wip: ['markScheduleWip', { idText: submitted, station }],
      prepaint: ['scheduleNwgPrePaint', { componentID: submitted }],
      preassembly: ['scheduleNwgPreAssembly', { componentID: submitted }]
    };
    try {
      const [action, args] = actions[kind];
      const result = await sccApi.commit(action, { ...args, reason });
      if (result?.ok === false) throw new Error(result.message);
      await search();
      setPopover(null);
      window.sccToast(result?.message || 'Schedule updated.', kind === 'complete' ? 'success' : 'info');
    } catch (error) { showApiError(error); }
  };

  const lanes = AREA_ORDER.map(area => ({ area, nodes: rows.filter(r => areaOf(r.station) === area) })).filter(l => l.nodes.length > 0);
  const nDone = rows.filter(r => r.status === 3).length;
  const pct = rows.length ? Math.round(nDone / rows.length * 100) : 0;
  const selRow = rows.find(r => r.station === selStation);
  const clsPill = notFound ? <Pill color="#E03131" solid>Not Found</Pill>
    : data ? (data.kind === 'WG' ? <Pill color="#E87722" solid>Whole Good</Pill> : <Pill color="#0C8599" solid>Non-Whole Good</Pill>) : null;

  const nodeClick = (n) => (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setSelStation(n.station);
    setPopover(p => {
      if (p?.station === n.station) return null;
      const x = Math.max(8, Math.min(r.left, window.innerWidth - 288));
      const below = r.bottom + 8;
      const y = below + 250 > window.innerHeight ? Math.max(8, r.top - 258) : below;
      return { station: n.station, x, y };
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Lookup hero */}
      <Card>
        <div className="p-4 flex gap-2">
          <div className="relative flex-1">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-scc-muted" style={{ fontSize: 19 }} />
            <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()}
              placeholder="ComponentID (M12345) or whole-good serial (0160153042)…"
              className="w-full h-11 pl-10 pr-3 rounded-lg border border-scc-border bg-scc-bg font-mono text-[14px] text-scc-text placeholder:text-scc-muted/70 placeholder:font-sans focus:border-scc-orange focus:ring-2 focus:ring-scc-orange/20 focus:bg-scc-card transition-colors" />
          </div>
          <Btn variant="primary" icon="search" className="!h-11 px-5" onClick={search}>Search</Btn>
        </div>
        {data && (
          <div className="flex items-center gap-5 px-4 py-3 border-t border-scc-borderLt flex-wrap">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-[19px] font-bold text-scc-text leading-none">{submitted}</span>
                {clsPill}
              </div>
              <div className="text-[12px] text-scc-muted mt-1"><span className="font-mono">{data.product}</span> · {data.machine} · <span className="font-mono">{data.wo}</span></div>
            </div>
            <span className="flex-1" />
            <div className="w-56">
              <div className="flex items-center justify-between text-[10.5px] font-bold uppercase tracking-wider text-scc-muted mb-1.5">
                <span>Progress</span><span className="tabular-nums">{nDone}/{rows.length} complete</span>
              </div>
              <div className="h-1.5 rounded-full bg-scc-borderLt overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? '#2F9E44' : '#E87722' }} />
              </div>
            </div>
            <Segmented value={view} onChange={setView} options={[{ value: 'chart', label: 'Chart', icon: 'account_tree' }, { value: 'rows', label: 'Rows', icon: 'table_rows' }]} />
          </div>
        )}
      </Card>

      {notFound && (
        <Card><EmptyState icon="search_off" title="Not found" sub={`No machine schedule matches "${submitted}". Enter an M-number or a 10-digit serial.`} /></Card>
      )}

      {data && (
        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
          {/* MAIN VIEW */}
          <Card>
            <CardHead title={view === 'chart' ? 'Machine Overview' : 'Schedule Entries'} sub={view === 'chart' ? 'Click a station node to act on it' : 'Click a row to act on it'} />
            {view === 'rows' ? (
              <div className="overflow-auto">
                <table className="w-full text-[13px] border-collapse">
                  <thead><tr className="text-left">
                    <th className="w-1.5 bg-scc-bg border-b border-scc-border" />
                    {['Station', 'Status', 'Item', 'Scheduled', 'WIP', 'Completed'].map(h => <th key={h} className="px-4 py-2.5 font-bold text-[10.5px] uppercase tracking-wider text-scc-muted bg-scc-bg border-b border-scc-border">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.station} onClick={() => setSelStation(r.station)}
                        className={`border-b border-scc-borderLt cursor-pointer transition-colors ${selStation === r.station ? 'bg-scc-orange/[0.08]' : 'hover:bg-scc-bg'}`}>
                        <td className="pl-1 w-1.5"><span className="block w-1.5 h-7 rounded-full" style={{ background: selStation === r.station ? '#E87722' : 'transparent' }} /></td>
                        <td className="px-4 py-2.5 font-mono font-bold">{r.station}</td>
                        <td className="px-4 py-2.5"><StatusPill code={r.status} /></td>
                        <td className="px-4 py-2.5">{r.item}</td>
                        <td className="px-4 py-2.5 text-scc-muted whitespace-nowrap">{r.sched || '—'}</td>
                        <td className="px-4 py-2.5 text-scc-muted whitespace-nowrap">{r.wip || '—'}</td>
                        <td className="px-4 py-2.5 text-scc-muted whitespace-nowrap">{r.done || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 flex flex-col gap-3 overflow-auto max-h-[540px]">
                {lanes.map(lane => (
                  <div key={lane.area} className="flex items-center gap-3">
                    <div className="w-[104px] flex-shrink-0 text-right">
                      <span className="text-[10.5px] font-bold uppercase tracking-wider text-scc-muted leading-tight">{lane.area}</span>
                    </div>
                    <div className="flex-1 flex items-center flex-wrap gap-y-2 rounded-xl border border-scc-borderLt bg-scc-bg px-3 py-2.5">
                      {lane.nodes.map((n, i) => (
                        <React.Fragment key={n.station}>
                          {i > 0 && <span className="w-6 h-px bg-scc-border flex-shrink-0" />}
                          <SwimlaneNode node={n} selected={selStation === n.station} onClick={nodeClick(n)} />
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* RIGHT PANEL */}
          <div className="flex flex-col gap-4">
            <Card>
              <CardHead title="Station Actions" sub={selStation ? <span className="font-mono">{selStation}</span> : 'Select a station'} />
              {!selRow ? (
                <div className="p-4 text-[13px] text-scc-muted italic">Select a {view === 'chart' ? 'node' : 'row'} to act on it.</div>
              ) : (
                <div className="p-4 flex flex-col gap-3">
                  <div className="rounded-lg border border-scc-borderLt bg-scc-bg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[15px] font-bold text-scc-text">{selRow.station}</span>
                      <StatusPill code={selRow.status} />
                    </div>
                    <div className="text-[12px] text-scc-muted mb-2.5">{selRow.item}</div>
                    <div className="flex flex-col gap-1">
                      <MiniStamp label="Scheduled" value={selRow.sched} />
                      <MiniStamp label="WIP" value={selRow.wip} />
                      <MiniStamp label="Completed" value={selRow.done} />
                    </div>
                  </div>
                  <ReasonField value={reason} onChange={setReason} />
                  <StationActions station={selRow.station} kind={data.kind} reason={reason} onAct={k => act(selRow.station, k)} />
                </div>
              )}
            </Card>

            {data.kind === 'WG' && data.components.length > 0 && (
              <Card>
                <CardHead title="Associated Components" sub="Read-only · NWG booms" />
                <div className="p-3 flex flex-col gap-1.5">
                  {data.components.map(c => (
                    <div key={c.section} className="flex items-center justify-between rounded-lg border border-scc-borderLt bg-scc-bg px-3 py-2">
                      <span className="text-[11px] font-bold text-scc-muted uppercase tracking-wider">{c.section}</span>
                      <span className="font-mono text-[13px] font-semibold text-scc-text">{c.id}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {popover && data && (() => {
        const n = rows.find(r => r.station === popover.station);
        if (!n) return null;
        return (
          <React.Fragment>
            <div className="fixed inset-0 z-40" onClick={() => setPopover(null)}></div>
            <div className="fixed z-50 w-[270px] bg-scc-card border border-scc-border rounded-xl shadow-2xl p-3.5" style={{ left: popover.x, top: popover.y, animation: 'sccToastIn .15s ease' }}>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2"><span className="font-mono text-[13.5px] font-bold text-scc-text">{n.station}</span><StatusPill code={n.status} /></div>
                <button onClick={() => setPopover(null)} className="text-scc-muted hover:text-scc-text"><Icon name="close" style={{ fontSize: 17 }} /></button>
              </div>
              <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (required)…"
                className="w-full h-8 px-2.5 rounded-lg border border-scc-border bg-scc-card text-[12px] text-scc-text placeholder:text-scc-muted/70 focus:border-scc-orange focus:ring-2 focus:ring-scc-orange/20 mb-2.5" />
              <StationActions station={n.station} kind={data.kind} reason={reason} onAct={k => act(n.station, k)} compact />
            </div>
          </React.Fragment>
        );
      })()}
    </div>
  );
}

window.TabRecon = TabRecon;
