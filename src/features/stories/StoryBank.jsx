import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageBar from '../../components/ui/PageBar'
import { createStory, deleteStory, listStories, updateStory } from '../../api/stories'
import { getErrorMessage } from '../../api/client'
import { showToast } from '../../stores/toastStore'
import { STORY_THEMES, buildThemeCoverage } from './storyThemes'
import styles from './StoryBank.module.css'

const STAR_FIELDS = [
  { key: 'S', label: '情境 (S)', hint: '背景、团队与当时面临的局面' },
  { key: 'T', label: '任务 (T)', hint: '你的目标、职责与成功标准' },
  { key: 'A', label: '行动 (A)', hint: '多写「我」采取的具体步骤' },
  { key: 'R', label: '结果 (R)', hint: '可量化的成效或复盘' },
]

const EMPTY_DRAFT = {
  id: null,
  title: '',
  S: '',
  T: '',
  A: '',
  R: '',
  themes: [],
}

export default function StoryBank() {
  const [stories, setStories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [busy, setBusy] = useState(false)

  const coverage = useMemo(() => buildThemeCoverage(stories), [stories])

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    return listStories()
      .then((rows) => {
        setStories(rows)
        setSelectedId((prev) => {
          if (prev && prev !== 'new' && rows.some((r) => r.id === prev)) return prev
          if (rows[0]) {
            setDraft({
              id: rows[0].id,
              title: rows[0].title,
              S: rows[0].S,
              T: rows[0].T,
              A: rows[0].A,
              R: rows[0].R,
              themes: rows[0].themes || [],
            })
            return rows[0].id
          }
          return null
        })
      })
      .catch((err) => setError(getErrorMessage(err, '加载故事库失败')))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const selectStory = (row) => {
    setSelectedId(row.id)
    setDraft({
      id: row.id,
      title: row.title,
      S: row.S,
      T: row.T,
      A: row.A,
      R: row.R,
      themes: row.themes || [],
    })
  }

  const startNew = () => {
    setSelectedId('new')
    setDraft({ ...EMPTY_DRAFT, id: 'new' })
  }

  const toggleTheme = (id) => {
    setDraft((d) => ({
      ...d,
      themes: d.themes.includes(id) ? d.themes.filter((t) => t !== id) : [...d.themes, id],
    }))
  }

  const handleSave = async () => {
    if (!draft.title.trim()) {
      showToast('请填写标题')
      return
    }
    setBusy(true)
    try {
      const payload = {
        title: draft.title.trim(),
        S: draft.S,
        T: draft.T,
        A: draft.A,
        R: draft.R,
        themes: draft.themes,
      }
      if (draft.id && draft.id !== 'new') {
        const updated = await updateStory(draft.id, payload)
        setStories((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
        showToast('已更新')
      } else {
        const created = await createStory({ ...payload, source: 'manual' })
        setStories((prev) => [created, ...prev])
        setSelectedId(created.id)
        setDraft({ ...payload, id: created.id })
        showToast('已创建')
      }
    } catch (err) {
      showToast(getErrorMessage(err, '保存失败'))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!draft.id || draft.id === 'new') return
    if (!window.confirm('确定删除这条故事？')) return
    setBusy(true)
    try {
      await deleteStory(draft.id)
      const next = stories.filter((s) => s.id !== draft.id)
      setStories(next)
      if (next[0]) selectStory(next[0])
      else {
        setSelectedId(null)
        setDraft(EMPTY_DRAFT)
      }
      showToast('已删除')
    } catch (err) {
      showToast(getErrorMessage(err, '删除失败'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.page}>
      <PageBar
        title="STAR 故事库"
        subtitle="沉淀修订后的经历 · 行为面多题复用"
        actions={
          <button type="button" className={styles['primary-btn']} onClick={startNew}>
            新建故事
          </button>
        }
      />

      <section className={styles['coverage-panel']} aria-labelledby="theme-coverage-heading">
        <div id="theme-coverage-heading" className={styles['coverage-title']}>
          主题覆盖（建议 6–8 则故事）
        </div>
        <table className={styles['coverage-table']}>
          <thead>
            <tr>
              <th>主题</th>
              <th>故事数</th>
              <th>缺口练习</th>
            </tr>
          </thead>
          <tbody>
            {coverage.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.label}
                  <div style={{ fontSize: '0.72rem', color: 'var(--chalk-dim)' }}>{row.hint}</div>
                </td>
                <td className={row.covered ? styles['count-ok'] : styles['count-miss']}>
                  {row.count}
                </td>
                <td>
                  {!row.covered ? (
                    <Link to={row.practiceTo} className={styles['practice-link']}>
                      {row.practiceLabel}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {loading ? <p className={styles.empty}>加载中…</p> : null}
      {error ? <p className={styles['form-error']}>{error}</p> : null}

      {!loading && (
        <div className={styles.layout}>
          <div className={styles['list-panel']}>
            {!stories.length ? (
              <p className={styles.empty}>还没有故事，点击「新建故事」或从复盘页存入。</p>
            ) : (
              stories.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`${styles['list-item']} ${selectedId === s.id ? styles['list-item-active'] : ''}`}
                  onClick={() => selectStory(s)}
                >
                  <div className={styles['list-item-title']}>{s.title}</div>
                  <div className={styles['list-item-meta']}>
                    {(s.themes || [])
                      .map((id) => STORY_THEMES.find((t) => t.id === id)?.label || id)
                      .join(' · ') || '未标记主题'}
                  </div>
                </button>
              ))
            )}
          </div>

          <div className={styles.editor}>
            {selectedId == null && draft.id !== 'new' ? (
              <div className={styles['editor-empty']}>选择左侧故事，或新建一条。</div>
            ) : (
              <>
                <label className={styles['form-label']}>
                  标题
                  <input
                    className={styles['form-input']}
                    value={draft.title}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  />
                </label>
                {STAR_FIELDS.map(({ key, label, hint }) => (
                  <label key={key} className={styles['form-label']}>
                    {label}
                    <span className={styles['field-hint']}>{hint}</span>
                    <textarea
                      className={styles['form-textarea']}
                      rows={4}
                      value={draft[key]}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                    />
                  </label>
                ))}
                <fieldset className={styles['theme-picker']}>
                  <legend>适用主题</legend>
                  <div className={styles['theme-chips']}>
                    {STORY_THEMES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={`${styles.chip} ${draft.themes.includes(t.id) ? styles['chip-active'] : ''}`}
                        onClick={() => toggleTheme(t.id)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <div className={styles.toolbar}>
                  <button type="button" className={styles['primary-btn']} onClick={handleSave} disabled={busy}>
                    保存
                  </button>
                  {draft.id && draft.id !== 'new' ? (
                    <button type="button" className={styles['danger-btn']} onClick={handleDelete} disabled={busy}>
                      删除
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
