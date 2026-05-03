import { useEffect, useRef, useState, useCallback } from 'react'
import './JournalCharts.css'

// ── Constants ──────────────────────────────────────────────────────
const EMOTION_COLORS = {
  焦虑: '#c4855a', 平静: '#6a9b8a', 顿悟: '#c4a882',
  喜悦: '#8aaf6a', 低落: '#7a7a9a', 愤怒: '#9a5a5a',
  困惑: '#8a7a5a', 感恩: '#7a9a6a', 空: '#6a6a6a',
  疲惫: '#8a6a5a', 兴奋: '#9aaf5a', 矛盾: '#8a6a9a',
  满足: '#6a9a7a', 孤独: '#6a6a8a', 轻松: '#6a9a8a', 烦躁: '#9a6a5a',
}
// Legacy energy score (kept for backward compat with old entries)
const ENERGY_SCORE = { 高能: 1, 平稳: 0, 低谷: -1, 波动: 0.5 }
const LAYER_COLORS = {
  object: '#7a9aaf', operation: '#9aaf7a',
  tension: '#af8a7a', output_form: '#c4a882',
}
const ACCENT = '#c4a882'
const DIM_COLOR = '#3a3a3a'
const TEXT_DIM = '#8a8078'

const DIM_CONFIG = {
  Others: { label: '对人', color: '#7a9aaf' },
  Self:   { label: '对己', color: '#c4a882' },
  Task:   { label: '对事', color: '#9aaf7a' },
  World:  { label: '对世', color: '#af8a7a' },
}
const DIMS = ['Others', 'Self', 'Task', 'World']
const DIM_ANGLES = { Others: Math.PI / 2, Self: 0, Task: -Math.PI / 2, World: Math.PI }

// ── Helpers ────────────────────────────────────────────────────────
function countField(entries, fieldPath) {
  const counts = {}
  for (const e of entries) {
    if (!e.tags) continue
    const arr = fieldPath.split('.').reduce((o, k) => o?.[k], e)
    if (!Array.isArray(arr)) continue
    for (const v of arr) counts[v] = (counts[v] || 0) + 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
}

// ── Chart component (DPR-correct) ──────────────────────────────────
// Key fix: draw functions receive (ctx, W, H, entries) — logical CSS pixels only.
// Canvas physical size = W*dpr × H*dpr, context pre-scaled by dpr.

function Chart({ title, drawFn, entries, height = 200 }) {
  const canvasRef = useRef(null)
  const wrapRef   = useRef(null)

  const render = useCallback(() => {
    const canvas = canvasRef.current
    const wrap   = wrapRef.current
    if (!canvas || !wrap) return

    const W = wrap.offsetWidth || 300   // logical CSS width
    const H = height                    // logical CSS height
    if (W <= 0 || H <= 0) return

    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    canvas.width  = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    canvas.style.width  = W + 'px'
    canvas.style.height = H + 'px'

    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)   // reset + scale in one call
    ctx.clearRect(0, 0, W, H)

    try {
      drawFn(ctx, W, H, entries)
    } catch (err) {
      ctx.fillStyle = TEXT_DIM
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('图表渲染出错', W / 2, H / 2)
      console.error('[Chart]', title, err)
    }
  }, [entries, drawFn, height, title])

  useEffect(() => {
    // Use ResizeObserver so canvas always knows its real width
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => render())
    ro.observe(wrap)
    render()
    return () => ro.disconnect()
  }, [render])

  return (
    <div className="chart-card">
      <div className="chart-title">{title}</div>
      <div ref={wrapRef} className="chart-wrap">
        <canvas ref={canvasRef} />
      </div>
    </div>
  )
}

// ── Draw functions — all receive (ctx, W, H, entries) ──────────────

