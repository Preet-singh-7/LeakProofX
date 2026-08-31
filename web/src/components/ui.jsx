export function Card({ children, className = '' }) {
  return <div className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300',
    secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400',
    danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
  };
  return (
    <button
      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

const SEVERITY_STYLES = {
  CRITICAL: 'bg-red-100 text-red-800 ring-1 ring-red-300',
  WARNING: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
};

const STATUS_STYLES = {
  OPEN: 'bg-red-100 text-red-800 ring-1 ring-red-300',
  ACKNOWLEDGED: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
  RESOLVED: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300',
  SCHEDULED: 'bg-slate-100 text-slate-700 ring-1 ring-slate-300',
  IN_TRANSIT: 'bg-blue-100 text-blue-800 ring-1 ring-blue-300',
  SECURED: 'bg-indigo-100 text-indigo-800 ring-1 ring-indigo-300',
  OPENED: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
  COMPLETED: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300',
  FLAGGED: 'bg-red-100 text-red-800 ring-1 ring-red-300',
};

export function Badge({ children, tone }) {
  const style = SEVERITY_STYLES[tone] || STATUS_STYLES[tone] || 'bg-slate-100 text-slate-700 ring-1 ring-slate-300';
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${style}`}>{children}</span>;
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
      {message}
    </div>
  );
}

export function LoadingSpinner({ label = 'Loading…' }) {
  return <div className="py-10 text-center text-sm text-slate-500">{label}</div>;
}

export function EmptyState({ label }) {
  return <div className="py-10 text-center text-sm text-slate-400">{label}</div>;
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
