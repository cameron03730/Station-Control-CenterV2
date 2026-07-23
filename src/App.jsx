// ===== App root — sidebar shell =====
import React, { useState, useEffect } from 'react';
import { Icon, ToastHost } from './primitives.jsx';
import HelpDrawer from './help.jsx';
import TabStation from './tabs/station.jsx';
import TabAmr from './tabs/amr.jsx';
import TabAssembly from './tabs/assembly.jsx';
import TabRecon from './tabs/recon.jsx';

// Real JLG wordmark (vector), background dropped, recolored to the app accent so it stays cohesive.
function JlgLogo({ className = '', style }) {
  return (
    <svg viewBox="12 66 166 61" className={className} style={style} role="img" aria-label="JLG"
      xmlns="http://www.w3.org/2000/svg" fill="#E87722">
      <path fillRule="evenodd" clipRule="evenodd" d="M58.611 123.377c.468-1.561 1.249-3.121 1.873-4.525 7.335-16.543 14.669-33.242 22.005-49.784H106.365v.312c-5.148 11.393-10.143 23.253-15.293 34.802h17.791l7.803-17.479c2.186-4.526 3.434-9.676 7.803-12.954 3.277-2.653 6.867-4.526 11.08-4.682h43.697c-2.34 5.931-5.15 11.861-7.646 17.791l-.312.156h-30.119c-1.094.312-1.248 1.562-1.717 2.341l-5.775 13.422c0 .467-.154 1.092.469 1.404h9.053c.467-1.094.623-1.719 1.092-2.654l-.312-.156h-5.463c.158-.936.781-1.715.938-2.496l3.59-8.115.156-.156h26.373c.469.156 0 .78 0 1.092l-10.143 23.097c0 .469-.469.781-.469 1.094l-3.121 7.334-.312.156h-36.83c-4.371-.312-9.053-2.496-10.613-7.023-.312-.779-.467-1.404-.623-2.184h-.156c-1.404 2.965-2.654 6.086-4.059 9.051l-.156.156h-44.48zM78.431 69.223l-1.249 2.966-9.988 22.94-6.398 14.669c-1.717 3.902-2.966 8.74-6.711 11.236-2.184 1.561-4.526 2.342-7.334 2.342H13.51l.156-.312 6.555-15.449 1.404-3.434h17.479l.312-.625 9.363-21.224c1.873-4.525 3.746-8.896 5.774-13.265H78.43v.156h.001zM167.697 117.758c.625.625.938 1.25.938 2.186 0 .938-.312 1.561-.938 2.186-.623.623-1.404.936-2.184.936-.938 0-1.717-.312-2.342-.936-.623-.625-.936-1.248-.936-2.186 0-.936.312-1.561.936-2.186.625-.623 1.404-.936 2.342-.936.78 0 1.561.313 2.184.936zm.313-.467c-.625-.625-1.561-.938-2.496-.938-1.094 0-1.873.312-2.652.938a3.652 3.652 0 0 0-1.094 2.652c0 .938.312 1.873 1.094 2.652a3.757 3.757 0 0 0 2.652 1.094c.936 0 1.871-.469 2.496-1.094a3.649 3.649 0 0 0 1.094-2.652c0-1.091-.313-1.873-1.094-2.652zm-2.028 2.496h-1.25v-1.404h.469c.469 0 .781 0 .936.156.156.156.312.312.312.623 0 .313-.156.469-.467.625zm-2.029 2.186h.779v-1.561h1.25c.311.154.467.469.467.936v.624h.625v-.156-.156-.624c0-.154-.156-.312-.312-.623-.156-.156-.312-.312-.625-.312.156 0 .469-.156.625-.156.156-.312.312-.469.312-.936 0-.469-.156-.781-.625-.938-.156-.156-.623-.156-1.092-.156h-1.404v4.058z" />
    </svg>
  );
}

