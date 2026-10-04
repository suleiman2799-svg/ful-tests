import { Link, NavLink, useNavigate } from 'react-router-dom'
import { BookOpen, LayoutList, LogOut, Moon, Sun } from 'lucide-react'
import { useTheme } from '../lib/theme'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { cn } from '../lib/utils'

export function Watermark() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden">
      <img src="/logo.jpg" alt="" className="watermark w-[min(78vw,540px)] opacity-[0.07]" />
    </div>
  )
}

export function Credit({ className }) {
  return (
    <p className={cn('text-center text-xs tracking-wide text-muted/80', className)}>
      Federal University Lokoja. Developed by Suleiman CR7
    </p>
  )
}

function ThemeButton() {
  const { dark, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="rounded-lg p-2 text-muted transition-colors hover:bg-brandsoft hover:text-text"
    >
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  )
}

const navCls = ({ isActive }) =>
  cn(
    'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-brandsoft text-brand' : 'text-muted hover:text-text',
  )

export function Shell({ children, bare, wide }) {
  const { session } = useAuth()
  const nav = useNavigate()

  async function signOut() {
    await supabase.auth.signOut()
    nav('/')
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <Watermark />
      {!bare && (
        <header className="relative z-10 border-b border-line bg-surface/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
            <Link to="/" className="flex items-center gap-3">
              <img src="/logo.jpg" alt="Federal University Lokoja" className="h-10 w-10 rounded-md object-contain" />
              <div className="leading-tight">
                <div className="font-display text-lg font-semibold">FUL Online Tests</div>
                <div className="hidden text-xs text-muted sm:block">Federal University Lokoja</div>
              </div>
            </Link>
            <nav className="ml-4 hidden items-center gap-1 sm:flex">
              {session && (
                <>
                  <NavLink to="/lecturer" end className={navCls}><LayoutList className="h-4 w-4" />My tests</NavLink>
                  <NavLink to="/lecturer/bank" className={navCls}><BookOpen className="h-4 w-4" />Question bank</NavLink>
                </>
              )}
            </nav>
            <div className="ml-auto flex items-center gap-1">
              <ThemeButton />
              {session && (
                <button
                  onClick={signOut}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-brandsoft hover:text-text"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              )}
            </div>
          </div>
          {session && (
            <nav className="flex gap-1 border-t border-line px-3 py-1.5 sm:hidden">
              <NavLink to="/lecturer" end className={navCls}><LayoutList className="h-4 w-4" />My tests</NavLink>
              <NavLink to="/lecturer/bank" className={navCls}><BookOpen className="h-4 w-4" />Question bank</NavLink>
            </nav>
          )}
        </header>
      )}
      <main className={cn('relative z-10 mx-auto w-full flex-1 px-4 py-8', wide ? 'max-w-6xl' : 'max-w-5xl')}>
        <div className="page-in">{children}</div>
      </main>
      <footer className="relative z-10 px-4 pb-5 pt-2">
        <Credit />
      </footer>
    </div>
  )
}
