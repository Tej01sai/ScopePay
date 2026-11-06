'use client';

import { useId } from 'react';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react';
import type { ApiError } from '@/lib/api-client';

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  pending?: boolean;
  pendingLabel?: string;
};

const variants = {
  primary: 'bg-indigo-700 text-white hover:bg-indigo-800 disabled:bg-indigo-300',
  secondary:
    'bg-white text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-indigo-800 hover:bg-indigo-50 disabled:text-slate-400',
  danger: 'bg-white text-red-800 ring-1 ring-red-300 hover:bg-red-50',
};

export function Button({
  variant = 'primary',
  pending = false,
  pendingLabel,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${variants[variant]} ${focusRing} ${className}`}
      {...rest}
    >
      {pending && <Spinner />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

export function Spinner() {
  return (
    <span
      aria-hidden
      className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}

type FieldShellProps = {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: (ids: { id: string; describedBy: string | undefined }) => ReactNode;
};

function FieldShell({ label, hint, error, children }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-800">
        {label}
      </label>
      {children({ id, describedBy })}
      {hint && (
        <p id={hintId} className="text-xs text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

const inputBase = `w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 ${focusRing}`;

type InputFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  error?: string;
};

export function InputField({ label, hint, error, className = '', ...rest }: InputFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {({ id, describedBy }) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={`${inputBase} ${error ? 'border-red-600' : 'border-slate-300'} ${className}`}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

type TextAreaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: ReactNode;
  error?: string;
};

export function TextAreaField({ label, hint, error, className = '', ...rest }: TextAreaFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {({ id, describedBy }) => (
        <textarea
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={`${inputBase} min-h-28 ${error ? 'border-red-600' : 'border-slate-300'} ${className}`}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

export function ErrorNotice({
  error,
  onRetry,
  retryPending,
}: {
  error: ApiError | null;
  onRetry?: () => void;
  retryPending?: boolean;
}) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
    >
      <p>
        {error.message}
        {error.code && <span className="ml-2 font-mono text-xs text-red-700">({error.code})</span>}
      </p>
      {onRetry && (
        <Button variant="danger" onClick={onRetry} pending={retryPending}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'success' | 'warning';
  children: ReactNode;
}) {
  const tones = {
    info: 'border-sky-300 bg-sky-50 text-sky-950',
    success: 'border-emerald-300 bg-emerald-50 text-emerald-950',
    warning: 'border-amber-300 bg-amber-50 text-amber-950',
  };
  return <div className={`rounded-md border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

export function Badge({
  tone,
  children,
}: {
  tone: 'slate' | 'green' | 'amber' | 'indigo' | 'red' | 'sky';
  children: ReactNode;
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-800 ring-slate-300',
    green: 'bg-emerald-50 text-emerald-900 ring-emerald-300',
    amber: 'bg-amber-50 text-amber-900 ring-amber-300',
    indigo: 'bg-indigo-50 text-indigo-900 ring-indigo-300',
    red: 'bg-red-50 text-red-900 ring-red-300',
    sky: 'bg-sky-50 text-sky-900 ring-sky-300',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

/** Source text shown as plain text (never HTML), preserving line breaks. */
export function Quote({ label, children }: { label: string; children: string }) {
  return (
    <figure className="rounded-md border-l-4 border-slate-300 bg-slate-50 px-3 py-2">
      <figcaption className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        {label}
      </figcaption>
      <blockquote className="mt-1 whitespace-pre-wrap text-sm text-slate-900">“{children}”</blockquote>
    </figure>
  );
}
