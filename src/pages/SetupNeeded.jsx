import { Shell } from '../components/Shell'
import { Card } from '../components/ui'

export default function SetupNeeded() {
  return (
    <Shell bare>
      <Card className="mx-auto mt-10 max-w-xl p-6">
        <h1 className="font-display text-2xl font-semibold">Connect your database</h1>
        <p className="mt-2 text-sm text-muted">
          The site is running, but it has no Supabase keys yet. Copy <code>.env.example</code> to{' '}
          <code>.env</code>, paste in your project URL and anon key, then restart the dev server. On Vercel, add the
          same two variables under Project Settings, Environment Variables.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-brandsoft p-3 text-xs">
{`VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY`}
        </pre>
        <p className="mt-4 text-sm text-muted">The full steps are in README.md.</p>
      </Card>
    </Shell>
  )
}
