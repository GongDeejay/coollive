import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'zentalk_journal_v1'

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [] } catch { return [] }
}
function saveLocal(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

function fetchWithTimeout(url, options = {}, timeoutMs = 50000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer))
}

function fallbackTags(scene, feeling, reflection, raw) {
  const text = [scene, feeling, reflection, raw].filter(Boolean).join(' ')
  const emotion = []
  if (/焦虑|担心|紧张|压力/.test(text)) emotion.push('焦虑')
  if (/累|疲惫|困|倦/.test(text)) emotion.push('疲惫')
  if (/开心|很爽|高兴|满意|满足/.test(text)) emotion.push('满足')
  if (/生气|愤怒|火大/.test(text)) emotion.push('愤怒')
  if (emotion.length === 0) emotion.push('平静')

  const object = []
  if (/项目|工作|任务|部署|开发|代码|系统/.test(text)) object.push('任务')
  if (/朋友|同事|家人|关系|沟通/.test(text)) object.push('关系')
  if (/身体|睡|病|累/.test(text)) object.push('身体')
  if (object.length === 0) object.push('意义')

  return {
    object: object.slice(0, 2),
    operation: ['观察'],
    tension: [],
    output_form: [],
    emotion: emotion.slice(0, 2),
    keywords: [],
  }
}

export function useJournal(sessionId, apiBase, token) {
  const [entries, setEntries] = useState(() => loadLocal())
  const [saving, setSaving]   = useState(false)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => { saveLocal(entries) }, [entries])

  // Login: fetch cloud and merge
  useEffect(() => {
    if (!token) return
    setSyncing(true)
    fetch(`${apiBase}/journal/entries`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        setEntries(prev => {
          const cloudMap = Object.fromEntries(data.entries.map(e => [e.id, e]))
          const localMap = Object.fromEntries(prev.map(e => [e.id, e]))
          const merged = { ...localMap, ...cloudMap }
          const sorted = Object.values(merged).sort((a, b) =>
            new Date(b.created_at) - new Date(a.created_at)
          )
          prev.forEach(e => {
            if (!cloudMap[e.id]) {
              fetch(`${apiBase}/journal/entries/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ entry: e }),
              }).catch(() => {})
            }
          })
          return sorted
        })
      })
      .catch(() => {})
      .finally(() => setSyncing(false))
  }, [token]) // eslint-disable-line

  const addEntry = useCallback(async ({ scene, feeling, reflection, raw, images = [] }) => {
    const entry = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      session_id: sessionId,
      scene: scene || '',
      feeling: feeling || '',
      reflection: reflection || '',
      raw: raw || '',
      images: images || [],   // [{id, dataUrl, type: 'upload'|'camera', width, height}]
      tags: null,
      summary: '',
      quadrant: null,    // { dim, value, energy, secondary_dim, reason }
      zen_session_id: null,
      zen_reply_id: null,
    }

    setEntries(prev => [entry, ...prev])
    setSaving(true)

    // Extract tags + quadrant in parallel
    try {
      const headers = { 'Content-Type': 'application/json' }
      const tagBody  = JSON.stringify({ scene, feeling, reflection, content: raw })
      const quadBody = JSON.stringify({ scene, feeling, reflection, raw })

      const [tagsRes, quadRes] = await Promise.allSettled([
        fetchWithTimeout(`${apiBase}/journal/tags`,     { method: 'POST', headers, body: tagBody }),
        fetchWithTimeout(`${apiBase}/journal/quadrant`, { method: 'POST', headers, body: quadBody }),
      ])

      let tags     = fallbackTags(scene, feeling, reflection, raw)
      let summary  = 'AI分析暂不可用，已保存原文'
      let quadrant = null

      if (tagsRes.status === 'fulfilled' && tagsRes.value.ok) {
        const d = await tagsRes.value.json()
        tags = {
          object:      d.object      || [],
          operation:   d.operation   || [],
          tension:     d.tension     || [],
          output_form: d.output_form || [],
          emotion:     d.emotion     || [],
          keywords:    d.keywords    || [],
        }
        summary = d.summary || ''
      }

      if (quadRes.status === 'fulfilled' && quadRes.value.ok) {
        quadrant = await quadRes.value.json()
      }

      const updated = { ...entry, tags, summary, quadrant }
      setEntries(prev => prev.map(e => e.id === entry.id ? updated : e))

      if (token) {
        fetch(`${apiBase}/journal/entries/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ entry: updated }),
        }).catch(() => {})
      }
    } catch { /* analysis remains null */ }
    finally { setSaving(false) }

    return entry.id
  }, [sessionId, apiBase, token])

  const deleteEntry = useCallback((id) => {
    setEntries(prev => prev.filter(e => e.id !== id))
    if (token) {
      fetch(`${apiBase}/journal/entries/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
    }
  }, [apiBase, token])

  const togglePublic = useCallback((id) => {
    setEntries(prev => {
      const updated = prev.map(e => e.id === id ? { ...e, is_public: !e.is_public } : e)
      if (token) {
        const entry = updated.find(e => e.id === id)
        if (entry) {
          fetch(`${apiBase}/journal/entries/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ entry }),
          }).catch(() => {})
        }
      }
      return updated
    })
  }, [apiBase, token])

  const exportMarkdown = useCallback(() => {
    const lines = entries.map(e => {
      const d = new Date(e.created_at)
      const dt = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
      const tagStr = e.tags
        ? [...(e.tags.emotion||[]), ...(e.tags.object||[]), ...(e.tags.operation||[])].map(t=>'#'+t).join(' ')
        : ''
      const quadStr = e.quadrant
        ? `[${e.quadrant.dim} ${e.quadrant.value>0?'+':''}${e.quadrant.value} ⚡${e.quadrant.energy}]`
        : ''
      return [
        `## ${dt} ${quadStr}`, tagStr, '',
        e.scene      ? `**场景：** ${e.scene}` : '',
        e.feeling    ? `**感受：** ${e.feeling}` : '',
        e.reflection ? `**体会：** ${e.reflection}` : '',
        e.raw && !e.scene ? e.raw : '',
        '', '---',
      ].filter(Boolean).join('\n')
    })
    return `# ZenTalk 随手记导出\n\n${lines.join('\n')}`
  }, [entries])

  const exportJSON = useCallback(() => JSON.stringify(entries, null, 2), [entries])

  return { entries, saving, syncing, addEntry, deleteEntry, togglePublic, exportMarkdown, exportJSON }
}
