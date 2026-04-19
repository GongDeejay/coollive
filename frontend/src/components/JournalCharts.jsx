import { useEffect, useRef } from 'react'
import './JournalCharts.css'

// ── Emotion color map ──────────────────────────────────────────────
const EMOTION_COLORS = {
  焦虑: '#c4855a', 平静: '#6a9b8a', 顿悟: '#c4a882',
  喜悦: '#8aaf6a', 低落: '#7a7a9a', 愤怒: '#9a5a5a',
  困惑: '#8a7a5a', 感恩: '#7a9a6a', 空: '#6a6a6a',
}
const ENERGY_SCORE = { 高能: 1, 平稳: 0, 低谷: -1 }
const ACCENT = '#c4a882'
const DIM = '#3a3a3a'
const TEXT_DIM = '#6a6060'

// ── Tiny canvas chart helpers ──────────────────────────────────────

function drawTimelineChart(canvas, entries) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)

  const dated = entries
    .filter(e => e.tags)
    .map(e => ({
      ts: new Date(e.created_at).getTime(),
      score: ENERGY_SCORE[e.tags.energy] ?? 0,
      emotion: e.tags.emotion?.[0] || '平静',
      summary: e.summary || '',
    }))
    .sort((a, b) => a.ts - b.ts)

  if (dated.length < 1) {
    ctx.fillStyle = TEXT_DIM
    ctx.font = '13px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('记录更多条目后显示', W / 2, H / 2)
    return
  }

  const pad = { l: 20, r: 20, t: 20, b: 30 }
  const cw = W - pad.l - pad.r
  const ch = H - pad.t - pad.b
  const minTs = dated[0].ts, maxTs = dated[dated.length - 1].ts || minTs + 1

  // Grid line at 0
  const yMid = pad.t + ch / 2
  ctx.strokeStyle = DIM
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.beginPath(); ctx.moveTo(pad.l, yMid); ctx.lineTo(W - pad.r, yMid); ctx.stroke()
  ctx.setLineDash([])

  // Plot points + connecting line
  const pts = dated.map(d => ({
    x: pad.l + (maxTs === minTs ? cw / 2 : ((d.ts - minTs) / (maxTs - minTs)) * cw),
    y: yMid - (d.score * (ch / 2 - 8)),
    color: EMOTION_COLORS[d.emotion] || ACCENT,
    ...d,
  }))

  if (pts.length > 1) {
    ctx.strokeStyle = '#3a3a3a'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
    ctx.stroke()
  }

  pts.forEach(p => {
    ctx.beginPath()
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
    ctx.fillStyle = p.color
    ctx.fill()
  })

  // X labels
  ctx.fillStyle = TEXT_DIM
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'center'
  ;[0, dated.length - 1].forEach(i => {
    if (!dated[i]) return
    const d = new Date(dated[i].ts)
    const label = `${d.getMonth()+1}/${d.getDate()}`
    ctx.fillText(label, pts[i].x, H - 8)
  })

  // Y labels
  ctx.textAlign = 'left'
  ctx.fillText('高能', 2, pad.t + 10)
  ctx.fillText('低谷', 2, H - pad.b - 4)
}


