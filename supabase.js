import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

export const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null

/** Call a database function. Throws an Error with a readable message. */
export async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(error.message || 'Something went wrong. Try again.')
  return data
}

/**
 * Same as rpc, but uses fetch with keepalive so the request still completes
 * while the page is being hidden or closed. Used for the auto-submit.
 */
export async function rpcKeepalive(name, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      // Legacy anon keys are JWTs and go in Authorization. New publishable keys must not.
      ...(SUPABASE_ANON_KEY.startsWith('eyJ') ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : {}),
    },
    body: JSON.stringify(args),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const err = new Error(body?.message || 'Request failed')
    err.definitive = res.status >= 400 && res.status < 500
    throw err
  }
  return body
}
