import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Copy, Download, FileText, Megaphone, Pencil, Search, Send, Trash2 } from 'lucide-react'
import { Shell } from '../components/Shell'
import { Badge, Button, Card, EmptyState, Input, Modal, Spinner, Textarea, useToast } from '../components/ui'
import { supabase } from '../lib/supabase'
import { downloadResultsPdf } from '../lib/pdf'
import { REASON_LABEL, TYPE_LABEL, cn, copyText, downloadCSV, fmtDate, fmtNum, testLink } from '../lib/utils'

const minutesBetween = (a, b) => (a && b ? Math.max(1, Math.round((new Date(b) - new Date(a)) / 60000)) : null)

function Stat({ label, value }) {
  return (
    <Card className="p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 font-display text-3xl font-semibold">{value}</div>
    </Card>
  )
}

const TABS = [['students', 'Students'], ['questions', 'Question analysis'], ['announce', 'Announcements']]

export default function Results() {
  const { id } = useParams()
  const toast = useToast()
  const [test, setTest] = useState(null)
  const [rows, setRows] = useState(null)
  const [questions, setQuestions] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('students')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('recent')
  const [releaseOpen, setReleaseOpen] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const [reset, setReset] = useState(null)
  const [note, setNote] = useState('')
  const [posting, setPosting] = useState(false)

  const load = useCallback(async () => {
    await supabase.rpc('finalize_expired', { p_test: id })
    const [t, a, qs, an] = await Promise.all([
      supabase.from('tests').select('*').eq('id', id).single(),
      supabase.from('attempts')
        .select('id,student_name,matric,department,email,started_at,submitted_at,submit_reason,score,total,percentage,violations,detail')
        .eq('test_id', id).order('started_at', { ascending: false }),
      supabase.from('questions').select('id,text,type,position').eq('test_id', id).order('position'),
      supabase.from('announcements').select('*').eq('test_id', id).order('created_at', { ascending: false }),
    ])
    if (t.error || a.error) return setErr((t.error || a.error).message)
    setTest(t.data); setRows(a.data); setQuestions(qs.data || []); setAnnouncements(an.data || [])
  }, [id])

  useEffect(() => {
    load()
    const timer = setInterval(load, 15000) // keeps the dashboard live
    return () => clearInterval(timer)
  }, [load])

  const done = useMemo(() => (rows || []).filter((r) => r.submitted_at), [rows])
  const passMark = test?.pass_mark

  const stats = useMemo(() => {
    if (!done.length) return null
    const p = done.map((r) => Number(r.percentage))
    const bins = Array(10).fill(0)
    p.forEach((v) => { bins[Math.min(9, Math.floor(v / 10))]++ })
    return {
      avg: (p.reduce((s, v) => s + v, 0) / p.length).toFixed(1),
      high: Math.max(...p).toFixed(1),
      low: Math.min(...p).toFixed(1),
      passRate: passMark != null ? Math.round((p.filter((v) => v >= passMark).length / p.length) * 100) : null,
      bins,
    }
  }, [done, passMark])

  const analysis = useMemo(() => {
    const map = {}
    questions.forEach((x) => { map[x.id] = { q: x, seen: 0, right: 0, wrong: 0, skipped: 0 } })
    done.forEach((a) => {
      Object.entries(a.detail || {}).forEach(([qid, d]) => {
        const m = map[qid]
        if (!m) return
        m.seen++
        if (d.c === true) m.right++
        else if (d.c === false) m.wrong++
        else m.skipped++
      })
    })
    return Object.values(map)
      .filter((m) => m.seen > 0)
      .map((m) => ({ ...m, pct: (m.right / m.seen) * 100 }))
      .sort((a, b) => a.pct - b.pct)
  }, [questions, done])

  const shown = useMemo(() => {
    let l = rows || []
    const s = q.trim().toLowerCase()
    if (s) l = l.filter((r) => [r.student_name, r.matric, r.department, r.email].some((x) => x.toLowerCase().includes(s)))
    if (filter === 'submitted') l = l.filter((r) => r.submitted_at && r.submit_reason === 'manual')
    if (filter === 'auto') l = l.filter((r) => r.submitted_at && r.submit_reason !== 'manual')
    if (filter === 'left') l = l.filter((r) => ['left', 'fullscreen'].includes(r.submit_reason))
    if (filter === 'progress') l = l.filter((r) => !r.submitted_at)
    if (filter === 'pass') l = l.filter((r) => r.submitted_at && passMark != null && Number(r.percentage) >= passMark)
    if (filter === 'fail') l = l.filter((r) => r.submitted_at && passMark != null && Number(r.percentage) < passMark)
    const by = {
      recent: (a, b) => new Date(b.started_at) - new Date(a.started_at),
      name: (a, b) => a.student_name.localeCompare(b.student_name),
      high: (a, b) => (Number(b.percentage) || -1) - (Number(a.percentage) || -1),
      low: (a, b) => (Number(a.percentage) || 101) - (Number(b.percentage) || 101),
    }[sort]
    return [...l].sort(by)
  }, [rows, q, filter, sort, passMark])

  const verdict = (r) => (passMark == null || !r.submitted_at ? '' : Number(r.percentage) >= passMark ? 'Pass' : 'Fail')

  function exportCsv() {
    const head = ['Name', 'Matric number', 'Department', 'Email', 'Score', 'Out of', 'Percentage', 'Result', 'Status', 'Times left page', 'Started', 'Submitted', 'Minutes taken']
    const body = done.map((r) => [
      r.student_name, r.matric, r.department, r.email, r.score, r.total, r.percentage, verdict(r),
      REASON_LABEL[r.submit_reason] || r.submit_reason, r.violations,
      fmtDate(r.started_at), fmtDate(r.submitted_at), minutesBetween(r.started_at, r.submitted_at),
    ])
    downloadCSV(`${(test.course_code || test.title).replace(/[^\w-]+/g, '_')}_results.csv`, [head, ...body])
  }

  async function exportPdf() {
    try {
      await downloadResultsPdf({
        title: test.title, course: test.course_code,
        rows: [...done].sort((a, b) => a.student_name.localeCompare(b.student_name)).map((r) => [
          r.student_name, r.matric, r.department, `${fmtNum(r.score)} / ${fmtNum(r.total)}`,
          `${Number(r.percentage).toFixed(1)}`,
          [REASON_LABEL[r.submit_reason], verdict(r)].filter(Boolean).join(', '),
        ]),
      })
    } catch { toast('Could not create the PDF.', 'err') }
  }

  async function release() {
    setReleasing(true)
    const { error } = await supabase.from('tests').update({ scores_released: true }).eq('id', id)
    if (error) { setReleasing(false); return toast(error.message, 'err') }
    const { data, error: fe } = await supabase.functions.invoke('send-results', { body: { action: 'release', test_id: id } })
    setReleasing(false); setReleaseOpen(false)
    toast(fe ? 'Scores released. Emails are not set up, so students can check their results on the site.' : `Scores released. ${data?.sent ?? 0} email(s) sent.`, 'ok')
    load()
  }

  async function allowRetake() {
    const { error } = await supabase.from('attempts').delete().eq('id', reset.id)
    if (error) return toast(error.message, 'err')
    toast('Attempt removed. The student can start again.')
    setReset(null); load()
  }

  async function postNote() {
    if (!note.trim()) return
    setPosting(true)
    const { error } = await supabase.from('announcements').insert({ test_id: id, message: note.trim() })
    setPosting(false)
    if (error) return toast(error.message, 'err')
    setNote(''); toast('Announcement posted'); load()
  }
  async function deleteNote(nid) {
    const { error } = await supabase.from('announcements').delete().eq('id', nid)
    if (error) return toast(error.message, 'err')
    load()
  }

  if (err) return <Shell><p className="text-danger">{err}</p></Shell>
  if (!test || !rows) return <Shell><div className="flex justify-center py-24"><Spinner className="h-6 w-6 text-brand" /></div></Shell>

  const holding = test.release_mode === 'manual' && !test.scores_released
  const maxBin = Math.max(1, ...(stats?.bins || [1]))

  return (
    <Shell wide>
      <Link to="/lecturer" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" />Back to my tests
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">{test.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            {test.course_code && <Badge tone="brand">{test.course_code}</Badge>}
            <span>Access code</span>
            <span className="font-mono font-semibold tracking-widest text-text">{test.access_code}</span>
            <button className="inline-flex items-center gap-1 text-brand hover:underline" onClick={async () => toast((await copyText(testLink(test.slug))) ? 'Link copied' : 'Could not copy', 'ok')}>
              <Copy className="h-3.5 w-3.5" />Copy link
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/lecturer/tests/${id}`}><Button variant="secondary"><Pencil className="h-4 w-4" />Edit test</Button></Link>
          <Button variant="secondary" onClick={exportCsv} disabled={!done.length}><Download className="h-4 w-4" />Excel (CSV)</Button>
          <Button variant="secondary" onClick={exportPdf} disabled={!done.length}><FileText className="h-4 w-4" />PDF</Button>
          {holding && <Button onClick={() => setReleaseOpen(true)}><Send className="h-4 w-4" />Release scores</Button>}
        </div>
      </div>

      {holding && (
        <p className="mt-4 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold">
          Scores are on hold. Students see a receipt only. Release them when you are ready.
        </p>
      )}

      <div className={cn('mt-6 grid grid-cols-2 gap-3', stats?.passRate != null ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
        <Stat label="Submissions" value={done.length} />
        <Stat label="Average" value={stats ? `${stats.avg}%` : '-'} />
        <Stat label="Highest" value={stats ? `${stats.high}%` : '-'} />
        <Stat label="Lowest" value={stats ? `${stats.low}%` : '-'} />
        {stats?.passRate != null && <Stat label={`Passed (${passMark}%+)`} value={`${stats.passRate}%`} />}
      </div>

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map(([k, label]) => (
          <button
            key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn('whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors', tab === k ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-text')}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'students' && (
        <>
          {stats && (
            <Card className="mt-4 p-5">
              <h2 className="font-display text-lg font-semibold">Score distribution</h2>
              <div className="mt-4 flex h-36 items-end gap-1.5 sm:gap-2" role="img" aria-label="Number of students in each 10 percent score band">
                {stats.bins.map((n, i) => (
                  <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <span className="text-xs text-muted">{n || ''}</span>
                    <div className="w-full rounded-t bg-brand/80" style={{ height: `${(n / maxBin) * 100}%`, minHeight: n ? 4 : 0 }} />
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex gap-1.5 sm:gap-2">
                {stats.bins.map((_, i) => <span key={i} className="flex-1 text-center text-[10px] text-muted sm:text-xs">{i * 10}{i === 9 ? '+' : ''}</span>)}
              </div>
            </Card>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input className="pl-9" placeholder="Search name, matric number, department" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search results" />
            </div>
            <select aria-label="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm">
              <option value="all">All students</option>
              <option value="submitted">Submitted by student</option>
              <option value="auto">Auto-submitted</option>
              <option value="left">Left the page</option>
              <option value="progress">In progress</option>
              {passMark != null && <option value="pass">Passed</option>}
              {passMark != null && <option value="fail">Failed</option>}
            </select>
            <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm">
              <option value="recent">Newest first</option>
              <option value="name">Name A to Z</option>
              <option value="high">Highest score</option>
              <option value="low">Lowest score</option>
            </select>
          </div>

          {rows.length === 0 ? (
            <div className="mt-4"><EmptyState title="No one has started yet">Share the link and access code. Results appear here as students submit.</EmptyState></div>
          ) : (
            <Card className="mt-4 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="border-b border-line bg-brandsoft/60 text-muted">
                    <tr>{['Student', 'Matric number', 'Department', 'Score', 'Time', 'Status', ''].map((h, i) => <th key={i} className="px-4 py-3 font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {shown.map((r) => {
                      const mins = minutesBetween(r.started_at, r.submitted_at)
                      const auto = r.submitted_at && r.submit_reason !== 'manual'
                      const v = verdict(r)
                      return (
                        <tr key={r.id} className="align-top">
                          <td className="px-4 py-3"><div className="font-medium">{r.student_name}</div><div className="text-xs text-muted">{r.email}</div></td>
                          <td className="px-4 py-3 font-mono text-xs">{r.matric}</td>
                          <td className="px-4 py-3">{r.department}</td>
                          <td className="px-4 py-3">
                            {r.submitted_at ? (
                              <>
                                <div className="font-semibold">{fmtNum(r.score)} / {fmtNum(r.total)}</div>
                                <div className="flex items-center gap-1.5 text-xs text-muted">
                                  {Number(r.percentage).toFixed(1)}%
                                  {v && <Badge tone={v === 'Pass' ? 'ok' : 'danger'}>{v}</Badge>}
                                </div>
                              </>
                            ) : '-'}
                          </td>
                          <td className="px-4 py-3">{mins ? `${mins} min` : '-'}</td>
                          <td className="px-4 py-3">
                            {!r.submitted_at ? <Badge tone="gold">In progress</Badge>
                              : auto ? <Badge tone="danger">{REASON_LABEL[r.submit_reason]}</Badge>
                              : <Badge tone="ok">Submitted</Badge>}
                            {r.violations > 0 && <div className="mt-1 text-xs text-muted">Left page {r.violations}x</div>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => setReset(r)} aria-label={`Allow ${r.student_name} to retake`} title="Remove attempt so the student can retake" className="rounded-md p-1.5 text-muted hover:bg-danger/10 hover:text-danger">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                    {shown.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">No students match your search.</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {tab === 'questions' && (
        <div className="mt-4">
          {analysis.length === 0 ? (
            <EmptyState title="Nothing to analyse yet">Once students submit, you will see which questions were answered correctly the least.</EmptyState>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">Hardest questions first. Based on {done.length} submission{done.length === 1 ? '' : 's'}.</p>
              <div className="space-y-3">
                {analysis.map((m, i) => (
                  <Card key={m.q.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium">{m.q.text}</div>
                        <div className="mt-0.5 text-xs text-muted">{TYPE_LABEL[m.q.type]}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={cn('font-display text-2xl font-semibold', m.pct < 40 ? 'text-danger' : m.pct < 70 ? 'text-gold' : 'text-ok')}>{Math.round(m.pct)}%</div>
                        <div className="text-xs text-muted">correct</div>
                      </div>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-line" aria-hidden>
                      <div className={cn('h-full', m.pct < 40 ? 'bg-danger' : m.pct < 70 ? 'bg-gold' : 'bg-ok')} style={{ width: `${m.pct}%` }} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      <span>{m.right} right</span><span>{m.wrong} wrong</span><span>{m.skipped} not answered</span>
                      <span>Seen by {m.seen}</span>
                      {i < 3 && m.pct < 60 && <Badge tone="danger">Most missed</Badge>}
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'announce' && (
        <div className="mt-4 space-y-4">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Megaphone className="h-5 w-5 text-brand" />Post an announcement</h2>
            <p className="mt-1 text-sm text-muted">Students see it on the test page before they start, for example a venue change or a reminder.</p>
            <Textarea className="mt-3" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Write your message" aria-label="Announcement" />
            <div className="mt-3 flex justify-end"><Button loading={posting} onClick={postNote} disabled={!note.trim()}>Post announcement</Button></div>
          </Card>
          {announcements.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">No announcements yet.</p>
          ) : announcements.map((a) => (
            <Card key={a.id} className="flex items-start justify-between gap-3 p-4">
              <div>
                <p className="whitespace-pre-line">{a.message}</p>
                <p className="mt-1 text-xs text-muted">{fmtDate(a.created_at)}</p>
              </div>
              <Button variant="dangerSoft" size="sm" aria-label="Delete announcement" onClick={() => deleteNote(a.id)}><Trash2 className="h-4 w-4" /></Button>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={releaseOpen} onClose={() => setReleaseOpen(false)} title="Release scores?"
        footer={<>
          <Button variant="secondary" onClick={() => setReleaseOpen(false)}>Not yet</Button>
          <Button loading={releasing} onClick={release}>Release scores</Button>
        </>}
      >
        Students will be able to see their scores, check them using their matric number, and download a result slip. If
        email is set up, everyone who has submitted is also emailed. Students who submit later see their score immediately.
      </Modal>

      <Modal
        open={!!reset} onClose={() => setReset(null)} title="Remove this attempt?"
        footer={<>
          <Button variant="secondary" onClick={() => setReset(null)}>Keep it</Button>
          <Button variant="danger" onClick={allowRetake}>Remove attempt</Button>
        </>}
      >
        {reset?.student_name} ({reset?.matric}) will lose this attempt and score, and can start the test again.
      </Modal>
    </Shell>
  )
}
