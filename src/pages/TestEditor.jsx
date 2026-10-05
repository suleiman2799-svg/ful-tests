import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, FileUp, Layers, Library, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { Shell } from '../components/Shell'
import { Alert, Button, Card, Field, Input, Modal, Spinner, Switch, Textarea, useToast } from '../components/ui'
import QuestionEditor, {
  answerSummary, blankQuestion, cleanQuestionFields, normalizeQuestion, validateQuestion,
} from '../components/QuestionEditor'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { importFile, TEMPLATE_CSV } from '../lib/importers'
import { TYPE_LABEL, fromLocalInput, randomCode, toLocalInput } from '../lib/utils'

const EMPTY = {
  title: '', course_code: '', instructions: '', duration_minutes: 30,
  opens_at: '', closes_at: '', access_code: '',
  shuffle_questions: true, shuffle_options: true, warn_before_submit: false,
  one_attempt: true, release_mode: 'instant', notify_email: '',
  negative_marking: '0', pass_mark: '',
}

const newSection = (title) => ({ id: crypto.randomUUID(), title, pick_count: '', questions: [blankQuestion()] })
const letterTitle = (i) => `Section ${String.fromCharCode(65 + (i % 26))}`
const isBlank = (q) => !q.text.trim() && q.type === 'mcq' && q.options.every((o) => !o.trim())

