import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Clock, Eye, ListChecks, Maximize, Play } from 'lucide-react'
import { Shell } from '../components/Shell'
import { Alert, Badge, Button, Card, Field, Input, Spinner } from '../components/ui'
import { rpc } from '../lib/supabase'
import { fmtDate, supportsFullscreen } from '../lib/utils'

export default function StudentEntry() {
  const { slug } = useParams()
  const nav = useNavigate()
  const storeKey = `ful_attempt_${slug}`
  const [info, setInfo] = useState(null)
  const [loadErr, setLoadErr] = useState('')
  const [form, setForm] = useState({ name: '', matric: '', department: '', email: '', code: '' })
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [hasSaved] = useState(() => Boolean(localStorage.getItem(storeKey)))

  useEffect(() => {
    rpc('get_test_public', { p_slug: slug }).then(setInfo).catch((e) => setLoadErr(e.message))
  }, [slug])

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErr('') }

  async function start(e) {
    e.preventDefault()
    if (!agree) return setErr('Tick the box to confirm you understand the rules.')
    setBusy(true); setErr('')
    // Fullscreen must be requested inside the click, before any waiting
    if (supportsFullscreen()) document.documentElement.requestFullscreen().catch(() => {})
    try {
      const data = await rpc('start_attempt', {
        p_slug: slug, p_code: form.code, p_name: form.name,
        p_matric: form.matric, p_department: form.department, p_email: form.email,
      })
      localStorage.setItem(storeKey, JSON.stringify({ id: data.attempt_id, token: data.token }))
      nav(`/t/${slug}/exam`, { state: { payload: data } })
    } catch (e2) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      setErr(e2.message)
      setBusy(false)
    }
  }

  if (loadErr) {
    return (
      <Shell>
        <div className="mx-auto max-w-md py-14 text-center">
          <h1 className="font-display text-3xl font-semibold">We could not open this test</h1>
          <p className="mt-2 text-muted">{loadErr}</p>
          <Link to="/"><Button className="mt-6" variant="secondary">Back to home</Button></Link>
        </div>
      </Shell>
    )
  }
  if (!info) return <Shell><div className="flex justify-center py-24"><Spinner className="h-6 w-6 text-brand" /></div></Shell>

  const blocked = info.status !== 'open'
  const rules = [
    [Clock, `You have ${info.duration_minutes} minutes. The timer starts as soon as you press Start and cannot be paused.`],
    [Eye, info.warn_before_submit
      ? 'Do not leave this page, switch apps, or exit fullscreen. You get one warning. The second time, your test is submitted immediately.'
      : 'Do not leave this page, switch apps, or exit fullscreen. If you do, your test is submitted immediately.'],
    [Maximize, 'The test runs in fullscreen. Do not refresh the page. Copying and pasting are disabled.'],
    [ListChecks, 'Your answers save as you go. When time runs out, the test submits itself.'],
  ]
  if (Number(info.negative_marking) > 0) {
    rules.push([ListChecks, `Wrong answers to multiple-choice and true/false questions lose ${Math.round(info.negative_marking * 100)}% of that question's marks. Questions you leave blank lose nothing.`])
  }
  if (info.pass_mark != null) rules.push([ListChecks, `The pass mark is ${Number(info.pass_mark)}%.`])

  return (
    <Shell>
      <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {info.course_code && <Badge tone="brand">{info.course_code}</Badge>}
            <Badge tone={blocked ? 'gold' : 'ok'}>
              {info.status === 'open' ? 'Open' : info.status === 'upcoming' ? 'Not open yet' : 'Closed'}
            </Badge>
          </div>
          <h1 className="mt-3 font-display text-3xl font-semibold leading-tight">{info.title}</h1>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
            <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" />{info.duration_minutes} minutes</span>
            <span className="flex items-center gap-1.5"><ListChecks className="h-4 w-4" />{info.question_count} questions</span>
          </div>
          {info.status === 'upcoming' && <p className="mt-3 text-sm text-muted">Opens {fmtDate(info.opens_at)}.</p>}
          {info.closes_at && info.status === 'open' && <p className="mt-3 text-sm text-muted">Closes {fmtDate(info.closes_at)}.</p>}
          {info.announcements?.length > 0 && (
            <div className="mt-5 space-y-2">
              {info.announcements.map((a, i) => (
                <Alert key={i} tone="gold">
                  <div className="whitespace-pre-line">{a.message}</div>
                  <div className="mt-1 text-xs opacity-80">{fmtDate(a.created_at)}</div>
                </Alert>
              ))}
            </div>
          )}
          {info.instructions && (
            <div className="mt-5">
              <h2 className="font-display text-lg font-semibold">From your lecturer</h2>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{info.instructions}</p>
            </div>
          )}
          <div className="mt-6">
            <h2 className="font-display text-lg font-semibold">Before you begin</h2>
            <ul className="mt-2 space-y-3">
              {rules.map(([Icon, text], i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{text}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Card className="h-fit p-5 sm:p-6">
          <h2 className="font-display text-2xl font-semibold">Your details</h2>
          <p className="mt-1 text-sm text-muted">These are sent to your lecturer with your score.</p>

          {hasSaved && !blocked && (
            <div className="mt-4">
              <Alert tone="gold">
                You have a test in progress on this device.{' '}
                <button className="font-semibold underline" onClick={() => nav(`/t/${slug}/exam`)}>Resume it</button>
              </Alert>
            </div>
          )}

          <form onSubmit={start} className="mt-5 space-y-4">
            <Field label="Full name"><Input required value={form.name} onChange={set('name')} autoComplete="name" disabled={blocked} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Matric number"><Input required value={form.matric} onChange={set('matric')} autoCapitalize="characters" disabled={blocked} /></Field>
              <Field label="Department"><Input required value={form.department} onChange={set('department')} disabled={blocked} /></Field>
            </div>
            <Field label="Email" hint="Your score will be sent here."><Input required type="email" value={form.email} onChange={set('email')} autoComplete="email" disabled={blocked} /></Field>
            <Field label="Access code"><Input required value={form.code} onChange={(e) => { setForm((f) => ({ ...f, code: e.target.value.toUpperCase() })); setErr('') }} className="font-mono tracking-widest" autoCapitalize="characters" autoComplete="off" disabled={blocked} /></Field>

            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} disabled={blocked} className="mt-0.5 h-4 w-4 accent-[rgb(var(--brand))]" />
              <span>I have read the rules and understand that leaving the test page will end my test.</span>
            </label>

            {err && <Alert>{err}</Alert>}
            <Button type="submit" size="lg" className="w-full" loading={busy} disabled={blocked}>
              <Play className="h-4 w-4" />Start test
            </Button>
            {blocked && <p className="text-center text-sm text-muted">{info.status === 'upcoming' ? 'This test has not opened yet.' : 'This test is closed.'}</p>}
          </form>
          <p className="mt-5 text-center text-sm text-muted">
            Already took this test?{' '}
            <Link className="font-medium text-brand underline" to={`/t/${slug}/result`}>Check your result</Link>
          </p>
        </Card>
      </div>
    </Shell>
  )
}
