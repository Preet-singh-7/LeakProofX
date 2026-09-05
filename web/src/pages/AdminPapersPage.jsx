import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPaper, generatePapers, listPapers } from '../api/papers';
import { extractErrorMessage } from '../api/client';
import { Badge, Button, Card, EmptyState, ErrorBanner, InlineSpinner, LoadingSpinner, PageHeader } from '../components/ui';
import { SelfieCapture } from '../components/SelfieCapture';

const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'];

const initialForm = {
  title: '',
  examName: '',
  content: '',
  examTime: '',
  durationMinutes: 90,
  assignedCenterIds: '',
};

const MAX_PDF_BYTES = 5 * 1024 * 1024;

function CreatePaperForm({ onCreated }) {
  const [form, setForm] = useState(initialForm);
  const [contentMode, setContentMode] = useState('text'); // 'text' | 'pdf'
  const [pdfFile, setPdfFile] = useState(null); // { name, sizeLabel, base64 } | null
  const [selfieImage, setSelfieImage] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handlePdfChange(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file after an error
    if (!file) return;
    setError('');
    if (file.type !== 'application/pdf') {
      setError('Only PDF files are accepted.');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError(`PDF is too large — max ${MAX_PDF_BYTES / (1024 * 1024)}MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      // dataURL looks like "data:application/pdf;base64,JVBERi0x..." — strip the prefix
      const base64 = String(reader.result).split(',')[1];
      setPdfFile({ name: file.name, sizeLabel: `${(file.size / 1024).toFixed(0)}KB`, base64 });
    };
    reader.onerror = () => setError('Could not read that file — try again.');
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess(null);
    if (!selfieImage) {
      setError('Capture a live selfie before scheduling this paper — required for accountability.');
      return;
    }
    if (contentMode === 'pdf' && !pdfFile) {
      setError('Choose a PDF file before scheduling this paper.');
      return;
    }
    setSubmitting(true);
    try {
      const assignedCenterIds = form.assignedCenterIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const paper = await createPaper({
        title: form.title,
        examName: form.examName,
        content: contentMode === 'pdf' ? pdfFile.base64 : form.content,
        contentType: contentMode === 'pdf' ? 'PDF' : 'TEXT',
        examTime: new Date(form.examTime).toISOString(),
        durationMinutes: Number(form.durationMinutes),
        selfieImage,
        ...(assignedCenterIds.length ? { assignedCenterIds } : {}),
      });
      setForm(initialForm);
      setPdfFile(null);
      setSelfieImage(null);
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
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-xs font-medium text-slate-500">Paper content</label>
            <div className="flex gap-1 text-xs">
              <button
                type="button"
                onClick={() => setContentMode('text')}
                className={`rounded px-2 py-0.5 font-medium transition-colors ${
                  contentMode === 'text' ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                }`}
              >
                Type text
              </button>
              <button
                type="button"
                onClick={() => setContentMode('pdf')}
                className={`rounded px-2 py-0.5 font-medium transition-colors ${
                  contentMode === 'pdf' ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                }`}
              >
                Upload PDF
              </button>
            </div>
          </div>
          {contentMode === 'text' ? (
            <textarea
              required
              rows={6}
              value={form.content}
              onChange={(e) => update('content', e.target.value)}
              placeholder="Full exam paper text — encrypted at rest with AES-256-GCM before storage."
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          ) : (
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4">
              <input type="file" accept="application/pdf" onChange={handlePdfChange} className="text-sm" />
              <p className="mt-1 text-xs text-slate-400">
                Max {MAX_PDF_BYTES / (1024 * 1024)}MB · stored and returned as encrypted bytes, never parsed server-side.
              </p>
              {pdfFile && (
                <p className="mt-2 text-sm text-slate-700">
                  Selected: <span className="font-medium">{pdfFile.name}</span> ({pdfFile.sizeLabel})
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <SelfieCapture
        image={selfieImage}
        onCapture={setSelfieImage}
        label="Who is submitting this paper"
      />

      <Button type="submit" disabled={submitting || !selfieImage}>
        {submitting ? 'Encrypting & scheduling…' : 'Schedule paper'}
      </Button>
    </form>
  );
}

const initialGenerateForm = {
  title: '',
  examName: '',
  examTime: '',
  durationMinutes: 90,
  assignedCenterIds: '',
  subject: '',
};

const initialBlueprint = [{ topic: '', difficulty: 'EASY', count: 5 }];

// One distinct paper is generated per assigned center — the whole point
// being that each center's copy is provably different, so a leaked physical
// copy can be traced back to exactly one center. See generation.service.js.
function GeneratePapersForm({ onCreated }) {
  const [form, setForm] = useState(initialGenerateForm);
  const [blueprint, setBlueprint] = useState(initialBlueprint);
  const [selfieImage, setSelfieImage] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function updateBlueprintRow(index, field, value) {
    setBlueprint((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function addBlueprintRow() {
    setBlueprint((rows) => [...rows, { topic: '', difficulty: 'EASY', count: 1 }]);
  }

  function removeBlueprintRow(index) {
    setBlueprint((rows) => rows.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess(null);
    if (!selfieImage) {
      setError('Capture a live selfie before generating these papers — required for accountability.');
      return;
    }
    const assignedCenterIds = form.assignedCenterIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (assignedCenterIds.length === 0) {
      setError('At least one center ID is required — one paper variant is generated per center.');
      return;
    }
    setSubmitting(true);
    try {
      const papers = await generatePapers({
        title: form.title,
        examName: form.examName,
        examTime: new Date(form.examTime).toISOString(),
        durationMinutes: Number(form.durationMinutes),
        assignedCenterIds,
        subject: form.subject,
        blueprint: blueprint.map((row) => ({ topic: row.topic || undefined, difficulty: row.difficulty, count: Number(row.count) })),
        selfieImage,
      });
      setForm(initialGenerateForm);
      setBlueprint(initialBlueprint);
      setSelfieImage(null);
      setSuccess(papers);
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
          Generated {success.length} distinct paper{success.length === 1 ? '' : 's'} — one per center.
          <ul className="mt-1 space-y-0.5">
            {success.map((p) => (
              <li key={p._id}>
                <Link to={`/tracking/${p._id}`} className="font-medium underline">
                  {p.assignedCenterIds?.[0] || p._id} →
                </Link>
              </li>
            ))}
          </ul>
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
            Assigned center IDs <span className="font-normal text-slate-400">(required, comma-separated — one paper generated per center)</span>
          </label>
          <input
            required
            value={form.assignedCenterIds}
            onChange={(e) => update('assignedCenterIds', e.target.value)}
            placeholder="e.g. 66f1a2b3c4d5e6f7a8b9c0d1, 66f1a2b3c4d5e6f7a8b9c0d2"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Subject</label>
          <input
            required
            value={form.subject}
            onChange={(e) => update('subject', e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500">Blueprint — topic, difficulty, and how many of each</label>
        <p className="mt-0.5 text-xs text-slate-400">
          Leave a row's topic blank to let AI spread that row's count across whatever topics exist in the bank, instead of pooling
          them all together — keeps a paper from accidentally landing all on one topic.
        </p>
        <div className="mt-1 space-y-2">
          {blueprint.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={row.topic}
                onChange={(e) => updateBlueprintRow(i, 'topic', e.target.value)}
                placeholder="Topic (blank = AI-balanced)"
                className="w-48 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <select
                value={row.difficulty}
                onChange={(e) => updateBlueprintRow(i, 'difficulty', e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                required
                value={row.count}
                onChange={(e) => updateBlueprintRow(i, 'count', e.target.value)}
                className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <span className="text-xs text-slate-400">questions</span>
              {blueprint.length > 1 && (
                <button type="button" onClick={() => removeBlueprintRow(i)} className="text-xs text-red-600 hover:underline">
                  Remove
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addBlueprintRow} className="text-xs font-medium text-indigo-600 hover:underline">
            + Add another row
          </button>
        </div>
      </div>

      <SelfieCapture image={selfieImage} onCapture={setSelfieImage} label="Who is generating these papers" />

      <Button type="submit" disabled={submitting || !selfieImage} className="inline-flex items-center gap-2">
        {submitting ? (
          <>
            <InlineSpinner /> Generating…
          </>
        ) : (
          'Generate papers'
        )}
      </Button>
      {submitting && (
        <p className="text-xs text-slate-400">
          Any row left topic-blank asks AI to balance it across the bank's topics — this can take a few seconds.
        </p>
      )}
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
  const [mode, setMode] = useState('manual'); // 'manual' | 'generate'

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
        <div className="mb-4 flex gap-2 border-b border-slate-200 pb-3">
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'manual' ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            Manual content
          </button>
          <button
            type="button"
            onClick={() => setMode('generate')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'generate' ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            Generate from question bank
          </button>
        </div>
        {mode === 'manual' ? <CreatePaperForm onCreated={load} /> : <GeneratePapersForm onCreated={load} />}
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
