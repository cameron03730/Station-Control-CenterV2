// ===== TAB: Run Schedule Refresh =====
const { useState, useEffect } = React;

function TabSchedule() {
  const [stations, setStations] = useState([]);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await sccApi.read('getStationRows');
      setStations(rows || []);
    } catch (error) { showApiError(error); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const refreshStation = async (station) => {
    if (!reason.trim()) {
      window.sccToast('A reason is required before refreshing a run schedule.', 'warn');
      return;
    }
    setBusy(station);
    try {
      const result = await sccApi.commit('pullNextWorkOrder', { station, reason });
      if (result?.ok === false) throw new Error(result.message);
      await load();
      window.sccToast(result?.message || `Run schedule refreshed for ${station}.`, 'success');
    } catch (error) { showApiError(error); }
    finally { setBusy(null); }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHead title="Run Schedule Refresh" sub="Re-fire the next work-order request for one station." />
        <div className="p-4 flex flex-col gap-3">
          <ReasonField value={reason} onChange={setReason} />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] text-scc-muted">{loading ? 'Loading stations…' : `${stations.length} stations available`}</span>
            <Btn variant="secondary" icon="refresh" onClick={load} disabled={loading}>Refresh list</Btn>
          </div>
        </div>
      </Card>
      <Card>
        <div className="overflow-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead><tr className="text-left">
              {['Station', 'Area', 'Component ID 1', 'Component ID 2', 'Action'].map(label => <th key={label} className="px-4 py-2.5 font-bold text-[10.5px] uppercase tracking-wider text-scc-muted bg-scc-bg border-b border-scc-border">{label}</th>)}
            </tr></thead>
            <tbody>
              {stations.map(row => {
                const station = row.station || row.Station;
                return <tr key={station} className="border-b border-scc-borderLt hover:bg-scc-bg">
                  <td className="px-4 py-3 font-mono font-bold">{station}</td>
                  <td className="px-4 py-3 text-scc-muted">{row.area || row.Area || areaOf(station || '')}</td>
                  <td className="px-4 py-3"><MonoVal>{row.ComponentID || row.c1}</MonoVal></td>
                  <td className="px-4 py-3"><MonoVal>{row.ComponentID_2 || row.c2}</MonoVal></td>
                  <td className="px-4 py-3"><Btn variant="outlineOrange" icon="sync" className="!h-8 text-[12px]" disabled={!reason.trim() || busy === station} onClick={() => refreshStation(station)}>{busy === station ? 'Refreshing…' : 'Refresh next order'}</Btn></td>
                </tr>;
              })}
              {!loading && stations.length === 0 && <tr><td colSpan={5}><EmptyState icon="inbox" title="No stations returned" /></td></tr>}
              {loading && <tr><td colSpan={5}><EmptyState icon="progress_activity" title="Loading stations…" /></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

window.TabSchedule = TabSchedule;
