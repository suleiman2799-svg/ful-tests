import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react'
import { cn } from '../lib/utils'

export function Spinner({ className }) {
  return <Loader2 className={cn('animate-spin', className || 'h-4 w-4')} aria-hidden />
}

const VARIANTS = {
  primary: 'bg-brand text-brandink hover:opacity-90',
  secondary: 'border border-line bg-surface text-text hover:bg-brandsoft',
  ghost: 'text-text hover:bg-brandsoft',
  danger: 'bg-danger text-white hover:opacity-90',
  dangerSoft: 'border border-danger/40 text-danger hover:bg-danger/10',
}
const SIZES = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-sm', lg: 'px-5 py-3 text-base' }

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant], SIZES[size], className,
      )}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

const fieldCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-text placeholder:text-muted/70 ' +
  'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:opacity-60'

export const Input = ({ className, ...p }) => <input className={cn(fieldCls, className)} {...p} />
export const Textarea = ({ className, ...p }) => <textarea className={cn(fieldCls, 'min-h-[88px] resize-y', className)} {...p} />

export function Field({ label, hint, children, className }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export function Card({ className, children, ...p }) {
  return (
    <div className={cn('rounded-xl border border-line bg-surface/95 backdrop-blur-[1px]', className)} {...p}>
      {children}
    </div>
  )
}

export function Switch({ checked, onChange, label, hint }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
          checked ? 'bg-brand' : 'bg-line',
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </div>
  )
}

export function Badge({ tone = 'neutral', children }) {
  const tones = {
    neutral: 'bg-line/60 text-muted',
    ok: 'bg-ok/15 text-ok',
    gold: 'bg-gold/15 text-gold',
    danger: 'bg-danger/15 text-danger',
    brand: 'bg-brandsoft text-brand',
  }
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone])}>
      {children}
    </span>
  )
}

export function Modal({ open, onClose, title, children, footer, locked, wide }) {
  useEffect(() => {
    if (!open || locked) return
    const h = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, locked, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={locked ? undefined : onClose} />
      <div
        className={cn(
          'relative flex max-h-[90vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-xl sm:rounded-2xl',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-5">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          {!locked && (
            <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted hover:bg-brandsoft">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="overflow-y-auto px-5 py-2 text-sm leading-relaxed">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 px-5 pb-5 pt-3">{footer}</div>}
      </div>
    </div>
  )
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {children && <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Alert({ tone = 'danger', children }) {
  const cls = tone === 'danger' ? 'border-danger/40 bg-danger/10 text-danger' : 'border-gold/40 bg-gold/10 text-gold'
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm', cls)} role="alert">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  )
}

/* ---------- toasts ---------- */
const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((message, type = 'ok') => {
    const id = Math.random().toString(36).slice(2)
    setItems((l) => [...l, { id, message, type }])
    setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), 3500)
  }, [])

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm shadow-lg"
          >
            {t.type === 'ok' ? <CheckCircle2 className="h-4 w-4 text-ok" /> : <AlertCircle className="h-4 w-4 text-danger" />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
