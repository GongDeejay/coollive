import { useState, useEffect, useRef, useCallback } from 'react'
import './AdminDashboard.css'

// ── Traffic sparkline (Canvas) ─────────────────────────────────────
function Sparkline({ data, color = '#c4a882', height = 52 }) {
  const wrapRef   = useRef(null)
  const canvasRef = useRef(null)

  const draw = useCallback(() => {
    const wrap = wrapRef.current; const canvas = canvasRef.current
    if (!wrap || !canvas || !data?.length) return
    const W = wrap.offsetWidth || 200
    const H = height
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    canvas.width  = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    canvas.style.width  = W + 'px'
    canvas.style.height = H + 'px'
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)

    const vals = data.map(d => d.requests)
    const max  = Math.max(...vals, 1)
    const padX = 4, padY = 6
    const cw = W - padX * 2, ch = H - padY * 2

    // Area fill
    const grad = ctx.createLinearGradient(0, padY, 0, padY + ch)
    grad.addColorStop(0, color + '44')
    grad.addColorStop(1, color + '06')
    ctx.beginPath()
    data.forEach((d, i) => {
      const x = padX + (i / (data.length - 1)) * cw
      const y = padY + ch - (d.requests / max) * ch
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.lineTo(padX + cw, padY + ch); ctx.lineTo(padX, padY + ch)
    ctx.closePath()
    ctx.fillStyle = grad; ctx.fill()

    // Line
    ctx.beginPath()
    data.forEach((d, i) => {
      const x = padX + (i / (data.length - 1)) * cw
      const y = padY + ch - (d.requests / max) * ch
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke()

    // Dots for each day
    data.forEach((d, i) => {
      const x = padX + (i / (data.length - 1)) * cw
      const y = padY + ch - (d.requests / max) * ch
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2)
      ctx.fillStyle = color; ctx.fill()
    })
  }, [data, color, height])

  useEffect(() => {
    const wrap = wrapRef.current; if (!wrap) return
    const ro = new ResizeObserver(() => draw())
    ro.observe(wrap); draw()
    return () => ro.disconnect()
  }, [draw])

  return <div ref={wrapRef} className="sparkline-wrap"><canvas ref={canvasRef} /></div>
}

// ── Traffic card for one site ──────────────────────────────────────
function TrafficCard({ site, label, data }) {
  if (!data?.days) return <div className="ad-card ad-card--loading">加载中…</div>
  const today   = data.days[data.days.length - 1] || {}
  const total7  = data.days.reduce((s, d) => s + d.requests, 0)
  const err5xx  = data.days.reduce((s, d) => s + d.errors_5xx, 0)
  const errRate = total7 > 0 ? ((err5xx / total7) * 100).toFixed(1) : '0.0'

  return (
    <div className="ad-card">
      <div className="ad-card-header">
        <div>
          <p className="ad-card-site">{label}</p>
          <p className="ad-card-today">{today.requests?.toLocaleString() ?? 0} <span>今日请求</span></p>
        </div>
        <div className="ad-card-meta">
          <span className="ad-chip">{today.unique_ips ?? 0} IP</span>
          <span className={`ad-chip ${err5xx > 0 ? 'ad-chip--warn' : ''}`}>
            5xx: {err5xx}
          </span>
        </div>
      </div>
      <Sparkline data={data.days} color={site === 'zen' ? '#c4a882' : '#7a9aaf'} />
      <div className="ad-card-footer">
        <span>7天 {total7.toLocaleString()} 次</span>
        <span>5xx率 {errRate}%</span>
        <span>4xx {data.days.reduce((s, d) => s + d.errors_4xx, 0)}</span>
      </div>
    </div>
  )
}

// ── Process status ─────────────────────────────────────────────────
function fmtUptime(sec) {
  if (!sec) return '—'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  if (d > 0) return `${d}天${h}h`
  const m = Math.floor((sec % 3600) / 60)
  return `${h}h${m}m`
}

function ProcessRow({ p }) {
  const ok = p.status === 'online'
  const warnRestarts = p.restarts > 10
  return (
    <div className="ad-proc-row">
      <span className={`ad-dot ${ok ? 'ad-dot--ok' : 'ad-dot--err'}`} />
      <span className="ad-proc-name">{p.name}</span>
      <span className="ad-proc-uptime">{fmtUptime(p.uptime_sec)}</span>
      <span className="ad-proc-mem">{p.memory_mb}MB</span>
      <span className={`ad-proc-restarts ${warnRestarts ? 'ad-warn' : ''}`}>
        重启 {p.restarts}
      </span>
    </div>
  )
}

// ── Error log viewer ───────────────────────────────────────────────
function ErrorRow({ e }) {
  return (
    <div className={`ad-err-row ad-err-row--${e.level}`}>
      <span className="ad-err-svc">[{e.service}]</span>
      <span className="ad-err-msg">{e.message}</span>
    </div>
  )
}

// ── Main dashboard ─────────────────────────────────────────────────
export default function AdminDashboard({ token, apiBase }) {
  const [stats, setStats]       = useState(null)
  const [loading, setLoading]   = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]       = useState('')
  const [genTime, setGenTime]   = useState(null)

  const fetchStats = useCallback(async (force = false) => {
    if (!token) return
    force ? setRefreshing(true) : setLoading(true)
    setError('')
    try {
      if (force) {
        await fetch(`${apiBase}/admin/stats/refresh`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
      }
      const res = await fetch(`${apiBase}/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setStats(data)
      setGenTime(data.generated_at ? new Date(data.generated_at * 1000) : null)
    } catch (e) {
      setError('数据加载失败：' + e.message)
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [token, apiBase])

  useEffect(() => { fetchStats() }, [fetchStats])

  if (loading) return (
    <div className="ad-page ad-center">
      <div className="ad-spinner" />
      <p>加载服务数据…</p>
    </div>
  )

  return (
    <div className="ad-page">
      {/* Header */}
      <div className="ad-header">
        <div>
          <h2 className="ad-title">服务后台</h2>
          {genTime && (
            <p className="ad-subtitle">
              数据截至 {genTime.toLocaleString('zh-CN')}
            </p>
          )}
        </div>
        <button
          className={`ad-refresh-btn ${refreshing ? 'ad-refresh-btn--spinning' : ''}`}
          onClick={() => fetchStats(true)}
          disabled={refreshing}
          title="强制刷新日志数据"
        >
          ↻ {refreshing ? '刷新中…' : '刷新'}
        </button>
      </div>

      {error && <p className="ad-error">{error}</p>}

      {/* Traffic section */}
      <div className="ad-section-title">访问流量（7天）</div>
      <div className="ad-traffic-grid">
        <TrafficCard site="zen" label="zen.mplusm.site"
          data={stats?.traffic?.zen} />
        <TrafficCard site="3d"  label="3d.mplusm.site"
          data={stats?.traffic?.['3d']} />
      </div>

      {/* Process status */}
      <div className="ad-section-title">进程状态</div>
      <div className="ad-card ad-card--proc">
        {stats?.processes?.length ? (
          stats.processes.map(p => <ProcessRow key={p.name} p={p} />)
        ) : (
          <p className="ad-empty">加载中…</p>
        )}
      </div>

      {/* Error log */}
      <div className="ad-section-title">
        接口错误日志
        <span className="ad-err-count">
          {stats?.errors?.filter(e => e.level === 'error').length ?? 0} 条 error
        </span>
      </div>
      <div className="ad-card ad-card--errors">
        {stats?.errors?.length ? (
          stats.errors
            .filter(e => e.level === 'error')
            .slice(0, 30)
            .map((e, i) => <ErrorRow key={i} e={e} />)
        ) : (
          <p className="ad-empty">暂无错误日志</p>
        )}
      </div>
    </div>
  )
}