function drawBubbleChart(canvas, entries) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)

  const tagged = entries.filter(e => e.tags)
  if (!tagged.length) {
    ctx.fillStyle = TEXT_DIM; ctx.font = '13px sans-serif'
    ctx.textAlign = 'center'; ctx.fillText('记录更多条目后显示', W/2, H/2); return
  }

  // Count topics
  const topicCount = {}
  tagged.forEach(e => e.tags.topic?.forEach(t => { topicCount[t] = (topicCount[t] || 0) + 1 }))
  const topics = Object.entries(topicCount).sort((a, b) => b[1] - a[1])
  const maxCount = topics[0]?.[1] || 1

  // Layout bubbles in a circle
  const cx = W / 2, cy = H / 2
  const n = topics.length
  const radius = Math.min(W, H) * 0.32

  topics.forEach(([topic, count], i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2
    const size = 16 + (count / maxCount) * 28
    const bx = n === 1 ? cx : cx + Math.cos(angle) * radius
    const by = n === 1 ? cy : cy + Math.sin(angle) * radius

    ctx.beginPath()
    ctx.arc(bx, by, size, 0, Math.PI * 2)
    ctx.fillStyle = ACCENT + '22'
    ctx.fill()
    ctx.strokeStyle = ACCENT + '66'
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.fillStyle = ACCENT
    ctx.font = `${Math.max(10, 10 + count * 1.5)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(topic, bx, by)
    if (count > 1) {
      ctx.font = '9px sans-serif'
      ctx.fillStyle = TEXT_DIM
      ctx.fillText(`×${count}`, bx, by + size * 0.65)
    }
  })
  ctx.textBaseline = 'alphabetic'
}


function drawOperationChart(canvas, entries) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)

  const tagged = entries.filter(e => e.tags)
  if (!tagged.length) {
    ctx.fillStyle = TEXT_DIM; ctx.font = '13px sans-serif'
    ctx.textAlign = 'center'; ctx.fillText('记录更多条目后显示', W/2, H/2); return
  }

  const opCount = {}
  tagged.forEach(e => e.tags.operation?.forEach(o => { opCount[o] = (opCount[o] || 0) + 1 }))
  const ops = Object.entries(opCount).sort((a, b) => b[1] - a[1])
  const total = ops.reduce((s, [, c]) => s + c, 0) || 1

  const COLORS = ['#c4a882', '#6a9b8a', '#c4855a', '#8aaf6a', '#7a7a9a', '#8a7a5a', '#9a5a5a', '#7a9a6a']
  const cx = W / 2, cy = H * 0.44, outerR = Math.min(W, H) * 0.3, innerR = outerR * 0.52

  let startAngle = -Math.PI / 2
  ops.forEach(([op, count], i) => {
    const slice = (count / total) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, outerR, startAngle, startAngle + slice)
    ctx.closePath()
    ctx.fillStyle = COLORS[i % COLORS.length]
    ctx.fill()
    ctx.strokeStyle = '#0f0f0f'
    ctx.lineWidth = 2
    ctx.stroke()
    startAngle += slice
  })

  // Donut hole
  ctx.beginPath()
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2)
  ctx.fillStyle = '#0f0f0f'
  ctx.fill()

  // Center label
  ctx.fillStyle = ACCENT
  ctx.font = `bold ${Math.floor(innerR * 0.35)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(ops[0]?.[0] || '', cx, cy)
  ctx.textBaseline = 'alphabetic'

  // Legend below
  const legendY = cy + outerR + 16
  const colW = W / Math.min(ops.length, 3)
  ops.slice(0, 6).forEach(([op, count], i) => {
    const lx = (i % 3) * colW + colW / 2
    const ly = legendY + Math.floor(i / 3) * 18
    ctx.fillStyle = COLORS[i % COLORS.length]
    ctx.beginPath(); ctx.arc(lx - 28, ly - 3, 4, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = TEXT_DIM
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(`${op} ${Math.round(count/total*100)}%`, lx - 20, ly)
  })
}


// ── Chart component ────────────────────────────────────────────────

function Chart({ title, draw, entries, height = 200 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = canvas.offsetWidth * dpr
    canvas.height = height * dpr
    canvas.getContext('2d').scale(dpr, dpr)
    draw(canvas, entries)
  }, [entries, draw, height])

  return (
    <div className="chart-card">
      <div className="chart-title">{title}</div>
      <canvas ref={canvasRef} className="chart-canvas" style={{ height }} />
    </div>
  )
}


export default function JournalCharts({ entries }) {
  const taggedCount = entries.filter(e => e.tags).length

  if (taggedCount === 0) {
    return (
      <div className="charts-empty">
        <p>记录 1 条并完成分析后</p>
        <p>图谱自动生成</p>
      </div>
    )
  }

  return (
    <div className="charts-container">
      <Chart
        title="情绪能量时间线"
        draw={drawTimelineChart}
        entries={entries}
        height={180}
      />
      <Chart
        title="主题星云"
        draw={drawBubbleChart}
        entries={entries}
        height={220}
      />
      <Chart
        title="认知操作频谱"
        draw={drawOperationChart}
        entries={entries}
        height={240}
      />
    </div>
  )
}
