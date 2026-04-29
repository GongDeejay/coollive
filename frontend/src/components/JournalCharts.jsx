import { useEffect, useRef } from 'react'
import './JournalCharts.css'

// ── Color maps ──────────────────────────────────────────────────────
const EMOTION_COLORS = {
  焦虑: '#c4855a', 平静: '#6a9b8a', 顿悟: '#c4a882',
  喜悦: '#8aaf6a', 低落: '#7a7a9a', 愤怒: '#9a5a5a',
  困惑: '#8a7a5a', 感恩: '#7a9a6a', 空: '#6a6a6a',
  疲惫: '#8a6a5a', 兴奋: '#9aaf5a', 矛盾: '#8a6a9a',
  满足: '#6a9a7a', 孤独: '#6a6a8a', 轻松: '#6a9a8a', 烦躁: '#9a6a5a',
}
const LAYER_COLORS = {
  object:      '#7a9aaf',
  operation:   '#9aaf7a',
  tension:     '#af8a7a',
  output_form: '#c4a882',
}
const ACCENT = '#c4a882'
const DIM = '#3a3a3a'
const TEXT_DIM = '#6a6060'

function countField(entries, fieldPath) {
  // fieldPath: 'tags.object', 'tags.operation', etc.
  const counts = {}
  for (const e of entries) {
    if (!e.tags) continue
    const parts = fieldPath.split('.')
    const arr = parts.reduce((o, k) => o?.[k], e)
    if (!Array.isArray(arr)) continue
    for (const v of arr) {
      counts[v] = (counts[v] || 0) + 1
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
}

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


// ── Bubble chart (generic, used for object / tension / output_form) ──
function drawBubbleChart(canvas, entries, field, color) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)

  const pairs = countField(entries.filter(e => e.tags), field)
  if (!pairs.length) {
    ctx.fillStyle = TEXT_DIM; ctx.font = '13px sans-serif'
    ctx.textAlign = 'center'; ctx.fillText('记录更多条目后显示', W/2, H/2); return
  }

  const maxCount = pairs[0][1] || 1
  const cx = W / 2, cy = H / 2
  const n = pairs.length
  const radius = Math.min(W, H) * 0.30

  pairs.slice(0, 10).forEach(([label, count], i) => {
    const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2
    const size = 14 + (count / maxCount) * 26
    const bx = n === 1 ? cx : cx + Math.cos(angle) * radius
    const by = n === 1 ? cy : cy + Math.sin(angle) * radius

    ctx.beginPath(); ctx.arc(bx, by, size, 0, Math.PI * 2)
    ctx.fillStyle = color + '20'; ctx.fill()
    ctx.strokeStyle = color + '70'; ctx.lineWidth = 1; ctx.stroke()

    ctx.fillStyle = color
    ctx.font = `${Math.max(10, 9 + count * 1.2)}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(label, bx, by)
    if (count > 1) {
      ctx.font = '9px sans-serif'; ctx.fillStyle = TEXT_DIM
      ctx.fillText(`×${count}`, bx, by + size * 0.68)
    }
  })
  ctx.textBaseline = 'alphabetic'
}

// ── Donut chart (generic, used for operation) ──────────────────────
function drawDonutChart(canvas, entries, field, title) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)

  const pairs = countField(entries.filter(e => e.tags), field)
  if (!pairs.length) {
    ctx.fillStyle = TEXT_DIM; ctx.font = '13px sans-serif'
    ctx.textAlign = 'center'; ctx.fillText('记录更多条目后显示', W/2, H/2); return
  }

  const total = pairs.reduce((s, [, c]) => s + c, 0) || 1
  const COLORS = ['#c4a882','#6a9b8a','#9aaf7a','#7a9aaf','#af8a7a','#8a7a9a','#9a7a6a','#7a9a7a']
  const cx = W / 2, cy = H * 0.42
  const outerR = Math.min(W, H) * 0.28
  const innerR = outerR * 0.54

  let startAngle = -Math.PI / 2
  pairs.forEach(([, count], i) => {
    const slice = (count / total) * Math.PI * 2
    ctx.beginPath(); ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, outerR, startAngle, startAngle + slice)
    ctx.closePath()
    ctx.fillStyle = COLORS[i % COLORS.length]; ctx.fill()
    ctx.strokeStyle = '#0f0f0f'; ctx.lineWidth = 2; ctx.stroke()
    startAngle += slice
  })

  ctx.beginPath(); ctx.arc(cx, cy, innerR, 0, Math.PI * 2)
  ctx.fillStyle = '#0f0f0f'; ctx.fill()

  ctx.fillStyle = ACCENT
  ctx.font = `bold ${Math.floor(innerR * 0.32)}px sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(pairs[0]?.[0] || '', cx, cy)
  ctx.textBaseline = 'alphabetic'

  const legendY = cy + outerR + 14
  const colW = W / 3
  pairs.slice(0, 6).forEach(([op, count], i) => {
    const lx = (i % 3) * colW + 12
    const ly = legendY + Math.floor(i / 3) * 17
    ctx.fillStyle = COLORS[i % COLORS.length]
    ctx.beginPath(); ctx.arc(lx + 4, ly - 3, 4, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = TEXT_DIM; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(`${op} ${Math.round(count/total*100)}%`, lx + 11, ly)
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
      {/* 情绪时间线 */}
      <Chart
        title="情绪时间线"
        draw={drawTimelineChart}
        entries={entries}
        height={170}
      />
      {/* 第一层：内容对象 */}
      <Chart
        title="内容对象分布"
        draw={(c, e) => drawBubbleChart(c, e, 'tags.object', LAYER_COLORS.object)}
        entries={entries}
        height={210}
      />
      {/* 第二层：心理动作 */}
      <Chart
        title="心理动作频谱"
        draw={(c, e) => drawDonutChart(c, e, 'tags.operation', '心理动作')}
        entries={entries}
        height={230}
      />
      {/* 第三层：内在张力（只在有数据时显示）*/}
      {countField(entries.filter(e => e.tags), 'tags.tension').length > 0 && (
        <Chart
          title="内在张力分布"
          draw={(c, e) => drawBubbleChart(c, e, 'tags.tension', LAYER_COLORS.tension)}
          entries={entries}
          height={210}
        />
      )}
      {/* 第四层：输出形态（只在有数据时显示）*/}
      {countField(entries.filter(e => e.tags), 'tags.output_form').length > 0 && (
        <Chart
          title="可沉淀形态"
          draw={(c, e) => drawBubbleChart(c, e, 'tags.output_form', LAYER_COLORS.output_form)}
          entries={entries}
          height={180}
        />
      )}
    </div>
  )
}
