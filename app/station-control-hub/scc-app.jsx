// ===== App root =====
const { useState, useEffect } = React;

const TABS = [
  { key: 'station', label: 'Station Rectification', icon: 'grid_view', Comp: window.TabStation },
  { key: 'amr', label: 'AMR Rectification', icon: 'hub', Comp: window.TabAmr },
  { key: 'assembly', label: 'Manual Assembly', icon: 'checklist', Comp: window.TabAssembly },
  { key: 'recon', label: 'Work Order Reconciliation', icon: 'schema', Comp: window.TabRecon }
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
            <span className="font-extrabold italic tracking-tight text-[22px] leading-none" style={{ color: '#D2202A' }}>JLG</span>
            <span className="w-px h-6 bg-scc-border" />
            <span className="text-[13px] font-semibold text-scc-text whitespace-nowrap">Station Control<span className="text-scc-muted font-normal"> · SCC</span></span>
          </div>
          {/* Tabs */}
          <nav className="flex items-stretch overflow-x-auto no-sb">
            {TABS.map(t => {
              const on = t.key === tab;
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`relative inline-flex items-center gap-2 px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors ${on ? 'text-scc-text' : 'text-scc-muted hover:text-scc-text'}`}>
                  <Icon name={t.icon} style={{ fontSize: 18 }} />{t.label}
                  {on && <span className="absolute left-2 right-2 bottom-0 h-[2.5px] rounded-t bg-scc-orange" />}
                </button>
              );
            })}
          </nav>
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

      {/* Working area */}
      <main className="max-w-[1320px] mx-auto px-4 py-5">
        <Active />
      </main>

      <ToastHost />
      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
