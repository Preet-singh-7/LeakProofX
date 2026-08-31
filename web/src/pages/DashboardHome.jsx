import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSummary } from '../api/dashboard';
import { extractErrorMessage } from '../api/client';
import { Card, ErrorBanner, LoadingSpinner, PageHeader } from '../components/ui';
import { ROLES } from '../utils/constants';

const METRICS_ROLES = [ROLES.ADMIN, ROLES.BOARD, ROLES.AUDITOR];

function StatCard({ label, value }) {
  return (
    <Card>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
    </Card>
  );
}

const STATUS_LABELS = {
  SCHEDULED: 'Scheduled',
  IN_TRANSIT: 'In Transit',
  SECURED: 'Secured',
  OPENED: 'Opened',
  COMPLETED: 'Completed',
  FLAGGED: 'Flagged',
};

function MetricsDashboard() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getSummary()
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((err) => {
        if (!cancelled) setError(extractErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorBanner message={error} />;

  const totalPapers = Object.values(summary.papersByStatus).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Papers" value={totalPapers} />
        <StatCard label="Open Alerts" value={summary.openAlertCount} />
        <StatCard label="Audit Log Entries" value={summary.auditLogCount} />
        <StatCard label="Custody Statuses" value={Object.keys(summary.papersByStatus).length} />
      </div>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Papers by custody status</h2>
        {totalPapers === 0 ? (
          <p className="text-sm text-slate-400">No papers created yet.</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(summary.papersByStatus).map(([status, count]) => (
              <div key={status} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-sm text-slate-600">{STATUS_LABELS[status] || status}</span>
                <div className="h-2 flex-1 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-indigo-500"
                    style={{ width: `${(count / totalPapers) * 100}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-sm font-medium text-slate-700">{count}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// Roles like COURIER/CENTER/INVIGILATOR aren't authorized for
// GET /dashboard/summary on the backend (board-level metrics aren't
// relevant to their job) — rather than surface a 403 to them, give them a
// quick-links landing view instead.
function QuickLinksDashboard() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card>
        <h2 className="text-sm font-semibold text-slate-700">Custody tracking</h2>
        <p className="mt-1 text-sm text-slate-500">View papers and record custody scans.</p>
        <Link to="/tracking" className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:underline">
          Go to Tracking →
        </Link>
      </Card>
    </div>
  );
}

export default function DashboardHome() {
  const { user } = useAuth();
  const showMetrics = METRICS_ROLES.includes(user.role);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={`Welcome back, ${user.name}.`} />
      {showMetrics ? <MetricsDashboard /> : <QuickLinksDashboard />}
    </div>
  );
}
