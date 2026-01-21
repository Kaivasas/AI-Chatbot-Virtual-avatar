"use client"

import { useState } from 'react'

export default function Page() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)
    try {
      const redirectTo = `${window.location.origin}/reset-password`
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, redirectTo }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        if (res.status === 404) {
          throw new Error('ไม่พบบัญชีที่ใช้อีเมลนี้')
        }
        throw new Error(j.error || 'Failed to send reset email')
      }
      setMessage('ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว')
    } catch (err: any) {
      setError(err?.message || 'Failed to send reset email')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, overflow: 'hidden', background: 'radial-gradient(ellipse at center, rgba(255,220,230,0.18) 0%, rgba(255,238,210,0.14) 45%, rgba(212,236,255,0.12) 100%)' }}>
      <div style={{ width: 'min(600px, 92vw)', maxWidth: '92vw', borderRadius: 32, border: '12px solid #2f2f2f', background: '#cf8f8f', boxShadow: '0 24px 70px rgba(0,0,0,0.35)', padding: 24, boxSizing: 'border-box', maxHeight: 'calc(100vh - 80px)', overflowY: 'auto' }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 14, color: '#1e1e1e' }}>Forgot Password</div>
        <form onSubmit={onSubmit} style={{ maxWidth: 520, margin: '0 auto', padding: '0 12px' }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 6, color: '#1e1e1e' }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid #ddd', background: '#ffe0e0', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px 16px', borderRadius: 999, border: 'none', background: '#2f2f2f', color: '#fff', cursor: 'pointer', boxShadow: '0 8px 20px rgba(0,0,0,0.25)' }}>
            {loading ? 'Sending...' : 'Send reset link'}
          </button>
        </form>
        {error && <p style={{ color: '#c0392b', marginTop: 10, textAlign: 'center' }}>{error}</p>}
        {message && <p style={{ color: 'green', marginTop: 10, textAlign: 'center' }}>{message}</p>}
        <div style={{ marginTop: 12, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
          <a href="/login" style={{ color: '#1e1e1e' }}>Back to Sign In</a>
        </div>
      </div>
    </div>
  )
}