import { useRef, useState } from 'react'
import { ArrowDown, ArrowUp, BookmarkPlus, ImagePlus, Plus, Trash2, X } from 'lucide-react'
import { Button, Card, Spinner, Textarea, useToast } from './ui'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { TYPE_LABEL, cn } from '../lib/utils'

const LETTERS = ['A', 'B', 'C', 'D', 'E']

export function blankQuestion(type = 'mcq') {
  const q = {
    id: crypto.randomUUID(), type, text: '', image_url: '', marks: 1,
    options: ['', '', '', ''], correct_index: 0, accepted: [''],
  }
  if (type === 'tf') q.options = ['True', 'False']
  if (type === 'short') q.options = []
  return q
}

/** Makes a question from the database (or an older one) safe to edit. */
export function normalizeQuestion(q) {
  const type = q.type || 'mcq'
  return {
    ...q,
    type,
    image_url: q.image_url || '',
    marks: q.marks ?? 1,
    options: type === 'short' ? [] : Array.isArray(q.options) ? q.options : ['', '', '', ''],
    accepted: Array.isArray(q.accepted) && q.accepted.length ? q.accepted : [''],
  }
}

/** Only the fields that go into the database. */
export function cleanQuestionFields(q) {
  const short = q.type === 'short'
  return {
    type: q.type,
    text: q.text.trim(),
    image_url: q.image_url || null,
    marks: Number(q.marks),
    options: short ? [] : q.options.map((o) => o.trim()),
    correct_index: short ? 0 : q.correct_index,
    accepted: short ? q.accepted.map((a) => a.trim()).filter(Boolean) : [],
  }
}

export function answerSummary(q) {
  if (q.type === 'short') return (q.accepted || []).filter(Boolean).join(' / ')
  return q.options?.[q.correct_index] ?? ''
}

