import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchMentorSessions } from '../../api/org'
import { getErrorMessage } from '../../api/client'
import PageBar from '../../components/ui/PageBar'
import styles from './Org.module.css'

export default function MentorView() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    fetchMentorSessions()
      .then(setSessions)
      .catch((err) => setError(getErrorMessage(err, '加载失败')))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className={styles.page} style={{ maxWidth: 960 }}>
      <PageBar title="指导者视图" subtitle="学生主动分享的练习" />

      <p className={styles.lead}>
        此处仅展示学生勾选分享的练习摘要，用于讨论表达方法。
        不含分数、排名、录用建议或完整转写。学生未开启分享时，您不会看到任何内容。
      </p>

      {loading && <p className={styles.empty}>加载中…</p>}
      {error && <p className={styles.error}>{error}</p>}

      {!loading && !error && sessions.length === 0 && (
        <p className={styles.empty}>暂无学生分享的练习</p>
      )}

      {sessions.map((s) => (
        <div key={`${s.member_label}-${s.session_id}`} className={styles.sessionCard}>
          <h3>{s.member_label}</h3>
          <p className={styles.note}>
            {s.session_type} · {s.completed_at ? new Date(s.completed_at).toLocaleString() : '未完成'}
            {' · '}
            {s.question_count} 题
          </p>
          <ul className={styles.list}>
            {(s.questions || []).map((q, idx) => (
              <li key={idx}>
                {q.title}
                {q.revision_decision ? ` · 修订：${q.revision_decision}` : ''}
                {q.attempt_count ? ` · ${q.attempt_count} 次作答` : ''}
              </li>
            ))}
          </ul>
          <p className={styles.note}>{s.note}</p>
        </div>
      ))}

      <div className={styles.actions}>
        <Link to="/" className={styles.ghost}>
          返回概览
        </Link>
      </div>
    </div>
  )
}
