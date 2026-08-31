import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { acknowledgeAlert, getAlert, resolveAlert } from '../api/alerts';
import { extractErrorMessage } from '../api/client';
import { Badge, Button, Card, ErrorBanner, LoadingSpinner, PageHeader } from '../components/ui';
import { RoleGate } from '../components/RoleGate';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../utils/constants';

const TRIAGE_ROLES = [ROLES.ADMIN, ROLES.BOARD, ROLES.AUDITOR];

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString() : '—';
}

// Alert.resolvedBy/acknowledgedBy are raw user ids (the backend has no
// user-lookup endpoint to resolve them to names from here) — showing "you"
// for the common case of viewing your own triage action is worth the small
// special-case rather than displaying a bare ObjectId either way.
function describeActor(userId, currentUser) {
  if (!userId) return '';
  return userId === currentUser.id ? ' by you' : ` by user ${userId}`;
}

export default function AlertDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [resolution, setResolution] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    getAlert(id)
      .then(setAlert)
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAcknowledge() {
    setActionError('');
    setSubmitting(true);
    try {
      const updated = await acknowledgeAlert(id);
      setAlert(updated);
    } catch (err) {
      setActionError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResolve(e) {
    e.preventDefault();
    setActionError('');
    setSubmitting(true);
    try {
      const updated = await resolveAlert(id, resolution || undefined);
      setAlert(updated);
    } catch (err) {
      setActionError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorBanner message={error} />;
  if (!alert) return null;

  return (
    <div className="max-w-3xl">
      <Link to="/alerts" className="mb-4 inline-block text-sm text-indigo-600 hover:underline">
        ← Back to alerts
      </Link>
      <PageHeader
        title="Alert detail"
        actions={
          <>
            <Badge tone={alert.severity}>{alert.severity}</Badge>
            <Badge tone={alert.status}>{alert.status}</Badge>
          </>
        }
      />

      <div className="space-y-6">
        <Card>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-slate-500">Risk score</dt>
              <dd className="text-lg font-semibold text-slate-900">{alert.riskScore}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Raised</dt>
              <dd className="text-slate-900">{formatDate(alert.createdAt)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-slate-500">Triggered rules</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {alert.triggeredRules.map((rule) => (
                  <span key={rule} className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
                    {rule}
                  </span>
                ))}
              </dd>
            </div>
            {alert.paperId && (
              <div>
                <dt className="text-slate-500">Paper</dt>
                <dd>
                  <Link to={`/tracking/${alert.paperId}`} className="text-indigo-600 hover:underline">
                    View custody timeline →
                  </Link>
                </dd>
              </div>
            )}
            {alert.context && Object.keys(alert.context).length > 0 && (
              <div className="col-span-2">
                <dt className="text-slate-500">Context</dt>
                <dd className="mt-1 rounded-md bg-slate-50 p-3 font-mono text-xs text-slate-700">
                  {Object.entries(alert.context)
                    .filter(([, v]) => v !== undefined && v !== null)
                    .map(([k, v]) => (
                      <div key={k}>
                        {k}: {String(v)}
                      </div>
                    ))}
                </dd>
              </div>
            )}
          </dl>
        </Card>

        <RoleGate roles={TRIAGE_ROLES}>
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Triage</h2>
            <ErrorBanner message={actionError} />

            {alert.status === 'OPEN' && (
              <Button onClick={handleAcknowledge} disabled={submitting} className="mb-4">
                Acknowledge
              </Button>
            )}
            {alert.status === 'ACKNOWLEDGED' && (
              <p className="mb-4 text-sm text-slate-600">
                Acknowledged {formatDate(alert.acknowledgedAt)}
                {describeActor(alert.acknowledgedBy, user)}.
              </p>
            )}

            {alert.status !== 'RESOLVED' ? (
              <form onSubmit={handleResolve} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500">Resolution notes (optional)</label>
                  <textarea
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <Button type="submit" variant="secondary" disabled={submitting}>
                  Mark resolved
                </Button>
              </form>
            ) : (
              <div className="text-sm text-slate-600">
                <p>
                  Resolved {formatDate(alert.resolvedAt)}
                  {describeActor(alert.resolvedBy, user)}.
                </p>
              </div>
            )}
          </Card>
        </RoleGate>
      </div>
    </div>
  );
}
