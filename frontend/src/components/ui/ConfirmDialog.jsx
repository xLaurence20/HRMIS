import { AlertTriangle, Loader2 } from 'lucide-react';
import Modal from './Modal';

export default function ConfirmDialog({
  open, onClose, onConfirm,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger', // danger | primary
  loading = false,
}) {
  const confirmClass =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-700'
      : 'bg-brand-600 hover:bg-brand-700';

  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onClose}
      title={title}
      size="md"
      closeOnBackdrop={!loading}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${confirmClass}`}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100">
          <AlertTriangle className="h-4.5 w-4.5 text-red-600" />
        </span>
        <p className="text-sm text-slate-600">{message}</p>
      </div>
    </Modal>
  );
}