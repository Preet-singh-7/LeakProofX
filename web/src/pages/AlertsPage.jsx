import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAlerts } from '../api/alerts';
import { extractErrorMessage } from '../api/client';
import { Badge, Card, EmptyState, ErrorBanner, LoadingSpinner, PageHeader } from '../components/ui';
import { ALERT_SEVERITY_VALUES, ALERT_STATUS_VALUES } from '../utils/constants';

function formatDate(iso) {
  return new Date(iso).toLocaleString();
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    listAlerts({ status: status || undefined, severity: severity || undefined })
      .then(setAlerts)
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [status, severity]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader title="Alerts" subtitle="Anomalies flagged by the risk engine, ranked by when they fired." />

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {ALERT_STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All severities</option>
          {ALERT_SEVERITY_VALUES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <LoadingSpinner />
      ) : alerts.length === 0 ? (
        <EmptyState label="No alerts match these filters." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Risk Score</th>
                <th className="px-4 py-3">Triggered Rules</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Raised</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {alerts.map((alert) => (
                <tr key={alert._id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Badge tone={alert.severity}>{alert.severity}</Badge>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{alert.riskScore}</td>
                  <td className="px-4 py-3 text-slate-600">{alert.triggeredRules.join(', ')}</td>
                  <td className="px-4 py-3">
                    <Badge tone={alert.status}>{alert.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(alert.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/alerts/${alert._id}`} className="text-sm font-medium text-indigo-600 hover:underline">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
