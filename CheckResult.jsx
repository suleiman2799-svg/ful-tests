import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileDown, Search } from 'lucide-react'
import { Shell } from '../components/Shell'
import { Alert, Badge, Button, Card, Field, Input } from '../components/ui'
import { rpc } from '../lib/supabase'
import { downloadSlip } from '../lib/pdf'
import { fmtDate, fmtNum } from '../lib/utils'

export default function CheckResult() {
  const { slug } = useParams()
  const [form, setForm] = useState({ matric: '', email: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [data, setData] = useState(null)

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErr('') }

  async function look(e) {
    e.preventDefault()
    setBusy(true); setErr(''); setData(null)
    try {
      setData(await rpc('lookup_result', { p_slug: slug, p_matric: form.matric, p_email: form.email }))
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }

  const r = data?.result

  return (
    <Shell>
      <div className="mx-auto max-w-md">
        <Link to={`/t/${slug}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
          <ArrowLeft className="h-4 w-4" />Back to the test page
        </Link>
        <Card className="p-6">
          <h1 className="font-display text-3xl font-semibold">Check your result</h1>
          <p className="mt-1 text-sm text-muted">Enter your matric number and the email you used for the test.</p>
          <form onSubmit={look} className="mt-5 space-y-4">
            <Field label="Matric number"><Input required value={form.matric} onChange={set('matric')} autoCapitalize="characters" /></Field>
            <Field label="Email"><Input required type="email" value={form.email} onChange={set('email')} autoComplete="email" /></Field>
            {err && <Alert>{err}</Alert>}
            <Button type="submit" size="lg" className="w-full" loading={busy}><Search className="h-4 w-4" />Find my result</Button>
          </form>
        </Card>

        {data && (
          <Card className="mt-5 p-6 text-center">
            <h2 className="font-display text-xl font-semibold">{data.title}</h2>
            <p className="mt-0.5 text-sm text-muted">{data.student_name}. {data.matric}</p>
            {r.released ? (
              <>
                <div className="mt-5 font-display text-5xl font-semibold">{Number(r.percentage).toFixed(0)}%</div>
                <div className="mt-1 text-muted">{fmtNum(r.score)} of {fmtNum(r.total)} marks</div>
                {r.passed !== null && r.passed !== undefined && (
                  <div className="mt-3"><Badge tone={r.passed ? 'ok' : 'danger'}>{r.passed ? 'Pass' : 'Fail'}</Badge></div>
                )}
                <Button className="mt-5" variant="secondary" onClick={() => downloadSlip({
                  name: data.student_name, matric: data.matric, department: data.department,
                  title: data.title, course: data.course_code, date: fmtDate(data.submitted_at),
                  score: r.score, total: r.total, percentage: r.percentage, passed: r.passed,
                })}>
                  <FileDown className="h-4 w-4" />Download result slip (PDF)
                </Button>
              </>
            ) : (
              <p className="mt-5 rounded-xl border border-line px-4 py-5 text-sm text-muted">
                Your test was received, but your lecturer has not released scores yet. Check again later.
              </p>
            )}
          </Card>
        )}
      </div>
    </Shell>
  )
}
