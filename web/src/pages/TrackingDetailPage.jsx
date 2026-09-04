import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { decryptPaper, getPaper, getPaperQr, printPaper } from '../api/papers';
import { getTimeline, recordScan } from '../api/tracking';
import { getVerificationEvidence, listVerificationEvidence } from '../api/verification';
import { extractErrorMessage } from '../api/client';
import { Badge, Button, Card, ErrorBanner, LoadingSpinner, PageHeader } from '../components/ui';
import { RoleGate } from '../components/RoleGate';
import { SelfieCapture } from '../components/SelfieCapture';
import { CUSTODY_STEP_ORDER, ROLES } from '../utils/constants';

const SCAN_ROLES = [ROLES.COURIER, ROLES.CENTER, ROLES.INVIGILATOR, ROLES.BOARD, ROLES.ADMIN];
const CONTENT_ACCESS_ROLES = [ROLES.INVIGILATOR, ROLES.ADMIN];
const EVIDENCE_VIEW_ROLES = [ROLES.ADMIN, ROLES.AUDITOR];

function formatDate(iso) {
  return new Date(iso).toLocaleString();
}

function nextStep(currentStep) {
  const idx = CUSTODY_STEP_ORDER.indexOf(currentStep);
  if (idx === -1 || idx === CUSTODY_STEP_ORDER.length - 1) return null;
  return CUSTODY_STEP_ORDER[idx + 1];
}

function ScanForm({ paper, onScanRecorded }) {
  const [location, setLocation] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const suggestedStep = nextStep(paper.currentCustodyStep);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await recordScan({ qrToken: paper.qrToken, toStep: suggestedStep, location, deviceId });
      onScanRecorded();
      setLocation('');
      setDeviceId('');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!suggestedStep) {
    return <p className="text-sm text-slate-400">Custody chain complete — no further transitions.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <ErrorBanner message={error} />
      <p className="text-sm text-slate-600">
        Record the next custody transition: <span className="font-semibold">{paper.currentCustodyStep}</span> →{' '}
        <span className="font-semibold">{suggestedStep}</span>
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500">Location</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Center A"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Device ID</label>
          <input
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            placeholder="e.g. scanner-01"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Recording…' : `Record scan → ${suggestedStep}`}
      </Button>
    </form>
  );
}

/**
 * Content access (decrypt/print) has its own panel rather than living inside
 * ScanForm — it's a materially different, higher-risk action (exposes the
 * actual exam content) with its own backend endpoints, time-lock/custody
 * checks, and audit actions (PAPER_DECRYPTED/PAPER_PRINTED), so it's kept
 * visually and logically separate from a routine custody scan.
 */
