import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Library, Plus, RefreshCw, Save } from 'lucide-react'
import { Shell } from '../components/Shell'
import { Alert, Button, Card, Field, Input, Modal, Spinner, Switch, Textarea, useToast } from '../components/ui'
import QuestionEditor, { blankQuestion, validateQuestion } from '../components/QuestionEditor'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fromLocalInput, randomCode, toLocalInput } from '../lib/utils'

const EMPTY = {
  title: '', course_code: '', instructions: '', duration_minutes: 30,
  opens_at: '', closes_at: '', access_code: '',
  shuffle_questions: true, shuffle_options: true, warn_before_submit: false,
  one_attempt: true, release_mode: 'instant', notify_email: '',
}

export default function TestEditor() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const [form, setForm] = useState({ ...EMPTY, access_code: randomCode() })
  const [questions, setQuestions] = useState([blankQuestion()])
  const [loading, setLoading] = useState(!!id)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [attemptCount, setAttemptCount] = useState(0)
  const [bankOpen, setBankOpen] = useState(false)
  const [bank, setBank] = useState(null)
  const [picked, setPicked] = useState({})

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!id) return
    ;(async () => {
      const [{ data: t, error }, { data: qs }, { count }] = await Promise.all([
        supabase.from('tests').select('*').eq('id', id).single(),
        supabase.from('questions').select('*').eq('test_id', id).order('position'),
        supabase.from('attempts').select('id', { count: 'exact', head: true }).eq('test_id', id),
      ])
      if (error || !t) { setErr('Test not found.'); setLoading(false); return }
      setForm({
        ...EMPTY, ...t,
        course_code: t.course_code || '', instructions: t.instructions || '', notify_email: t.notify_email || '',
        opens_at: toLocalInput(t.opens_at), closes_at: toLocalInput(t.closes_at),
      })
      setQuestions(qs?.length ? qs.map((q) => ({ ...q, image_url: q.image_url || '' })) : [blankQuestion()])
      setAttemptCount(count || 0)
      setLoading(false)
    })()
  }, [id])

  const updateQ = (i, q) => setQuestions((l) => l.map((x, j) => (j === i ? q : x)))
  const removeQ = (i) => setQuestions((l) => (l.length === 1 ? [blankQuestion()] : l.filter((_, j) => j !== i)))
  const moveQ = (i, d) => setQuestions((l) => {
    const a = [...l]; const j = i + d
    if (j < 0 || j >= a.length) return l
    ;[a[i], a[j]] = [a[j], a[i]]
    return a
  })

  async function saveToBank(q) {
    const msg = validateQuestion(q, questions.findIndex((x) => x.id === q.id) + 1)
    if (msg) return toast(msg, 'err')
    const { error } = await supabase.from('question_bank').insert({
      text: q.text.trim(), image_url: q.image_url || null,
      options: q.options.map((o) => o.trim()), correct_index: q.correct_index,
    })
    toast(error ? error.message : 'Saved to your question bank', error ? 'err' : 'ok')
  }

  async function openBank() {
    setBankOpen(true); setPicked({})
    const { data } = await supabase.from('question_bank').select('*').order('created_at', { ascending: false })
    setBank(data || [])
  }

  function importPicked() {
    const add = bank.filter((b) => picked[b.id]).map((b) => ({
      id: crypto.randomUUID(), text: b.text, image_url: b.image_url || '', options: b.options, correct_index: b.correct_index,
    }))
    setQuestions((l) => {
      const keep = l.length === 1 && !l[0].text.trim() ? [] : l
      return [...keep, ...add]
    })
    setBankOpen(false)
    toast(`${add.length} question${add.length === 1 ? '' : 's'} added`)
  }

  function validate() {
    if (!form.title.trim()) return 'Give the test a title.'
    const mins = Number(form.duration_minutes)
    if (!Number.isInteger(mins) || mins < 1 || mins > 600) return 'Time limit must be a whole number between 1 and 600 minutes.'
    if (form.opens_at && form.closes_at && new Date(form.closes_at) <= new Date(form.opens_at)) return 'The closing time must be after the opening time.'
    if (!form.access_code.trim()) return 'Add an access code.'
    for (let i = 0; i < questions.length; i++) {
      const m = validateQuestion(questions[i], i + 1)
      if (m) return m
    }
    return null
  }

  async function save() {
    setErr('')
    const problem = validate()
    if (problem) { setErr(problem); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        course_code: form.course_code.trim() || null,
        instructions: form.instructions.trim() || null,
        duration_minutes: Number(form.duration_minutes),
        opens_at: fromLocalInput(form.opens_at),
        closes_at: fromLocalInput(form.closes_at),
        access_code: form.access_code.trim().toUpperCase(),
        shuffle_questions: form.shuffle_questions,
        shuffle_options: form.shuffle_options,
        warn_before_submit: form.warn_before_submit,
        one_attempt: form.one_attempt,
        release_mode: form.release_mode,
        notify_email: form.notify_email.trim() || null,
      }
      let testId = id
      if (id) {
        const { error } = await supabase.from('tests').update(payload).eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('tests').insert(payload).select('id').single()
        if (error) throw error
        testId = data.id
      }

      const rows = questions.map((q, i) => ({
        id: q.id, test_id: testId, position: i,
        text: q.text.trim(), image_url: q.image_url || null,
        options: q.options.map((o) => o.trim()), correct_index: q.correct_index,
      }))
      const { error: qe } = await supabase.from('questions').upsert(rows, { onConflict: 'id' })
      if (qe) throw qe

      // Remove questions the lecturer deleted
      const { data: existing } = await supabase.from('questions').select('id').eq('test_id', testId)
      const keep = new Set(rows.map((r) => r.id))
      const gone = (existing || []).map((r) => r.id).filter((x) => !keep.has(x))
      if (gone.length) {
        const { error: de } = await supabase.from('questions').delete().in('id', gone)
        if (de) throw de
      }

      toast('Test saved')
      nav('/lecturer')
    } catch (e) {
      setErr(e.message || 'Could not save the test.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Shell><div className="flex justify-center py-24"><Spinner className="h-6 w-6 text-brand" /></div></Shell>

  return (
    <Shell>
      <Link to="/lecturer" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" />Back to my tests
      </Link>
      <h1 className="font-display text-3xl font-semibold">{id ? 'Edit test' : 'New test'}</h1>

      {err && <div className="mt-4"><Alert>{err}</Alert></div>}
      {attemptCount > 0 && (
        <div className="mt-4">
          <Alert tone="gold">
            {attemptCount} student{attemptCount === 1 ? ' has' : 's have'} already started this test. Changing questions or
            answers now will affect how new and unfinished attempts are marked.
          </Alert>
        </div>
      )}

      <div className="mt-6 space-y-6">
        <Card className="space-y-4 p-5">
          <h2 className="font-display text-xl font-semibold">Details</h2>
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <Field label="Test title"><Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="CSC 201 mid-semester test" /></Field>
            <Field label="Course code"><Input value={form.course_code} onChange={(e) => set('course_code', e.target.value)} placeholder="CSC 201" /></Field>
          </div>
          <Field label="Instructions for students" hint="Shown before the test starts.">
            <Textarea value={form.instructions} onChange={(e) => set('instructions', e.target.value)} placeholder="Answer all questions. Each question carries equal marks." />
          </Field>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="font-display text-xl font-semibold">Time and access</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Time limit (minutes)">
              <Input type="number" min={1} max={600} value={form.duration_minutes} onChange={(e) => set('duration_minutes', e.target.value)} />
            </Field>
            <Field label="Opens" hint="Leave empty to open immediately.">
              <Input type="datetime-local" value={form.opens_at} onChange={(e) => set('opens_at', e.target.value)} />
            </Field>
            <Field label="Closes" hint="Leave empty for no closing time.">
              <Input type="datetime-local" value={form.closes_at} onChange={(e) => set('closes_at', e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Access code" hint="Students need this code to start.">
              <div className="flex gap-2">
                <Input className="font-mono tracking-widest" value={form.access_code} onChange={(e) => set('access_code', e.target.value.toUpperCase())} />
                <Button variant="secondary" aria-label="Generate a new code" onClick={() => set('access_code', randomCode())}><RefreshCw className="h-4 w-4" /></Button>
              </div>
            </Field>
            <Field label="Send results to" hint="Leave empty to use your account email.">
              <Input type="email" value={form.notify_email} onChange={(e) => set('notify_email', e.target.value)} placeholder={user?.email} />
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-xl font-semibold">Test rules</h2>
          <div className="divide-y divide-line">
            <Switch label="Shuffle question order" hint="Every student gets the questions in a different order." checked={form.shuffle_questions} onChange={(v) => set('shuffle_questions', v)} />
            <Switch label="Shuffle answer options" hint="Options appear in a different order for each student." checked={form.shuffle_options} onChange={(v) => set('shuffle_options', v)} />
            <Switch label="Give one warning before auto-submit" hint="The first time a student leaves the page they get a warning. The second time the test is submitted. Useful on phones where a notification can interrupt the page." checked={form.warn_before_submit} onChange={(v) => set('warn_before_submit', v)} />
            <Switch label="One attempt per matric number" hint="A student cannot retake the test once they have submitted." checked={form.one_attempt} onChange={(v) => set('one_attempt', v)} />
            <Switch label="Release scores to students instantly" hint="Turn off to hold scores until you release them from the results page." checked={form.release_mode === 'instant'} onChange={(v) => set('release_mode', v ? 'instant' : 'manual')} />
          </div>
        </Card>

        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl font-semibold">Questions ({questions.length})</h2>
            <Button variant="secondary" size="sm" onClick={openBank}><Library className="h-4 w-4" />Add from question bank</Button>
          </div>
          <div className="space-y-4">
            {questions.map((q, i) => (
              <QuestionEditor
                key={q.id} q={q} index={i} total={questions.length}
                onChange={(nq) => updateQ(i, nq)} onRemove={() => removeQ(i)}
                onMove={(d) => moveQ(i, d)} onSaveToBank={saveToBank}
              />
            ))}
          </div>
          <Button variant="secondary" className="mt-4 w-full" onClick={() => setQuestions((l) => [...l, blankQuestion()])}>
            <Plus className="h-4 w-4" />Add question
          </Button>
        </div>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 mt-8 border-t border-line bg-surface/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-3">
          <Link to="/lecturer"><Button variant="ghost">Cancel</Button></Link>
          <Button size="lg" loading={saving} onClick={save}><Save className="h-4 w-4" />Save test</Button>
        </div>
      </div>

      <Modal
        open={bankOpen} onClose={() => setBankOpen(false)} title="Add from question bank" wide
        footer={<>
          <Button variant="secondary" onClick={() => setBankOpen(false)}>Cancel</Button>
          <Button onClick={importPicked} disabled={!Object.values(picked).some(Boolean)}>Add selected questions</Button>
        </>}
      >
        {!bank && <div className="flex justify-center py-8"><Spinner className="h-5 w-5 text-brand" /></div>}
        {bank?.length === 0 && <p className="py-6 text-center text-muted">Your question bank is empty. Use "Save to bank" on any question to build it.</p>}
        <div className="space-y-2">
          {bank?.map((b) => (
            <label key={b.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 hover:bg-brandsoft/60">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--brand))]" checked={!!picked[b.id]} onChange={(e) => setPicked((p) => ({ ...p, [b.id]: e.target.checked }))} />
              <span>
                <span className="block font-medium">{b.text}</span>
                <span className="mt-0.5 block text-xs text-muted">{b.options.length} options. Answer: {b.options[b.correct_index]}</span>
              </span>
            </label>
          ))}
        </div>
      </Modal>
    </Shell>
  )
}
