// ===== TAB 2: AMR Rectification =====
const { useState, useEffect } = React;

const AMR_STATES = {
  Auto: { color: '#2F9E44', label: 'Auto' },
  StandBy: { color: '#E8920C', label: 'StandBy' },
  Offline: { color: '#5B6675', label: 'Offline' }
};

function BattBar({ pct }) {
  const color = pct > 50 ? '#2F9E44' : pct > 20 ? '#E8920C' : '#E03131';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-scc-borderLt overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[11px] font-bold tabular-nums" style={{ color }}>{pct}%</span>
    </div>
  );
}

function SlotChip({ label, value }) {
  return (
    <div className={`rounded-md border px-2 py-1.5 min-w-0 ${value ? 'border-scc-border bg-scc-bg' : 'border-dashed border-scc-border/70'}`}>
      <div className="text-[9.5px] uppercase tracking-wide text-scc-muted font-bold">{label}</div>
      <div className="truncate">{value ? <span className="font-mono text-[12px] font-semibold text-scc-text">{value}</span> : <span className="font-mono text-[11.5px] text-scc-muted/60 italic">empty</span>}</div>
    </div>
  );
}

function AmrCard({ row, selected, onSelect, onSend }) {
  const st = AMR_STATES[row.state];
  const canSend = !!(row.c1 || row.c2) && row.state !== 'Offline';
  return (
    <div onClick={onSelect}
      className={`group cursor-pointer rounded-xl border bg-scc-card p-3.5 transition-all hover:-translate-y-0.5 shadow-card ${selected ? 'border-scc-orange ring-1 ring-scc-orange' : 'border-scc-border hover:border-scc-muted/50'} ${row.state === 'Offline' ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10.5px] uppercase tracking-wide text-scc-muted font-bold">AMR</span>
          <span className="font-mono text-[19px] font-bold text-scc-text leading-none">{row.amr}</span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: st.color }}>
          <span className="w-2 h-2 rounded-full" style={{ background: st.color, boxShadow: row.state === 'Auto' ? `0 0 6px ${st.color}` : 'none' }} />{st.label}
        </span>
      </div>
      <BattBar pct={row.batt} />
      <div className="grid grid-cols-2 gap-2 mt-3">
        <SlotChip label="Component 1" value={row.c1} />
        <SlotChip label="Component 2" value={row.c2} />
      </div>
      <div className="flex gap-2 mt-3">
        <Btn variant="outlineOrange" icon="send" disabled={!canSend} className="flex-1 !h-8 text-[12px]"
          onClick={e => { e.stopPropagation(); onSend(); }}>Send Payload</Btn>
        <Btn variant="secondary" icon="edit" className="!h-8 text-[12px]" onClick={e => { e.stopPropagation(); onSelect(); }}>Rectify</Btn>
      </div>
    </div>
  );
}

function AmrCompEditor({ label, current, reason, onCommit, onUnassign }) {
  const [val, setVal] = useState('');
  const disabled = !reason.trim();
  return (
    <div className="rounded-lg border border-scc-borderLt bg-scc-card p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[12px] font-bold uppercase tracking-wide text-scc-text">{label}</div>
        <MonoVal>{current}</MonoVal>
      </div>
      <TextInput value={val} onChange={setVal} placeholder="New component ID…" mono className="w-full mb-2" />
      <div className="flex gap-2">
        <Btn variant="primary" icon="save" disabled={disabled || !val.trim()} className="flex-1" onClick={() => onCommit(val.trim(), () => setVal(''))}>Commit</Btn>
        <Btn variant="secondary" icon="backspace" disabled={disabled || !current} onClick={() => onUnassign()}>Unassign</Btn>
      </div>
    </div>
  );
}

function TabAmr() {
  const [amrs, setAmrs] = useState(seedAmrs);
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState(null);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(null);

  const filtered = amrs.filter(a => a.amr.includes(q) || a.c1.includes(q) || a.c2.includes(q));
  const sel = amrs.find(a => a.amr === selId);
  const counts = ['Auto', 'StandBy', 'Offline'].map(s => ({ s, n: amrs.filter(a => a.state === s).length }));
  const refresh = () => { setAmrs(seedAmrs()); window.sccToast('AMR fleet refreshed.', 'info'); };

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') setSelId(null); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const sendPayload = (a) => window.sccToast(<span>AMR <b className="font-mono">{a.amr}</b> payload sent (Navithor size profile + scanner).</span>, 'success');

  const askCommit = (field, label, newVal, clearInput) => {
    const cur = sel[field] || '(blank)';
    const nxt = newVal || '(blank)';
    setConfirm({
      title: `Commit AMR ${sel.amr} ${label}?`,
      body: <span>Set AMR <b className="text-scc-text font-mono">{sel.amr}</b> {label} → <span className="font-mono text-scc-orangeDk font-semibold">{nxt}</span>. Committing re-sends the AMR payload (Navithor size profile + scanner).</span>,
      run: () => {
        setAmrs(list => list.map(a => a.amr === selId ? { ...a, [field]: newVal } : a));
        window.sccToast(<span>AMR <b className="font-mono">{sel.amr}</b> {label}: <span className="font-mono">{cur}</span> → <span className="font-mono">{nxt}</span> · payload re-sent</span>, 'success');
        clearInput?.(); setConfirm(null);
      }
    });
  };

  return (
    <div>
      {/* Toolbar */}
      <Card className="mb-4">
        <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
          <div className="flex items-baseline gap-2 pr-2">
            <span className="text-[13px] font-bold tracking-wide uppercase text-scc-text">AMR Fleet</span>
            <span className="text-[12px] text-scc-muted">{filtered.length} of {amrs.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {counts.map(({ s, n }) => (
              <span key={s} className="inline-flex items-center gap-1.5 rounded-full border border-scc-border px-2.5 h-6 text-[11px] font-semibold text-scc-muted">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: AMR_STATES[s].color }} />{n} {s}
              </span>
            ))}
          </div>
          <span className="flex-1" />
          <SearchBox value={q} onChange={setQ} placeholder="Search AMR number or component ID…" className="w-72" />
          <Btn variant="secondary" icon="refresh" onClick={refresh}>Refresh</Btn>
        </div>
      </Card>

      {/* Full-width grid */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
        {filtered.length === 0 && <Card><EmptyState icon="search_off" title="No AMRs match" /></Card>}
        {filtered.map(a => <AmrCard key={a.amr} row={a} selected={a.amr === selId}
          onSelect={() => { setSelId(a.amr); setReason(''); }} onSend={() => sendPayload(a)} />)}
      </div>

      {/* Slide-in details panel */}
      {sel && (
        <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(8,11,16,0.45)' }} onClick={() => setSelId(null)}>
          <div className="w-full max-w-[420px] h-full bg-scc-card border-l border-scc-border shadow-2xl flex flex-col" style={{ animation: 'sccSlideIn .22s ease-out' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 h-14 border-b border-scc-borderLt flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[11px] uppercase tracking-wide text-scc-muted font-bold">AMR</span>
                  <span className="font-mono text-[20px] font-bold text-scc-text leading-none">{sel.amr}</span>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: AMR_STATES[sel.state].color }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: AMR_STATES[sel.state].color }} />{AMR_STATES[sel.state].label}
                </span>
              </div>
              <button onClick={() => setSelId(null)} className="text-scc-muted hover:text-scc-text"><Icon name="close" style={{ fontSize: 22 }} /></button>
            </div>
            <div className="flex-1 overflow-auto p-4 flex flex-col gap-3.5">
              <div className="rounded-lg border border-scc-borderLt bg-scc-bg px-3 py-2.5"><BattBar pct={sel.batt} /></div>
              <ReasonField value={reason} onChange={setReason} />
              <div className="flex items-start gap-2 rounded-md bg-scc-teal/10 border border-scc-teal/30 px-3 py-2.5">
                <Icon name="info" className="text-scc-teal" style={{ fontSize: 18 }} />
                <p className="text-[12.5px] text-scc-text m-0 leading-snug">Committing re-sends the AMR payload (<b>Navithor size profile + scanner</b>).</p>
              </div>
              <AmrCompEditor label="Component 1" current={sel.c1} reason={reason}
                onCommit={(v, clr) => askCommit('c1', 'Component 1', v, clr)}
                onUnassign={() => askCommit('c1', 'Component 1', '', null)} />
              <AmrCompEditor label="Component 2" current={sel.c2} reason={reason}
                onCommit={(v, clr) => askCommit('c2', 'Component 2', v, clr)}
                onUnassign={() => askCommit('c2', 'Component 2', '', null)} />
            </div>
            <div className="p-4 border-t border-scc-borderLt flex-shrink-0">
              <Btn variant="primary" icon="send" disabled={!(sel.c1 || sel.c2)} className="w-full" onClick={() => sendPayload(sel)}>Send Payload</Btn>
              {!(sel.c1 || sel.c2) && <div className="text-[11px] text-scc-muted mt-2 flex items-center gap-1"><Icon name="info" style={{ fontSize: 14 }} />A component ID is required to send a payload.</div>}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!confirm} title={confirm?.title} body={confirm?.body}
        onConfirm={() => confirm?.run()} onCancel={() => setConfirm(null)} />
    </div>
  );
}

window.TabAmr = TabAmr;
