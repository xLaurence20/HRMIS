import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const STYLES = {
  error:   { wrap: 'border-red-200 bg-red-50 text-red-800',       Icon: AlertCircle },
  success: { wrap: 'border-emerald-200 bg-emerald-50 text-emerald-800', Icon: CheckCircle2 },
  info:    { wrap: 'border-brand-200 bg-brand-50 text-brand-800', Icon: Info },
};

export default function Alert({ variant = 'info', title, children, onClose }) {
  const { wrap, Icon } = STYLES[variant] ?? STYLES.info;

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`flex animate-slide-up items-start gap-3 rounded-lg border px-4 py-3 text-sm ${wrap}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="rounded p-0.5 opacity-60 transition hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}