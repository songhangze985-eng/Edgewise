import { useEffect, useState } from 'react'
import { splitTextIntoStar } from '../interview/speechMetrics'
import { createStory } from '../../api/stories'
import { getErrorMessage } from '../../api/client'
import { showToast } from '../../stores/toastStore'
import { STORY_THEMES } from './storyThemes'
import styles from './StoryBank.module.css'

const STAR_FIELDS = [
  { key: 'S', label: '情境 (S)', hint: '背景、团队与当时面临的局面' },
  { key: 'T', label: '任务 (T)', hint: '你的目标、职责与成功标准' },
  { key: 'A', label: '行动 (A)', hint: '多写「我」采取的具体步骤' },
  { key: 'R', label: '结果 (R)', hint: '可量化的成效或复盘' },
]

export default function SaveStoryDialog({
  open,
  onClose,
  initialText = '',
  defaultTitle = '',
  sourceSession = null,
  source = 'revision',
}) {
  const [title, setTitle] = useState(defaultTitle)
  const [fields, setFields] = useState({ S: '', T: '', A: '', R: '' })
  const [themes, setThemes] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setTitle(defaultTitle || '')
    setFields(splitTextIntoStar(initialText))
    setThemes([])
    setError('')
  }, [open, initialText, defaultTitle])

  if (!open) return null

  const toggleTheme = (id) => {
    setThemes((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('请填写故事标题')
      return
    }
    const bodyText = [fields.S, fields.T, fields.A, fields.R].join('').trim()
    if (!bodyText) {
      setError('请至少填写一段 STAR 内容')
      return
    }
    setBusy(true)
    setError('')
    try {
      await createStory({
        title: title.trim(),
        S: fields.S,
        T: fields.T,
        A: fields.A,
        R: fields.R,
        themes,
        source_session: sourceSession || undefined,
        source,
      })
      showToast('已存入故事库')
      onClose?.(true)
    } catch (err) {
      setError(getErrorMessage(err, '保存失败'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="save-story-title">
      <div className={styles.dialog}>
        <div className={styles['dialog-header']}>
          <h2 id="save-story-title">存为 STAR 故事</h2>
          <p className={styles['dialog-sub']}>
            系统按信号词初步拆分四段，请核对并修改；不会自动生成或润色内容。
          </p>
        </div>
        <form className={styles['dialog-form']} onSubmit={handleSubmit}>
          <label className={styles['form-label']}>
            标题
            <input
              className={styles['form-input']}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="例如：校园活动系统改版"
            />
          </label>
          {STAR_FIELDS.map(({ key, label, hint }) => (
            <label key={key} className={styles['form-label']}>
              {label}
              <span className={styles['field-hint']}>{hint}</span>
              <textarea
                className={styles['form-textarea']}
                rows={3}
                value={fields[key]}
                onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
              />
            </label>
          ))}
          <fieldset className={styles['theme-picker']}>
            <legend>适用主题（可多选）</legend>
            <div className={styles['theme-chips']}>
              {STORY_THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`${styles.chip} ${themes.includes(t.id) ? styles['chip-active'] : ''}`}
                  onClick={() => toggleTheme(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </fieldset>
          {error ? <p className={styles['form-error']}>{error}</p> : null}
          <div className={styles['dialog-actions']}>
            <button type="button" className={styles['ghost-btn']} onClick={() => onClose?.(false)} disabled={busy}>
              取消
            </button>
            <button type="submit" className={styles['primary-btn']} disabled={busy}>
              {busy ? '保存中…' : '保存到故事库'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
