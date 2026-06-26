import { useState, useCallback, useEffect } from 'react'

const TOKEN_KEY = 'zentalk_token'
const USER_KEY  = 'zentalk_user'

export function useAuth(apiBase) {
  const [user, setUser]     = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY)) } catch { return null }
  })
  const [token, setToken]   = useState(() => localStorage.getItem(TOKEN_KEY) || null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  // Verify token on mount
  useEffect(() => {
    if (!token) return
    fetch(`${apiBase}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (!data.logged_in) { setToken(null); setUser(null); localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY) }
      })
      .catch(() => {})
  }, []) // eslint-disable-line

  const _persist = (userData, tok) => {
    setUser(userData)
    setToken(tok)
    localStorage.setItem(TOKEN_KEY, tok)
    localStorage.setItem(USER_KEY, JSON.stringify(userData))
  }

  const register = useCallback(async (email, password) => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`${apiBase}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = { email_exists: '该邮箱已注册', invalid_email: '邮箱格式有误', password_too_short: '密码至少6位' }
        setError(msg[data.detail] || '注册失败'); return false
      }
      _persist({ user_id: data.user_id, email: data.email }, data.token)
      return true
    } catch { setError('网络错误'); return false }
    finally { setLoading(false) }
  }, [apiBase])

  const login = useCallback(async (email, password) => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = { user_not_found: '邮箱未注册', wrong_password: '密码错误' }
        setError(msg[data.detail] || '登录失败'); return false
      }
      _persist({ user_id: data.user_id, email: data.email }, data.token)
      return true
    } catch { setError('网络错误'); return false }
    finally { setLoading(false) }
  }, [apiBase])

  const logout = useCallback(() => {
    setUser(null); setToken(null)
    localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY)
  }, [])

  const clearError = useCallback(() => setError(''), [])

  return { user, token, loading, error, register, login, logout, clearError }
}
