import { Loader2, AlertCircle } from 'lucide-react';
import EmptyState from './EmptyState';

export default function DataTableShell({
  loading, error, isEmpty, emptyProps,
  children, colSpan,
}) {
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 px-6 text-center">
        <AlertCircle className="h-6 w-6 text-red-500" />
        <p className="text-sm text-slate-700">{error}</p>
      </div>
    );
  }

  if (isEmpty) return <EmptyState {...emptyProps} />;

  return children;
}