import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function POST(request: Request) {
  const { email, password } = await request.json()
  if (!email || !password) {
    return NextResponse.json({ error: 'missing credentials' }, { status: 400 })
  }
  let response = NextResponse.json({ ok: true })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string) || (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string),
    {
      cookies: {
        getAll() {
          return []
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400, headers: response.headers })
  }
  const access_token = data.session?.access_token
  const refresh_token = data.session?.refresh_token
  const secure = process.env.NODE_ENV === 'production'
  const json = NextResponse.json({ access_token, refresh_token })
  if (access_token) {
    json.cookies.set('sb-access-token', access_token, { httpOnly: true, sameSite: 'lax', path: '/', secure })
  }
  if (refresh_token) {
    json.cookies.set('sb-refresh-token', refresh_token, { httpOnly: true, sameSite: 'lax', path: '/', secure })
  }
  return json
}