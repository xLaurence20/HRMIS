import { Inbox } from 'lucide-react';

export default function EmptyState({ Icon = Inbox, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-slate-900">{title}</h3>
      {description && (
        <p className="mt-1 max-w-md text-xs text-slate-500">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}