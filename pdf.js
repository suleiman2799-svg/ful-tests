// PDF generation (loaded only when a PDF is requested, so it never slows the site down)
import { fmtNum } from './utils'

async function logoData() {
  try {
    const res = await fetch('/logo.jpg')
    const blob = await res.blob()
    return await new Promise((ok) => {
      const r = new FileReader()
      r.onload = () => ok(r.result)
      r.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

const safe = (s) => String(s || 'result').replace(/[^\w-]+/g, '_')

/** One student's result slip. */
export async function downloadSlip(s) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()

  const logo = await logoData()
  if (logo) doc.addImage(logo, 'JPEG', W / 2 - 28, 40, 56, 62)

  doc.setFont('helvetica', 'bold'); doc.setFontSize(19)
  doc.text('Federal University Lokoja', W / 2, 130, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(90)
  doc.text('Online Test Result Slip', W / 2, 150, { align: 'center' })
  doc.setDrawColor(200); doc.line(60, 168, W - 60, 168)

  doc.setTextColor(20)
  const rows = [
    ['Name', s.name], ['Matric number', s.matric], ['Department', s.department],
    ['Test', s.title], ['Course', s.course], ['Submitted', s.date],
  ].filter(([, v]) => v)
  let y = 200
  rows.forEach(([k, v]) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(`${k}:`, 60, y)
    doc.setFont('helvetica', 'normal'); doc.text(String(v), 180, y, { maxWidth: W - 240 })
    y += 26
  })

  y += 12
  doc.setDrawColor(31, 78, 158); doc.setLineWidth(1.2)
  doc.roundedRect(60, y, W - 120, 110, 8, 8)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(32); doc.setTextColor(20)
  doc.text(`${fmtNum(s.score)} / ${fmtNum(s.total)}`, W / 2, y + 55, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(13); doc.setTextColor(80)
  const verdict = s.passed === true ? '   PASS' : s.passed === false ? '   FAIL' : ''
  doc.text(`${Number(s.percentage).toFixed(1)}%${verdict}`, W / 2, y + 86, { align: 'center' })

  doc.setFontSize(9); doc.setTextColor(140)
  doc.text(`Generated ${new Date().toLocaleString()}. Developed by Suleiman CR7`, W / 2, H - 36, { align: 'center' })
  doc.save(`result_${safe(s.matric)}.pdf`)
}

/** Lecturer's full results table. */
export async function downloadResultsPdf({ title, course, rows }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const cols = [
    ['Name', 40, 28], ['Matric number', 210, 16], ['Department', 320, 26],
    ['Score', 505, 12], ['%', 580, 7], ['Status', 630, 24],
  ]

  const header = () => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(20)
    doc.text(`${title}${course ? ` (${course})` : ''}`, 40, 42)
    doc.setFontSize(9); doc.setTextColor(110); doc.setFont('helvetica', 'normal')
    doc.text(`Federal University Lokoja. ${rows.length} submission(s). Generated ${new Date().toLocaleString()}`, 40, 58)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(20)
    cols.forEach(([h, x]) => doc.text(h, x, 86))
    doc.setDrawColor(190); doc.line(40, 92, W - 40, 92)
    doc.setFont('helvetica', 'normal')
    return 112
  }

  let y = header()
  rows.forEach((r) => {
    if (y > H - 50) { doc.addPage(); y = header() }
    cols.forEach(([, x, max], i) => doc.text(String(r[i] ?? '').slice(0, max), x, y))
    y += 20
  })
  doc.setFontSize(8); doc.setTextColor(140)
  doc.text('Developed by Suleiman CR7', W / 2, H - 20, { align: 'center' })
  doc.save(`${safe(course || title)}_results.pdf`)
}
