import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock, Grid3x3, Maximize, Send } from 'lucide-react'
import { Shell } from '../components/Shell'
import { Alert, Button, Card, Modal, Spinner } from '../components/ui'
import { rpc, rpcKeepalive, supabase } from '../lib/supabase'
import { cn, mmss, supportsFullscreen } from '../lib/utils'

const LETTERS = ['A', 'B', 'C', 'D', 'E']

const REASON_TEXT = {
  left: 'Your test was submitted automatically because you left the test page.',
  fullscreen: 'Your test was submitted automatically because you exited fullscreen.',
  timeup: 'Time ran out, so your test was submitted automatically.',
  expired: 'Your test session ended before it was submitted, so your saved answers were marked.',
}

export default function Exam() {
  const { slug } = useParams()
  const nav = useNavigate()
  const loc = useLocation()
  const storeKey = `ful_attempt_${slug}`

  const [phase, setPhase] = useState('loading') // loading | gate | running | finalizing | done | error
  const [data, setData] = useState(null)
  const [answers, setAnswers] = useState({})
  const [cur, setCur] = useState(0)
  const [left, setLeft] = useState(0)
  const [result, setResult] = useState(null)
  const [warn, setWarn] = useState(null)
  const [saveState, setSaveState] = useState('saved')
  const [confirm, setConfirm] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [err, setErr] = useState('')

  // Everything the event handlers need lives in a ref so they never go stale
  const r = useRef({ submitted: false, violations: 0, answers: {}, phase: 'loading' })
  useEffect(() => { r.current.phase = phase }, [phase])

  /* ---------- load ---------- */
  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        let p = loc.state?.payload
        if (!p) {
          const saved = JSON.parse(localStorage.getItem(storeKey) || 'null')
          if (!saved) throw new Error('There is no test in progress for this link. Go back and enter your details.')
          p = await rpc('get_attempt', { p_attempt: saved.id, p_token: saved.token })
        }
        if (dead) return
        const s = r.current
        s.attempt = p.attempt_id
        s.token = p.token
        s.violations = p.violations || 0
        s.answers = p.answers || {}
        s.offset = new Date(p.server_now).getTime() - Date.now()
        s.deadline = new Date(p.deadline_at).getTime()
        s.warnEnabled = p.warn_before_submit
        setData(p)
        setAnswers(s.answers)
        if (p.submitted) {
          localStorage.removeItem(storeKey)
          setResult(p.result)
          setPhase('done')
        } else {
          setPhase(!supportsFullscreen() || document.fullscreenElement ? 'running' : 'gate')
        }
      } catch (e) {
        if (!dead) { setErr(e.message); setPhase('error') }
      }
    })()
    return () => { dead = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------- submit (idempotent on the server, retried until it lands) ---------- */
  const submit = useCallback(async (why) => {
    const s = r.current
    if (s.submitted) return
    s.submitted = true
    s.why = why
    clearTimeout(s.saveT)
    setPhase('finalizing'); setConfirm(false); setNavOpen(false); setWarn(null)
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})

    for (let i = 0; i < 40; i++) {
      try {
        const res = await rpcKeepalive('submit_attempt', {
          p_attempt: s.attempt, p_token: s.token, p_answers: s.answers, p_reason: why,
        })
        localStorage.removeItem(storeKey)
        setResult(res)
        setPhase('done')
        // Email the lecturer and the student. Failure here must never block the student.
        supabase.functions.invoke('send-results', { body: { action: 'submission', attempt_id: s.attempt, token: s.token } }).catch(() => {})
        return
      } catch (e) {
        if (e.definitive) { setErr(e.message); setPhase('error'); return }
        await new Promise((ok) => setTimeout(ok, 2500))
      }
    }
    setErr('We could not reach the server. Keep this page open and check your connection.')
    setPhase('error')
  }, [storeKey])

  /* ---------- autosave ---------- */
  const saveNow = useCallback(async () => {
    const s = r.current
    if (s.submitted || !s.attempt) return
    setSaveState('saving')
    try {
      await rpc('save_answers', { p_attempt: s.attempt, p_token: s.token, p_answers: s.answers, p_violations: s.violations || 0 })
      setSaveState('saved')
    } catch { setSaveState('offline') }
  }, [])

  useEffect(() => {
    if (phase !== 'running') return
    const t = setInterval(saveNow, 20000)
    return () => clearInterval(t)
  }, [phase, saveNow])

  function choose(qid, idx) {
    const s = r.current
    s.answers = { ...s.answers, [qid]: idx }
    setAnswers(s.answers)
    setSaveState('saving')
    clearTimeout(s.saveT)
    s.saveT = setTimeout(saveNow, 700)
  }
  function clearAnswer(qid) {
    const s = r.current
    const next = { ...s.answers }
    delete next[qid]
    s.answers = next
    setAnswers(next)
    clearTimeout(s.saveT)
    s.saveT = setTimeout(saveNow, 700)
  }

  /* ---------- timer (driven by the server's clock) ---------- */
  useEffect(() => {
    if (phase !== 'running' && phase !== 'gate') return
    const tick = () => {
      const s = r.current
      const remaining = (s.deadline - (Date.now() + s.offset)) / 1000
      setLeft(remaining)
      if (remaining <= 0) submit('timeup')
    }
    tick()
    const t = setInterval(tick, 500)
    return () => clearInterval(t)
  }, [phase, submit])

  /* ---------- leave detection ---------- */
  const onLeave = useCallback((kind) => {
    const s = r.current
    if (s.submitted || s.phase !== 'running') return
    const now = Date.now()
    if (now - (s.lastLeave || 0) < 1500) return
    s.lastLeave = now
    s.violations = (s.violations || 0) + 1
    if (s.warnEnabled && s.violations === 1) {
      setWarn(kind)
      saveNow()
      return
    }
    submit(kind === 'fullscreen' ? 'fullscreen' : 'left')
  }, [submit, saveNow])

  useEffect(() => {
    if (phase !== 'running') return
    const stop = (e) => e.preventDefault()
    const onVis = () => { if (document.visibilityState === 'hidden') onLeave('left') }
    const onBlur = () => setTimeout(() => { if (!document.hasFocus()) onLeave('left') }, 400)
    const onFs = () => { if (supportsFullscreen() && !document.fullscreenElement) onLeave('fullscreen') }
    const onHide = () => onLeave('left')
    const onKey = (e) => {
      const k = e.key.toLowerCase()
      const mod = e.ctrlKey || e.metaKey
      if (e.key === 'F12' || e.key === 'PrintScreen' || (mod && ['c', 'v', 'x', 'a', 'p', 's', 'u'].includes(k)) || (mod && e.shiftKey && ['i', 'j', 'c'].includes(k))) {
        e.preventDefault()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('blur', onBlur)
    window.addEventListener('pagehide', onHide)
    document.addEventListener('fullscreenchange', onFs)
    document.addEventListener('keydown', onKey)
    ;['copy', 'cut', 'paste', 'contextmenu', 'selectstart', 'dragstart'].forEach((ev) => document.addEventListener(ev, stop))
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('fullscreenchange', onFs)
      document.removeEventListener('keydown', onKey)
      ;['copy', 'cut', 'paste', 'contextmenu', 'selectstart', 'dragstart'].forEach((ev) => document.removeEventListener(ev, stop))
    }
  }, [phase, onLeave])

  const enterFullscreen = () => {
    if (supportsFullscreen() && !document.fullscreenElement) {
      return document.documentElement.requestFullscreen().catch(() => {})
    }
  }

  /* ---------- screens ---------- */
  if (phase === 'loading') {
    return <Shell bare><div className="flex min-h-[60vh] items-center justify-center"><Spinner className="h-7 w-7 text-brand" /></div></Shell>
  }

  if (phase === 'error') {
    return (
      <Shell bare>
        <div className="mx-auto max-w-md py-16 text-center">
          <h1 className="font-display text-3xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-muted">{err}</p>
          <Button className="mt-6" variant="secondary" onClick={() => nav(`/t/${slug}`)}>Back to the test page</Button>
        </div>
      </Shell>
    )
  }

  if (phase === 'finalizing') {
    return (
      <Shell bare>
        <div className="mx-auto max-w-md py-24 text-center">
          <Spinner className="mx-auto h-8 w-8 text-brand" />
          <h1 className="mt-5 font-display text-2xl font-semibold">Submitting your test</h1>
          <p className="mt-2 text-sm text-muted">Keep this page open until it finishes.</p>
        </div>
      </Shell>
    )
  }

  if (phase === 'done') {
    const reason = result?.reason
    return (
      <Shell bare>
        <div className="mx-auto max-w-lg py-10">
          <Card className="p-6 text-center sm:p-8">
            <CheckCircle2 className="mx-auto h-10 w-10 text-ok" />
            <h1 className="mt-3 font-display text-3xl font-semibold">Test submitted</h1>
            {data && <p className="mt-1 text-muted">{data.title}</p>}

            {reason && REASON_TEXT[reason] && (
              <div className="mt-5 text-left"><Alert tone="gold">{REASON_TEXT[reason]}</Alert></div>
            )}

            {result?.released ? (
              <div className="mt-6 rounded-xl border border-line py-6">
                <div className="font-display text-5xl font-semibold">{Number(result.percentage).toFixed(0)}%</div>
                <div className="mt-1 text-muted">{result.score} of {result.total} correct</div>
              </div>
            ) : (
              <p className="mt-6 rounded-xl border border-line px-4 py-5 text-sm text-muted">
                Your lecturer will release scores later. You will get yours by email when they do.
              </p>
            )}
            {data?.email && (
              <p className="mt-5 text-sm text-muted">
                {result?.released ? 'A copy has been sent to ' : 'A receipt has been sent to '}
                <b className="text-text">{data.email}</b>.
              </p>
            )}
            <Button className="mt-6" variant="secondary" onClick={() => nav('/')}>Back to home</Button>
          </Card>
        </div>
      </Shell>
    )
  }

  /* ---------- running / gate ---------- */
  const paper = data.paper
  const q = paper[cur]
  const answered = paper.filter((p) => answers[p.id] !== undefined).length
  const unanswered = paper.map((p, i) => ({ p, i })).filter(({ p }) => answers[p.id] === undefined)
  const urgent = left <= 60
  const soon = left <= 300

  const Navigator = ({ onPick }) => (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {paper.map((p, i) => {
          const done = answers[p.id] !== undefined
          return (
            <button
              key={p.id}
              onClick={() => { setCur(i); onPick?.() }}
              aria-label={`Question ${i + 1}${done ? ', answered' : ', not answered'}`}
              aria-current={i === cur}
              className={cn(
                'aspect-square rounded-lg border text-sm font-medium transition-colors',
                i === cur && 'ring-2 ring-brand ring-offset-2 ring-offset-surface',
                done ? 'border-brand bg-brand text-brandink' : 'border-line hover:bg-brandsoft',
              )}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-brand" />Answered</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-line" />Not answered</span>
      </div>
    </div>
  )

  return (
    <Shell bare wide>
      <div className="no-select -mt-4">
        <header className="sticky top-0 z-30 -mx-4 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-lg font-semibold">{data.title}</div>
              <div className="truncate text-xs text-muted">
                {data.student_name}{data.course_code ? `, ${data.course_code}` : ''}
              </div>
            </div>
            <span className="hidden text-xs text-muted sm:inline" aria-live="polite">
              {saveState === 'saving' ? 'Saving...' : saveState === 'offline' ? 'Offline. Retrying...' : 'Answers saved'}
            </span>
            <div
              role="timer"
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-lg font-semibold tabular-nums',
                urgent ? 'border-danger bg-danger/10 text-danger' : soon ? 'border-gold bg-gold/10 text-gold' : 'border-line',
              )}
            >
              <Clock className="h-4 w-4" />{mmss(left)}
            </div>
          </div>
          <div className="mx-auto mt-2 h-1.5 max-w-6xl overflow-hidden rounded-full bg-line" aria-label={`${answered} of ${paper.length} answered`}>
            <div className="h-full bg-brand transition-all" style={{ width: `${(answered / paper.length) * 100}%` }} />
          </div>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_290px]">
          <div>
            <Card className="p-5 sm:p-7">
              <div className="text-sm text-muted">Question {cur + 1} of {paper.length}</div>
              <p className="mt-2 whitespace-pre-line text-lg leading-relaxed sm:text-xl">{q.text}</p>
              {q.image_url && <img src={q.image_url} alt="" draggable={false} className="mt-4 max-h-72 rounded-lg border border-line" />}

              <div className="mt-6 space-y-3" role="radiogroup" aria-label="Answer options">
                {q.options.map((o, i) => {
                  const on = answers[q.id] === i
                  return (
                    <button
                      key={i}
                      role="radio"
                      aria-checked={on}
                      onClick={() => choose(q.id, i)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-colors sm:p-4',
                        on ? 'border-brand bg-brandsoft' : 'border-line hover:bg-brandsoft/60',
                      )}
                    >
                      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold', on ? 'border-brand bg-brand text-brandink' : 'border-line text-muted')}>
                        {LETTERS[i]}
                      </span>
                      <span className="leading-snug">{o}</span>
                    </button>
                  )
                })}
              </div>
              {answers[q.id] !== undefined && (
                <button onClick={() => clearAnswer(q.id)} className="mt-3 text-sm text-muted underline-offset-2 hover:text-text hover:underline">Clear my answer</button>
              )}
            </Card>

            <div className="mt-4 flex items-center justify-between gap-3">
              <Button variant="secondary" disabled={cur === 0} onClick={() => setCur(cur - 1)}><ChevronLeft className="h-4 w-4" />Previous</Button>
              <Button variant="secondary" className="lg:hidden" onClick={() => setNavOpen(true)}><Grid3x3 className="h-4 w-4" />Questions</Button>
              {cur < paper.length - 1
                ? <Button onClick={() => setCur(cur + 1)}>Next<ChevronRight className="h-4 w-4" /></Button>
                : <Button onClick={() => setConfirm(true)}><Send className="h-4 w-4" />Review and submit</Button>}
            </div>
          </div>

          <aside className="hidden lg:block">
            <Card className="sticky top-24 p-4">
              <h2 className="mb-3 font-display text-lg font-semibold">Questions</h2>
              <Navigator />
              <Button className="mt-5 w-full" onClick={() => setConfirm(true)}><Send className="h-4 w-4" />Submit test</Button>
            </Card>
          </aside>
        </div>
      </div>

      {/* Mobile question grid */}
      <Modal open={navOpen} onClose={() => setNavOpen(false)} title="Questions"
        footer={<Button onClick={() => { setNavOpen(false); setConfirm(true) }}><Send className="h-4 w-4" />Submit test</Button>}>
        <Navigator onPick={() => setNavOpen(false)} />
      </Modal>

      {/* Submit confirmation with review */}
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Submit your test?"
        footer={<>
          <Button variant="secondary" onClick={() => setConfirm(false)}>Keep working</Button>
          <Button onClick={() => submit('manual')}>Submit now</Button>
        </>}>
        <p>You answered <b>{answered}</b> of <b>{paper.length}</b> questions. You cannot change your answers after submitting.</p>
        {unanswered.length > 0 && (
          <div className="mt-3">
            <p className="text-muted">Not answered yet:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {unanswered.map(({ i }) => (
                <button key={i} onClick={() => { setCur(i); setConfirm(false) }} className="rounded-md border border-line px-2.5 py-1 text-sm hover:bg-brandsoft">
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Warning after the first time leaving (only if the lecturer enabled it) */}
      <Modal open={phase === 'running' && !!warn} locked title="You left the test page"
        footer={<Button onClick={async () => { await enterFullscreen(); setWarn(null) }}>Return to the test</Button>}>
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
          <p>
            This is your one warning. If you leave the page, switch apps, or exit fullscreen again, your test will be
            submitted immediately.
          </p>
        </div>
      </Modal>

      {/* Gate: shown when resuming, because fullscreen needs a tap */}
      <Modal open={phase === 'gate'} locked title="Continue your test"
        footer={<Button onClick={async () => { await enterFullscreen(); setPhase('running') }}><Maximize className="h-4 w-4" />Enter fullscreen and continue</Button>}>
        <p>
          Your test is still running and your saved answers are intact. The timer has kept counting
          ({mmss(left)} left). The test must be taken in fullscreen.
        </p>
      </Modal>
    </Shell>
  )
}
