import { useEffect, useRef, useCallback } from 'react'
import { useMindFreedom } from '../hooks/useMindFreedom'
import './MindFreedomPage.css'

// ── Radar chart (pure Canvas, 3-axis equilateral triangle) ────────
function MindRadar({ cognitive, discernment, presence }) {
  const wrapRef   = useRef(null)
  const canvasRef = useRef(null)

  const draw = useCallback(() => {
    const wrap   = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const W   = wrap.offsetWidth || 300
    const H   = Math.min(W * 0.75, 260)
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    canvas.width  = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    canvas.style.width  = W + 'px'
    canvas.style.height = H + 'px'
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)

    const cx = W / 2
    const cy = H * 0.52
    const maxR = Math.min(W, H) * 0.33

    // 3 axes: top = cognitive (90°), bottom-right = discernment (330°), bottom-left = presence (210°)
    const AXES = [
      { label: '认知自由度', val: cognitive,   angle: -Math.PI / 2 },
      { label: '取舍自由度', val: discernment, angle: -Math.PI / 2 + (2 * Math.PI / 3) },
      { label: '在场自由度', val: presence,    angle: -Math.PI / 2 + (4 * Math.PI / 3) },
    ]
    const ACCENT   = '#c4a882'
    const DIMCOLOR = '#3a3a3a'
    const TEXTDIM  = '#8a8078'

    // Grid rings at 20%, 40%, 60%, 80%, 100%
    for (let t = 1; t <= 5; t++) {
      const r = (t / 5) * maxR
      ctx.beginPath()
      AXES.forEach((a, i) => {
        const x = cx + Math.cos(a.angle) * r
        const y = cy + Math.sin(a.angle) * r
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.closePath()
      ctx.strokeStyle = DIMCOLOR + (t === 5 ? 'cc' : '55')
      ctx.lineWidth   = 0.5
      ctx.stroke()
    }

    // Axis lines
    AXES.forEach(a => {
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(a.angle) * maxR, cy + Math.sin(a.angle) * maxR)
      ctx.strokeStyle = DIMCOLOR + '55'
      ctx.lineWidth   = 1
      ctx.stroke()
    })

    // Filled polygon
    ctx.beginPath()
    AXES.forEach((a, i) => {
      const r = (a.val / 100) * maxR
      const x = cx + Math.cos(a.angle) * r
      const y = cy + Math.sin(a.angle) * r
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.closePath()
    ctx.fillStyle   = ACCENT + '28'
    ctx.fill()
    ctx.strokeStyle = ACCENT
    ctx.lineWidth   = 1.5
    ctx.stroke()

    // Dots + value labels
    AXES.forEach(a => {
      const r  = (a.val / 100) * maxR
      const x  = cx + Math.cos(a.angle) * r
      const y  = cy + Math.sin(a.angle) * r
      ctx.beginPath()
      ctx.arc(x, y, 5, 0, Math.PI * 2)
      ctx.fillStyle = ACCENT
      ctx.fill()
      ctx.strokeStyle = '#111'
      ctx.lineWidth   = 1
      ctx.stroke()
      // Score label
      ctx.fillStyle     = ACCENT
      ctx.font          = 'bold 11px sans-serif'
      ctx.textAlign     = 'center'
      ctx.textBaseline  = 'middle'
      ctx.fillText(String(a.val), x, y - 14)
    })

    // Axis labels (outside)
    AXES.forEach(a => {
      const lx = cx + Math.cos(a.angle) * (maxR + 22)
      const ly = cy + Math.sin(a.angle) * (maxR + 22)
      ctx.fillStyle    = TEXTDIM
      ctx.font         = '11px sans-serif'
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(a.label, lx, ly)
    })

    ctx.textBaseline = 'alphabetic'
  }, [cognitive, discernment, presence])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => draw())
    ro.observe(wrap)
    draw()
    return () => ro.disconnect()
  }, [draw])

  return (
    <div ref={wrapRef} className="mf-radar-wrap">
      <canvas ref={canvasRef} className="mf-radar-canvas" />
    </div>
  )
}

// ── Intro view ─────────────────────────────────────────────────────
function IntroView({ onStart, onHistory, hasHistory, error }) {
  return (
    <div className="mf-intro">
      <div className="mf-intro-header">
        <h1 className="mf-intro-title">心智自由度</h1>
        <p className="mf-intro-subtitle">十二道问题 · 5–10 分钟</p>
      </div>

      <div className="mf-intro-notice mf-intro-notice--simple">
        <p className="mf-intro-desc">
          这是开发者基于个人对思维世界的理解，提出的一套分析框架。
        </p>
        <p className="mf-intro-desc">
          当作趣味测试来玩就好。没有标准答案，请按直觉回答，越真实越有意思。
        </p>
      </div>

      {error && <p className="mf-error">{error}</p>}

      <div className="mf-intro-actions">
        <button className="mf-btn mf-btn--primary" onClick={onStart}
          style={{ width: '100%', maxWidth: 320, padding: '13px' }}>
          开始测测
        </button>
        {hasHistory && (
          <button className="mf-btn mf-btn--ghost" onClick={onHistory}>
            查看历史记录
          </button>
        )}
      </div>
    </div>
  )
}

