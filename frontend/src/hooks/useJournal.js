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

  // Sync localStorage whenever entries change
  useEffect(() => { saveLocal(entries) }, [entries])

  // When user logs in, fetch cloud entries and merge (cloud wins for same id)
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
          // Push any local-only entries to cloud
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
      zen_session_id: null,
      zen_reply_id: null,
    }

    setEntries(prev => [entry, ...prev])
    setSaving(true)

    try {
      const res = await fetch(`${apiBase}/journal/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene, feeling, reflection, content: raw }),
      })
      if (res.ok) {
        const data = await res.json()
        const updated = { ...entry, tags: data, summary: data.summary }
        setEntries(prev => prev.map(e => e.id === entry.id ? updated : e))

        // Sync to cloud if logged in
        if (token) {
          fetch(`${apiBase}/journal/entries/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ entry: updated }),
          }).catch(() => {})
        }
      }
    } catch { /* tags remain null */ }
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

  const exportMarkdown = useCallback(() => {
    const lines = entries.map(e => {
      const d = new Date(e.created_at)
      const dt = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
      const tags = e.tags
        ? `#${[...e.tags.emotion, ...e.tags.topic, ...e.tags.operation, e.tags.timeview, e.tags.energy].join(' #')}`
        : ''
      return [
        `## ${dt}`, tags, '',
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

  return { entries, saving, syncing, addEntry, deleteEntry, exportMarkdown, exportJSON }
}
