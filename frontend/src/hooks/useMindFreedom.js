import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'zentalk_assessments_v1'   // array of result objects
const DRAFT_KEY   = 'zentalk_mf_draft_v1'       // { answers, currentQIdx, questions }
const COUNT_KEY   = 'zentalk_mf_count'          // integer: total tests on this device

function loadLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
function saveLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function fetchWithTimeout(url, options = {}, timeoutMs = 70000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer))
}

export function useMindFreedom(apiBase, token) {
  // page state machine
  const [page, setPage]           = useState('intro')
  // test data
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers]     = useState({})   // { Q1: "text", ... }
  const [currentQIdx, setCurrentQIdx] = useState(0)
  // results
  const [currentResult, setCurrentResult] = useState(null)
  const [viewingResult, setViewingResult] = useState(null)  // for history detail view
  const [history, setHistory]     = useState(() => loadLocal(STORAGE_KEY, []))
  // status
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  // Sync history to localStorage
  useEffect(() => { saveLocal(STORAGE_KEY, history) }, [history])

  // If logged in, fetch cloud results and merge on mount
  useEffect(() => {
    if (!token) return
    fetch(`${apiBase}/mind-freedom/results`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.results?.length) return
        setHistory(prev => {
          const cloudMap = Object.fromEntries(data.results.map(r => [r.id, r]))
          const localMap = Object.fromEntries(prev.map(r => [r.id, r]))
          const merged = { ...localMap, ...cloudMap }
          return Object.values(merged).sort((a, b) =>
            new Date(b.created_at) - new Date(a.created_at)
          )
        })
      })
      .catch(() => {})
  }, [token]) // eslint-disable-line

  // ── Start a new test ─────────────────────────────────────────────
  const startTest = useCallback(async () => {
    setError('')
    setPage('loading_q')
    const testCount = loadLocal(COUNT_KEY, 0)

    try {
      const res = await fetchWithTimeout(`${apiBase}/mind-freedom/questions?test_idx=${testCount}`, {}, 30000)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setQuestions(data.questions || [])

      // Restore draft if same question set (simple check: same first question id)
      const draft = loadLocal(DRAFT_KEY, null)
      if (draft && draft.questions?.[0]?.id === data.questions?.[0]?.id) {
        setAnswers(draft.answers || {})
        setCurrentQIdx(draft.currentQIdx || 0)
      } else {
        setAnswers({})
        setCurrentQIdx(0)
      }

      // Increment count
      saveLocal(COUNT_KEY, testCount + 1)
      setPage('test')
    } catch (e) {
      setError('题目加载失败，请重试')
      setPage('intro')
    }
  }, [apiBase])

  // ── Answer management ─────────────────────────────────────────────
  const setAnswer = useCallback((qid, text) => {
    setAnswers(prev => {
      const next = { ...prev, [qid]: text }
      // Auto-save draft
      saveLocal(DRAFT_KEY, { answers: next, currentQIdx, questions })
      return next
    })
  }, [currentQIdx, questions])

  const goToQuestion = useCallback((idx) => {
    setCurrentQIdx(idx)
  }, [])

  const goToReview = useCallback(() => {
    saveLocal(DRAFT_KEY, { answers, currentQIdx: questions.length - 1, questions })
    setPage('review')
  }, [answers, questions])

  // ── Submit for analysis ───────────────────────────────────────────
  const submitForAnalysis = useCallback(async () => {
    setError('')
    setPage('analyzing')

    const payload = {
      answers: questions.map(q => ({
        question_id:   q.id,
        question_text: q.text,
        answer:        answers[q.id] || '',
      })),
    }

    try {
      const res = await fetchWithTimeout(`${apiBase}/mind-freedom/analyze`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      }, 70000)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const result = await res.json()

      // Attach questions+answers snapshot to result
      result.questions_snapshot = questions
      result.answers_snapshot   = answers

      setCurrentResult(result)

      // Auto-save locally
      setHistory(prev => [result, ...prev.filter(r => r.id !== result.id)])

      // Auto-save to cloud if logged in
      if (token) {
        fetch(`${apiBase}/mind-freedom/results/save`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ result }),
        }).catch(() => {})
      }

      // Clear draft
      localStorage.removeItem(DRAFT_KEY)
      setPage('result')
    } catch (e) {
      setError('分析生成失败，请稍后重试')
      setPage('review')
    }
  }, [apiBase, token, questions, answers])

  // ── Delete a result ───────────────────────────────────────────────
  const deleteResult = useCallback((resultId) => {
    setHistory(prev => prev.filter(r => r.id !== resultId))
    if (token) {
      fetch(`${apiBase}/mind-freedom/results/${resultId}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
    }
  }, [apiBase, token])

  // ── Export result as Markdown ────────────────────────────────────
  const exportResult = useCallback((result) => {
    if (!result) return
    const d = new Date(result.created_at)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    const s = result.scores

    const lines = [
      `# 心智自由度测评结果`,
      ``,
      `**测评时间：** ${dateStr}`,
      `**综合心智自由度：** ${s.overall} / 100`,
      ``,
      `## 三维评分`,
      `- 认知自由度：${s.cognitive}`,
      `- 取舍自由度：${s.discernment}`,
      `- 在场自由度：${s.presence}`,
      ``,
      `## 总体画像`,
      result.summary || '',
      ``,
      `## 维度解析`,
      `**认知自由度**`,
      result.dimension_analysis?.cognitive || '',
      ``,
      `**取舍自由度**`,
      result.dimension_analysis?.discernment || '',
      ``,
      `**在场自由度**`,
      result.dimension_analysis?.presence || '',
      ``,
    ]

    if (result.key_quotes?.length) {
      lines.push('## 关键回答解读')
      result.key_quotes.forEach(q => {
        lines.push(`> "${q.quote}"`)
        lines.push(`> *${q.interpretation}*`)
        lines.push('')
      })
    }

    if (result.strengths?.length) {
      lines.push('## 结构性优势')
      result.strengths.forEach(s => lines.push(`- ${s}`))
      lines.push('')
    }

    if (result.risks?.length) {
      lines.push('## 潜在风险')
      result.risks.forEach(r => lines.push(`- ${r}`))
      lines.push('')
    }

    if (result.recommendations?.length) {
      lines.push('## 下一步建议')
      result.recommendations.forEach((r, i) => lines.push(`${i+1}. ${r}`))
      lines.push('')
    }

    lines.push('---')
    lines.push(`*${result.disclaimer || '本结果不是医学或心理诊断，仅作为自我观察参考。'}*`)

    const md   = lines.join('\n')
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `心智自由度-${dateStr}.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  // ── Navigation helpers ────────────────────────────────────────────
  const viewHistoryResult = useCallback((result) => {
    setViewingResult(result)
    setPage('result_detail')
  }, [])

  const reset = useCallback(() => {
    setQuestions([])
    setAnswers({})
    setCurrentQIdx(0)
    setCurrentResult(null)
    setViewingResult(null)
    setError('')
    setPage('intro')
  }, [])

  return {
    page, setPage,
    questions, answers, currentQIdx,
    currentResult, viewingResult,
    history,
    loading, error,
    startTest,
    setAnswer, goToQuestion, goToReview,
    submitForAnalysis,
    deleteResult, exportResult,
    viewHistoryResult, reset,
  }
}
