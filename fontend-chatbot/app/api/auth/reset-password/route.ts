import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { email, redirectTo } = await request.json()
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'missing email' }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string) || (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string)
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined
  const target = (email || '').trim().toLowerCase()
  const strict = /^(1|true|yes|on)$/i.test(process.env.STRICT_RESET_EMAIL_CHECK || '')

    if (!url || !anon) {
      return NextResponse.json({ error: 'supabase env missing' }, { status: 500 })
    }

  if (!strict) {
    const pub = createClient(url, anon)
    const { error } = await pub.auth.resetPasswordForEmail(email, { redirectTo: typeof redirectTo === 'string' ? redirectTo : undefined })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  }

  if (!service) {
    return NextResponse.json({ error: 'service role not configured' }, { status: 500 })
  }
  const admin = createClient(url, service)
  const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 })
  }
  const exists = !!usersData?.users?.some((u: any) => (u.email || '').toLowerCase() === target)
  if (!exists) {
    return NextResponse.json({ error: 'email not found' }, { status: 404 })
  }

    const pub = createClient(url, anon)
    const { error } = await pub.auth.resetPasswordForEmail(email, { redirectTo: typeof redirectTo === 'string' ? redirectTo : undefined })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown error' }, { status: 500 })
  }
}