export default function QuestionEditor({ q, index, total, onChange, onRemove, onMove, onSaveToBank }) {
  const { user } = useAuth()
  const toast = useToast()
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  const set = (patch) => onChange({ ...q, ...patch })
  const setOption = (i, v) => set({ options: q.options.map((o, j) => (j === i ? v : o)) })
  const setAccepted = (i, v) => set({ accepted: q.accepted.map((o, j) => (j === i ? v : o)) })

  function changeType(type) {
    if (type === q.type) return
    const fresh = blankQuestion(type)
    set({
      type,
      options: type === 'mcq' && q.type !== 'tf' && q.options.length >= 2 ? q.options : fresh.options,
      correct_index: 0,
      accepted: q.accepted?.length ? q.accepted : [''],
    })
  }

  function removeOption(i) {
    if (q.options.length <= 2) return
    const options = q.options.filter((_, j) => j !== i)
    let correct = q.correct_index
    if (i === correct) correct = 0
    else if (i < correct) correct -= 1
    set({ options, correct_index: correct })
  }

  async function upload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return toast('Choose an image file.', 'err')
    if (file.size > 3 * 1024 * 1024) return toast('Image is larger than 3 MB.', 'err')
    setUploading(true)
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '')
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('question-images').upload(path, file)
    setUploading(false)
    if (error) return toast(error.message, 'err')
    set({ image_url: supabase.storage.from('question-images').getPublicUrl(path).data.publicUrl })
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-semibold">Question {index + 1}</h3>
        <div className="flex items-center gap-1">
          {onSaveToBank && (
            <Button variant="ghost" size="sm" onClick={() => onSaveToBank(q)} title="Save to question bank">
              <BookmarkPlus className="h-4 w-4" /><span className="hidden sm:inline">Save to bank</span>
            </Button>
          )}
          {onMove && (
            <>
              <Button variant="ghost" size="sm" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up"><ArrowUp className="h-4 w-4" /></Button>
              <Button variant="ghost" size="sm" disabled={index === total - 1} onClick={() => onMove(1)} aria-label="Move down"><ArrowDown className="h-4 w-4" /></Button>
            </>
          )}
          {onRemove && (
            <Button variant="ghost" size="sm" onClick={onRemove} aria-label="Delete question" className="text-danger"><Trash2 className="h-4 w-4" /></Button>
          )}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg bg-brandsoft p-1 text-sm font-medium" role="tablist" aria-label="Question type">
          {Object.entries(TYPE_LABEL).map(([k, label]) => (
            <button
              key={k} role="tab" aria-selected={q.type === k} onClick={() => changeType(k)}
              className={cn('rounded-md px-3 py-1.5 transition-colors', q.type === k ? 'bg-surface shadow-sm' : 'text-muted')}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-muted">Marks</span>
          <input
            type="number" min="0.25" step="0.25" value={q.marks}
            onChange={(e) => set({ marks: e.target.value })}
            aria-label="Marks for this question"
            className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
          />
        </label>
      </div>

      <Textarea value={q.text} onChange={(e) => set({ text: e.target.value })} placeholder="Type the question" aria-label={`Question ${index + 1} text`} />

      <div className="mt-3">
        {q.image_url ? (
          <div className="relative inline-block">
            <img src={q.image_url} alt="Question" className="max-h-48 rounded-lg border border-line" />
            <button onClick={() => set({ image_url: '' })} aria-label="Remove image" className="absolute -right-2 -top-2 rounded-full border border-line bg-surface p-1 shadow">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={upload} />
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Spinner /> : <ImagePlus className="h-4 w-4" />}Add image
            </Button>
          </>
        )}
      </div>

      {q.type === 'short' ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-muted">
            Accepted answers. A student's answer is marked correct if it matches any of these. Capital letters and extra
            spaces are ignored.
          </p>
          {q.accepted.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={a} onChange={(e) => setAccepted(i, e.target.value)}
                placeholder={i === 0 ? 'Correct answer' : 'Another accepted answer'}
                aria-label={`Accepted answer ${i + 1}`}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
              />
              {q.accepted.length > 1 && (
                <button onClick={() => set({ accepted: q.accepted.filter((_, j) => j !== i) })} aria-label="Remove accepted answer" className="rounded-md p-1.5 text-muted hover:bg-brandsoft">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {q.accepted.length < 10 && (
            <Button variant="ghost" size="sm" onClick={() => set({ accepted: [...q.accepted, ''] })}><Plus className="h-4 w-4" />Add another accepted answer</Button>
          )}
        </div>
      ) : (
        <fieldset className="mt-4 space-y-2">
          <legend className="mb-1 text-xs text-muted">Select the circle beside the correct answer.</legend>
          {q.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <button
                type="button" onClick={() => set({ correct_index: i })} role="radio"
                aria-checked={q.correct_index === i}
                aria-label={`Mark option ${q.type === 'tf' ? o : LETTERS[i]} as correct`}
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
                  q.correct_index === i ? 'border-ok bg-ok text-white' : 'border-line text-muted hover:border-ok',
                )}
              >
                {LETTERS[i]}
              </button>
              {q.type === 'tf' ? (
                <span className="py-2 font-medium">{o}</span>
              ) : (
                <>
                  <input
                    value={o} onChange={(e) => setOption(i, e.target.value)}
                    placeholder={`Option ${LETTERS[i]}`} aria-label={`Option ${LETTERS[i]}`}
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                  />
                  {q.options.length > 2 && (
                    <button onClick={() => removeOption(i)} aria-label={`Remove option ${LETTERS[i]}`} className="rounded-md p-1.5 text-muted hover:bg-brandsoft">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
          {q.type === 'mcq' && q.options.length < 5 && (
            <Button variant="ghost" size="sm" onClick={() => set({ options: [...q.options, ''] })}><Plus className="h-4 w-4" />Add option</Button>
          )}
        </fieldset>
      )}
    </Card>
  )
}

/** Returns an error message, or null if the question is complete. */
export function validateQuestion(q, n) {
  if (!q.text.trim()) return `Question ${n} has no text.`
  if (!(Number(q.marks) > 0)) return `Question ${n} needs marks above 0.`
  if (q.type === 'short') {
    if (!q.accepted.some((a) => a.trim())) return `Question ${n} needs at least one accepted answer.`
    return null
  }
  if (q.options.some((o) => !o.trim())) return `Question ${n} has an empty option. Fill it in or remove it.`
  if (q.correct_index < 0 || q.correct_index >= q.options.length) return `Choose the correct answer for question ${n}.`
  return null
}
