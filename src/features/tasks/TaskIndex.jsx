import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchTasksManifest } from '../../api/tasks'
import styles from './Tasks.module.css'

export default function TaskIndex() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchTasksManifest()
      .then((data) => {
        if (!cancelled) {
          setTasks(data.tasks || [])
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || '加载失败')
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.status}>加载任务列表…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.inner}>
          <Link to="/promo" className={styles.topLink}>
            ← 了解谈锋
          </Link>
          <p className={styles.status}>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <Link to="/promo" className={styles.topLink}>
          ← 了解谈锋
        </Link>
        <h1 className={styles.title}>面试准备任务</h1>
        <p className={styles.lead}>
          每个任务对应一种常见准备困难：先看清判断方法，再用匹配的模拟练习亲自验证。谈锋帮助你练习表达与应对追问，不承诺录用结果。
        </p>
        <ul className={styles.list}>
          {tasks.map((task) => (
            <li key={task.slug}>
              <Link to={`/tasks/${task.slug}`} className={styles.card}>
                <h2>{task.title}</h2>
                <p>{task.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
