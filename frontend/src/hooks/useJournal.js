import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'zentalk_journal_v1'

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [] } catch { return [] }
}
function saveLocal(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
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

  const addEntry = useCallback(async ({ scene, feeling, reflection, raw }) => {
    const entry = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      session_id: sessionId,
      scene: scene || '',
      feeling: feeling || '',
      reflection: reflection || '',
      raw: raw || '',
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
        fetch(`${apiBase}/journal/tags`,     { method: 'POST', headers, body: tagBody }),
        fetch(`${apiBase}/journal/quadrant`, { method: 'POST', headers, body: quadBody }),
      ])

      let tags     = null
      let summary  = ''
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


  const analyzeHistorical = async (onProgress) => {
    const pending = entries.filter(e => !e.quadrant && (e.scene || e.feeling || e.reflection || e.raw))
    const total = pending.length
    if (total === 0) return 0
    let done = 0
    for (const entry of pending) {
      try {
        const res = await fetch(`${apiBase}/journal/quadrant`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scene: entry.scene, feeling: entry.feeling, reflection: entry.reflection, raw: entry.raw }),
        })
        if (res.ok) {
          const quadrant = await res.json()
          const updated = { ...entry, quadrant }
          setEntries(prev => prev.map(e => e.id === entry.id ? updated : e))
          if (token) {
            fetch(`${apiBase}/journal/entries/sync`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ entry: updated }),
            }).catch(() => {})
          }
        }
      } catch { /* continue */ }
      done++
      if (onProgress) onProgress(done, total)
      await new Promise(r => setTimeout(r, 400))
    }
    return done
  }

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
    return `# ZenTalk 日记导出\n\n${lines.join('\n')}`
  }, [entries])

  const exportJSON = useCallback(() => JSON.stringify(entries, null, 2), [entries])

  return { entries, saving, syncing, addEntry, deleteEntry, togglePublic, analyzeHistorical, exportMarkdown, exportJSON }
}
