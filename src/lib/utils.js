export const cn = (...a) => a.filter(Boolean).join(' ')

export function randomCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const arr = new Uint32Array(len)
  crypto.getRandomValues(arr)
  return Array.from(arr, (n) => chars[n % chars.length]).join('')
}

/** Accepts a full test link or just the code at the end of it. */
export function parseSlug(input) {
  const s = (input || '').trim()
  const m = s.match(/\/t\/([a-z0-9]+)/i)
  return (m ? m[1] : s).toLowerCase().replace(/[^a-z0-9]/g, '')
}

export const testLink = (slug) => `${window.location.origin}/t/${slug}`

export function fmtDate(d) {
  if (!d) return 'Not set'
  return new Date(d).toLocaleString([], {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

const pad = (n) => String(n).padStart(2, '0')

export function toLocalInput(d) {
  if (!d) return ''
  const x = new Date(d)
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`
}
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null)

export function mmss(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`
}

export function testStatus(t) {
  const now = Date.now()
  if (t.opens_at && now < new Date(t.opens_at).getTime()) return 'upcoming'
  if (t.closes_at && now > new Date(t.closes_at).getTime()) return 'closed'
  return 'open'
}

export const REASON_LABEL = {
  manual: 'Submitted',
  timeup: 'Time ran out',
  left: 'Left the page',
  fullscreen: 'Exited fullscreen',
  expired: 'Never submitted',
}

export function downloadCSV(filename, rows) {
  const esc = (v) => {
    let s = String(v ?? '')
    if (/^[=+\-@]/.test(s)) s = "'" + s // stop spreadsheet formula injection
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = '\ufeff' + rows.map((r) => r.map(esc).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export const supportsFullscreen = () => Boolean(document.documentElement.requestFullscreen)
