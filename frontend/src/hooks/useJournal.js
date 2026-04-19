import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'zentalk_journal_v1'

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

export function useJournal(sessionId, apiBase) {
  const [entries, setEntries] = useState(() => loadEntries())
  const [saving, setSaving] = useState(false)

  // Sync to localStorage whenever entries change
  useEffect(() => {
    saveEntries(entries)
  }, [entries])

  const addEntry = useCallback(async ({ scene, feeling, reflection, raw }) => {
    const entry = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      session_id: sessionId,
      scene: scene || '',
      feeling: feeling || '',
      reflection: reflection || '',
      raw: raw || '',
      tags: null,       // filled after API call
      summary: '',
      zen_session_id: null,
      zen_reply_id: null,
    }

    // Optimistically add entry
    setEntries(prev => [entry, ...prev])
    setSaving(true)

    // Extract tags async
    try {
      const res = await fetch(`${apiBase}/journal/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene, feeling, reflection, content: raw }),
      })
      if (res.ok) {
        const data = await res.json()
        setEntries(prev => prev.map(e =>
          e.id === entry.id
            ? { ...e, tags: data, summary: data.summary }
            : e
        ))
      }
    } catch {
      // Tags remain null — entry still saved locally
    } finally {
      setSaving(false)
    }

    return entry.id
  }, [sessionId, apiBase])

  const deleteEntry = useCallback((id) => {
    setEntries(prev => prev.filter(e => e.id !== id))
  }, [])

  const exportMarkdown = useCallback(() => {
    const lines = entries.map(e => {
      const d = new Date(e.created_at)
      const dt = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
      const tags = e.tags
        ? `#${[...e.tags.emotion, ...e.tags.topic, ...e.tags.operation, e.tags.timeview, e.tags.energy].join(' #')}`
        : ''
      const parts = [
        `## ${dt}`,
        tags,
        '',
        e.scene    ? `**场景：** ${e.scene}` : '',
        e.feeling  ? `**感受：** ${e.feeling}` : '',
        e.reflection ? `**体会：** ${e.reflection}` : '',
        e.raw && !e.scene ? e.raw : '',
        '',
        '---',
      ].filter(l => l !== undefined)
      return parts.join('\n')
    })
    return `# ZenTalk 日记导出\n\n${lines.join('\n')}`
  }, [entries])

  const exportJSON = useCallback(() => {
    return JSON.stringify(entries, null, 2)
  }, [entries])

  return { entries, saving, addEntry, deleteEntry, exportMarkdown, exportJSON }
}
