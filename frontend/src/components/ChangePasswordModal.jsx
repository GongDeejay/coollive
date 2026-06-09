import { useState } from 'react'
import './AuthModal.css'   /* reuse existing modal styles */

export default function ChangePasswordModal({ apiBase, token, userEmail, onClose }) {
  const [mode, setMode]         = useState('self')   // 'self' | 'admin-reset'
  const [oldPwd, setOldPwd]     = useState('')
  const [newPwd, setNewPwd]     = useState('')
  const [targetEmail, setTargetEmail] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  const isAdmin = userEmail === 'gongdj@gmail.com'

  const handleSubmit = async e => {
    e.preventDefault()
    setError(''); setSuccess(''); setLoading(true)
    try {
      let res
      if (mode === 'self') {
        res = await fetch(`${apiBase}/auth/change-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ old_password: oldPwd, new_password: newPwd }),
        })
      } else {
        res = await fetch(`${apiBase}/auth/admin-reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ target_email: targetEmail, new_password: newPwd }),
        })
      }
      const data = await res.json()
      if (!res.ok) {
        const msg = {
          wrong_password: '原密码错误',
          password_too_short: '新密码至少6位',
          user_not_found: '用户不存在',
          admin_only: '无权限执行此操作',
        }
        setError(msg[data.detail] || data.detail || '操作失败')
      } else {
        setSuccess(mode === 'self' ? '密码修改成功！' : `已重置 ${targetEmail} 的密码`)
        setOldPwd(''); setNewPwd(''); setTargetEmail('')
      }
    } catch {
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card">
        <button className="modal-close" onClick={onClose}>✕</button>

        <div className="modal-logo">
          <span className="modal-logo-circle" />
          <span className="modal-logo-text">密码管理</span>
        </div>

        {isAdmin && (
          <div className="modal-tabs">
            <button className={mode === 'self' ? 'modal-tab--active' : ''}
              onClick={() => { setMode('self'); setError(''); setSuccess('') }}>
              修改自己密码
            </button>
            <button className={mode === 'admin-reset' ? 'modal-tab--active' : ''}
              onClick={() => { setMode('admin-reset'); setError(''); setSuccess('') }}>
              重置用户密码
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="modal-form">
          {mode === 'self' ? (
            <>
              <input
                type="password" placeholder="当前密码" value={oldPwd}
                onChange={e => setOldPwd(e.target.value)} required
                className="modal-input" autoComplete="current-password"
              />
              <input
                type="password" placeholder="新密码（至少6位）" value={newPwd}
                onChange={e => setNewPwd(e.target.value)} required
                className="modal-input" autoComplete="new-password"
              />
            </>
          ) : (
            <>
              <input
                type="email" placeholder="目标用户邮箱" value={targetEmail}
                onChange={e => setTargetEmail(e.target.value)} required
                className="modal-input"
              />
              <input
                type="password" placeholder="新密码（至少6位）" value={newPwd}
                onChange={e => setNewPwd(e.target.value)} required
                className="modal-input" autoComplete="new-password"
              />
            </>
          )}

          {error   && <p className="modal-error">{error}</p>}
          {success && <p style={{ fontSize: 13, color: '#6a9b8a', textAlign: 'center' }}>{success}</p>}

          <button type="submit" className="modal-submit" disabled={loading}>
            {loading ? '…' : mode === 'self' ? '确认修改' : '重置密码'}
          </button>
        </form>

        <p className="modal-guest" style={{ marginTop: 12 }}>
          {userEmail}
        </p>
      </div>
    </div>
  )
}
