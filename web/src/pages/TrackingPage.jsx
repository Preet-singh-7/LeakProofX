import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listPapers } from '../api/papers';
import { extractErrorMessage } from '../api/client';
import { Badge, Card, EmptyState, ErrorBanner, LoadingSpinner, PageHeader } from '../components/ui';

function formatDate(iso) {
  return new Date(iso).toLocaleString();
}

export default function TrackingPage() {
  const [papers, setPapers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    listPapers()
      .then((data) => {
        if (!cancelled) setPapers(data);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return papers;
    return papers.filter((p) => p.title.toLowerCase().includes(q) || p.examName.toLowerCase().includes(q));
  }, [papers, search]);

  return (
    <div>
      <PageHeader
        title="Custody Tracking"
        subtitle="Every paper's current custody state and full chain-of-custody history."
      />

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by title or exam name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <EmptyState label="No papers found." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Exam</th>
                <th className="px-4 py-3">Exam Time</th>
                <th className="px-4 py-3">Custody Step</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((paper) => (
                <tr key={paper._id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{paper.title}</td>
                  <td className="px-4 py-3 text-slate-600">{paper.examName}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(paper.examTime)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={paper.status}>{paper.currentCustodyStep.replaceAll('_', ' ')}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={paper.status}>{paper.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/tracking/${paper._id}`} className="text-sm font-medium text-indigo-600 hover:underline">
                      View timeline →
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
