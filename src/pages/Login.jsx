import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Shell } from '../components/Shell'
import { Alert, Button, Card, Field, Input } from '../components/ui'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { cn } from '../lib/utils'

export default function Login() {
  const { session, loading } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [mode, setMode] = useState('signin')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => { setErr(''); setInfo('') }, [mode])

  if (!loading && session) return <Navigate to={loc.state?.from || '/lecturer'} replace />

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr(''); setInfo('')
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password })
        if (error) throw error
        nav(loc.state?.from || '/lecturer', { replace: true })
      } else {
        if (form.password.length < 8) throw new Error('Use a password with at least 8 characters.')
        const { data, error } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: { data: { full_name: form.name.trim() } },
        })
        if (error) throw error
        if (!data.session) {
          setInfo('Account created. Open the confirmation email we sent you, then sign in.')
          setMode('signin')
        }
      }
    } catch (e2) {
      setErr(e2.message || 'Could not sign in. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell>
      <div className="mx-auto max-w-md py-6">
        <Card className="p-6">
          <h1 className="font-display text-3xl font-semibold">Lecturer access</h1>
          <p className="mt-1 text-sm text-muted">Sign in to create tests and read results.</p>

          <div className="mt-5 grid grid-cols-2 rounded-lg bg-brandsoft p-1 text-sm font-medium" role="tablist">
            {[['signin', 'Sign in'], ['signup', 'Create account']].map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={mode === k}
                onClick={() => setMode(k)}
                className={cn('rounded-md py-2 transition-colors', mode === k ? 'bg-surface shadow-sm' : 'text-muted')}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-5 space-y-4">
            {mode === 'signup' && (
              <Field label="Full name">
                <Input required value={form.name} onChange={set('name')} autoComplete="name" />
              </Field>
            )}
            <Field label="Email">
              <Input required type="email" value={form.email} onChange={set('email')} autoComplete="email" />
            </Field>
            <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters.' : undefined}>
              <Input
                required type="password" value={form.password} onChange={set('password')}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
            </Field>
            {err && <Alert>{err}</Alert>}
            {info && <Alert tone="gold">{info}</Alert>}
            <Button type="submit" size="lg" loading={busy} className="w-full">
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </form>
        </Card>
      </div>
    </Shell>
  )
}
