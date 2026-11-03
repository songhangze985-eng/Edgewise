import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listStories } from '../../api/stories'
import { getErrorMessage } from '../../api/client'
import styles from './StorySidePeek.module.css'

export default function StorySidePeek({ open, onToggle }) {
  const [stories, setStories] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    return listStories()
      .then(setStories)
      .catch((err) => setError(getErrorMessage(err, '加载故事失败')))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  if (!open) {
    return (
      <button type="button" className={styles['peek-tab']} onClick={onToggle} aria-label="打开故事库侧栏">
        故事
      </button>
    )
  }

  return (
    <aside className={styles.peek} aria-label="我的 STAR 故事">
      <div className={styles['peek-head']}>
        <span>我的故事</span>
        <button type="button" className={styles['peek-close']} onClick={onToggle} aria-label="收起故事库">
          ×
        </button>
      </div>
      {loading ? <p className={styles['peek-muted']}>加载中…</p> : null}
      {error ? <p className={styles['peek-error']}>{error}</p> : null}
      {!loading && !stories.length ? (
        <p className={styles['peek-muted']}>
          暂无故事。
          <Link to="/stories" className={styles['peek-link']}>
            去撰写
          </Link>
        </p>
      ) : null}
      <ul className={styles['peek-list']}>
        {stories.map((s) => {
          const expanded = expandedId === s.id
          return (
            <li key={s.id}>
              <button
                type="button"
                className={styles['peek-item']}
                onClick={() => setExpandedId(expanded ? null : s.id)}
              >
                {s.title}
              </button>
              {expanded ? (
                <div className={styles['peek-body']}>
                  {s.S ? <p><strong>S</strong> {s.S}</p> : null}
                  {s.T ? <p><strong>T</strong> {s.T}</p> : null}
                  {s.A ? <p><strong>A</strong> {s.A}</p> : null}
                  {s.R ? <p><strong>R</strong> {s.R}</p> : null}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      <Link to="/stories" className={styles['peek-foot']}>
        打开故事库
      </Link>
    </aside>
  )
}
