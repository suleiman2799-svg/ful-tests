import { useEffect, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { Shell } from '../components/Shell'
import { Button, Card, EmptyState, Input, Modal, Spinner, useToast } from '../components/ui'
import QuestionEditor, { answerSummary, blankQuestion, cleanQuestionFields, normalizeQuestion, validateQuestion } from '../components/QuestionEditor'
import { TYPE_LABEL } from '../lib/utils'
import { supabase } from '../lib/supabase'

export default function QuestionBank() {
  const toast = useToast()
  const [items, setItems] = useState(null)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null) // question object being edited/created
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [del, setDel] = useState(null)

  async function load() {
    const { data, error } = await supabase.from('question_bank').select('*').order('created_at', { ascending: false })
    if (error) toast(error.message, 'err')
    setItems((data || []).map(normalizeQuestion))
  }
  useEffect(() => { load() }, [])

  async function save() {
    const msg = validateQuestion(editing, 1)
    if (msg) return toast(msg, 'err')
    setSaving(true)
    const row = cleanQuestionFields(editing)
    const { error } = isNew
      ? await supabase.from('question_bank').insert(row)
      : await supabase.from('question_bank').update(row).eq('id', editing.id)
    setSaving(false)
    if (error) return toast(error.message, 'err')
    toast('Question saved')
    setEditing(null)
    load()
  }

  async function remove() {
    const { error } = await supabase.from('question_bank').delete().eq('id', del.id)
    if (error) return toast(error.message, 'err')
    toast('Question deleted')
    setDel(null)
    load()
  }

  const shown = (items || []).filter((q) => q.text.toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <Shell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Question bank</h1>
          <p className="mt-1 text-sm text-muted">Keep questions here and reuse them across tests.</p>
        </div>
        <Button size="lg" onClick={() => { setEditing(blankQuestion()); setIsNew(true) }}>
          <Plus className="h-4 w-4" />New question
        </Button>
      </div>

      {!items && <div className="flex justify-center py-20"><Spinner className="h-6 w-6 text-brand" /></div>}

      {items && items.length === 0 && (
        <EmptyState title="Your bank is empty">
          Add questions here, or use "Save to bank" on any question while building a test.
        </EmptyState>
      )}

      {items && items.length > 0 && (
        <>
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" placeholder="Search questions" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search questions" />
          </div>
          <div className="space-y-3">
            {shown.map((q) => (
              <Card key={q.id} className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="font-medium">{q.text}</div>
                  <div className="mt-1 text-sm text-muted">{TYPE_LABEL[q.type]}. Answer: {answerSummary(q)}. {Number(q.marks)} mark{Number(q.marks) === 1 ? '' : 's'}.</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="secondary" size="sm" onClick={() => { setEditing(q); setIsNew(false) }}>Edit</Button>
                  <Button variant="dangerSoft" size="sm" onClick={() => setDel(q)}>Delete</Button>
                </div>
              </Card>
            ))}
            {shown.length === 0 && <p className="py-8 text-center text-muted">No questions match your search.</p>}
          </div>
        </>
      )}

      <Modal
        open={!!editing} onClose={() => setEditing(null)} wide title={isNew ? 'New question' : 'Edit question'}
        footer={<>
          <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
          <Button loading={saving} onClick={save}>Save question</Button>
        </>}
      >
        {editing && <QuestionEditor q={editing} index={0} total={1} onChange={setEditing} />}
      </Modal>

      <Modal
        open={!!del} onClose={() => setDel(null)} title="Delete this question?"
        footer={<>
          <Button variant="secondary" onClick={() => setDel(null)}>Keep it</Button>
          <Button variant="danger" onClick={remove}>Delete question</Button>
        </>}
      >
        It will be removed from your bank. Tests that already use a copy of it are not affected.
      </Modal>
    </Shell>
  )
}
