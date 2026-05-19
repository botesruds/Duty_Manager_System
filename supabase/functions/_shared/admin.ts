// Shared helpers for admin-only Edge Functions.
// Verifies the caller's JWT and that their profile is is_admin=true.
// Throws on failure with an HTTP-suitable status.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
}

export async function requireAdmin(req: Request): Promise<{ userId: string; svc: SupabaseClient }> {
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Missing Authorization header')
  }
  const token = auth.slice('Bearer '.length)

  const svc = serviceClient()
  const { data: userData, error: userErr } = await svc.auth.getUser(token)
  if (userErr || !userData?.user) {
    throw new HttpError(401, 'Invalid token')
  }
  const userId = userData.user.id

  const { data: profile, error: profErr } = await svc
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle()
  if (profErr) throw new HttpError(500, profErr.message)
  if (!profile?.is_admin) throw new HttpError(403, 'Admin only')

  return { userId, svc }
}

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...(init.headers ?? {}) },
  })
}

export function handleError(e: unknown): Response {
  if (e instanceof HttpError) return jsonResponse({ error: e.message }, { status: e.status })
  const message = e instanceof Error ? e.message : 'Unknown error'
  return jsonResponse({ error: message }, { status: 500 })
}