// ── Loading view ────────────────────────────────────────────────────
function LoadingQView() {
  return (
    <div className="mf-loading">
      <div className="mf-loading-dots">
        <span /><span /><span />
      </div>
      <p className="mf-loading-text">题目准备中…</p>
    </div>
  )
}

// ── Multi-blank separator ──────────────────────────────────────────
const BLANK_SEP = '\n——\n'

// Split question text by '……' to count / locate blanks
function getBlankSegments(text) {
  return (text || '').split('……')
}

// Smart answer input: single textarea OR per-blank textareas
function SmartInput({ question, answer, onAnswer }) {
  const segments  = getBlankSegments(question.text)
  const blankCount = segments.length - 1

  const autoResize = e => {
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  if (blankCount < 2) {
    return (
      <>
        <textarea
          className="mf-textarea"
          placeholder="不需要写得正确，请写你第一反应中最真实的部分……"
          value={answer || ''}
          onChange={e => { onAnswer(e.target.value); autoResize(e) }}
          rows={4}
          autoFocus
        />
        <p className="mf-test-hint">建议 1–3 句话 · 支持语音输入</p>
      </>
    )
  }

  // Multiple blanks: one textarea per blank, with question segments as labels
  const parts = (answer || '').split(BLANK_SEP)
  return (
    <div className="mf-multi-input">
      {segments.map((seg, i) => (
        <div key={i} className="mf-multi-block">
          {seg && <p className="mf-multi-seg">{seg}</p>}
          {i < blankCount && (
            <textarea
              className="mf-textarea mf-textarea--compact"
              placeholder={`第 ${i + 1} 处填写……`}
              value={parts[i] || ''}
              onChange={e => {
                const np = Array.from({ length: blankCount }, (_, k) => parts[k] || '')
                np[i] = e.target.value
                onAnswer(np.join(BLANK_SEP))
                autoResize(e)
              }}
              rows={2}
              autoFocus={i === 0}
            />
          )}
        </div>
      ))}
      <p className="mf-test-hint">按填空顺序分别填写 · 支持语音输入</p>
    </div>
  )
}

// ── Test view ───────────────────────────────────────────────────────
function TestView({ questions, answers, currentQIdx, onAnswer, onGo, onReview }) {
  const q = questions[currentQIdx]
  if (!q) return null

  const isLast    = currentQIdx === questions.length - 1
  const segments  = getBlankSegments(q.text)
  const blankCount = segments.length - 1
  const rawAnswer  = answers[q.id] || ''

  // canNext: all blanks must be non-empty
  const canNext = blankCount >= 2
    ? rawAnswer.split(BLANK_SEP).filter(p => p.trim()).length >= blankCount
    : rawAnswer.trim().length > 0

  return (
    <div className="mf-test">
      <div className="mf-progress-wrap">
        <div className="mf-progress-label">{currentQIdx + 1} / {questions.length}</div>
        <div className="mf-progress-bar">
          <div className="mf-progress-fill"
            style={{ width: `${((currentQIdx + 1) / questions.length) * 100}%` }} />
        </div>
      </div>

      <p className="mf-dim-hint">{q.dim}</p>
      {/* For multi-blank questions, question text is embedded in SmartInput */}
      {blankCount < 2 && <p className="mf-question-text">{q.text}</p>}

      <SmartInput
        question={q}
        answer={rawAnswer}
        onAnswer={text => onAnswer(q.id, text)}
      />

      <div className="mf-test-nav">
        <button className="mf-btn" onClick={() => onGo(currentQIdx - 1)}
          disabled={currentQIdx === 0}>
          ← 上一题
        </button>
        {isLast ? (
          <button className="mf-btn mf-btn--primary" onClick={onReview}
            disabled={!canNext}>
            完成，确认回答 →
          </button>
        ) : (
          <button className="mf-btn mf-btn--primary" onClick={() => onGo(currentQIdx + 1)}
            disabled={!canNext}>
            下一题 →
          </button>
        )}
      </div>
    </div>
  )
}

// ── Review view ─────────────────────────────────────────────────────
function ReviewView({ questions, answers, onEdit, onSubmit, error }) {
  return (
    <div className="mf-review">
      <h2 className="mf-review-title">确认你的回答</h2>
      <p className="mf-review-subtitle">可以修改任意题目，确认后生成心智自由度画像</p>

      <div className="mf-review-list">
        {questions.map((q, idx) => {
          const ans = (answers[q.id] || '').trim()
          return (
            <div key={q.id} className="mf-review-item">
              <div className="mf-review-item-header">
                <p className="mf-review-q">{idx + 1}. {q.text}</p>
                <button className="mf-review-edit-btn" onClick={() => onEdit(idx)}>修改</button>
              </div>
              <p className={`mf-review-a ${ans ? '' : 'mf-review-a--empty'}`}>
                {ans || '（未作答）'}
              </p>
            </div>
          )
        })}
      </div>

      {error && <p className="mf-error">{error}</p>}

      <div className="mf-review-actions">
        <button className="mf-btn" onClick={() => onEdit(questions.length - 1)}>← 返回修改</button>
        <button className="mf-btn mf-btn--primary" onClick={onSubmit}>
          生成我的心智自由度画像 →
        </button>
      </div>
    </div>
  )
}

// ── Analyzing view ──────────────────────────────────────────────────
function AnalyzingView() {
  return (
    <div className="mf-analyzing">
      <div className="mf-pulse-circles">
        <span /><span /><span />
      </div>
      <p className="mf-analyzing-title">正在生成你的心智自由度画像</p>
      <p className="mf-analyzing-sub">AI 正在分析十二道回答 · 约 20–40 秒</p>
    </div>
  )
}

// ── Result view ─────────────────────────────────────────────────────
function ResultView({ result, onSave, onExport, onReset, onHistory, onLoginPrompt, isLoggedIn }) {
  if (!result) return null
  const s = result.scores

  return (
    <div className="mf-result">
      <div className="mf-result-header">
        <div className="mf-score-circle">
          <span className="mf-score-num">{s.overall}</span>
          <span className="mf-score-label">综合</span>
        </div>
        <p className="mf-result-title">心智自由度画像</p>
      </div>

      {/* Radar + dim scores */}
      <MindRadar cognitive={s.cognitive} discernment={s.discernment} presence={s.presence} />
      <div className="mf-dim-scores">
        <div className="mf-dim-score-item">
          <div className="mf-dim-score-name">认知</div>
          <div className="mf-dim-score-val">{s.cognitive}</div>
        </div>
        <div className="mf-dim-score-item">
          <div className="mf-dim-score-name">取舍</div>
          <div className="mf-dim-score-val">{s.discernment}</div>
        </div>
        <div className="mf-dim-score-item">
          <div className="mf-dim-score-name">在场</div>
          <div className="mf-dim-score-val">{s.presence}</div>
        </div>
      </div>

      <hr className="mf-divider" />

      {/* Summary */}
      <div className="mf-section">
        <div className="mf-section-title">总体画像</div>
        <p className="mf-summary-text">{result.summary}</p>
      </div>

      {/* Dimension analysis */}
      <div className="mf-section">
        <div className="mf-section-title">三维解析</div>
        <div className="mf-dim-analysis">
          {[
            { name: '认知自由度', key: 'cognitive'   },
            { name: '取舍自由度', key: 'discernment' },
            { name: '在场自由度', key: 'presence'    },
          ].map(d => (
            <div key={d.key} className="mf-dim-analysis-item">
              <div className="mf-dim-analysis-name">{d.name}</div>
              <p className="mf-dim-analysis-text">{result.dimension_analysis?.[d.key]}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Key quotes */}
      {result.key_quotes?.length > 0 && (
        <div className="mf-section">
          <div className="mf-section-title">关键回答解读</div>
          <div className="mf-quotes">
            {result.key_quotes.map((q, i) => (
              <div key={i} className="mf-quote-item">
                <p className="mf-quote-text">"{q.quote}"</p>
                <p className="mf-quote-interp">{q.interpretation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strengths */}
      {result.strengths?.length > 0 && (
        <div className="mf-section">
          <div className="mf-section-title">结构性优势</div>
          <ul className="mf-list mf-list--strengths">
            {result.strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {/* Risks */}
      {result.risks?.length > 0 && (
        <div className="mf-section">
          <div className="mf-section-title">潜在风险</div>
          <ul className="mf-list mf-list--risks">
            {result.risks.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {/* Recommendations */}
      {result.recommendations?.length > 0 && (
        <div className="mf-section">
          <div className="mf-section-title">下一步建议</div>
          <ul className="mf-list mf-list--recs">
            {result.recommendations.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      <hr className="mf-divider" />

      <p className="mf-disclaimer">{result.disclaimer}</p>

      {/* Framework background — moved here from intro page */}
      <details className="mf-framework-details">
        <summary className="mf-framework-summary">关于这三个维度（背景说明）</summary>
        <div className="mf-framework-body">
          <p>这套分析框架是开发者基于个人对思维世界的理解提出的，当作趣味参考即可。</p>
          <div className="mf-framework-dim">
            <span className="mf-framework-dim-name">认知自由度</span>
            <span className="mf-framework-dim-def">不被单一解释和单一因果链困住的能力</span>
          </div>
          <div className="mf-framework-dim">
            <span className="mf-framework-dim-name">取舍自由度</span>
            <span className="mf-framework-dim-def">在责任、欲望、关系之间把握有所为有所不为的能力</span>
          </div>
          <div className="mf-framework-dim">
            <span className="mf-framework-dim-name">在场自由度</span>
            <span className="mf-framework-dim-def">从抽象思考回到身体、行动和生活现场的能力</span>
          </div>
        </div>
      </details>

      <div className="mf-section">
        <div className="mf-result-actions">
          <button className="mf-btn" onClick={() => isLoggedIn ? onSave(result) : onLoginPrompt()}>
            {isLoggedIn ? '保存记录' : '登录后保存'}
          </button>
          <button className="mf-btn" onClick={() => onExport(result)}>下载结果</button>
          <button className="mf-btn" onClick={onReset}>再次测测</button>
          <button className="mf-btn" onClick={onHistory}>查看历史</button>
          <button className="mf-btn" disabled title="即将推出">记入随手记</button>
        </div>
      </div>
    </div>
  )
}

// ── History view ────────────────────────────────────────────────────
function HistoryView({ history, onView, onDelete, onBack, onExport }) {
  return (
    <div className="mf-history">
      <div className="mf-history-header">
        <h2 className="mf-history-title">历史记录</h2>
        <button className="mf-btn mf-btn--ghost" onClick={onBack}>← 返回</button>
      </div>

      {history.length === 0 ? (
        <div className="mf-history-empty">
          <p>暂无历史记录</p>
        </div>
      ) : (
        <div className="mf-history-list">
          {history.map(r => {
            const d   = new Date(r.created_at)
            const dstr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
            const s   = r.scores || {}
            return (
              <div key={r.id} className="mf-history-card" onClick={() => onView(r)}>
                <div className="mf-history-card-top">
                  <span className="mf-history-date">{dstr}</span>
                  <span className="mf-history-overall">{s.overall ?? '—'}</span>
                </div>
                <div className="mf-history-dim-bars">
                  {[
                    { label: '认知', val: s.cognitive   },
                    { label: '取舍', val: s.discernment },
                    { label: '在场', val: s.presence    },
                  ].map(dim => (
                    <div key={dim.label} className="mf-history-dim-bar">
                      <div className="mf-history-dim-label">{dim.label}</div>
                      <div className="mf-history-dim-track">
                        <div className="mf-history-dim-fill"
                          style={{ width: `${dim.val ?? 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mf-history-card-actions">
                  <button className="mf-btn" style={{ fontSize: 12, padding: '4px 12px' }}
                    onClick={e => { e.stopPropagation(); onExport(r) }}>下载</button>
                  <button className="mf-del-btn"
                    onClick={e => { e.stopPropagation(); onDelete(r.id) }}>删除</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────
export default function MindFreedomPage({ apiBase, user, token, onLoginPrompt }) {
  const {
    page, setPage,
    questions, answers, currentQIdx,
    currentResult, viewingResult,
    history,
    error,
    startTest,
    setAnswer, goToQuestion, goToReview,
    submitForAnalysis,
    deleteResult, exportResult,
    viewHistoryResult, reset,
  } = useMindFreedom(apiBase, token)

  // Displayed result: either current test result or a history detail
  const displayResult = page === 'result_detail' ? viewingResult : currentResult

  return (
    <div className="mf-page">
      {page === 'intro' && (
        <IntroView
          onStart={startTest}
          onHistory={() => setPage('history')}
          hasHistory={history.length > 0}
          error={error}
        />
      )}

      {page === 'loading_q' && <LoadingQView />}

      {page === 'test' && (
        <TestView
          questions={questions}
          answers={answers}
          currentQIdx={currentQIdx}
          onAnswer={setAnswer}
          onGo={goToQuestion}
          onReview={goToReview}
        />
      )}

      {page === 'review' && (
        <ReviewView
          questions={questions}
          answers={answers}
          onEdit={idx => { goToQuestion(idx); setPage('test') }}
          onSubmit={submitForAnalysis}
          error={error}
        />
      )}

      {page === 'analyzing' && <AnalyzingView />}

      {(page === 'result' || page === 'result_detail') && (
        <ResultView
          result={displayResult}
          onSave={() => {}}           /* auto-saved already */
          onExport={exportResult}
          onReset={reset}
          onHistory={() => setPage('history')}
          onLoginPrompt={onLoginPrompt}
          isLoggedIn={!!user}
        />
      )}

      {page === 'history' && (
        <HistoryView
          history={history}
          onView={viewHistoryResult}
          onDelete={deleteResult}
          onExport={exportResult}
          onBack={() => setPage('intro')}
        />
      )}
    </div>
  )
}