function drawTimeline(ctx, W, H, entries) {
  const dated = entries
    .filter(e => e.tags || e.quadrant)
    .map(e => {
      // Use quadrant energy (normalized -1..+1) if available, else legacy energy score
      let score = 0
      if (e.quadrant) {
        score = e.quadrant.value / 5   // -5..+5 → -1..+1
      } else if (e.tags?.energy) {
        score = ENERGY_SCORE[e.tags.energy] ?? 0
      }
      return {
        ts: new Date(e.created_at).getTime(),
        score,
        color: EMOTION_COLORS[e.tags?.emotion?.[0]] || DIM_CONFIG[e.quadrant?.dim]?.color || ACCENT,
      }
    })
    .sort((a, b) => a.ts - b.ts)

  if (dated.length < 1) {
    ctx.fillStyle = TEXT_DIM; ctx.font = '13px sans-serif'
    ctx.textAlign = 'center'; ctx.fillText('记录更多条目后显示', W / 2, H / 2); return
  }

  const pad = { l: 24, r: 16, t: 16, b: 26 }
  const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b
  const minTs = dated[0].ts, maxTs = dated[dated.length - 1].ts
  const tsRange = Math.max(maxTs - minTs, 1)
  const yMid = pad.t + ch / 2

  // Center line
  ctx.strokeStyle = DIM_COLOR; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
  ctx.beginPath(); ctx.moveTo(pad.l, yMid); ctx.lineTo(W - pad.r, yMid); ctx.stroke()
  ctx.setLineDash([])

  const pts = dated.map(d => ({
    x: pad.l + ((d.ts - minTs) / tsRange) * cw,
    y: yMid - d.score * (ch / 2 - 6),
    color: d.color,
  }))

  if (pts.length > 1) {
    ctx.strokeStyle = DIM_COLOR + '80'; ctx.lineWidth = 1.5
    ctx.beginPath()
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
    ctx.stroke()
  }
  pts.forEach(p => {
    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
    ctx.fillStyle = p.color; ctx.fill()
  })

  ctx.fillStyle = TEXT_DIM; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'
  ctx.fillText('+', 4, pad.t + 8)
  ctx.fillText('−', 4, H - pad.b - 2)

  if (dated.length >= 2) {
    const fmt = ts => { const d = new Date(ts); return `${d.getMonth()+1}/${d.getDate()}` }
    ctx.textAlign = 'center'
    ctx.fillText(fmt(dated[0].ts), pts[0].x, H - 6)
    ctx.fillText(fmt(dated[dated.length-1].ts), pts[pts.length-1].x, H - 6)
  }
}

