import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'warning';
interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  show: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm no-print">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className={`animate-slide-up rounded-lg px-4 py-3 text-sm shadow-lg text-white ${
              t.type === 'success'
                ? 'bg-sukses'
                : t.type === 'error'
                ? 'bg-bahaya'
                : t.type === 'warning'
                ? 'bg-peringatan'
                : 'bg-tinta'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast harus di dalam ToastProvider');
  return ctx;
}
