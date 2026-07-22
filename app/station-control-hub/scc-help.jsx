// ===== HELP drawer =====
const { useState, useEffect } = React;
const HELP_SECTIONS = [
  {
    key: 'station', icon: 'edit_location_alt', title: 'Station Rectification',
    intro: 'Correct the Component ID 1 / ID 2 loaded at a physical station.',
    steps: ['Filter by Area or search, then click a station row to select it.', 'Type a Reason (required — this is logged).', 'Enter a New value for Component ID 1 or ID 2. Leave it blank to unassign/clear.', 'Click Commit; confirm in the dialog. A toast reports the change.'],
    watch: ['Stations that are Actively building (WIP) are blocked from edits.', 'A blank New value clears the slot — double-check before committing.', 'Use “Refresh Next Work Order” to re-arm the station from the run schedule.']
  },
  {
    key: 'amr', icon: 'precision_manufacturing', title: 'AMR Rectification',
    intro: 'Fix the component payload carried by an autonomous mobile robot.',
    steps: ['Search and select an AMR from the fleet grid.', 'Enter a Reason.', 'Set a New value and Commit, or Unassign to clear a slot.', 'Confirm the dialog; the AMR payload is re-sent.'],
    watch: ['Committing re-sends the full payload (Navithor size profile + scanner).', 'Unassign is destructive — the robot will carry no ID for that slot.']
  },
  {
    key: 'assembly', icon: 'conveyor_belt', title: 'Manual Assembly',
    intro: 'Schedule whole-good serials into the assembly line.',
    steps: ['Add each 10-digit serial (Enter or the Add button).', 'Click Verify All — pills flip to VERIFIED or INVALID.', 'Enter a Reason and optionally flip the Legacy toggle.', 'Click Schedule All. Only VERIFIED serials are scheduled; a toast summarizes.'],
    watch: ['M-numbers cannot be scheduled here — they are non-whole-good components.', 'Serials already scheduled are flagged INVALID.', 'Schedule All skips anything not VERIFIED.']
  },
  {
    key: 'recon', icon: 'account_tree', title: 'Work Order Reconciliation',
    intro: 'Inspect and correct a machine’s station-by-station schedule.',
    steps: ['Enter an M-number or 10-digit serial and Search. Note the classification pill.', 'Toggle Rows for the timestamp table, or Chart for the swimlane overview.', 'Select a row (or click a node) and enter a Reason.', 'Mark Complete / Mark WIP. For M-numbers, schedule for Pre-Paint or Pre-Assembly.'],
    watch: ['The current WIP node glows orange in the Chart view.', 'Whole-good serials show a read-only Associated Components panel.', 'NOT FOUND means no schedule matches — check the ID format.']
  }
];

function HelpDrawer({ open, onClose }) {
  const [expanded, setExpanded] = useState({});
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    if (open) window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex justify-end" style={{ background: 'rgba(27,33,43,0.45)' }} onClick={onClose}>
      <div className="w-full max-w-[520px] h-full bg-scc-bg shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 h-14 bg-scc-dark flex-shrink-0" style={{ borderBottom: '3px solid #E87722' }}>
          <div className="flex items-center gap-2.5 text-white"><Icon name="help" style={{ fontSize: 22, color: '#E87722' }} /><span className="font-bold text-[15px] tracking-wide">Help &amp; Guidance</span></div>
          <button onClick={onClose} className="text-white/70 hover:text-white"><Icon name="close" style={{ fontSize: 24 }} /></button>
        </div>
        <div className="flex-1 overflow-auto p-5 flex flex-col gap-3">
          <div className="rounded-xl bg-scc-card border border-scc-borderLt p-4">
            <div className="text-[13px] font-bold uppercase tracking-wide text-scc-text mb-1.5">Overview</div>
            <p className="text-[13.5px] text-scc-muted leading-relaxed m-0">The Station Control Center lets Engineering, Supervisors and Schedulers perform manual Station Control interventions on the Jefferson City line. Every committed action requires a typed reason and is written to the <b className="text-scc-text">SupervisorOverrideLog</b>. Expand a section below for a step-by-step walkthrough.</p>
          </div>

          {HELP_SECTIONS.map(s => {
            const isOpen = expanded[s.key];
            return (
              <div key={s.key} className="rounded-xl bg-scc-card border border-scc-borderLt overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <Icon name={s.icon} style={{ fontSize: 22, color: '#E87722' }} />
                  <div className="flex-1">
                    <div className="text-[14px] font-bold text-scc-text">{s.title}</div>
                    <div className="text-[12.5px] text-scc-muted">{s.intro}</div>
                  </div>
                  <button onClick={() => setExpanded(e => ({ ...e, [s.key]: !e[s.key] }))}
                    className="inline-flex items-center gap-1 text-[12px] font-semibold text-scc-orangeDk hover:text-scc-orange whitespace-nowrap">
                    {isOpen ? 'Less' : 'More info'}<Icon name={isOpen ? 'expand_less' : 'expand_more'} style={{ fontSize: 18 }} />
                  </button>
                </div>
                {isOpen && (
                  <div className="px-4 pb-4 pt-1 border-t border-scc-borderLt">
                    <div className="text-[11.5px] font-bold uppercase tracking-wide text-scc-muted mt-3 mb-2">Steps</div>
                    <ol className="m-0 pl-0 flex flex-col gap-1.5 list-none">
                      {s.steps.map((st, i) => (
                        <li key={i} className="flex gap-2.5 text-[13px] text-scc-text leading-snug">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-scc-orange/15 text-scc-orangeDk text-[11px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                          <span>{st}</span>
                        </li>
                      ))}
                    </ol>
                    <div className="text-[11.5px] font-bold uppercase tracking-wide text-scc-red mt-4 mb-2 flex items-center gap-1"><Icon name="warning" style={{ fontSize: 15 }} />Watch out</div>
                    <ul className="m-0 pl-0 flex flex-col gap-1.5 list-none">
                      {s.watch.map((w, i) => (
                        <li key={i} className="flex gap-2 text-[12.5px] text-scc-muted leading-snug"><Icon name="chevron_right" className="text-scc-red flex-shrink-0" style={{ fontSize: 16 }} /><span>{w}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}

          <div className="rounded-xl bg-scc-orange/[0.07] border border-scc-orange/30 p-4 flex gap-3">
            <Icon name="push_pin" style={{ fontSize: 20, color: '#C9631A' }} />
            <div>
              <div className="text-[13px] font-bold text-scc-text mb-1">Remember</div>
              <p className="text-[13px] text-scc-muted leading-relaxed m-0">Every commit needs a reason and is logged to the SupervisorOverrideLog. Nothing auto-refreshes — use the <b className="text-scc-text">Refresh</b> buttons to pull the latest state.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.HelpDrawer = HelpDrawer;