function ContentAccessPanel({ paper, onAccessGranted }) {
  const [location, setLocation] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [content, setContent] = useState(null);
  const [contentType, setContentType] = useState('TEXT');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null); // 'decrypt' | 'print' | null
  // Printing produces a physical, leak-able copy — decrypt (on-screen view)
  // doesn't need this, print does (backend enforces it too, this is just
  // the client-side prompt for the same requirement).
  const [printSelfie, setPrintSelfie] = useState(null);

  async function handleDecrypt() {
    setError('');
    setContent(null);
    setBusy('decrypt');
    try {
      const result = await decryptPaper(paper._id, { location, deviceId });
      setContent(result.content);
      setContentType(result.contentType || 'TEXT');
      // A first successful decrypt auto-transitions custody to
      // OPENED_FOR_EXAM on the backend (papers.service.js) — refresh the
      // parent page's paper/timeline state so that's reflected here too,
      // the same way ScanForm's onScanRecorded already does for scans.
      onAccessGranted();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handlePrint() {
    setError('');
    if (!printSelfie) {
      setError('Capture a live selfie before printing — required for accountability.');
      return;
    }
    setBusy('print');
    try {
      const result = await printPaper(paper._id, { location, deviceId, selfieImage: printSelfie });
      setContent(result.content);
      setContentType(result.contentType || 'TEXT');
      setPrintSelfie(null);
      onAccessGranted();
      // Give React a tick to render the printable content before invoking
      // the browser print dialog.
      setTimeout(() => window.print(), 50);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Content access</h2>
      <ErrorBanner message={error} />

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500">Location</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Exam Hall 3"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Device ID</label>
          <input
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            placeholder="e.g. invig-tablet-3"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="mb-3">
        <SelfieCapture image={printSelfie} onCapture={setPrintSelfie} label="Who is printing this paper" />
      </div>

      <div className="flex gap-2">
        <Button onClick={handleDecrypt} disabled={busy !== null}>
          {busy === 'decrypt' ? 'Decrypting…' : 'Decrypt & view'}
        </Button>
        <Button variant="secondary" onClick={handlePrint} disabled={busy !== null || !printSelfie}>
          {busy === 'print' ? 'Preparing…' : 'Print'}
        </Button>
      </div>

      {content !== null && contentType === 'PDF' && (
        <iframe
          title="Paper PDF"
          src={`data:application/pdf;base64,${content}`}
          className="print-content mt-4 h-[600px] w-full rounded-md border border-slate-200"
        />
      )}
      {content !== null && contentType !== 'PDF' && (
        <div className="print-content mt-4 whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-4 font-mono text-sm text-slate-800">
          {content}
        </div>
      )}
    </Card>
  );
}

/**
 * Investigation view, ADMIN/AUDITOR only — the whole point of this panel
 * is answering "who created/printed this specific paper" after the fact,
 * so it deliberately isn't reachable by the BOARD/INVIGILATOR who actually
 * performed those actions (see src/verification/ on the backend — the API
 * itself already enforces this; this is just the matching UI gate).
 */
function VerificationEvidencePanel({ paperId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openImage, setOpenImage] = useState(null); // { name, role, action, selfieImage } | null

  useEffect(() => {
    listVerificationEvidence({ paperId })
      .then(setItems)
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [paperId]);

  async function viewImage(id) {
    setError('');
    try {
      const full = await getVerificationEvidence(id);
      setOpenImage(full);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-slate-700">Identity verification evidence</h2>
      <p className="mb-3 text-xs text-slate-500">
        A live selfie captured at the moment this paper was created and printed — the accountability record if either
        action is ever traced back after a leak.
      </p>
      <ErrorBanner message={error} />

      {loading ? (
        <LoadingSpinner />
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-400">No evidence recorded yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item._id}
              className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium text-slate-900">
                  {item.action === 'PAPER_CREATED' ? 'Created by' : 'Printed by'} {item.userId?.name}{' '}
                  <span className="font-normal text-slate-500">({item.userId?.role})</span>
                </p>
                <p className="text-xs text-slate-500">{formatDate(item.capturedAt)}</p>
              </div>
              <Button variant="secondary" onClick={() => viewImage(item._id)}>
                View photo
              </Button>
            </li>
          ))}
        </ul>
      )}

      {openImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpenImage(null)}
        >
          <div className="rounded-lg bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-2 text-sm font-medium text-slate-700">
              {openImage.action === 'PAPER_CREATED' ? 'Created by' : 'Printed by'} {openImage.userId?.name} (
              {openImage.userId?.role}) &middot; {formatDate(openImage.capturedAt)}
            </p>
            <img src={openImage.selfieImage} alt="Captured selfie" className="max-h-[70vh] rounded-md" />
            <Button className="mt-3 w-full" onClick={() => setOpenImage(null)}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function TrackingDetailPage() {
  const { id } = useParams();
  const [paper, setPaper] = useState(null);
  const [logs, setLogs] = useState([]);
  const [qr, setQr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [paperData, logsData] = await Promise.all([getPaper(id), getTimeline(id)]);
      setPaper(paperData);
      setLogs(logsData);
      try {
        setQr(await getPaperQr(id));
      } catch {
        // QR is a nice-to-have on this page; don't block the rest of the view if it 403s for this role
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorBanner message={error} />;
  if (!paper) return null;

  return (
    <div>
      <Link to="/tracking" className="mb-4 inline-block text-sm text-indigo-600 hover:underline">
        ← Back to all papers
      </Link>
      <PageHeader title={paper.title} subtitle={paper.examName} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Custody timeline</h2>
            {logs.length === 0 ? (
              <p className="text-sm text-slate-400">No custody events recorded yet.</p>
            ) : (
              <ol className="space-y-4 border-l-2 border-slate-200 pl-4">
                {logs.map((log) => (
                  <li key={log._id} className="relative">
                    <span
                      className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${
                        log.accepted ? 'bg-emerald-500' : 'bg-red-500'
                      }`}
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-900">
                        {log.fromStep.replaceAll('_', ' ')} → {log.toStep.replaceAll('_', ' ')}
                      </p>
                      <Badge tone={log.accepted ? 'RESOLVED' : 'OPEN'}>{log.accepted ? 'Accepted' : 'Rejected'}</Badge>
                    </div>
                    <p className="text-xs text-slate-500">
                      {formatDate(log.timestamp)} · {log.roleId}
                      {log.location ? ` · ${log.location}` : ''}
                      {log.deviceId ? ` · ${log.deviceId}` : ''}
                    </p>
                    {!log.accepted && log.rejectionReason && (
                      <p className="mt-1 text-xs text-red-600">{log.rejectionReason}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <RoleGate roles={SCAN_ROLES}>
            <Card>
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Record custody scan</h2>
              <ScanForm paper={paper} onScanRecorded={load} />
            </Card>
          </RoleGate>

          {/* Not custody-step-gated client-side: the backend enforces the
              real time-lock/custody rules, and surfacing its actual error
              (e.g. "too early", wrong custody state) is more informative
              than hiding the panel and leaving the user to guess why. */}
          <RoleGate roles={CONTENT_ACCESS_ROLES}>
            <ContentAccessPanel paper={paper} onAccessGranted={load} />
          </RoleGate>

          <RoleGate roles={EVIDENCE_VIEW_ROLES}>
            <VerificationEvidencePanel paperId={paper._id} />
          </RoleGate>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Paper details</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Exam time</dt>
                <dd className="text-slate-900">{formatDate(paper.examTime)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Duration</dt>
                <dd className="text-slate-900">{paper.durationMinutes} min</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Custody step</dt>
                <dd>
                  <Badge tone={paper.status}>{paper.currentCustodyStep.replaceAll('_', ' ')}</Badge>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Status</dt>
                <dd>
                  <Badge tone={paper.status}>{paper.status}</Badge>
                </dd>
              </div>
            </dl>
          </Card>

          {qr && (
            <Card>
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Custody QR code</h2>
              <img src={qr.dataUrl} alt={`QR code for ${paper.title}`} className="mx-auto w-40" />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