export default function TestEditor() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const fileRef = useRef(null)

  const [form, setForm] = useState({ ...EMPTY, access_code: randomCode() })
  const [sections, setSections] = useState([newSection('Section A')])
  const [loading, setLoading] = useState(!!id)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [attemptCount, setAttemptCount] = useState(0)

  const [bankFor, setBankFor] = useState(null) // section index
  const [bank, setBank] = useState(null)
  const [picked, setPicked] = useState({})
  const [imp, setImp] = useState(null) // {questions, errors, target}
  const [importing, setImporting] = useState(false)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const total = sections.reduce((n, s) => n + s.questions.length, 0)

  useEffect(() => {
    if (!id) return
    ;(async () => {
      const [{ data: t, error }, { data: secs }, { data: qs }, { count }] = await Promise.all([
        supabase.from('tests').select('*').eq('id', id).single(),
        supabase.from('sections').select('*').eq('test_id', id).order('position'),
        supabase.from('questions').select('*').eq('test_id', id).order('position'),
        supabase.from('attempts').select('id', { count: 'exact', head: true }).eq('test_id', id),
      ])
      if (error || !t) { setErr('Test not found.'); setLoading(false); return }
      setForm({
        ...EMPTY, ...t,
        course_code: t.course_code || '', instructions: t.instructions || '', notify_email: t.notify_email || '',
        opens_at: toLocalInput(t.opens_at), closes_at: toLocalInput(t.closes_at),
        negative_marking: String(t.negative_marking ?? 0), pass_mark: t.pass_mark ?? '',
      })
      let list = (secs || []).map((s) => ({
        id: s.id, title: s.title, pick_count: s.pick_count ?? '',
        questions: (qs || []).filter((q) => q.section_id === s.id).map(normalizeQuestion),
      }))
      if (!list.length) list = [newSection('Section A')]
      const orphans = (qs || []).filter((q) => !q.section_id || !list.some((s) => s.id === q.section_id)).map(normalizeQuestion)
      if (orphans.length) list[0].questions = [...list[0].questions, ...orphans]
      list.forEach((s) => { if (!s.questions.length) s.questions = [blankQuestion()] })
      setSections(list)
      setAttemptCount(count || 0)
      setLoading(false)
    })()
  }, [id])

  /* ---------- section / question helpers ---------- */
  const patchSection = (si, patch) => setSections((l) => l.map((s, i) => (i === si ? { ...s, ...patch } : s)))
  const updateQ = (si, qi, q) => patchSection(si, { questions: sections[si].questions.map((x, j) => (j === qi ? q : x)) })
  const addQ = (si, type = 'mcq') => patchSection(si, { questions: [...sections[si].questions, blankQuestion(type)] })
  const removeQ = (si, qi) => {
    const rest = sections[si].questions.filter((_, j) => j !== qi)
    patchSection(si, { questions: rest.length ? rest : [blankQuestion()] })
  }
  const moveQ = (si, qi, d) => {
    const a = [...sections[si].questions]
    const j = qi + d
    if (j < 0 || j >= a.length) return
    ;[a[qi], a[j]] = [a[j], a[qi]]
    patchSection(si, { questions: a })
  }
  const addSection = () => setSections((l) => [...l, newSection(letterTitle(l.length))])
  const removeSection = (si) => {
    if (sections.length === 1) return
    setSections((l) => l.filter((_, i) => i !== si))
  }

  async function saveToBank(q) {
    const msg = validateQuestion(q, 1)
    if (msg) return toast(msg, 'err')
    const { error } = await supabase.from('question_bank').insert(cleanQuestionFields(q))
    toast(error ? error.message : 'Saved to your question bank', error ? 'err' : 'ok')
  }

  /* ---------- question bank ---------- */
  async function openBank(si) {
    setBankFor(si); setPicked({})
    const { data } = await supabase.from('question_bank').select('*').order('created_at', { ascending: false })
    setBank((data || []).map(normalizeQuestion))
  }
  function importPicked() {
    const add = bank.filter((b) => picked[b.id]).map((b) => ({ ...b, id: crypto.randomUUID() }))
    setSections((l) => l.map((s, i) => {
      if (i !== bankFor) return s
      const keep = s.questions.length === 1 && isBlank(s.questions[0]) ? [] : s.questions
      return { ...s, questions: [...keep, ...add] }
    }))
    setBankFor(null)
    toast(`${add.length} question${add.length === 1 ? '' : 's'} added`)
  }

  /* ---------- import from file ---------- */
  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImporting(true)
    try {
      const res = await importFile(file)
      setImp({ ...res, target: 0, name: file.name })
    } catch (e2) {
      toast(`Could not read that file. ${e2.message || ''}`, 'err')
    } finally {
      setImporting(false)
    }
  }

  function confirmImport() {
    setSections((current) => {
      let list = current.map((s) => ({ ...s, questions: [...s.questions] }))
      // an untouched blank question is replaced by the imported ones
      list = list.map((s) => (s.questions.length === 1 && isBlank(s.questions[0]) ? { ...s, questions: [] } : s))
      imp.questions.forEach(({ sectionTitle, ...q }) => {
        let idx = -1
        if (sectionTitle) idx = list.findIndex((s) => s.title.trim().toLowerCase() === sectionTitle.toLowerCase())
        if (sectionTitle && idx < 0) {
          list.push({ id: crypto.randomUUID(), title: sectionTitle, pick_count: '', questions: [] })
          idx = list.length - 1
        }
        if (idx < 0) idx = Math.min(imp.target, list.length - 1)
        list[idx].questions.push(q)
      })
      return list.map((s) => (s.questions.length ? s : { ...s, questions: [blankQuestion()] }))
    })
    toast(`${imp.questions.length} question${imp.questions.length === 1 ? '' : 's'} imported`)
    setImp(null)
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob(['\ufeff' + TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = 'question_template.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  /* ---------- validate + save ---------- */
  function validate() {
    if (!form.title.trim()) return 'Give the test a title.'
    const mins = Number(form.duration_minutes)
    if (!Number.isInteger(mins) || mins < 1 || mins > 600) return 'Time limit must be a whole number between 1 and 600 minutes.'
    if (form.opens_at && form.closes_at && new Date(form.closes_at) <= new Date(form.opens_at)) return 'The closing time must be after the opening time.'
    if (!form.access_code.trim()) return 'Add an access code.'
    if (form.pass_mark !== '' && !(Number(form.pass_mark) >= 0 && Number(form.pass_mark) <= 100)) return 'The pass mark must be between 0 and 100.'
    for (let s = 0; s < sections.length; s++) {
      const sec = sections[s]
      if (!sec.title.trim()) return `Section ${s + 1} needs a title.`
      if (sec.pick_count !== '' && !(Number.isInteger(Number(sec.pick_count)) && Number(sec.pick_count) >= 1)) return `${sec.title}: "questions per student" must be a whole number of 1 or more.`
      for (let i = 0; i < sec.questions.length; i++) {
        const m = validateQuestion(sec.questions[i], i + 1)
        if (m) return `${sec.title}: ${m}`
      }
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
        negative_marking: Number(form.negative_marking) || 0,
        pass_mark: form.pass_mark === '' ? null : Number(form.pass_mark),
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

      // 1. sections, 2. questions, 3. clean up anything the lecturer removed
      const secRows = sections.map((s, i) => ({
        id: s.id, test_id: testId, title: s.title.trim(), position: i,
        pick_count: s.pick_count === '' ? null : Number(s.pick_count),
      }))
      const { error: se } = await supabase.from('sections').upsert(secRows, { onConflict: 'id' })
      if (se) throw se

      let pos = 0
      const qRows = sections.flatMap((s) => s.questions.map((q) => ({
        id: q.id, test_id: testId, section_id: s.id, position: pos++, ...cleanQuestionFields(q),
      })))
      const { error: qe } = await supabase.from('questions').upsert(qRows, { onConflict: 'id' })
      if (qe) throw qe

      const keepQ = new Set(qRows.map((r) => r.id))
      const { data: oldQ } = await supabase.from('questions').select('id').eq('test_id', testId)
      const goneQ = (oldQ || []).map((r) => r.id).filter((x) => !keepQ.has(x))
      if (goneQ.length) {
        const { error: de } = await supabase.from('questions').delete().in('id', goneQ)
        if (de) throw de
      }
      const keepS = new Set(secRows.map((r) => r.id))
      const { data: oldS } = await supabase.from('sections').select('id').eq('test_id', testId)
      const goneS = (oldS || []).map((r) => r.id).filter((x) => !keepS.has(x))
      if (goneS.length) {
        const { error: de2 } = await supabase.from('sections').delete().in('id', goneS)
        if (de2) throw de2
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

  const multi = sections.length > 1

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
            <Field label="Time limit (minutes)"><Input type="number" min={1} max={600} value={form.duration_minutes} onChange={(e) => set('duration_minutes', e.target.value)} /></Field>
            <Field label="Opens" hint="Leave empty to open immediately."><Input type="datetime-local" value={form.opens_at} onChange={(e) => set('opens_at', e.target.value)} /></Field>
            <Field label="Closes" hint="Leave empty for no closing time."><Input type="datetime-local" value={form.closes_at} onChange={(e) => set('closes_at', e.target.value)} /></Field>
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

        <Card className="space-y-4 p-5">
          <h2 className="font-display text-xl font-semibold">Marking</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Negative marking" hint="A wrong multiple-choice or true/false answer loses this share of that question's marks. Unanswered questions lose nothing.">
              <select value={form.negative_marking} onChange={(e) => set('negative_marking', e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2.5">
                <option value="0">None</option>
                <option value="0.25">25% of the marks</option>
                <option value="0.33">33% of the marks</option>
                <option value="0.5">50% of the marks</option>
                <option value="1">100% of the marks</option>
              </select>
            </Field>
            <Field label="Pass mark (%)" hint="Optional. Students see Pass or Fail on their result.">
              <Input type="number" min={0} max={100} value={form.pass_mark} onChange={(e) => set('pass_mark', e.target.value)} placeholder="e.g. 50" />
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-xl font-semibold">Test rules</h2>
          <div className="divide-y divide-line">
            <Switch label="Shuffle question order" hint="Every student gets the questions in a different order inside each section." checked={form.shuffle_questions} onChange={(v) => set('shuffle_questions', v)} />
            <Switch label="Shuffle answer options" hint="Multiple-choice options appear in a different order for each student." checked={form.shuffle_options} onChange={(v) => set('shuffle_options', v)} />
            <Switch label="Give one warning before auto-submit" hint="The first time a student leaves the page they get a warning. The second time the test is submitted. Useful on phones where a notification can interrupt the page." checked={form.warn_before_submit} onChange={(v) => set('warn_before_submit', v)} />
            <Switch label="One attempt per matric number" hint="A student cannot retake the test once they have submitted." checked={form.one_attempt} onChange={(v) => set('one_attempt', v)} />
            <Switch label="Release scores to students instantly" hint="Turn off to hold scores until you release them from the results page." checked={form.release_mode === 'instant'} onChange={(v) => set('release_mode', v ? 'instant' : 'manual')} />
          </div>
        </Card>

        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl font-semibold">Questions ({total})</h2>
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept=".xlsx,.csv,.docx" className="hidden" onChange={onFile} />
              <Button variant="secondary" size="sm" loading={importing} onClick={() => fileRef.current?.click()}><FileUp className="h-4 w-4" />Import from Excel or Word</Button>
              <Button variant="ghost" size="sm" onClick={downloadTemplate}><Download className="h-4 w-4" />Template</Button>
            </div>
          </div>

          <div className="space-y-8">
            {sections.map((sec, si) => (
              <section key={sec.id} aria-label={sec.title}>
                <Card className="mb-3 space-y-3 border-brand/40 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Layers className="h-5 w-5 text-brand" />
                    <input
                      value={sec.title} onChange={(e) => patchSection(si, { title: e.target.value })}
                      aria-label="Section title"
                      className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 font-display text-lg font-semibold focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                    />
                    {multi && (
                      <Button variant="ghost" size="sm" className="text-danger" aria-label={`Delete ${sec.title}`}
                        onClick={() => {
                          if (sec.questions.some((q) => !isBlank(q)) && !window.confirm(`Delete "${sec.title}" and its ${sec.questions.length} question(s)?`)) return
                          removeSection(si)
                        }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <label className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted">Questions per student</span>
                    <input
                      type="number" min={1} value={sec.pick_count} placeholder={`All ${sec.questions.length}`}
                      onChange={(e) => patchSection(si, { pick_count: e.target.value })}
                      className="w-24 rounded-lg border border-line bg-surface px-2 py-1.5 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                    />
                    <span className="text-xs text-muted">Leave empty to give everyone every question. Enter a number to draw that many at random per student.</span>
                  </label>
                </Card>

                <div className="space-y-4">
                  {sec.questions.map((q, qi) => (
                    <QuestionEditor
                      key={q.id} q={q} index={qi} total={sec.questions.length}
                      onChange={(nq) => updateQ(si, qi, nq)} onRemove={() => removeQ(si, qi)}
                      onMove={(d) => moveQ(si, qi, d)} onSaveToBank={saveToBank}
                    />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" className="flex-1" onClick={() => addQ(si)}><Plus className="h-4 w-4" />Add question</Button>
                  <Button variant="secondary" onClick={() => openBank(si)}><Library className="h-4 w-4" />From bank</Button>
                </div>
              </section>
            ))}
          </div>

          <Button variant="ghost" className="mt-6 w-full border border-dashed border-line" onClick={addSection}>
            <Layers className="h-4 w-4" />Add a section
          </Button>
        </div>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 mt-8 border-t border-line bg-surface/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-3">
          <Link to="/lecturer"><Button variant="ghost">Cancel</Button></Link>
          <Button size="lg" loading={saving} onClick={save}><Save className="h-4 w-4" />Save test</Button>
        </div>
      </div>

      {/* question bank picker */}
      <Modal
        open={bankFor !== null} onClose={() => setBankFor(null)} title="Add from question bank" wide
        footer={<>
          <Button variant="secondary" onClick={() => setBankFor(null)}>Cancel</Button>
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
                <span className="mt-0.5 block text-xs text-muted">{TYPE_LABEL[b.type]}. Answer: {answerSummary(b)}</span>
              </span>
            </label>
          ))}
        </div>
      </Modal>

      {/* import preview */}
      <Modal
        open={!!imp} onClose={() => setImp(null)} title="Import questions" wide
        footer={<>
          <Button variant="secondary" onClick={() => setImp(null)}>Cancel</Button>
          <Button onClick={confirmImport} disabled={!imp?.questions.length}>Import {imp?.questions.length || 0} question{imp?.questions.length === 1 ? '' : 's'}</Button>
        </>}
      >
        {imp && (
          <div className="space-y-4">
            <p>
              <b>{imp.questions.length}</b> question{imp.questions.length === 1 ? '' : 's'} found in <b>{imp.name}</b>.
              {imp.errors.length > 0 && <> <b className="text-danger">{imp.errors.length}</b> could not be read.</>}
            </p>
            {imp.errors.length > 0 && (
              <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-danger">
                <ul className="list-disc space-y-1 pl-5">
                  {imp.errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
                </ul>
                {imp.errors.length > 8 && <p className="mt-1">and {imp.errors.length - 8} more.</p>}
              </div>
            )}
            {imp.questions.length > 0 && (
              <>
                <div className="space-y-1.5">
                  {imp.questions.slice(0, 4).map((q) => (
                    <div key={q.id} className="rounded-lg border border-line px-3 py-2">
                      <div className="truncate font-medium">{q.text}</div>
                      <div className="text-xs text-muted">{TYPE_LABEL[q.type]}. Answer: {answerSummary(q)}. {q.marks} mark{Number(q.marks) === 1 ? '' : 's'}{q.sectionTitle ? `. ${q.sectionTitle}` : ''}</div>
                    </div>
                  ))}
                  {imp.questions.length > 4 && <p className="text-xs text-muted">and {imp.questions.length - 4} more.</p>}
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Add questions without a section name to</span>
                  <select value={imp.target} onChange={(e) => setImp({ ...imp, target: Number(e.target.value) })} className="w-full rounded-lg border border-line bg-surface px-3 py-2.5">
                    {sections.map((s, i) => <option key={s.id} value={i}>{s.title}</option>)}
                  </select>
                </label>
              </>
            )}
          </div>
        )}
      </Modal>
    </Shell>
  )
}
