import { useEffect, useRef, useState } from 'react'
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


// ── Quadrant dimension config ──────────────────────────────────────
const DIM_CONFIG = {
  Others: { label: '对人', color: '#7a9aaf' },
  Self:   { label: '对己', color: '#c4a882' },
  Task:   { label: '对事', color: '#9aaf7a' },
  World:  { label: '对世', color: '#af8a7a' },
}
const DIMS = ['Others', 'Self', 'Task', 'World']
const DIM_ANGLES = { Others: Math.PI / 2, Self: 0, Task: -Math.PI / 2, World: Math.PI }

function drawRadarChart(canvas, entries) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)
  const qe = entries.filter(e => e.quadrant)
  if (!qe.length) {
    ctx.fillStyle = TEXT_DIM; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('记录更多条目后显示', W/2, H/2); return
  }
  const cx = W / 2, cy = H / 2, maxR = Math.min(W, H) * 0.30
  // Grid
  for (let r = 1; r <= 5; r++) {
    ctx.beginPath(); ctx.arc(cx, cy, (r/5)*maxR, 0, Math.PI*2)
    ctx.strokeStyle = DIM + (r===5?'cc':'55'); ctx.lineWidth = 0.5; ctx.stroke()
  }
  // Axes + labels
  DIMS.forEach(d => {
    const a = DIM_ANGLES[d], { label, color } = DIM_CONFIG[d]
    ctx.strokeStyle = DIM+'80'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(a)*maxR, cy - Math.sin(a)*maxR); ctx.stroke()
    const lx = cx + Math.cos(a)*(maxR+20), ly = cy - Math.sin(a)*(maxR+20)
    ctx.fillStyle = color; ctx.font = '12px sans-serif'
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
  // Polygon
  ctx.beginPath(); let first = true
  DIMS.forEach(d => {
    const a = DIM_ANGLES[d]
    const avg = stats[d].count ? stats[d].sum/stats[d].count : 0
    const r = (avg/5)*maxR
    const x = cx + Math.cos(a)*r, y = cy - Math.sin(a)*r
    first ? ctx.moveTo(x,y) : ctx.lineTo(x,y); first = false
  })
  ctx.closePath()
  ctx.fillStyle = ACCENT+'28'; ctx.fill()
  ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.5; ctx.stroke()
  // Dots
  DIMS.forEach(d => {
    const a = DIM_ANGLES[d], { color } = DIM_CONFIG[d]
    const avg = stats[d].count ? stats[d].sum/stats[d].count : 0
    const r = (avg/5)*maxR
    const x = cx + Math.cos(a)*r, y = cy - Math.sin(a)*r
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI*2)
    ctx.fillStyle = color; ctx.fill()
    if (stats[d].count) {
      ctx.fillStyle = color; ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(`${avg.toFixed(1)}`, x, y-13)
      ctx.font = '9px sans-serif'; ctx.fillStyle = TEXT_DIM
      ctx.fillText(`n=${stats[d].count}`, x, y+13)
    }
  })
  ctx.textBaseline = 'alphabetic'
}

function drawTimeScatterChart(canvas, entries) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)
  const qe = entries.filter(e => e.quadrant)
    .map(e => ({ ...e.quadrant, ts: new Date(e.created_at).getTime(), summary: e.summary||'' }))
    .sort((a,b) => a.ts - b.ts)
  if (!qe.length) {
    ctx.fillStyle = TEXT_DIM; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('记录更多条目后显示', W/2, H/2); return
  }
  const padL=40, padR=10, padT=8, padB=28
  const cw = W-padL-padR, ch = H-padT-padB
  const trackH = ch/4
  const minTs = qe[0].ts, tsRange = Math.max(qe[qe.length-1].ts - minTs, 1)

  DIMS.forEach((d, i) => {
    const ty = padT + i*trackH, { label, color } = DIM_CONFIG[d]
    ctx.fillStyle = color+'08'; ctx.fillRect(padL, ty, cw, trackH)
    ctx.strokeStyle = DIM+'40'; ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.moveTo(padL, ty+trackH); ctx.lineTo(padL+cw, ty+trackH); ctx.stroke()
    ctx.setLineDash([3,4]); ctx.strokeStyle = DIM+'60'
    ctx.beginPath(); ctx.moveTo(padL, ty+trackH/2); ctx.lineTo(padL+cw, ty+trackH/2); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = color; ctx.font = '10px sans-serif'
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    ctx.fillText(label, padL-3, ty+trackH/2)
    // +/- labels
    ctx.fillStyle = TEXT_DIM; ctx.font = '8px sans-serif'
    ctx.fillText('+5', padL-3, ty+5); ctx.fillText('-5', padL-3, ty+trackH-3)
  })

  ctx.textBaseline = 'top'; ctx.fillStyle = TEXT_DIM; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
  if (qe.length>=2) {
    const d0=new Date(qe[0].ts), d1=new Date(qe[qe.length-1].ts)
    ctx.fillText(`${d0.getMonth()+1}/${d0.getDate()}`, padL, H-padB+4)
    ctx.fillText(`${d1.getMonth()+1}/${d1.getDate()}`, padL+cw, H-padB+4)
  }

  qe.forEach(q => {
    const idx = DIMS.indexOf(q.dim); if (idx<0) return
    const ty = padT + idx*trackH
    const x = padL + ((q.ts-minTs)/tsRange)*cw
    const y = (ty+trackH/2) - (q.value/5)*(trackH/2-4)
    const r = 3 + (q.energy-10)/40*7
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2)
    ctx.fillStyle = DIM_CONFIG[q.dim].color+'bb'; ctx.fill()
    if (r>5) {
      ctx.fillStyle = DIM_CONFIG[q.dim].color; ctx.font='8px sans-serif'
      ctx.textAlign='center'; ctx.textBaseline='middle'
      ctx.fillText(q.dim[0], x, y)
    }
  })
  ctx.textBaseline = 'alphabetic'
}

