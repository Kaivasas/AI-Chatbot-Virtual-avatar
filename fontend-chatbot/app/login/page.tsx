"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/utill/supabase/client'

export default function Page() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ถ้ามีเซสชันอยู่แล้ว ให้เด้งไปหน้าหลักทันที
  useEffect(() => {
    let unsub: (() => void) | undefined
    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (data.session?.user) {
          router.replace('/')
        }
      } catch {}
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          router.replace('/')
        }
      })
      unsub = () => sub.subscription?.unsubscribe()
    }
    init()
    return () => { try { unsub && unsub() } catch {} }
  }, [router])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const resLogin = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!resLogin.ok) {
        const j = await resLogin.json().catch(() => ({}))
        throw new Error(j.error || 'Sign in failed')
      }
      const tokens = await resLogin.json()
      if (tokens?.access_token && tokens?.refresh_token) {
        const { error: errSet } = await supabase.auth.setSession({ access_token: tokens.access_token, refresh_token: tokens.refresh_token })
        if (errSet) throw new Error('Failed to set session in browser')
        const resSet = await fetch('/api/auth/set-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: tokens.access_token, refresh_token: tokens.refresh_token }),
        })
        if (!resSet.ok) throw new Error('Failed to set server-side session')
      }
      const { data: u } = await supabase.auth.getUser()
      const user = u.user
      if (user) {
        const m: any = user.user_metadata || {}
        const ageNum = typeof m.age === 'number' ? m.age : (m.age ? parseInt(m.age as any, 10) : null)
        await supabase
          .from('profiles')
          .upsert(
            [{ user_id: user.id, display_name: m.display_name ?? null, first_name: m.first_name ?? null, last_name: m.last_name ?? null, age: ageNum }],
            { onConflict: 'user_id' }
          )
      }
      if (typeof window !== 'undefined') {
        window.location.assign('/')
      } else {
        router.replace('/')
      }
    } catch (err: any) {
      setError(err?.message || 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, overflow: 'hidden', background: 'radial-gradient(ellipse at center, rgba(255,220,230,0.18) 0%, rgba(255,238,210,0.14) 45%, rgba(212,236,255,0.12) 100%)' }}>
      <div style={{ width: 'min(600px, 92vw)', maxWidth: '92vw', borderRadius: 32, border: '12px solid #2f2f2f', background: '#cf8f8f', boxShadow: '0 24px 70px rgba(0,0,0,0.35)', padding: 24, boxSizing: 'border-box', maxHeight: 'calc(100vh - 80px)', overflowY: 'auto' }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 16, color: '#1e1e1e', textAlign: 'center' }}>Sign In</div>
        <form onSubmit={onSubmit} style={{ maxWidth: 520, margin: '0 auto', padding: '0 12px' }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', marginBottom: 8, color: '#1e1e1e' }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%', padding: '12px 14px', borderRadius: 16, border: '1px solid #ddd', background: '#ffe0e0', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', marginBottom: 8, color: '#1e1e1e' }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: '100%', padding: '12px 14px', borderRadius: 16, border: '1px solid #ddd', background: '#ffe0e0', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px 16px', borderRadius: 999, border: 'none', background: '#2f2f2f', color: '#fff', cursor: 'pointer', boxShadow: '0 8px 20px rgba(0,0,0,0.25)' }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        {error && <p style={{ color: '#c0392b', marginTop: 12, textAlign: 'center' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 420, margin: '12px auto 0' }}>
          <a href="/register" style={{ color: '#1e1e1e' }}>Create Account</a>
          <a href="/forgot-password" style={{ color: '#1e1e1e' }}>Forgot password</a>
        </div>
      </div>
    </div>
  )
}