// Turns Excel (.xlsx), CSV and Word (.docx) files into questions.

const ALIAS = {
  type: 'type', question: 'question', q: 'question', text: 'question',
  a: 'a', b: 'b', c: 'c', d: 'd', e: 'e',
  answer: 'answer', answers: 'answer', correct: 'answer',
  marks: 'marks', mark: 'marks', section: 'section',
}

export const TEMPLATE_CSV = [
  'type,question,A,B,C,D,E,answer,marks,section',
  'mcq,"What is the capital of Nigeria?",Lagos,Abuja,Kano,Ibadan,,B,1,Section A',
  'tf,"The sun rises in the west.",,,,,,False,1,Section A',
  'short,"Name the process plants use to make food.",,,,,,photosynthesis|Photosynthesis,2,Section B',
].join('\r\n')

const normType = (v) => {
  const s = String(v || '').toLowerCase().replace(/[^a-z]/g, '')
  if (['tf', 'truefalse', 'trueorfalse', 'boolean'].includes(s)) return 'tf'
  if (['short', 'shortanswer', 'fill', 'fillin', 'text'].includes(s)) return 'short'
  return 'mcq'
}

/**
 * Builds one question from loose parts.
 * parts: { type?, question, options: [{letter, text}], answer, marks, section }
 */
function build(parts, label) {
  const text = (parts.question || '').trim()
  if (!text) return { error: `${label}: the question text is empty.` }

  let marks = 1
  if (parts.marks !== undefined && String(parts.marks).trim() !== '') {
    marks = parseFloat(parts.marks)
    if (!(marks > 0)) return { error: `${label}: marks must be a number above 0.` }
  }

  const answer = String(parts.answer || '').trim()
  let type = parts.type
  if (!type) {
    const low = answer.toLowerCase()
    if (parts.options.length >= 2) type = 'mcq'
    else if (['true', 'false', 't', 'f'].includes(low)) type = 'tf'
    else type = 'short'
  }

  const base = {
    id: crypto.randomUUID(), type, text, image_url: '', marks,
    options: [], correct_index: 0, accepted: [''], sectionTitle: (parts.section || '').trim(),
  }

  if (type === 'tf') {
    const low = answer.toLowerCase()
    if (['true', 't', 'yes'].includes(low)) base.correct_index = 0
    else if (['false', 'f', 'no'].includes(low)) base.correct_index = 1
    else return { error: `${label}: the answer must be True or False.` }
    base.options = ['True', 'False']
    return { q: base }
  }

  if (type === 'short') {
    const accepted = answer.split('|').map((x) => x.trim()).filter(Boolean)
    if (!accepted.length) return { error: `${label}: add at least one accepted answer.` }
    base.accepted = accepted
    return { q: base }
  }

  const opts = parts.options.filter((o) => o.text)
  if (opts.length < 2) return { error: `${label}: needs at least two options.` }
  let idx = -1
  if (/^[a-e]$/i.test(answer)) idx = opts.findIndex((o) => o.letter === answer.toUpperCase())
  if (idx < 0) idx = opts.findIndex((o) => o.text.toLowerCase() === answer.toLowerCase())
  if (idx < 0) return { error: `${label}: the answer "${answer}" does not match any option letter (A to E).` }
  base.options = opts.map((o) => o.text)
  base.correct_index = idx
  return { q: base }
}

/* ---------- spreadsheet rows (xlsx / csv) ---------- */
export function rowsToQuestions(rows) {
  const questions = []
  const errors = []
  if (!rows.length) return { questions, errors: ['The file is empty.'] }

  const head = rows[0].map((h) => ALIAS[String(h ?? '').trim().toLowerCase()] || null)
  if (!head.includes('question')) {
    return { questions, errors: ['The first row must be a header row with a "question" column. Download the template to see the layout.'] }
  }

  rows.slice(1).forEach((row, i) => {
    const get = {}
    head.forEach((k, j) => { if (k) get[k] = String(row[j] ?? '').trim() })
    if (!Object.values(get).some(Boolean)) return // blank row
    const letters = ['a', 'b', 'c', 'd', 'e']
    const res = build({
      type: get.type ? normType(get.type) : undefined,
      question: get.question,
      options: letters.map((l) => ({ letter: l.toUpperCase(), text: get[l] || '' })),
      answer: get.answer, marks: get.marks, section: get.section,
    }, `Row ${i + 2}`)
    if (res.error) errors.push(res.error)
    else questions.push(res.q)
  })
  return { questions, errors }
}

export function parseCSV(text) {
  let t = text.replace(/^\ufeff/, '')
  const firstLine = t.split(/\r?\n/)[0] || ''
  const delim = firstLine.includes(',') ? ',' : firstLine.includes(';') ? ';' : ','
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (quoted) {
      if (c === '"') {
        if (t[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += c
    } else if (c === '"') quoted = true
    else if (c === delim) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}

/* ---------- Word text ---------- */
export function textToQuestions(text) {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean)
  const questions = []
  const errors = []
  let cur = null
  let section = ''

  const flush = () => {
    if (!cur) return
    const res = build({
      question: cur.text, options: cur.opts, answer: cur.answer, marks: cur.marks, section: cur.section,
    }, `Question ${cur.n}`)
    if (res.error) errors.push(res.error)
    else questions.push(res.q)
    cur = null
  }

  for (const line of lines) {
    let m
    if ((m = line.match(/^section\s*[:\-]\s*(.+)$/i))) { flush(); section = m[1].trim(); continue }
    if ((m = line.match(/^(?:answer|ans|correct)\s*[:\-]\s*(.+)$/i))) { if (cur) cur.answer = m[1].trim(); continue }
    if ((m = line.match(/^marks?\s*[:\-]\s*([\d.]+)/i))) { if (cur) cur.marks = m[1]; continue }
    if (cur && (m = line.match(/^\(?([A-Ea-e])[.)]\s*(.+)$/))) {
      cur.opts.push({ letter: m[1].toUpperCase(), text: m[2].trim() })
      continue
    }
    if ((m = line.match(/^(?:q(?:uestion)?\s*)?(\d+)\s*[.):\-]\s*(.+)$/i))) {
      flush()
      cur = { n: m[1], text: m[2].trim(), opts: [], answer: '', marks: '', section }
      continue
    }
    if (cur) {
      if (cur.opts.length) cur.opts[cur.opts.length - 1].text += ' ' + line
      else cur.text += ' ' + line
    }
  }
  flush()
  if (!questions.length && !errors.length) {
    errors.push('No questions were found. Number each question (1. 2. 3.), put options on lines starting A. B. C. D., and add an "Answer: B" line.')
  }
  return { questions, errors }
}

/** Reads any supported file. */
export async function importFile(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv')) {
    return rowsToQuestions(parseCSV(await file.text()))
  }
  if (name.endsWith('.xlsx')) {
    const mod = await import('read-excel-file')
    const read = mod.default || mod
    const rows = await read(file)
    return rowsToQuestions(rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : String(c)))))
  }
  if (name.endsWith('.docx')) {
    const mod = await import('mammoth/mammoth.browser')
    const mammoth = mod.default || mod
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return textToQuestions(value)
  }
  return { questions: [], errors: ['Unsupported file. Use .xlsx, .csv or .docx. (Old .xls and .doc files must be re-saved in the newer format.)'] }
}