function drawEnergyHistogram(canvas, entries) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)
  const qe = entries.filter(e => e.quadrant)
  if (!qe.length) {
    ctx.fillStyle = TEXT_DIM; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('记录更多条目后显示', W/2, H/2); return
  }
  const BINS = [
    {min:10,max:20,l1:'10-20',l2:'微风'},
    {min:21,max:30,l1:'21-30',l2:'波浪'},
    {min:31,max:40,l1:'31-40',l2:'暗流'},
    {min:41,max:50,l1:'41-50',l2:'风暴'},
  ]
  const counts = BINS.map(b => {
    const c = {}; DIMS.forEach(d => c[d]=0)
    qe.forEach(e => { const en=e.quadrant.energy; if (en>=b.min&&en<=b.max) c[e.quadrant.dim]++ })
    return c
  })
  const maxT = Math.max(...counts.map(c => DIMS.reduce((s,d)=>s+c[d],0)), 1)
  const padL=10, padR=60, padT=10, padB=36
  const cw=W-padL-padR, ch=H-padT-padB
  const bw=cw/BINS.length*0.65, gap=cw/BINS.length

  counts.forEach((c,i) => {
    const bx = padL + i*gap + gap*0.175
    let sy = padT+ch
    DIMS.forEach(d => {
      const cnt=c[d]; if (!cnt) return
      const bh = (cnt/maxT)*ch; sy -= bh
      ctx.fillStyle = DIM_CONFIG[d].color+'cc'
      ctx.fillRect(bx, sy, bw, bh)
    })
    const total = DIMS.reduce((s,d)=>s+c[d],0)
    if (total) {
      ctx.fillStyle=TEXT_DIM; ctx.font='bold 11px sans-serif'
      ctx.textAlign='center'; ctx.textBaseline='bottom'
      ctx.fillText(total, bx+bw/2, padT+ch-1)
    }
    ctx.fillStyle=TEXT_DIM; ctx.font='10px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='top'
    ctx.fillText(BINS[i].l1, bx+bw/2, padT+ch+4)
    ctx.fillText(BINS[i].l2, bx+bw/2, padT+ch+16)
  })

  // Legend
  const lx=W-padR+6, ly=padT+4
  DIMS.forEach((d,i) => {
    ctx.fillStyle=DIM_CONFIG[d].color
    ctx.fillRect(lx, ly+i*14, 8, 8)
    ctx.font='10px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='middle'
    ctx.fillStyle=TEXT_DIM
    ctx.fillText(DIM_CONFIG[d].label, lx+11, ly+i*14+4)
  })
  ctx.textBaseline='alphabetic'
}


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
      {/* Tab switcher */}
      <div className="charts-tabs">
        <button className={`charts-tab ${tab==='tags'?'charts-tab--active':''}`} onClick={()=>setTab('tags')}>
          认知标签
        </button>
        <button className={`charts-tab ${tab==='quadrant'?'charts-tab--active':''}`} onClick={()=>setTab('quadrant')}>
          四维图谱
          {quadCount > 0 && <span className="charts-tab-badge">{quadCount}</span>}
        </button>
      </div>

      {tab === 'tags' && (
        <>
          <Chart title="情绪时间线" draw={drawTimelineChart} entries={entries} height={170} />
          <Chart title="内容对象"
            draw={(c,e)=>drawBubbleChart(c,e,'tags.object',LAYER_COLORS.object)}
            entries={entries} height={200} />
          <Chart title="心理动作频谱"
            draw={(c,e)=>drawDonutChart(c,e,'tags.operation')}
            entries={entries} height={220} />
          {countField(entries.filter(e=>e.tags),'tags.tension').length > 0 && (
            <Chart title="内在张力"
              draw={(c,e)=>drawBubbleChart(c,e,'tags.tension',LAYER_COLORS.tension)}
              entries={entries} height={200} />
          )}
          {countField(entries.filter(e=>e.tags),'tags.output_form').length > 0 && (
            <Chart title="可沉淀形态"
              draw={(c,e)=>drawBubbleChart(c,e,'tags.output_form',LAYER_COLORS.output_form)}
              entries={entries} height={180} />
          )}
        </>
      )}

      {tab === 'quadrant' && (
        <>
          {quadCount === 0 ? (
            <div className="charts-empty">
              <p>四维数据收集中</p>
              <p className="charts-empty-sub">新记录保存后自动分析</p>
            </div>
          ) : (
            <>
              <Chart title="四维均值雷达" draw={drawRadarChart} entries={entries} height={240} />
              <Chart title="四维时间轨迹（点大小=能量）" draw={drawTimeScatterChart} entries={entries} height={220} />
              <Chart title="能量分布（按维度）" draw={drawEnergyHistogram} entries={entries} height={180} />
            </>
          )}
        </>
      )}
    </div>
  )
}
