'use client';
import { statusLabel, statusTone } from '@mehfil/shared';
import { ChevronLeft, ChevronRight, Inbox, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import { ButtonHTMLAttributes, createContext, ReactNode, useCallback, useContext, useState } from 'react';
import { ApiError } from '@/lib/api';

const VARIANTS = {
  primary: 'bg-ruby text-white hover:bg-ruby-hover',
  secondary: 'bg-blush text-ruby hover:bg-[#f3dfdf]',
  outline: 'border border-line bg-white text-ink hover:border-rose',
  danger: 'border border-bad/40 bg-white text-bad hover:bg-bad/5',
  ghost: 'text-ink hover:bg-blush',
};

export function Button({ variant = 'primary', busy, className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS; busy?: boolean }) {
  return (
    <button {...rest} disabled={rest.disabled || busy} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${VARIANTS[variant]} ${className}`}>
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}{children}
    </button>
  );
}

export function LinkButton({ href, variant = 'primary', className = '', children }: { href: string; variant?: keyof typeof VARIANTS; className?: string; children: ReactNode }) {
  return <Link href={href} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${VARIANTS[variant]} ${className}`}>{children}</Link>;
}

const FIELD = 'w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-muted/70 focus:border-rose focus:outline-none';

interface FieldProps { label?: string; error?: string; hint?: string; className?: string }
function Wrap({ label, error, hint, className = '', children }: FieldProps & { children: ReactNode }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="mb-1.5 block text-sm font-medium">{label}</span>}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-bad" role="alert">{error}</span>}
    </label>
  );
}

export function Input({ label, error, hint, className, ...rest }: FieldProps & React.InputHTMLAttributes<HTMLInputElement>) {
  return <Wrap {...{ label, error, hint, className }}><input {...rest} className={FIELD} aria-invalid={!!error} /></Wrap>;
}
export function Textarea({ label, error, hint, className, ...rest }: FieldProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <Wrap {...{ label, error, hint, className }}><textarea rows={4} {...rest} className={FIELD} aria-invalid={!!error} /></Wrap>;
}
export function Select({ label, error, hint, className, children, ...rest }: FieldProps & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <Wrap {...{ label, error, hint, className }}><select {...rest} className={FIELD} aria-invalid={!!error}>{children}</select></Wrap>;
}

export function Card({ title, action, className = '', children }: { title?: ReactNode; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`rounded-xl border border-line bg-white p-5 ${className}`}>
      {(title || action) && <header className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg">{title}</h2>{action}</header>}
      {children}
    </section>
  );
}

const TONES = { good: 'bg-good/12 text-good', warn: 'bg-gold/20 text-warn', bad: 'bg-bad/10 text-bad', info: 'bg-blush text-ruby', neutral: 'bg-ink/8 text-ink' };
export function Status({ value }: { value: string }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${TONES[statusTone(value)]}`}>{statusLabel(value)}</span>;
}

export function Spinner() { return <div className="flex justify-center py-14 text-rose" role="status" aria-label="Loading"><Loader2 className="size-6 animate-spin" /></div>; }

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-14 text-center">
      <div className="mb-3 grid size-12 place-items-center rounded-full bg-blush text-ruby"><Inbox className="size-5" aria-hidden /></div>
      <p className="font-medium">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="rounded-xl border border-bad/30 bg-bad/5 p-5 text-sm" role="alert">
      <p className="text-bad">{error instanceof Error ? error.message : 'Something went wrong.'}</p>
      {retry && <Button variant="outline" className="mt-3" onClick={retry}>Try again</Button>}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="tnum mt-1 text-xl font-semibold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl md:text-3xl">{title}</h1>{sub && <p className="mt-1 text-sm text-muted">{sub}</p>}</div>
      {action}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg">{title}</h2><button onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-blush"><X className="size-5" /></button></div>
        {children}
      </div>
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-2 text-sm">
      <Button variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
      <span className="tnum text-muted">Page {page} of {pages}</span>
      <Button variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="size-4" /></Button>
    </div>
  );
}

type ToastItem = { id: number; text: string; bad?: boolean };
const ToastCtx = createContext<(text: string, bad?: boolean) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, bad?: boolean) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, bad }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-2" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`rounded-lg px-4 py-3 text-sm text-white shadow-lg ${t.bad ? 'bg-bad' : 'bg-ink'}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

/** Small form state helper: field binding, API field errors, and a busy flag. */
export function useForm<T extends Record<string, any>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => setValues((v) => ({ ...v, [key]: value })), []);
  const bind = (key: keyof T & string) => ({
    value: values[key] ?? '', error: errors[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { set(key, e.target.value as T[typeof key]); setErrors(({ [key]: _, ...r }) => r); },
  });
  const submit = async (fn: () => Promise<void>) => {
    setBusy(true); setFormError(null); setErrors({});
    try { await fn(); }
    catch (e) {
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
      setFormError(e instanceof Error ? e.message : 'Something went wrong');
    } finally { setBusy(false); }
  };
  return { values, set, setValues, bind, submit, busy, errors, formError };
}

export function FormError({ message }: { message: string | null }) {
  return message ? <p className="rounded-lg bg-bad/8 px-3 py-2 text-sm text-bad" role="alert">{message}</p> : null;
}

/** A button that asks for a typed reason before running an action. */
export function ReasonAction({ label, title, placeholder, variant = 'outline', onSubmit, optional, children }: { label: string; title?: string; placeholder?: string; variant?: keyof typeof VARIANTS; optional?: boolean; onSubmit: (reason: string) => Promise<unknown>; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setError(null);
    try { await onSubmit(reason); setOpen(false); setReason(''); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>{label}</Button>
      {open && (
        <Modal title={title ?? label} onClose={() => setOpen(false)}>
          {children}
          <Textarea label={optional ? 'Reason (optional)' : 'Reason'} placeholder={placeholder} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="mt-3"><FormError message={error} /></div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Back</Button>
            <Button variant={variant === 'danger' ? 'primary' : variant === 'outline' ? 'primary' : variant} busy={busy} disabled={!optional && !reason.trim()} onClick={go}>Confirm</Button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { label: string; value: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
      {tabs.map((t) => <button key={t.value} role="tab" aria-selected={t.value === value} onClick={() => onChange(t.value)} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${t.value === value ? 'border-ruby font-semibold text-ruby' : 'border-transparent text-muted hover:text-ink'}`}>{t.label}</button>)}
    </div>
  );
}
