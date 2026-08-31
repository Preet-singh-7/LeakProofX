import { useEffect, useState } from 'react';
import { listPapers } from '../api/papers';
import { listAlerts } from '../api/alerts';
import { extractErrorMessage } from '../api/client';
import { Badge, Button, Card, EmptyState, ErrorBanner, LoadingSpinner, PageHeader } from '../components/ui';
import { toCsv, downloadCsv } from '../utils/csv';

const PAPER_COLUMNS = [
  { key: 'title', label: 'Title' },
  { key: 'examName', label: 'Exam' },
  { key: 'examTime', label: 'Exam Time', get: (r) => new Date(r.examTime).toISOString() },
  { key: 'currentCustodyStep', label: 'Custody Step' },
  { key: 'status', label: 'Status' },
  { key: 'durationMinutes', label: 'Duration (min)' },
];

const ALERT_COLUMNS = [
  { key: 'severity', label: 'Severity' },
  { key: 'riskScore', label: 'Risk Score' },
  { key: 'triggeredRules', label: 'Triggered Rules', get: (r) => r.triggeredRules.join('; ') },
  { key: 'status', label: 'Status' },
  { key: 'paperId', label: 'Paper ID' },
  { key: 'createdAt', label: 'Raised', get: (r) => new Date(r.createdAt).toISOString() },
];

function ReportTable({ title, filenamePrefix, columns, rows, loading, error, renderCell }) {
  function handleExport() {
    const csv = toCsv(rows, columns);
    downloadCsv(`${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <Card className="overflow-x-auto">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        <Button variant="secondary" onClick={handleExport} disabled={rows.length === 0}>
          Export CSV
        </Button>
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <LoadingSpinner />
      ) : rows.length === 0 ? (
        <EmptyState label="No data to report." />
      ) : (
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="px-3 py-2">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, idx) => (
              <tr key={row._id || idx}>
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-2 text-slate-700">
                    {renderCell ? renderCell(c, row) : c.get ? c.get(row) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export default function ReportsPage() {
  const [papers, setPapers] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [papersLoading, setPapersLoading] = useState(true);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [papersError, setPapersError] = useState('');
  const [alertsError, setAlertsError] = useState('');

  useEffect(() => {
    listPapers()
      .then(setPapers)
      .catch((err) => setPapersError(extractErrorMessage(err)))
      .finally(() => setPapersLoading(false));
    listAlerts()
      .then(setAlerts)
      .catch((err) => setAlertsError(extractErrorMessage(err)))
      .finally(() => setAlertsLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Export current data as CSV for offline analysis or record-keeping." />

      <ReportTable
        title="Papers"
        filenamePrefix="leakproofx-papers"
        columns={PAPER_COLUMNS}
        rows={papers}
        loading={papersLoading}
        error={papersError}
        renderCell={(col, row) =>
          col.key === 'status' || col.key === 'currentCustodyStep' ? (
            <Badge tone={row.status}>{col.get ? col.get(row) : row[col.key]}</Badge>
          ) : col.get ? (
            col.get(row)
          ) : (
            row[col.key]
          )
        }
      />

      <ReportTable
        title="Alerts"
        filenamePrefix="leakproofx-alerts"
        columns={ALERT_COLUMNS}
        rows={alerts}
        loading={alertsLoading}
        error={alertsError}
        renderCell={(col, row) =>
          col.key === 'severity' || col.key === 'status' ? (
            <Badge tone={row[col.key]}>{row[col.key]}</Badge>
          ) : col.get ? (
            col.get(row)
          ) : (
            row[col.key]
          )
        }
      />
    </div>
  );
}
