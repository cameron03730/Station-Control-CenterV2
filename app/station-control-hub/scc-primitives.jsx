// ===== Shared UI primitives =====
const { useState, useEffect, useRef, useCallback } = React;

function Icon({ name, className = '', style }) {
  return <span className={`ms ${className}`} style={style}>{name}</span>;
}

// ---- Pills ----
function StatusPill({ code, className = '' }) {
  const s = STATUS[code] || { label: '—', color: '#5B6675' };
  return <Pill color={s.color} className={className}>{s.label}</Pill>;
}
function Pill({ children, color = '#5B6675', solid = false, className = '' }) {
  const style = solid
    ? { background: color, color: '#fff', borderColor: color }
    : { background: color + '1A', color, borderColor: color + '40' };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide leading-none ${className}`} style={style}>
      {children}
    </span>
  );
}

// ---- Buttons ----
const BTN_VARIANTS = {
  primary: 'bg-scc-orange text-white border-scc-orange hover:bg-scc-orangeDk',
  secondary: 'bg-scc-card text-scc-text border-scc-border hover:bg-scc-bg',
  success: 'bg-scc-green text-white border-scc-green hover:brightness-95',
  danger: 'bg-scc-red text-white border-scc-red hover:brightness-95',
  outlineOrange: 'bg-scc-card text-scc-orangeDk border-scc-orange hover:bg-scc-orange/10',
  ghost: 'bg-transparent text-scc-muted border-transparent hover:bg-scc-borderLt'
};
function Btn({ variant = 'secondary', icon, children, className = '', disabled, ...rest }) {
  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 h-9 text-[13px] font-semibold transition-all whitespace-nowrap focus-visible:ring-2 focus-visible:ring-scc-orange/40 active:scale-[.97] ${BTN_VARIANTS[variant]} ${disabled ? 'opacity-45 cursor-not-allowed pointer-events-none' : 'cursor-pointer'} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} style={{ fontSize: 18 }} />}
      {children}
    </button>
  );
}

// ---- Card ----
function Card({ children, className = '', style }) {
  return <div className={`bg-scc-card border border-scc-border rounded-xl shadow-card ${className}`} style={style}>{children}</div>;
}
function CardHead({ title, sub, right }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-scc-borderLt">
      <div>
        <div className="text-[13px] font-bold tracking-wide text-scc-text uppercase">{title}</div>
        {sub && <div className="text-[12px] text-scc-muted mt-0.5">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

// ---- Inputs ----
function TextInput({ value, onChange, placeholder, mono, className = '', onKeyDown, ...rest }) {
  return (
    <input
      value={value} onChange={e => onChange?.(e.target.value)} placeholder={placeholder} onKeyDown={onKeyDown}
      className={`h-9 px-3 rounded-lg border border-scc-border bg-scc-card text-[13px] text-scc-text placeholder:text-scc-muted/70 focus:border-scc-orange focus:ring-2 focus:ring-scc-orange/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${mono ? 'font-mono' : ''} ${className}`}
      {...rest}
    />
  );
}
function SearchBox({ value, onChange, placeholder = 'Search…', className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <Icon name="search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-scc-muted" style={{ fontSize: 18 }} />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="h-9 w-full pl-9 pr-3 rounded-lg border border-scc-border bg-scc-card text-[13px] placeholder:text-scc-muted/70 focus:border-scc-orange focus:ring-2 focus:ring-scc-orange/20 transition-colors" />
    </div>
  );
}
function Dropdown({ value, onChange, options, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="appearance-none h-9 w-full pl-3 pr-8 rounded-lg border border-scc-border bg-scc-card text-[13px] text-scc-text cursor-pointer focus:border-scc-orange focus:ring-2 focus:ring-scc-orange/20 transition-colors">
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <Icon name="expand_more" className="absolute right-2 top-1/2 -translate-y-1/2 text-scc-muted pointer-events-none" style={{ fontSize: 20 }} />
    </div>
  );
}
function Toggle({ checked, onChange, label }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <span onClick={() => onChange(!checked)} className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-scc-orange' : 'bg-scc-border'}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-scc-card shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </span>
      {label && <span className="text-[13px] font-medium text-scc-text">{label}</span>}
    </label>
  );
}
function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex p-0.5 bg-scc-borderLt rounded-lg border border-scc-border">
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-[13px] font-semibold transition-colors ${value === o.value ? 'bg-scc-card text-scc-text shadow-sm' : 'text-scc-muted hover:text-scc-text'}`}>
          {o.icon && <Icon name={o.icon} style={{ fontSize: 17 }} />}{o.label}
        </button>
      ))}
    </div>
  );
}

