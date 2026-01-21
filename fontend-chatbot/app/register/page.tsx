"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/utill/supabase/client'

export default function Page() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [age, setAge] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)
    try {
      const checkRes = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (checkRes.ok) {
        const j = await checkRes.json()
        if (j?.exists) {
          throw new Error('อีเมลนี้ถูกใช้งานแล้ว')
        }
      } else {
        const j = await checkRes.json().catch(() => ({}))
        if (checkRes.status === 500) throw new Error(j.error || 'ระบบตรวจสอบอีเมลไม่พร้อม')
      }
      const ageNum = age ? parseInt(age, 10) : null
      if (ageNum !== null) {
        if (Number.isNaN(ageNum) || ageNum < 1 || ageNum > 100) {
          throw new Error('อายุต้องอยู่ระหว่าง 1–100 ปี')
        }
      }
      const { data, error: signErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName || null, first_name: firstName || null, last_name: lastName || null, age: ageNum },
        },
      })
      if (signErr) {
        const msg = (signErr.message || '').toLowerCase()
        if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
          throw new Error('อีเมลนี้ถูกใช้งานแล้ว')
        }
        throw new Error(signErr.message)
      }
      const user = data.user
      if (user) {
        await supabase
          .from('profiles')
          .upsert(
            [{ user_id: user.id, display_name: displayName || null, first_name: firstName || null, last_name: lastName || null, age: ageNum }],
            { onConflict: 'user_id' }
          )
      }
      setMessage('Sign up successful. Please verify your email before signing in')
    } catch (err: any) {
      setError(err?.message || 'Sign up failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, overflow: 'hidden', background: 'radial-gradient(ellipse at center, rgba(255,220,230,0.18) 0%, rgba(255,238,210,0.14) 45%, rgba(212,236,255,0.12) 100%)' }}>
      <div style={{ width: 'min(640px, 92vw)', maxWidth: '92vw', borderRadius: 32, border: '12px solid #2f2f2f', background: '#cf8f8f', boxShadow: '0 24px 70px rgba(0,0,0,0.35)', padding: 24, boxSizing: 'border-box', maxHeight: 'calc(100vh - 80px)', overflowY: 'auto' }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 14, color: '#1e1e1e' }}>Create Account</div>
        <form onSubmit={onSubmit} style={{ maxWidth: 560, margin: '0 auto', padding: '0 16px' }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 6, color: '#1e1e1e' }}>Display name</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="ex. Alex" style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid #ddd', background: '#ffe0e0', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 6, color: '#1e1e1e' }}>First name</label>
              <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid #ddd', background: '#ffe0e0', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, color: '#1e1e1e' }}>Last name</label>
              <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid #ddd', background: '#ffe0e0', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 6, color: '#1e1e1e' }}>Age</label>
            <input type="number" min="1" max="100" value={age} onChange={(e) => setAge(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid #ddd', background: '#ffe0e0', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 6, color: '#1e1e1e' }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid #ddd', background: '#ffe0e0', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 6, color: '#1e1e1e' }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid #ddd', background: '#ffe0e0', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px 16px', borderRadius: 999, border: 'none', background: '#2f2f2f', color: '#fff', cursor: 'pointer', boxShadow: '0 8px 20px rgba(0,0,0,0.25)' }}>
            {loading ? 'Creating...' : 'Create Account'}
          </button>
        </form>
        {error && <p style={{ color: '#c0392b', marginTop: 10, textAlign: 'center' }}>{error}</p>}
        {message && <p style={{ color: 'green', marginTop: 10, textAlign: 'center' }}>{message}</p>}
        <div style={{ marginTop: 12, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto', textAlign: 'right' }}>
          <a href="/login" style={{ color: '#1e1e1e' }}>Back to Sign In</a>
        </div>
      </div>
    </div>
  )
}
