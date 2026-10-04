import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, Clock, Copy, ListChecks, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { Shell } from '../components/Shell'
import { Badge, Button, Card, EmptyState, Modal, Spinner, useToast } from '../components/ui'
import { supabase } from '../lib/supabase'
import { copyText, fmtDate, testLink, testStatus } from '../lib/utils'

const STATUS = {
  open: ['ok', 'Open'],
  upcoming: ['gold', 'Opens later'],
  closed: ['neutral', 'Closed'],
}

export default function Dashboard() {
  const toast = useToast()
  const [tests, setTests] = useState(null)
  const [err, setErr] = useState('')
  const [del, setDel] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('tests')
      .select('*, questions(count), attempts(count)')
      .order('created_at', { ascending: false })
    if (error) setErr(error.message)
    else setTests(data)
  }, [])

  useEffect(() => { load() }, [load])

  async function copy(text, what) {
    toast((await copyText(text)) ? `${what} copied` : 'Could not copy. Select and copy it manually.', 'ok')
  }

  async function remove() {
    setDeleting(true)
    const { error } = await supabase.from('tests').delete().eq('id', del.id)
    setDeleting(false)
    if (error) return toast(error.message, 'err')
    toast('Test deleted')
    setDel(null)
    load()
  }

  return (
    <Shell wide>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">My tests</h1>
          <p className="mt-1 text-sm text-muted">Share the link and access code with your students.</p>
        </div>
        <Link to="/lecturer/tests/new">
          <Button size="lg"><Plus className="h-4 w-4" />New test</Button>
        </Link>
      </div>

      {err && <p className="text-danger">{err}</p>}
      {!tests && !err && <div className="flex justify-center py-20"><Spinner className="h-6 w-6 text-brand" /></div>}

      {tests && tests.length === 0 && (
        <EmptyState
          title="No tests yet"
          action={<Link to="/lecturer/tests/new"><Button><Plus className="h-4 w-4" />Create your first test</Button></Link>}
        >
          Add your questions, set a time limit, and share the link with your class.
        </EmptyState>
      )}

      <div className="space-y-4">
        {tests?.map((t) => {
          const [tone, label] = STATUS[testStatus(t)]
          const qn = t.questions?.[0]?.count ?? 0
          const an = t.attempts?.[0]?.count ?? 0
          return (
            <Card key={t.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl font-semibold">{t.title}</h2>
                    <Badge tone={tone}>{label}</Badge>
                    {t.course_code && <Badge tone="brand">{t.course_code}</Badge>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
                    <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" />{t.duration_minutes} minutes</span>
                    <span className="flex items-center gap-1.5"><ListChecks className="h-4 w-4" />{qn} questions</span>
                    <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{an} submissions</span>
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    Opens: {fmtDate(t.opens_at)}. Closes: {fmtDate(t.closes_at)}.
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link to={`/lecturer/tests/${t.id}/results`}><Button variant="secondary" size="sm"><BarChart3 className="h-4 w-4" />Results</Button></Link>
                  <Link to={`/lecturer/tests/${t.id}`}><Button variant="secondary" size="sm"><Pencil className="h-4 w-4" />Edit</Button></Link>
                  <Button variant="dangerSoft" size="sm" aria-label={`Delete ${t.title}`} onClick={() => setDel(t)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 rounded-lg bg-brandsoft/60 p-3 sm:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="text-xs text-muted">Student link</div>
                  <div className="truncate text-sm font-medium">{testLink(t.slug)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div>
                    <div className="text-xs text-muted">Access code</div>
                    <div className="font-mono text-sm font-semibold tracking-widest">{t.access_code}</div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => copy(`Link: ${testLink(t.slug)}\nAccess code: ${t.access_code}`, 'Link and code')}>
                    <Copy className="h-4 w-4" />Copy both
                  </Button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <Modal
        open={!!del}
        onClose={() => setDel(null)}
        title="Delete this test?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDel(null)}>Keep test</Button>
            <Button variant="danger" loading={deleting} onClick={remove}>Delete test</Button>
          </>
        }
      >
        <p>
          <b>{del?.title}</b> and all of its questions and student results will be removed permanently. Download the
          results first if you need them.
        </p>
      </Modal>
    </Shell>
  )
}
