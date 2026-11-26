import { type ReactNode, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxWidth?: string;
}

export function Dialog({ open, onClose, title, children, maxWidth = 'max-w-md' }: DialogProps) {
  const handleEsc = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [open, handleEsc]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center no-print">
      <div className="absolute inset-0 bg-tinta/50 animate-fade-in" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative bg-kertas w-full ${maxWidth} max-h-[92vh] overflow-y-auto rounded-t-lg sm:rounded-lg shadow-xl animate-slide-up`}
      >
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-kertas z-10">
            <h2 className="font-semibold text-tinta">{title}</h2>
            <button onClick={onClose} className="btn-touch p-1 rounded hover:bg-kertasdark" aria-label="Tutup">
              <X size={20} />
            </button>
          </div>
        )}
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Ya',
  cancelLabel = 'Batal',
  danger,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  return (
    <Dialog open={open} onClose={onCancel} title={title} maxWidth="max-w-sm">
      <p className="text-sm text-tintalight mb-5">{message}</p>
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="btn-touch px-4 rounded border border-border bg-kertas hover:bg-kertasdark text-tinta"
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          className={`btn-touch px-4 rounded text-white ${danger ? 'bg-bahaya hover:bg-bahaya/90' : 'bg-aksen hover:bg-aksen/90'}`}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
