import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileDown, Search } from 'lucide-react'
import { Shell } from '../components/Shell'
import { Alert, Badge, Button, Card, Field, Input } from '../components/ui'
import { rpc } from '../lib/supabase'
import { downloadSlip } from '../lib/pdf'
import { fmtDate, fmtNum } from '../lib/utils'

function Review({ items }) {
  const right = items.filter((q) => q.correct === true).length
  const wrong = items.filter((q) => q.correct === false).length
  const skipped = items.length - right - wrong

  return (
    <Card className="mt-5 p-6">
      <h2 className="font-display text-xl font-semibold">Your answers</h2>
      <p className="mt-0.5 text-sm text-muted">
        {right} correct, {wrong} wrong, {skipped} not answered.
      </p>

      <div className="mt-5 space-y-5">
        {items.map((q, i) => (
          <div key={q.id} className="rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted">Question {i + 1}</span>
              <div className="flex items-center gap-2">
                {q.got !== null && q.got !== undefined && (
                  <span className="text-xs text-muted">{fmtNum(q.got)} / {fmtNum(q.marks)}</span>
                )}
                {q.correct === true && <Badge tone="ok">Correct</Badge>}
                {q.correct === false && <Badge tone="danger">Wrong</Badge>}
                {q.correct !== true && q.correct !== false && <span className="text-xs text-muted">Not answered</span>}
              </div>
            </div>

            <p className="mt-2 whitespace-pre-wrap font-medium">{q.text}</p>
            {q.image_url && <img src={q.image_url} alt="" className="mt-2 max-h-48 rounded-lg" />}

            {q.type === 'short' ? (
              <div className="mt-3 space-y-1.5 text-sm">
                <div>
                  <span className="text-muted">Your answer: </span>
                  <span className="font-medium">{q.answer && q.answer.trim() ? q.answer : 'No answer'}</span>
                </div>
                {Array.isArray(q.accepted) && q.accepted.length > 0 && (
                  <div>
                    <span className="text-muted">Accepted answer{q.accepted.length === 1 ? '' : 's'}: </span>
                    <span className="font-medium">{q.accepted.join(', ')}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {(q.options || []).map((o, j) => {
                  const isCorrect = j === q.correct_pos
                  const isChosen = j === q.chosen
                  return (
                    <div key={j} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                      <span>{o}</span>
                      <span className="flex items-center gap-1.5">
                        {isCorrect && isChosen && <Badge tone="ok">Your answer, correct</Badge>}
                        {isCorrect && !isChosen && <Badge tone="ok">Correct answer</Badge>}
                        {!isCorrect && isChosen && <Badge tone="danger">Your answer</Badge>}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

export default function CheckResult() {
  const { slug } = useParams()
  const [form, setForm] = useState({ matric: '', email: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [data, setData] = useState(null)
  const [review, setReview] = useState(null)

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErr('') }

  async function look(e) {
    e.preventDefault()
    setBusy(true); setErr(''); setData(null); setReview(null)
    try {
      const args = { p_slug: slug, p_matric: form.matric, p_email: form.email }
      setData(await rpc('lookup_result', args))
      // The answer review is optional. If it is switched off or fails, the score still shows.
      try {
        const rv = await rpc('lookup_review', args)
        if (rv && rv.allowed && Array.isArray(rv.questions) && rv.questions.length) setReview(rv.questions)
      } catch {
        setReview(null)
      }
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

        {data && r?.released && review && <Review items={review} />}
      </div>
    </Shell>
  )
}
