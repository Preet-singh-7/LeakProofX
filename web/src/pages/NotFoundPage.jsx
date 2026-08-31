import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-2xl font-bold text-slate-900">404 — Page not found</h1>
      <Link to="/" className="mt-4 text-sm font-medium text-indigo-600 hover:underline">
        Back to dashboard
      </Link>
    </div>
  );
}