// ---- Reason field (required) ----
function ReasonField({ value, onChange, className = '' }) {
  return (
    <div className={className}>
      <div className="flex items-center gap-1.5 mb-1">
        <label className="text-[12px] font-bold uppercase tracking-wide text-scc-text">Reason</label>
        <span className="text-scc-red text-[13px] leading-none">*</span>
        <span className="text-[11px] text-scc-muted font-medium">required — recorded to SupervisorOverrideLog</span>
      </div>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder="e.g. Correcting mis-scan reported by line lead…"
        className="w-full h-9 px-3 rounded-lg border border-scc-border bg-scc-card text-[13px] placeholder:text-scc-muted/70 focus:border-scc-orange focus:ring-2 focus:ring-scc-orange/20 transition-colors" />
    </div>
  );
}

// ---- Mono value display ----
function MonoVal({ children, muted }) {
  if (!children) return <span className="font-mono text-[12.5px] text-scc-muted/70 italic">(blank)</span>;
  return <span className={`font-mono text-[12.5px] ${muted ? 'text-scc-muted' : 'text-scc-text'}`}>{children}</span>;
}

// ---- Confirmation dialog ----
function ConfirmDialog({ open, title, body, confirmLabel = 'Commit', confirmVariant = 'primary', onConfirm, onCancel }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onCancel?.(); };
    if (open) window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(27,33,43,0.45)' }} onClick={onCancel}>
      <div className="bg-scc-card rounded-xl shadow-2xl w-full max-w-[440px] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-scc-borderLt flex items-center gap-2.5">
          <Icon name="error" className="text-scc-orange" style={{ fontSize: 20 }} />
          <div className="text-[15px] font-bold text-scc-text">{title}</div>
        </div>
        <div className="px-5 py-4 text-[13.5px] text-scc-muted leading-relaxed">{body}</div>
        <div className="px-5 py-3.5 bg-scc-bg border-t border-scc-borderLt flex justify-end gap-2.5">
          <Btn variant="secondary" onClick={onCancel}>Cancel</Btn>
          <Btn variant={confirmVariant} icon="check" onClick={onConfirm}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
}

// ---- Toast system ----
function ToastHost() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    window.sccToast = (msg, type = 'success') => {
      const id = Math.random().toString(36).slice(2);
      setToasts(t => [...t, { id, msg, type }]);
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4200);
    };
  }, []);
  const cfg = {
    success: { icon: 'check_circle', color: '#2F9E44' },
    error: { icon: 'error', color: '#E03131' },
    info: { icon: 'info', color: '#0C8599' },
    warn: { icon: 'warning', color: '#E8920C' }
  };
  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2.5 w-[360px]">
      {toasts.map(t => {
        const c = cfg[t.type] || cfg.success;
        return (
          <div key={t.id} className="flex items-start gap-3 bg-scc-card rounded-lg border border-scc-border shadow-lg px-4 py-3" style={{ animation: 'sccToastIn .25s ease', borderLeft: `4px solid ${c.color}` }}>
            <Icon name={c.icon} style={{ fontSize: 20, color: c.color }} />
            <div className="text-[13px] text-scc-text leading-snug flex-1 pt-0.5">{t.msg}</div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Empty state ----
function EmptyState({ icon, title, sub }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <Icon name={icon} className="text-scc-border" style={{ fontSize: 44 }} />
      <div className="text-[14px] font-semibold text-scc-muted mt-3">{title}</div>
      {sub && <div className="text-[12.5px] text-scc-muted/80 mt-1 max-w-[260px]">{sub}</div>}
    </div>
  );
}

Object.assign(window, {
  Icon, Pill, StatusPill, Btn, Card, CardHead, TextInput, SearchBox, Dropdown,
  Toggle, Segmented, ReasonField, MonoVal, ConfirmDialog, ToastHost, EmptyState
});
