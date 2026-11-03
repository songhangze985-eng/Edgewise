import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createCaseSession, listCasePrompts } from '../../api/case'
import { getErrorMessage } from '../../api/client'
import { showToast } from '../../stores/toastStore'
import PageBar from '../../components/ui/PageBar'
import styles from './CaseLobby.module.css'

const FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'case', label: '商业 Case' },
  { id: 'system_design', label: '系统设计' },
]

export default function CaseLobby() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(null)

  useEffect(() => {
    let cancelled = false
    listCasePrompts({ skipErrorToast: true })
      .then((data) => {
        if (!cancelled) setItems(data.items || [])
      })
      .catch((err) => {
        if (!cancelled) showToast(getErrorMessage(err, '加载题库失败'), 'error')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const visible = items.filter((item) => filter === 'all' || item.kind === filter)

  const handleStart = async (item) => {
    setStarting(item.id)
    try {
      const session = await createCaseSession({
        case_id: item.id,
        kind: item.kind,
        title: item.title,
        metadata: { case_entry: 'dedicated_lobby' },
      })
      navigate(`/case/room/${session.id}`)
    } catch (err) {
      showToast(getErrorMessage(err, '创建练习失败'), 'error')
    } finally {
      setStarting(null)
    }
  }

  return (
    <div className={styles.page}>
      <PageBar title="Case / 系统设计" />
      <p className={styles.lead}>
        谈锋自编练习题（非企业真题）。Case 按「澄清 → 框架 → 假设 → 数据 → 结论」推进；系统设计按分步清单与白板架构图练习。
      </p>

      <div className={styles.filters}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`${styles.chip} ${filter === f.id ? styles.active : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className={styles.muted}>加载中…</p>
      ) : visible.length === 0 ? (
        <p className={styles.muted}>暂无题目</p>
      ) : (
        <div className={styles.grid}>
          {visible.map((item) => (
            <article key={item.id} className={styles.card}>
              <span className={styles.badge}>
                {item.kind === 'system_design' ? '系统设计' : 'Case'}
              </span>
              <h3>{item.title}</h3>
              <p>{item.prompt_preview}…</p>
              <button
                type="button"
                className={styles.start}
                disabled={starting === item.id}
                onClick={() => handleStart(item)}
              >
                {starting === item.id ? '创建中…' : '开始练习'}
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
