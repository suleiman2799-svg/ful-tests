import { Link } from 'react-router-dom'
import { Shell } from '../components/Shell'
import { Button } from '../components/ui'

export default function NotFound() {
  return (
    <Shell>
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="font-display text-3xl font-semibold">Page not found</h1>
        <p className="mt-2 text-muted">That link does not lead anywhere. Check it and try again.</p>
        <Link to="/"><Button className="mt-6">Go to the home page</Button></Link>
      </div>
    </Shell>
  )
}
