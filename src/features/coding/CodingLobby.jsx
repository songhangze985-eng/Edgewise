import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { createCodingSession } from '../../api/coding'
import { getErrorMessage } from '../../api/client'
import { showToast } from '../../stores/toastStore'
import PageBar from '../../components/ui/PageBar'
import styles from './CodingLobby.module.css'

const MODES = [
  {
    id: 'interview',
    title: '面试模式',
    desc: '1 道编程题 · 30–45 分钟 · 含思路追问模板',
    duration: 40,
  },
  {
    id: 'exam',
    title: '笔试模式',
    desc: '3–4 道编程题 · 约 2 小时 · 无追问',
    duration: 120,
  },
]

export default function CodingLobby() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const prefillQuestion = searchParams.get('question_id') || ''
  const [mode, setMode] = useState('interview')
  const [questionId, setQuestionId] = useState(prefillQuestion)
  const [loading, setLoading] = useState(false)

  const handleStart = async () => {
    setLoading(true)
    try {
      const picked = MODES.find((m) => m.id === mode)
      const session = await createCodingSession({
        mode,
        question_id: questionId.trim() || undefined,
        duration_minutes: picked?.duration,
        source: questionId.trim() ? 'question_bank' : 'coding_lobby',
      })
      navigate(`/coding/${session.id}`)
    } catch (err) {
      showToast(getErrorMessage(err, '创建编程会话失败'), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <PageBar title="编程练习" />
      <p className={styles.lead}>
        在线编辑与运行（JavaScript 在 Web Worker 中执行，2 秒超时；Python 首次需懒加载 Pyodide，约 10MB）。
      </p>

      <div className={styles['mode-grid']}>
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`${styles['mode-card']} ${mode === m.id ? styles.active : ''}`}
            onClick={() => setMode(m.id)}
          >
            <h3>{m.title}</h3>
            <p>{m.desc}</p>
          </button>
        ))}
      </div>

      <label className={styles.field}>
        <span>指定题目 ID（可选，如 C001）</span>
        <input
          type="text"
          value={questionId}
          onChange={(e) => setQuestionId(e.target.value)}
          placeholder="留空则随机抽题"
        />
      </label>

      <button
        type="button"
        className={styles['start-btn']}
        disabled={loading}
        onClick={handleStart}
      >
        {loading ? '创建中…' : '进入编程间'}
      </button>
    </div>
  )
}
