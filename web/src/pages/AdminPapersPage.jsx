import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPaper, listPapers } from '../api/papers';
import { extractErrorMessage } from '../api/client';
import { Badge, Button, Card, EmptyState, ErrorBanner, LoadingSpinner, PageHeader } from '../components/ui';

const initialForm = {
  title: '',
  examName: '',
  content: '',
  examTime: '',
  durationMinutes: 90,
  assignedCenterIds: '',
};

function CreatePaperForm({ onCreated }) {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess(null);
    setSubmitting(true);
    try {
      const assignedCenterIds = form.assignedCenterIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const paper = await createPaper({
        title: form.title,
        examName: form.examName,
        content: form.content,
        examTime: new Date(form.examTime).toISOString(),
        durationMinutes: Number(form.durationMinutes),
        ...(assignedCenterIds.length ? { assignedCenterIds } : {}),
      });
      setForm(initialForm);
      setSuccess(paper);
      onCreated();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ErrorBanner message={error} />
      {success && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          "{success.title}" scheduled.{' '}
          <Link to={`/tracking/${success._id}`} className="font-medium underline">
            View custody timeline →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500">Title</label>
          <input
            required
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Exam name</label>
          <input
            required
            value={form.examName}
            onChange={(e) => update('examName', e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Exam time</label>
          <input
            type="datetime-local"
            required
            value={form.examTime}
            onChange={(e) => update('examTime', e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Duration (minutes)</label>
          <input
            type="number"
            min={1}
            required
            value={form.durationMinutes}
            onChange={(e) => update('durationMinutes', e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-500">
            Assigned center IDs <span className="font-normal text-slate-400">(optional, comma-separated)</span>
          </label>
          <input
            value={form.assignedCenterIds}
            onChange={(e) => update('assignedCenterIds', e.target.value)}
            placeholder="e.g. 66f1a2b3c4d5e6f7a8b9c0d1"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-500">Paper content</label>
          <textarea
            required
            rows={6}
            value={form.content}
            onChange={(e) => update('content', e.target.value)}
            placeholder="Full exam paper text — encrypted at rest with AES-256-GCM before storage."
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <Button type="submit" disabled={submitting}>
        {submitting ? 'Encrypting & scheduling…' : 'Schedule paper'}
      </Button>
    </form>
  );
}

function formatDate(iso) {
  return new Date(iso).toLocaleString();
}

export default function AdminPapersPage() {
  const [papers, setPapers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    listPapers()
      .then(setPapers)
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const upcoming = [...papers]
    .filter((p) => p.status === 'SCHEDULED')
    .sort((a, b) => new Date(a.examTime) - new Date(b.examTime));

  return (
    <div className="space-y-6">
      <PageHeader title="Paper Scheduling" subtitle="Create and encrypt a new exam paper. BOARD/ADMIN only." />

      <Card>
        <CreatePaperForm onCreated={load} />
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Upcoming scheduled papers</h2>
        <ErrorBanner message={error} />
        {loading ? (
          <LoadingSpinner />
        ) : upcoming.length === 0 ? (
          <EmptyState label="Nothing scheduled yet." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {upcoming.map((p) => (
              <li key={p._id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <Link to={`/tracking/${p._id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                    {p.title}
                  </Link>
                  <span className="ml-2 text-slate-500">{formatDate(p.examTime)}</span>
                </div>
                <Badge tone={p.status}>{p.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
