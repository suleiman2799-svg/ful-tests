// Supabase Edge Function: send-results
//
// action "submission": called by the student's browser right after a test is
//   submitted. Emails the lecturer the result, and emails the student their
//   score (or a receipt if the lecturer has not released scores yet).
// action "release": called by the lecturer when they release scores. Emails every
//   student whose score has not been sent yet.
//
// Secrets needed (supabase secrets set ...):
//   RESEND_API_KEY   your Resend API key
//   FROM_EMAIL       e.g. "FUL Tests <tests@yourdomain.com>"
//   SITE_URL         e.g. https://your-site.vercel.app   (optional, used in links)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM = Deno.env.get('FROM_EMAIL') ?? 'FUL Tests <onboarding@resend.dev>'
const SITE = Deno.env.get('SITE_URL') ?? ''

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

const REASON: Record<string, string> = {
  manual: 'Submitted by the student',
  timeup: 'Time ran out',
  left: 'Auto-submitted: student left the test page',
  fullscreen: 'Auto-submitted: student exited fullscreen',
  expired: 'Auto-submitted: session ended without a submission',
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  })
  if (!res.ok) throw new Error(`Resend error: ${await res.text()}`)
}

const wrap = (inner: string) => `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111c34">
  <p style="font-size:13px;color:#606d86;margin:0 0 16px">Federal University Lokoja &middot; Online Tests</p>
  ${inner}
  <p style="font-size:12px;color:#8a95ab;margin-top:28px">This is an automated message. Please do not reply.</p>
</div>`

function studentScoreMail(a: any, t: any) {
  return wrap(`
    <h2 style="margin:0 0 8px">Your result: ${esc(t.title)}</h2>
    <p style="margin:0 0 16px">Hello ${esc(a.student_name)}, here is your score.</p>
    <div style="border:1px solid #d7deec;border-radius:10px;padding:16px">
      <div style="font-size:34px;font-weight:700">${a.score} / ${a.total}</div>
      <div style="color:#606d86">${Number(a.percentage).toFixed(1)}%</div>
    </div>
    <p style="margin-top:16px;font-size:14px">Matric number: ${esc(a.matric)}<br/>Department: ${esc(a.department)}${t.course_code ? `<br/>Course: ${esc(t.course_code)}` : ''}</p>`)
}

function studentReceiptMail(a: any, t: any) {
  return wrap(`
    <h2 style="margin:0 0 8px">Test received: ${esc(t.title)}</h2>
    <p>Hello ${esc(a.student_name)}, your test was submitted successfully.
    Your lecturer has not released scores yet. You will get another email with your score when they do.</p>`)
}

function lecturerMail(a: any, t: any) {
  const mins = a.submitted_at
    ? Math.max(1, Math.round((new Date(a.submitted_at).getTime() - new Date(a.started_at).getTime()) / 60000))
    : '-'
  return wrap(`
    <h2 style="margin:0 0 8px">New submission: ${esc(t.title)}</h2>
    <table style="border-collapse:collapse;font-size:14px;width:100%">
      <tr><td style="padding:6px 0;color:#606d86">Name</td><td>${esc(a.student_name)}</td></tr>
      <tr><td style="padding:6px 0;color:#606d86">Matric number</td><td>${esc(a.matric)}</td></tr>
      <tr><td style="padding:6px 0;color:#606d86">Department</td><td>${esc(a.department)}</td></tr>
      <tr><td style="padding:6px 0;color:#606d86">Email</td><td>${esc(a.email)}</td></tr>
      <tr><td style="padding:6px 0;color:#606d86">Score</td><td><b>${a.score} / ${a.total}</b> (${Number(a.percentage).toFixed(1)}%)</td></tr>
      <tr><td style="padding:6px 0;color:#606d86">Time taken</td><td>${mins} min</td></tr>
      <tr><td style="padding:6px 0;color:#606d86">Status</td><td>${esc(REASON[a.submit_reason] ?? a.submit_reason)}</td></tr>
    </table>
    ${SITE ? `<p style="margin-top:16px"><a href="${SITE}/lecturer/tests/${t.id}/results">Open the results dashboard</a></p>` : ''}`)
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const body = await req.json()

    // ---------------- student just submitted ----------------
    if (body.action === 'submission') {
      const { data: a } = await admin
        .from('attempts').select('*').eq('id', body.attempt_id).eq('token', body.token).maybeSingle()
      if (!a || !a.submitted_at) return json({ error: 'Attempt not found or not submitted' }, 404)
      if (a.email_sent) return json({ ok: true, skipped: true })

      const { data: t } = await admin.from('tests').select('*').eq('id', a.test_id).single()
      const released = t.release_mode === 'instant' || t.scores_released

      // Mark first, so a double call can never send twice
      await admin.from('attempts').update({ email_sent: true, score_emailed: released }).eq('id', a.id)

      // Lecturer copy
      let lecturerTo = t.notify_email as string | null
      if (!lecturerTo) {
        const { data: u } = await admin.auth.admin.getUserById(t.lecturer_id)
        lecturerTo = u?.user?.email ?? null
      }
      const jobs: Promise<unknown>[] = []
      if (lecturerTo) {
        jobs.push(sendEmail(lecturerTo, `${a.student_name} (${a.matric}) scored ${a.score}/${a.total}: ${t.title}`, lecturerMail(a, t)))
      }
      // Student copy
      jobs.push(
        released
          ? sendEmail(a.email, `Your score for ${t.title}`, studentScoreMail(a, t))
          : sendEmail(a.email, `Your test was received: ${t.title}`, studentReceiptMail(a, t)),
      )
      const results = await Promise.allSettled(jobs)
      const failed = results.filter((r) => r.status === 'rejected')
      if (failed.length) {
        console.error(failed)
        await admin.from('attempts').update({ email_sent: false, score_emailed: false }).eq('id', a.id)
        return json({ error: 'Some emails failed to send' }, 502)
      }
      return json({ ok: true })
    }

    // ---------------- lecturer released scores ----------------
    if (body.action === 'release') {
      const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
      const { data: userData } = await admin.auth.getUser(jwt)
      const user = userData?.user
      if (!user) return json({ error: 'Not signed in' }, 401)

      const { data: t } = await admin.from('tests').select('*').eq('id', body.test_id).maybeSingle()
      if (!t || t.lecturer_id !== user.id) return json({ error: 'Not your test' }, 403)

      const { data: list } = await admin
        .from('attempts').select('*').eq('test_id', t.id).not('submitted_at', 'is', null).eq('score_emailed', false)

      let sent = 0
      for (const a of list ?? []) {
        try {
          await sendEmail(a.email, `Your score for ${t.title}`, studentScoreMail(a, t))
          await admin.from('attempts').update({ score_emailed: true }).eq('id', a.id)
          sent++
        } catch (e) {
          console.error(e)
        }
      }
      return json({ ok: true, sent, total: list?.length ?? 0 })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: String(e) }, 500)
  }
})
