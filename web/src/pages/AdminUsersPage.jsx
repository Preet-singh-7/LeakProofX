import { useCallback, useEffect, useRef, useState } from 'react';
import { deactivateUser, listUsers, setIdProof } from '../api/users';
import { registerUser } from '../api/auth';
import { extractErrorMessage } from '../api/client';
import { Badge, Button, Card, ErrorBanner, LoadingSpinner, PageHeader } from '../components/ui';
import { ROLE_VALUES } from '../utils/constants';

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function CreateUserForm({ onCreated }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: ROLE_VALUES[0] });
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
      await registerUser(form);
      setForm({ name: '', email: '', password: '', role: ROLE_VALUES[0] });
      onCreated();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <ErrorBanner message={error} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500">Name</label>
          <input
            required
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Email</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Temporary password</label>
          <input
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Role</label>
          <select
            value={form.role}
            onChange={(e) => update('role', e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {ROLE_VALUES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Creating…' : 'Create user'}
      </Button>
    </form>
  );
}

function IdProofButton({ user, onVerified, onError }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later (e.g. to redo it)
    if (!file) return;
    setUploading(true);
    onError('');
    try {
      const dataUrl = await fileToDataUrl(file);
      await setIdProof(user._id, dataUrl);
      onVerified();
    } catch (err) {
      onError(extractErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <Button variant="secondary" disabled={uploading} onClick={() => inputRef.current?.click()}>
        {uploading ? 'Uploading…' : user.idVerified ? 'Replace ID proof' : 'Upload ID proof'}
      </Button>
    </>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    listUsers()
      .then(setUsers)
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDeactivate(id) {
    setActionError('');
    try {
      await deactivateUser(id);
      load();
    } catch (err) {
      setActionError(extractErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="User Management" subtitle="Provision accounts and deactivate access. ADMIN only." />

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Create user</h2>
        <CreateUserForm onCreated={load} />
      </Card>

      <Card className="overflow-x-auto p-0">
        <div className="p-4">
          <ErrorBanner message={error || actionError} />
        </div>
        {loading ? (
          <LoadingSpinner />
        ) : (
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">ID verified</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u._id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{u.name}</td>
                  <td className="px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3 text-slate-600">{u.role}</td>
                  <td className="px-4 py-3">
                    <Badge tone={u.isActive ? 'RESOLVED' : 'OPEN'}>{u.isActive ? 'Active' : 'Deactivated'}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={u.idVerified ? 'RESOLVED' : 'OPEN'}>{u.idVerified ? 'Verified' : 'Not verified'}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <IdProofButton user={u} onVerified={load} onError={setActionError} />
                      {u.isActive && (
                        <Button variant="danger" onClick={() => handleDeactivate(u._id)}>
                          Deactivate
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
