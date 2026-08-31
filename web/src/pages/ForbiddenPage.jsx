import { Link } from 'react-router-dom';

export default function ForbiddenPage() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-2xl font-bold text-slate-900">403 — Not authorized</h1>
      <p className="text-sm text-slate-500">Your role doesn't have access to this page.</p>
      <Link to="/" className="mt-4 text-sm font-medium text-indigo-600 hover:underline">
        Back to dashboard
      </Link>
    </div>
  );
}
