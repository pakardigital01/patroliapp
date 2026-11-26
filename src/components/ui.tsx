import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  full?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'bg-aksen text-white hover:bg-aksen/90 disabled:bg-aksen/50',
  secondary: 'bg-kertas text-tinta border border-border hover:bg-kertasdark disabled:opacity-50',
  danger: 'bg-bahaya text-white hover:bg-bahaya/90 disabled:bg-bahaya/50',
  ghost: 'bg-transparent text-tinta hover:bg-kertasdark disabled:opacity-50',
  success: 'bg-sukses text-white hover:bg-sukses/90 disabled:bg-sukses/50',
};

const sizes: Record<Size, string> = {
  sm: 'text-xs px-3 py-1.5',
  md: 'text-sm px-4 py-2.5',
  lg: 'text-base px-5 py-3',
};

export function Button({ variant = 'primary', size = 'md', loading, full, children, className = '', disabled, ...props }: ButtonProps) {
  return (
    <button
      className={`btn-touch rounded font-medium transition-colors disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${full ? 'w-full' : ''} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <span className="inline-block animate-pulse-soft">Memproses…</span> : children}
    </button>
  );
}

interface FieldProps {
  label: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

export function Field({ label, error, hint, required, children }: FieldProps) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-tinta mb-1.5">
        {label} {required && <span className="text-bahaya">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-tintalight mt-1">{hint}</p>}
      {error && <p className="text-xs text-bahaya mt-1">{error}</p>}
    </div>
  );
}

const inputClass = 'w-full rounded border border-border bg-white px-3 py-2.5 text-sm text-tinta placeholder:text-tintalight/60 focus:border-aksen focus:ring-1 focus:ring-aksen outline-none';

export function Input({ error, className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & { error?: string | null }) {
  return <input className={`${inputClass} ${error ? 'border-bahaya' : ''} ${className}`} {...props} />;
}

export function Textarea({ error, className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string | null }) {
  return <textarea className={`${inputClass} ${error ? 'border-bahaya' : ''} ${className}`} {...props} />;
}

export function Select({ error, className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { error?: string | null }) {
  return <select className={`${inputClass} ${error ? 'border-bahaya' : ''} ${className}`} {...props}>{children}</select>;
}

type BadgeColor = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';

export function Badge({ children, color = 'neutral' }: { children: ReactNode; color?: BadgeColor }) {
  const colors: Record<BadgeColor, string> = {
    neutral: 'bg-kertasdark text-tintalight',
    success: 'bg-sukses/15 text-sukses',
    warning: 'bg-peringatan/15 text-peringatan',
    danger: 'bg-bahaya/15 text-bahaya',
    accent: 'bg-aksen/15 text-aksen',
  };
  return <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${colors[color]}`}>{children}</span>;
}

export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center" style={{ width: size, height: size }}>
      <div className="animate-spin rounded-full border-2 border-border border-t-aksen" style={{ width: size, height: size }} />
    </div>
  );
}

export function EmptyState({ icon, title, message }: { icon?: ReactNode; title: string; message?: string }) {
  return (
    <div className="text-center py-12 px-4">
      {icon && <div className="mx-auto mb-3 text-tintalight">{icon}</div>}
      <p className="font-medium text-tinta">{title}</p>
      {message && <p className="text-sm text-tintalight mt-1">{message}</p>}
    </div>
  );
}
