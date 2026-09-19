import { Link } from 'react-router-dom';
import { ShieldOff, ArrowLeft } from 'lucide-react';

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6">
      <div className="max-w-md text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
          <ShieldOff className="h-7 w-7 text-red-600" />
        </span>
        <h1 className="mt-5 text-xl font-bold text-slate-900">Access denied</h1>
        <p className="mt-2 text-sm text-slate-500">
          Your role does not include the permission required for this page.
          If you believe this is an error, contact your system administrator.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}