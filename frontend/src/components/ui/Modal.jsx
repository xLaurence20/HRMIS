import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({
  open, onClose, title, description,
  children, footer,
  size = 'md', // sm | md | lg | xl | 2xl
  closeOnBackdrop = true,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = {
    sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg',
    xl: 'max-w-2xl', '2xl': 'max-w-4xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`relative z-10 w-full ${widths[size]} my-8 rounded-2xl bg-white shadow-xl ring-1 ring-slate-900/5 animate-slide-up`}
      >
        <header className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex-1 min-w-0">
            <h2 id="modal-title" className="text-base font-semibold text-slate-900">
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 text-xs text-slate-500">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-3 rounded-b-2xl">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}