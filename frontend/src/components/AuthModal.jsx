import { useState, useEffect } from 'react'
import './AuthModal.css'

export default function AuthModal({ onClose, onRegister, onLogin, loading, error, clearError }) {
  const [mode, setMode]       = useState('login')   // 'login' | 'register'
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => { clearError() }, [mode]) // eslint-disable-line

  const handleSubmit = async (e) => {
    e.preventDefault()
    const ok = mode === 'login'
      ? await onLogin(email, password)
      : await onRegister(email, password)
    if (ok) onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card">
        <button className="modal-close" onClick={onClose}>✕</button>

        <div className="modal-logo">
          <span className="modal-logo-circle" />
          <span className="modal-logo-text">ZenTalk</span>
        </div>

        <p className="modal-subtitle">
          {mode === 'login' ? '登录后，日记同步云端' : '注册账号，日记永不丢失'}
        </p>

        <div className="modal-tabs">
          <button className={mode === 'login' ? 'modal-tab--active' : ''} onClick={() => setMode('login')}>登录</button>
          <button className={mode === 'register' ? 'modal-tab--active' : ''} onClick={() => setMode('register')}>注册</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <input
            type="email" placeholder="邮箱" value={email}
            onChange={e => setEmail(e.target.value)} required
            className="modal-input" autoComplete="email"
          />
          <input
            type="password" placeholder={mode === 'register' ? '密码（至少6位）' : '密码'}
            value={password} onChange={e => setPassword(e.target.value)}
            required className="modal-input" autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          />
          {error && <p className="modal-error">{error}</p>}
          <button type="submit" className="modal-submit" disabled={loading}>
            {loading ? '...' : mode === 'login' ? '登录' : '注册'}
          </button>
        </form>

        <p className="modal-guest">
          不登录也可以继续使用，日记保存在本地浏览器
        </p>
      </div>
    </div>
  )
}