function drawBubble(ctx, W, H, entries, field, color) {
  const pairs = countField(entries.filter(e => e.tags), field)
  if (!pairs.length) {
    ctx.fillStyle = TEXT_DIM; ctx.font = '13px sans-serif'
    ctx.textAlign = 'center'; ctx.fillText('记录更多条目后显示', W / 2, H / 2); return
  }
  const maxCount = pairs[0][1] || 1
  const cx = W / 2, cy = H / 2, n = pairs.length
  const radius = Math.min(W, H) * 0.28

  pairs.slice(0, 10).forEach(([label, count], i) => {
    const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2
    const size = 14 + (count / maxCount) * 24
    const bx = n === 1 ? cx : cx + Math.cos(angle) * radius
    const by = n === 1 ? cy : cy + Math.sin(angle) * radius

    ctx.beginPath(); ctx.arc(bx, by, size, 0, Math.PI * 2)
    ctx.fillStyle = color + '22'; ctx.fill()
    ctx.strokeStyle = color + '70'; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = color
    ctx.font = `${Math.max(10, 9 + count)}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(label, bx, by)
    if (count > 1) {
      ctx.font = '9px sans-serif'; ctx.fillStyle = TEXT_DIM
      ctx.fillText(`×${count}`, bx, by + size * 0.7)
    }
  })
  ctx.textBaseline = 'alphabetic'
}

function drawDonut(ctx, W, H, entries, field) {
  const pairs = countField(entries.filter(e => e.tags), field)
  if (!pairs.length) {
    ctx.fillStyle = TEXT_DIM; ctx.font = '13px sans-serif'
    ctx.textAlign = 'center'; ctx.fillText('记录更多条目后显示', W / 2, H / 2); return
  }
  const total = pairs.reduce((s, [, c]) => s + c, 0) || 1
  const COLORS = ['#c4a882','#6a9b8a','#9aaf7a','#7a9aaf','#af8a7a','#8a7a9a','#9a7a6a','#7a9a7a']
  const cx = W / 2, cy = H * 0.40
  const outerR = Math.min(W * 0.35, H * 0.35)
  const innerR = outerR * 0.52

  let start = -Math.PI / 2
  pairs.forEach(([, count], i) => {
    const slice = (count / total) * Math.PI * 2
    ctx.beginPath(); ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, outerR, start, start + slice)
    ctx.closePath()
    ctx.fillStyle = COLORS[i % COLORS.length]; ctx.fill()
    ctx.strokeStyle = '#0f0f0f'; ctx.lineWidth = 1.5; ctx.stroke()
    start += slice
  })
  ctx.beginPath(); ctx.arc(cx, cy, innerR, 0, Math.PI * 2)
  ctx.fillStyle = '#0f0f0f'; ctx.fill()
  ctx.fillStyle = ACCENT
  ctx.font = `bold ${Math.max(10, Math.floor(innerR * 0.30))}px sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(pairs[0]?.[0] || '', cx, cy)
  ctx.textBaseline = 'alphabetic'

  const legendY = cy + outerR + 12
  const colW = W / 3
  pairs.slice(0, 6).forEach(([op, count], i) => {
    const lx = (i % 3) * colW + 10, ly = legendY + Math.floor(i / 3) * 16
    ctx.fillStyle = COLORS[i % COLORS.length]
    ctx.beginPath(); ctx.arc(lx + 4, ly - 3, 3.5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = TEXT_DIM; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(`${op} ${Math.round(count/total*100)}%`, lx + 10, ly)
  })
}

// ── Quadrant charts ─────────────────────────────────────────────────

function drawRadar(ctx, W, H, entries) {
  const qe = entries.filter(e => e.quadrant)
  if (!qe.length) {
    ctx.fillStyle = TEXT_DIM; ctx.font = '13px sans-serif'
    ctx.textAlign = 'center'; ctx.fillText('记录更多条目后显示', W / 2, H / 2); return
  }
  const cx = W / 2, cy = H / 2, maxR = Math.min(W, H) * 0.28

  // Grid rings
  for (let r = 1; r <= 5; r++) {
    ctx.beginPath(); ctx.arc(cx, cy, (r / 5) * maxR, 0, Math.PI * 2)
    ctx.strokeStyle = DIM_COLOR + (r === 5 ? 'aa' : '44')
    ctx.lineWidth = 0.5; ctx.stroke()
  }
  // Axes + labels
  DIMS.forEach(d => {
    const a = DIM_ANGLES[d], { label, color } = DIM_CONFIG[d]
    const ex = cx + Math.cos(a) * maxR, ey = cy - Math.sin(a) * maxR
    ctx.strokeStyle = DIM_COLOR + '66'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke()
    const lx = cx + Math.cos(a) * (maxR + 18), ly = cy - Math.sin(a) * (maxR + 18)
    ctx.fillStyle = color; ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(label, lx, ly)
  })

  // Stats
  const stats = {}
  DIMS.forEach(d => { stats[d] = { sum: 0, count: 0 } })
  qe.forEach(e => {
    const { dim, value } = e.quadrant
    if (stats[dim]) { stats[dim].sum += Math.abs(value); stats[dim].count++ }
  })

  // Filled polygon
  ctx.beginPath(); let first = true
  DIMS.forEach(d => {
    const a = DIM_ANGLES[d]
    const avg = stats[d].count ? stats[d].sum / stats[d].count : 0
    const r = (avg / 5) * maxR
    const x = cx + Math.cos(a) * r, y = cy - Math.sin(a) * r
    first ? ctx.moveTo(x, y) : ctx.lineTo(x, y); first = false
  })
  ctx.closePath()
  ctx.fillStyle = ACCENT + '28'; ctx.fill()
  ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.5; ctx.stroke()

  // Dots + value labels
  DIMS.forEach(d => {
    const a = DIM_ANGLES[d], { color } = DIM_CONFIG[d]
    const avg = stats[d].count ? stats[d].sum / stats[d].count : 0
    const r = (avg / 5) * maxR
    const x = cx + Math.cos(a) * r, y = cy - Math.sin(a) * r
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2)
    ctx.fillStyle = color; ctx.fill()
    if (stats[d].count) {
      ctx.fillStyle = color; ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(avg.toFixed(1), x, y - 13)
      ctx.font = '9px sans-serif'; ctx.fillStyle = TEXT_DIM
      ctx.fillText(`n=${stats[d].count}`, x, y + 13)
    }
  })
  ctx.textBaseline = 'alphabetic'
}

function drawTimeScatter(ctx, W, H, entries) {
  const qe = entries.filter(e => e.quadrant)
    .map(e => ({ ...e.quadrant, ts: new Date(e.created_at).getTime() }))
    .sort((a, b) => a.ts - b.ts)
  if (!qe.length) {
    ctx.fillStyle = TEXT_DIM; ctx.font = '13px sans-serif'
    ctx.textAlign = 'center'; ctx.fillText('记录更多条目后显示', W / 2, H / 2); return
  }
  const padL = 42, padR = 12, padT = 8, padB = 26
  const cw = W - padL - padR, ch = H - padT - padB
  const trackH = ch / 4
  const minTs = qe[0].ts, tsRange = Math.max(qe[qe.length - 1].ts - minTs, 1)

  DIMS.forEach((d, i) => {
    const ty = padT + i * trackH, { label, color } = DIM_CONFIG[d]
    ctx.fillStyle = color + '0c'; ctx.fillRect(padL, ty, cw, trackH)
    ctx.strokeStyle = DIM_COLOR + '30'; ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.moveTo(padL, ty + trackH); ctx.lineTo(padL + cw, ty + trackH); ctx.stroke()
    ctx.setLineDash([3, 4]); ctx.strokeStyle = DIM_COLOR + '50'
    ctx.beginPath(); ctx.moveTo(padL, ty + trackH / 2); ctx.lineTo(padL + cw, ty + trackH / 2); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = color; ctx.font = '10px sans-serif'
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    ctx.fillText(label, padL - 4, ty + trackH / 2)
    ctx.fillStyle = TEXT_DIM; ctx.font = '8px sans-serif'
    ctx.fillText('+5', padL - 4, ty + 6); ctx.fillText('-5', padL - 4, ty + trackH - 3)
  })

  if (qe.length >= 2) {
    const fmt = ts => { const d = new Date(ts); return `${d.getMonth()+1}/${d.getDate()}` }
    ctx.fillStyle = TEXT_DIM; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(fmt(qe[0].ts), padL, H - padB + 4)
    ctx.fillText(fmt(qe[qe.length-1].ts), padL + cw, H - padB + 4)
    ctx.textBaseline = 'alphabetic'
  }

  qe.forEach(q => {
    const idx = DIMS.indexOf(q.dim); if (idx < 0) return
    const ty = padT + idx * trackH
    const x = padL + ((q.ts - minTs) / tsRange) * cw
    const y = (ty + trackH / 2) - (q.value / 5) * (trackH / 2 - 4)
    const r = 3 + (q.energy - 10) / 40 * 7
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = DIM_CONFIG[q.dim].color + 'bb'; ctx.fill()
    if (r > 6) {
      ctx.fillStyle = DIM_CONFIG[q.dim].color; ctx.font = '8px sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(q.dim[0], x, y)
      ctx.textBaseline = 'alphabetic'
    }
  })
}

function drawEnergyHist(ctx, W, H, entries) {
  const qe = entries.filter(e => e.quadrant)
  if (!qe.length) {
    ctx.fillStyle = TEXT_DIM; ctx.font = '13px sans-serif'
    ctx.textAlign = 'center'; ctx.fillText('记录更多条目后显示', W / 2, H / 2); return
  }
  const BINS = [
    { min: 10, max: 20, l1: '10-20', l2: '微风' },
    { min: 21, max: 30, l1: '21-30', l2: '波浪' },
    { min: 31, max: 40, l1: '31-40', l2: '暗流' },
    { min: 41, max: 50, l1: '41-50', l2: '风暴' },
  ]
  const counts = BINS.map(b => {
    const c = {}; DIMS.forEach(d => { c[d] = 0 })
    qe.forEach(e => { const en = e.quadrant.energy; if (en >= b.min && en <= b.max) c[e.quadrant.dim]++ })
    return c
  })
  const maxT = Math.max(...counts.map(c => DIMS.reduce((s, d) => s + c[d], 0)), 1)
  const padL = 10, padR = 56, padT = 10, padB = 34
  const cw = W - padL - padR, ch = H - padT - padB
  const bw = cw / BINS.length * 0.65, gap = cw / BINS.length

  counts.forEach((c, i) => {
    const bx = padL + i * gap + gap * 0.175
    let sy = padT + ch
    DIMS.forEach(d => {
      const cnt = c[d]; if (!cnt) return
      const bh = (cnt / maxT) * ch; sy -= bh
      ctx.fillStyle = DIM_CONFIG[d].color + 'cc'
      ctx.fillRect(bx, sy, bw, bh)
    })
    const total = DIMS.reduce((s, d) => s + c[d], 0)
    if (total) {
      ctx.fillStyle = TEXT_DIM; ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText(total, bx + bw / 2, padT + ch - 2)
    }
    ctx.fillStyle = TEXT_DIM; ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(BINS[i].l1, bx + bw / 2, padT + ch + 4)
    ctx.fillText(BINS[i].l2, bx + bw / 2, padT + ch + 16)
  })

  const lx = W - padR + 6, ly = padT + 4
  DIMS.forEach((d, i) => {
    ctx.fillStyle = DIM_CONFIG[d].color
    ctx.fillRect(lx, ly + i * 14, 8, 8)
    ctx.font = '10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillStyle = TEXT_DIM
    ctx.fillText(DIM_CONFIG[d].label, lx + 11, ly + i * 14 + 4)
  })
  ctx.textBaseline = 'alphabetic'
}

// ── Main component ──────────────────────────────────────────────────
export default function JournalCharts({ entries }) {
  const [tab, setTab] = useState('tags')
  const taggedCount = entries.filter(e => e.tags).length
  const quadCount   = entries.filter(e => e.quadrant).length

  if (taggedCount === 0 && quadCount === 0) {
    return (
      <div className="charts-empty">
        <p>记录 1 条并完成分析后</p>
        <p>图谱自动生成</p>
      </div>
    )
  }

  return (
    <div className="charts-container">
      <div className="charts-tabs">
        <button className={`charts-tab ${tab === 'tags' ? 'charts-tab--active' : ''}`}
          onClick={() => setTab('tags')}>认知标签</button>
        <button className={`charts-tab ${tab === 'quadrant' ? 'charts-tab--active' : ''}`}
          onClick={() => setTab('quadrant')}>
          四维图谱
          {quadCount > 0 && <span className="charts-tab-badge">{quadCount}</span>}
        </button>
      </div>

      {tab === 'tags' && (
        <>
          <Chart title="情绪 / 极性时间线"
            drawFn={drawTimeline} entries={entries} height={170} />
          <Chart title="内容对象"
            drawFn={(c, W, H, e) => drawBubble(c, W, H, e, 'tags.object', LAYER_COLORS.object)}
            entries={entries} height={200} />
          <Chart title="心理动作频谱"
            drawFn={(c, W, H, e) => drawDonut(c, W, H, e, 'tags.operation')}
            entries={entries} height={220} />
          {countField(entries.filter(e => e.tags), 'tags.tension').length > 0 && (
            <Chart title="内在张力"
              drawFn={(c, W, H, e) => drawBubble(c, W, H, e, 'tags.tension', LAYER_COLORS.tension)}
              entries={entries} height={200} />
          )}
          {countField(entries.filter(e => e.tags), 'tags.output_form').length > 0 && (
            <Chart title="可沉淀形态"
              drawFn={(c, W, H, e) => drawBubble(c, W, H, e, 'tags.output_form', LAYER_COLORS.output_form)}
              entries={entries} height={180} />
          )}
        </>
      )}

      {tab === 'quadrant' && (
        quadCount === 0 ? (
          <div className="charts-empty">
            <p>四维数据收集中</p>
            <p className="charts-empty-sub">新记录保存后自动分析</p>
          </div>
        ) : (
          <>
            <Chart title="四维均值雷达"
              drawFn={drawRadar} entries={entries} height={240} />
            <Chart title="四维时间轨迹（点大小=能量强度）"
              drawFn={drawTimeScatter} entries={entries} height={220} />
            <Chart title="能量分布（按维度）"
              drawFn={drawEnergyHist} entries={entries} height={180} />
          </>
        )
      )}
    </div>
  )
}