const TABS = [
  { key: 'station', label: 'Station Rectification', icon: 'grid_view', sub: 'Rectify station component IDs and drive the run schedule', Comp: TabStation },
  { key: 'amr', label: 'AMR Rectification', icon: 'hub', sub: 'Reassign or clear AMR component IDs and re-send payloads', Comp: TabAmr },
  { key: 'assembly', label: 'Manual Assembly', icon: 'checklist', sub: 'Validate and schedule whole-good serials for assembly', Comp: TabAssembly },
  { key: 'recon', label: 'Work Order Reconciliation', icon: 'schema', sub: 'Trace a machine across stations and reconcile work orders', Comp: TabRecon }
];

export default function App() {
  const [tab, setTab] = useState('station');
  const [helpOpen, setHelpOpen] = useState(false);
  // Dark by default — only light if the user has explicitly chosen it in v2.
  const [dark, setDark] = useState(() => localStorage.getItem('scc-theme-v2') !== 'light');
  const active = TABS.find(t => t.key === tab);
  const Active = active.Comp;

  useEffect(() => {
    const root = document.documentElement;
    dark ? root.classList.add('dark') : root.classList.remove('dark');
    localStorage.setItem('scc-theme-v2', dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <div className="min-h-screen flex bg-scc-bg text-scc-text">
      {/* ===== Sidebar ===== */}
      <aside className="fixed inset-y-0 left-0 w-[236px] z-40 flex flex-col border-r border-scc-border sidebar-sheen">
        {/* Brand */}
        <div className="h-[64px] flex items-center gap-3 px-5 border-b border-scc-border/60">
          <JlgLogo style={{ height: 26, width: 'auto' }} />
          <span className="w-px h-7 bg-scc-border" />
          <div className="leading-tight">
            <div className="text-[12.5px] font-bold text-scc-text tracking-tight">Station Control</div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-scc-muted">Center</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto no-sb px-3 py-4 flex flex-col gap-1">
          <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-scc-muted/70">Operations</div>
          {TABS.map(t => {
            const on = t.key === tab;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} title={t.sub}
                className={`group relative flex items-center gap-3 h-11 px-3 rounded-lg text-[13.5px] font-medium transition-all ${on ? 'bg-scc-orange/[0.12] text-scc-text' : 'text-scc-muted hover:text-scc-text hover:bg-scc-text/[0.04]'}`}>
                {on && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-full bg-scc-orange" style={{ boxShadow: '0 0 10px rgba(232,119,34,.7)' }} />}
                <Icon name={t.icon} style={{ fontSize: 20, color: on ? '#E87722' : undefined }} />
                <span className="truncate">{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3.5 border-t border-scc-border/60 flex items-center justify-between gap-2">
          <span className="inline-flex items-center rounded-md border border-scc-border px-2 h-[22px] text-[9.5px] font-bold uppercase tracking-wide text-scc-muted whitespace-nowrap">Jefferson City</span>
          <span className="text-[10.5px] text-scc-muted/70 tabular-nums">SCC v2.0.0</span>
        </div>
      </aside>

      {/* ===== Content ===== */}
      <div className="flex-1 min-w-0 ml-[236px] flex flex-col min-h-screen">
        {/* Slim page header */}
        <header className="sticky top-0 z-30 h-[64px] flex items-center gap-3 px-6 border-b border-scc-border"
          style={{ background: 'rgb(var(--c-bg) / 0.82)', backdropFilter: 'blur(10px)' }}>
          <div className="min-w-0">
            <h1 className="text-[16px] font-bold text-scc-text leading-none truncate">{active.label}</h1>
            <p className="text-[12px] text-scc-muted mt-1 truncate">{active.sub}</p>
          </div>
          <span className="flex-1" />
          <button onClick={() => setDark(d => !d)} title="Toggle theme"
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-scc-border text-scc-muted hover:text-scc-text hover:border-scc-orange/60 transition-colors">
            <Icon name={dark ? 'light_mode' : 'dark_mode'} style={{ fontSize: 18 }} />
          </button>
          <button onClick={() => setHelpOpen(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-scc-border text-[13px] font-medium text-scc-muted hover:text-scc-text hover:border-scc-orange/60 transition-colors">
            <Icon name="help" style={{ fontSize: 17 }} />Help
          </button>
        </header>

        {/* Working area */}
        <main className="flex-1 px-6 py-6">
          <div className="max-w-[1400px] mx-auto w-full"><Active /></div>
        </main>
      </div>

      <ToastHost />
      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
