// ===== TAB: Machine Overview =====
const { useState } = React;

function TabOverview() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    const idText = query.trim();
    if (!idText) return;
    setLoading(true);
    try {
      const flow = await sccApi.read('getMachineFlow', { idText });
      setSubmitted(idText);
      setRows((flow || []).map(row => ({
        ...row,
        station: row.station || row.Station,
        area: row.area || row.Area || areaOf(row.station || row.Station || ''),
        item: row.item || row.Item || '',
        status: row.status ?? row.Status
      })));
    } catch (error) { setRows([]); showApiError(error); }
    finally { setLoading(false); }
  };

  const lanes = AREA_ORDER.map(area => ({ area, nodes: rows.filter(row => row.area === area) })).filter(lane => lane.nodes.length);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="p-4 flex gap-2">
          <div className="relative flex-1">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-scc-muted" style={{ fontSize: 19 }} />
            <input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => event.key === 'Enter' && search()} placeholder="M-number or 10-digit whole-good serial…" className="w-full h-11 pl-10 pr-3 rounded-lg border border-scc-border bg-scc-bg font-mono text-[14px] text-scc-text placeholder:text-scc-muted/70 placeholder:font-sans focus:border-scc-orange focus:ring-2 focus:ring-scc-orange/20" />
          </div>
          <Btn variant="primary" icon="search" className="!h-11 px-5" onClick={search} disabled={loading}>{loading ? 'Loading…' : 'Load journey'}</Btn>
        </div>
        {submitted && <div className="px-4 pb-3 text-[12px] text-scc-muted">Machine journey for <span className="font-mono font-semibold text-scc-text">{submitted}</span> · {rows.length} stations</div>}
      </Card>
      <Card>
        <CardHead title="Machine Journey" sub="Read-only schedule flow ordered by production area." right={<Btn variant="secondary" icon="refresh" onClick={search} disabled={!submitted || loading}>Refresh</Btn>} />
        {!submitted ? <EmptyState icon="route" title="Enter a machine identifier" sub="The journey loads on demand from the gateway." /> : lanes.length === 0 ? <EmptyState icon="search_off" title="No journey returned" /> : <div className="p-4 flex flex-col gap-3">
          {lanes.map(lane => <div key={lane.area} className="flex items-center gap-3">
            <div className="w-[110px] flex-shrink-0 text-right text-[10.5px] font-bold uppercase tracking-wider text-scc-muted">{lane.area}</div>
            <div className="flex-1 flex flex-wrap items-center gap-2 rounded-xl border border-scc-borderLt bg-scc-bg px-3 py-2.5">
              {lane.nodes.map((node, index) => <React.Fragment key={`${node.station}-${index}`}>
                {index > 0 && <span className="w-5 h-px bg-scc-border" />}
                <div className="min-w-[160px] rounded-lg border border-scc-border bg-scc-card px-3 py-2.5 shadow-card">
                  <div className="flex items-center justify-between gap-2"><span className="font-mono text-[13px] font-bold">{node.station}</span><StatusPill code={node.status} /></div>
                  <div className="mt-1 text-[11px] text-scc-muted truncate">{node.item || 'Schedule entry'}</div>
                </div>
              </React.Fragment>)}
            </div>
          </div>)}
        </div>}
      </Card>
    </div>
  );
}

window.TabOverview = TabOverview;
