"use client"

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/utill/supabase/client'

function getLinkParams() {
  if (typeof window === 'undefined') return {}
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const code = search.get('code') || hash.get('code') || undefined
  const access_token = hash.get('access_token') || undefined
  const refresh_token = hash.get('refresh_token') || undefined
  const error = search.get('error') || hash.get('error') || undefined
  const error_code = search.get('error_code') || hash.get('error_code') || undefined
  const error_description = search.get('error_description') || hash.get('error_description') || undefined
  return { code, access_token, refresh_token, error, error_code, error_description }
}

export default function Page() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [hasSession, setHasSession] = useState(false)

  useEffect(() => {
    const setup = async () => {
      const { code, access_token, refresh_token, error, error_description } = getLinkParams()

      if (error) {
        setError(error_description || 'ลิงก์ไม่ถูกต้องหรือหมดอายุ')
        return
      }

      try {
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
          setHasSession(!!data.session)
          return
        }
        if (access_token && refresh_token) {
          const { data, error } = await supabase.auth.setSession({ access_token, refresh_token })
          if (error) throw error
          setHasSession(!!data.session)
          return
        }
        const { data } = await supabase.auth.getSession()
        setHasSession(!!data.session)
      } catch (e: any) {
        setError(e?.message || 'ตั้งค่าเซสชันไม่สำเร็จ')
      }
    }
    setup()
  }, [])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    if (password !== confirm) {
      setError('รหัสผ่านไม่ตรงกัน')
      return
    }
    if (!hasSession) {
      setError('Auth session missing! กรุณาเปิดลิงก์ล่าสุดจากอีเมลอีกครั้ง')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setMessage('ตั้งรหัสผ่านใหม่สำเร็จ')
    setTimeout(() => router.replace('/login'), 1200)
  }

  return (
    <div style={{ maxWidth: 360, margin: '40px auto' }}>
      <h2>ตั้งรหัสผ่านใหม่</h2>
      <form onSubmit={onSubmit}>
        <div style={{ marginBottom: 10 }}>
          <label>รหัสผ่านใหม่</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: '100%' }} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label>ยืนยันรหัสผ่าน</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required style={{ width: '100%' }} />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {message && <p style={{ color: 'green' }}>{message}</p>}
      <div style={{ marginTop: 12 }}>
        <a href="/login">กลับไปหน้าเข้าสู่ระบบ</a>
      </div>
    </div>
  )
}