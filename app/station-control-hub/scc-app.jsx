// ===== App root =====
const { useState, useEffect } = React;

const TABS = [
  { key: 'station', label: 'Station Rectification', icon: 'grid_view', Comp: window.TabStation },
  { key: 'amr', label: 'AMR Rectification', icon: 'hub', Comp: window.TabAmr },
  { key: 'assembly', label: 'Manual Assembly', icon: 'checklist', Comp: window.TabAssembly },
  { key: 'schedule', label: 'Run Schedule Refresh', icon: 'sync', Comp: window.TabSchedule },
  { key: 'recon', label: 'Work Order Reconciliation', icon: 'schema', Comp: window.TabRecon },
  { key: 'overview', label: 'Machine Overview', icon: 'route', Comp: window.TabOverview }
];

function App() {
  const [tab, setTab] = useState('station');
  const [helpOpen, setHelpOpen] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('scc-theme') === 'dark');
  const Active = TABS.find(t => t.key === tab).Comp;

  useEffect(() => {
    const root = document.documentElement;
    dark ? root.classList.add('dark') : root.classList.remove('dark');
    localStorage.setItem('scc-theme', dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <div className="min-h-screen bg-scc-bg">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-scc-card border-b border-scc-border">
        <div className="flex items-stretch h-[52px] pl-4 pr-3">
          {/* Brand */}
          <div className="flex items-center gap-3 pr-4">
            <img src="./image.png" alt="JLG, An Oshkosh Corporation Business" className="w-[112px] h-[48px] object-contain shrink-0" />
            <span className="w-px h-6 bg-scc-border" />
            <span className="text-[13px] font-semibold text-scc-text whitespace-nowrap">Station Control<span className="text-scc-muted font-normal"> · SCC</span></span>
          </div>
          <span className="flex-1" />
          {/* Controls */}
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center rounded-md border border-scc-border px-2.5 h-6 text-[10.5px] font-bold uppercase tracking-wide text-scc-muted whitespace-nowrap">Jefferson City</span>
            <span className="inline-flex items-center rounded-md border border-scc-border bg-scc-bg px-2 h-6 text-[11px] font-semibold text-scc-muted tabular-nums">v1.0.0</span>
            <span className="w-px h-6 bg-scc-border" />
            <button onClick={() => setDark(d => !d)} title="Toggle theme"
              className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-scc-orange/70 text-scc-muted hover:text-scc-text transition-colors">
              <Icon name={dark ? 'light_mode' : 'dark_mode'} style={{ fontSize: 17 }} />
            </button>
            <button onClick={() => setHelpOpen(true)}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-scc-border text-[12.5px] font-medium text-scc-muted hover:text-scc-text hover:bg-scc-bg transition-colors">
              <Icon name="help" style={{ fontSize: 16 }} />Help
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row lg:items-start">
        {/* Workspace navigation */}
        <aside className="w-full lg:w-[248px] lg:shrink-0 lg:sticky lg:top-[52px] lg:h-[calc(100vh-52px)] bg-scc-card border-b lg:border-b-0 lg:border-r border-scc-border">
          <div className="px-4 pt-5 pb-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-scc-muted">Workspaces</div>
            <div className="text-[12px] text-scc-muted mt-1">Production control tools</div>
          </div>
          <nav className="flex lg:flex-col gap-1 px-3 pb-3 overflow-x-auto no-sb" aria-label="Workspaces">
            {TABS.map(t => {
              const on = t.key === tab;
              return (
                <button key={t.key} onClick={() => setTab(t.key)} aria-current={on ? 'page' : undefined}
                  className={`relative inline-flex lg:flex w-auto lg:w-full shrink-0 items-center gap-3 rounded-lg px-3 h-10 text-left text-[13px] font-semibold whitespace-nowrap transition-colors ${on ? 'bg-scc-orange/10 text-scc-orangeDk dark:text-scc-orange' : 'text-scc-muted hover:bg-scc-bg hover:text-scc-text'}`}>
                  <Icon name={t.icon} style={{ fontSize: 19 }} />
                  <span>{t.label}</span>
                  {on && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-scc-orange" />}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Working area */}
        <main className="min-w-0 flex-1 max-w-[1320px] mx-auto w-full px-4 py-5 lg:px-6">
          <Active />
        </main>
      </div>

      <ToastHost />
      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
