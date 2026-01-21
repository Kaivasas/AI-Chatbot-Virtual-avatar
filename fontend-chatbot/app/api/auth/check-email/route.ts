import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { email } = await request.json()
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'missing email' }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined
    if (!url || !service) {
      return NextResponse.json({ error: 'service role not configured' }, { status: 500 })
    }

    const admin = createClient(url, service)
    const target = email.trim().toLowerCase()
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const exists = !!data?.users?.some((u: any) => (u.email || '').toLowerCase() === target)
    return NextResponse.json({ exists })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown error' }, { status: 500 })
  }
}