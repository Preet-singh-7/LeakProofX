import { useEffect, useState } from 'react';
import { listQuestions, createQuestion, deleteQuestion } from '../api/questions';
import { extractErrorMessage } from '../api/client';
import { Badge, Button, Card, EmptyState, ErrorBanner, LoadingSpinner, PageHeader } from '../components/ui';

const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'];

const initialForm = {
  subject: '',
  topic: '',
  difficulty: 'EASY',
  marks: 2,
  text: '',
  options: '',
};

function AddQuestionForm({ onCreated }) {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const options = form.options
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      await createQuestion({
        subject: form.subject,
        topic: form.topic || undefined,
        difficulty: form.difficulty,
        marks: Number(form.marks),
        text: form.text,
        ...(options.length ? { options } : {}),
      });
      setForm(initialForm);
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
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500">Subject</label>
          <input
            required
            value={form.subject}
            onChange={(e) => update('subject', e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">
            Topic <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            value={form.topic}
            onChange={(e) => update('topic', e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Difficulty</label>
          <select
            value={form.difficulty}
            onChange={(e) => update('difficulty', e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Marks</label>
          <input
            type="number"
            min={1}
            required
            value={form.marks}
            onChange={(e) => update('marks', e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-500">Question text</label>
          <textarea
            required
            rows={3}
            value={form.text}
            onChange={(e) => update('text', e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-500">
            Options <span className="font-normal text-slate-400">(optional, one per line — leave blank for a subjective question)</span>
          </label>
          <textarea
            rows={3}
            value={form.options}
            onChange={(e) => update('options', e.target.value)}
            placeholder={'Option A\nOption B\nOption C'}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Adding…' : 'Add question'}
      </Button>
    </form>
  );
}

const MAX_PDF_BYTES = 10 * 1024 * 1024;

// Extraction and splitting both happen in the browser (see utils/pdfText.js)
// — the server never sees or parses the PDF. What actually reaches the
// backend is only the structured question objects below, one at a time,
// through the same validated POST /questions every hand-typed question
// already goes through — reviewed and editable here first, not auto-submitted.
function PdfQuestionImport({ onImported }) {
  const [extracting, setExtracting] = useState(false);
  const [fileInfo, setFileInfo] = useState(null); // { name, sizeLabel } | null
  const [rawText, setRawText] = useState('');
  const [drafts, setDrafts] = useState([]); // { text, subject, topic, difficulty, marks }
  const [defaults, setDefaults] = useState({ subject: '', topic: '', difficulty: 'EASY', marks: 2 });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [addedCount, setAddedCount] = useState(0);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setAddedCount(0);
    setFileInfo(null);
    if (file.type !== 'application/pdf') {
      setError('Only PDF files are accepted.');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError(`PDF is too large — max ${MAX_PDF_BYTES / (1024 * 1024)}MB.`);
      return;
    }
    setFileInfo({ name: file.name, sizeLabel: `${(file.size / 1024).toFixed(0)}KB` });
    setExtracting(true);
    setDrafts([]);
    try {
      // Dynamically imported so pdfjs-dist (~1.2MB, worker included) is only
      // fetched when someone actually uses this tab, not on every page load.
      const { extractPdfText } = await import('../utils/pdfText');
      const text = await extractPdfText(file);
      setRawText(text);
    } catch {
      setError("Could not read text from that PDF — it may be a scanned image without a text layer, which this can't extract from.");
    } finally {
      setExtracting(false);
    }
  }

  async function handleSplit() {
    const { splitIntoQuestions } = await import('../utils/pdfText');
    const found = splitIntoQuestions(rawText);
    setDrafts(found.map((text) => ({ text, ...defaults })));
  }

  function updateDraft(i, field, value) {
    setDrafts((rows) => rows.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));
  }

  function removeDraft(i) {
    setDrafts((rows) => rows.filter((_, idx) => idx !== i));
  }

  async function handleAddAll() {
    setError('');
    setSubmitting(true);
    let added = 0;
    try {
      for (const draft of drafts) {
        if (!draft.text.trim() || !draft.subject.trim()) continue;
        await createQuestion({
          subject: draft.subject,
          topic: draft.topic || undefined,
          difficulty: draft.difficulty,
          marks: Number(draft.marks),
          text: draft.text,
        });
        added += 1;
      }
      setAddedCount(added);
      setDrafts([]);
      setRawText('');
      onImported();
    } catch (err) {
      setError(`${extractErrorMessage(err)} (${added} of ${drafts.length} added before this failed)`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} />
      {addedCount > 0 && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Added {addedCount} question{addedCount === 1 ? '' : 's'} to the bank.
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-500">Source PDF</label>
        <div className="mt-1 rounded-md border border-dashed border-slate-300 bg-slate-50 p-4">
          <input type="file" accept="application/pdf" onChange={handleFile} className="text-sm" disabled={extracting} />
          <p className="mt-1 text-xs text-slate-400">
            Max {MAX_PDF_BYTES / (1024 * 1024)}MB · text extracted in your browser, never sent to the server as a file.
          </p>
          {extracting && <p className="mt-2 text-sm text-slate-700">Extracting text…</p>}
          {!extracting && fileInfo && (
            <p className="mt-2 text-sm text-slate-700">
              Selected: <span className="font-medium">{fileInfo.name}</span> ({fileInfo.sizeLabel})
            </p>
          )}
        </div>
      </div>

      {rawText && (
        <>
          <div>
            <label className="block text-xs font-medium text-slate-500">
              Extracted text <span className="font-normal text-slate-400">(clean up headers/footers/OCR noise before splitting)</span>
            </label>
            <textarea
              rows={6}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-4 gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div>
              <label className="block text-xs font-medium text-slate-500">Default subject</label>
              <input
                value={defaults.subject}
                onChange={(e) => setDefaults((d) => ({ ...d, subject: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">Default topic</label>
              <input
                value={defaults.topic}
                onChange={(e) => setDefaults((d) => ({ ...d, topic: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">Default difficulty</label>
              <select
                value={defaults.difficulty}
                onChange={(e) => setDefaults((d) => ({ ...d, difficulty: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">Default marks</label>
              <input
                type="number"
                min={1}
                value={defaults.marks}
                onChange={(e) => setDefaults((d) => ({ ...d, marks: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          <Button type="button" variant="secondary" onClick={handleSplit}>
            Split into questions
          </Button>
        </>
      )}

      {drafts.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            {drafts.length} draft question{drafts.length === 1 ? '' : 's'} found — review each before adding.
          </p>
          {drafts.map((draft, i) => (
            <div key={i} className="rounded-md border border-slate-200 p-3">
              <textarea
                rows={2}
                value={draft.text}
                onChange={(e) => updateDraft(i, 'text', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
              <div className="mt-2 grid grid-cols-4 gap-2">
                <input
                  value={draft.subject}
                  onChange={(e) => updateDraft(i, 'subject', e.target.value)}
                  placeholder="Subject"
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                />
                <input
                  value={draft.topic}
                  onChange={(e) => updateDraft(i, 'topic', e.target.value)}
                  placeholder="Topic"
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                />
                <select
                  value={draft.difficulty}
                  onChange={(e) => updateDraft(i, 'difficulty', e.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                >
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    value={draft.marks}
                    onChange={(e) => updateDraft(i, 'marks', e.target.value)}
                    className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs"
                  />
                  <button type="button" onClick={() => removeDraft(i)} className="ml-auto text-xs text-red-600 hover:underline">
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
          <Button type="button" onClick={handleAddAll} disabled={submitting}>
            {submitting ? 'Adding…' : `Add ${drafts.length} question${drafts.length === 1 ? '' : 's'} to bank`}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function QuestionBankPage() {
  const [questions, setQuestions] = useState([]);
  const [subjectFilter, setSubjectFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('manual'); // 'manual' | 'pdf'

  function load() {
    setLoading(true);
    listQuestions(subjectFilter ? { subject: subjectFilter } : {})
      .then(setQuestions)
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [subjectFilter]);

  async function handleDelete(id) {
    if (!window.confirm('Delete this question? Papers already generated from it are unaffected.')) return;
    try {
      await deleteQuestion(id);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Question Bank"
        subtitle="The pool randomized paper generation draws from. BOARD/ADMIN only — as sensitive as paper content."
      />

      <Card>
        <div className="mb-4 flex gap-2 border-b border-slate-200 pb-3">
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'manual' ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            Add one question
          </button>
          <button
            type="button"
            onClick={() => setMode('pdf')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'pdf' ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            Import from PDF
          </button>
        </div>
        {mode === 'manual' ? <AddQuestionForm onCreated={load} /> : <PdfQuestionImport onImported={load} />}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Questions</h2>
          <input
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            placeholder="Filter by subject…"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <ErrorBanner message={error} />
        {loading ? (
          <LoadingSpinner />
        ) : questions.length === 0 ? (
          <EmptyState label="No questions yet." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {questions.map((q) => (
              <li key={q._id} className="flex items-start justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge tone={q.difficulty === 'EASY' ? 'RESOLVED' : q.difficulty === 'HARD' ? 'OPEN' : 'ACKNOWLEDGED'}>
                      {q.difficulty}
                    </Badge>
                    <span className="font-medium text-slate-900">{q.subject}</span>
                    {q.topic && <span className="text-slate-400">· {q.topic}</span>}
                    <span className="text-slate-400">· {q.marks} marks</span>
                  </div>
                  <p className="mt-1 truncate text-slate-600">{q.text}</p>
                </div>
                <Button variant="danger" className="shrink-0" onClick={() => handleDelete(q._id)}>
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
