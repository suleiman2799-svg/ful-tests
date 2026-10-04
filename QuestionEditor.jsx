import { useRef, useState } from 'react'
import { ArrowDown, ArrowUp, BookmarkPlus, ImagePlus, Plus, Trash2, X } from 'lucide-react'
import { Button, Card, Spinner, Textarea, useToast } from './ui'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { cn } from '../lib/utils'

const LETTERS = ['A', 'B', 'C', 'D', 'E']

export function blankQuestion() {
  return { id: crypto.randomUUID(), text: '', image_url: '', options: ['', '', '', ''], correct_index: 0 }
}

export default function QuestionEditor({ q, index, total, onChange, onRemove, onMove, onSaveToBank }) {
  const { user } = useAuth()
  const toast = useToast()
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  const set = (patch) => onChange({ ...q, ...patch })
  const setOption = (i, v) => set({ options: q.options.map((o, j) => (j === i ? v : o)) })

  function addOption() {
    if (q.options.length < 5) set({ options: [...q.options, ''] })
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
    const { data } = supabase.storage.from('question-images').getPublicUrl(path)
    set({ image_url: data.publicUrl })
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
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

      <Textarea
        value={q.text}
        onChange={(e) => set({ text: e.target.value })}
        placeholder="Type the question"
        aria-label={`Question ${index + 1} text`}
      />

      <div className="mt-3">
        {q.image_url ? (
          <div className="relative inline-block">
            <img src={q.image_url} alt="Question" className="max-h-48 rounded-lg border border-line" />
            <button
              onClick={() => set({ image_url: '' })}
              aria-label="Remove image"
              className="absolute -right-2 -top-2 rounded-full border border-line bg-surface p-1 shadow"
            >
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

      <fieldset className="mt-4 space-y-2">
        <legend className="mb-1 text-xs text-muted">Select the circle beside the correct answer.</legend>
        {q.options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => set({ correct_index: i })}
              role="radio"
              aria-checked={q.correct_index === i}
              aria-label={`Mark option ${LETTERS[i]} as correct`}
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
                q.correct_index === i ? 'border-ok bg-ok text-white' : 'border-line text-muted hover:border-ok',
              )}
            >
              {LETTERS[i]}
            </button>
            <input
              value={o}
              onChange={(e) => setOption(i, e.target.value)}
              placeholder={`Option ${LETTERS[i]}`}
              aria-label={`Option ${LETTERS[i]}`}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
            />
            {q.options.length > 2 && (
              <button onClick={() => removeOption(i)} aria-label={`Remove option ${LETTERS[i]}`} className="rounded-md p-1.5 text-muted hover:bg-brandsoft">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        {q.options.length < 5 && (
          <Button variant="ghost" size="sm" onClick={addOption}><Plus className="h-4 w-4" />Add option</Button>
        )}
      </fieldset>
    </Card>
  )
}

/** Returns an error message, or null if the question is complete. */
export function validateQuestion(q, n) {
  if (!q.text.trim()) return `Question ${n} has no text.`
  if (q.options.some((o) => !o.trim())) return `Question ${n} has an empty option. Fill it in or remove it.`
  if (q.correct_index < 0 || q.correct_index >= q.options.length) return `Choose the correct answer for question ${n}.`
  return null
}
