import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Clock, Mail, ShieldCheck } from 'lucide-react'
import { Shell } from '../components/Shell'
import { Button, Card, Input } from '../components/ui'
import { useAuth } from '../lib/auth'
import { parseSlug } from '../lib/utils'

export default function Landing() {
  const nav = useNavigate()
  const { session } = useAuth()
  const [value, setValue] = useState('')
  const [err, setErr] = useState('')

  function join(e) {
    e.preventDefault()
    const slug = parseSlug(value)
    if (slug.length < 4) return setErr('Paste the full test link your lecturer sent you.')
    nav(`/t/${slug}`)
  }

  return (
    <Shell>
      <div className="grid items-center gap-10 py-6 lg:grid-cols-[1.15fr_1fr] lg:py-14">
        <div>
          <h1 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            Tests for Federal University Lokoja, taken on your own device.
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">
            Students open the link their lecturer shares and sit the test. Lecturers write the questions and see every
            result the moment it comes in.
          </p>
          <ul className="mt-8 space-y-3 text-sm">
            <li className="flex items-center gap-3"><Clock className="h-5 w-5 text-brand" />Each test is timed and submits itself when time is up.</li>
            <li className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-brand" />Leaving the test page submits it automatically.</li>
            <li className="flex items-center gap-3"><Mail className="h-5 w-5 text-brand" />Your score is sent to the email you enter.</li>
          </ul>
        </div>

        <div className="space-y-4">
          <Card className="p-6">
            <h2 className="font-display text-2xl font-semibold">Join a test</h2>
            <p className="mt-1 text-sm text-muted">Paste the link from your lecturer.</p>
            <form onSubmit={join} className="mt-5 space-y-3">
              <Input
                value={value}
                onChange={(e) => { setValue(e.target.value); setErr('') }}
                placeholder="https://.../t/a1b2c3d4"
                aria-label="Test link"
                autoComplete="off"
                autoCapitalize="none"
              />
              {err && <p className="text-sm text-danger" role="alert">{err}</p>}
              <Button type="submit" size="lg" className="w-full">Continue</Button>
            </form>
          </Card>
          <Card className="flex items-center justify-between gap-4 p-5">
            <div>
              <div className="font-medium">Are you a lecturer?</div>
              <div className="text-sm text-muted">Create tests and view results.</div>
            </div>
            <Link to={session ? '/lecturer' : '/login'}>
              <Button variant="secondary">{session ? 'Open dashboard' : 'Sign in'}</Button>
            </Link>
          </Card>
        </div>
      </div>
    </Shell>
  )
}
