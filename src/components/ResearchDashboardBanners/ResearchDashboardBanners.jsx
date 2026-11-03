import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createSession } from '../../api/interview'
import { fetchPosttestStatus } from '../../api/research'
import useResearchStore from '../../stores/researchStore'
import { getErrorMessage } from '../../api/client'
import styles from './ResearchDashboardBanners.module.css'

export default function ResearchDashboardBanners() {
  const navigate = useNavigate()
  const getSessionMetadata = useResearchStore((s) => s.getSessionMetadata)
  const [status, setStatus] = useState(null)
  const [day14Loading, setDay14Loading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await fetchPosttestStatus()
        if (!cancelled) setStatus(data)
      } catch {
        /* optional banners */
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const handleDay14 = async () => {
    setDay14Loading(true)
    setError('')
    try {
      const session = await createSession({
        type: 'interview',
        difficulty: 'medium',
        topic: '自愿后续任务 · 研究观察',
        metadata: {
          ...getSessionMetadata(),
          source: 'day14_voluntary',
          research_session_source: 'day14_voluntary',
          counts_toward_activation: true,
          participation_mode: 'active',
        },
      })
      navigate(`/interview/room/${session.id}`)
    } catch (err) {
      setError(getErrorMessage(err, '创建后续任务失败'))
    } finally {
      setDay14Loading(false)
    }
  }

  if (!status) return null

  const showPosttest = status.due && !status.completed
  const showDay14 = status.followup_task_open

  if (!showPosttest && !showDay14) return null

  return (
    <div className={styles.wrap}>
      {showPosttest && (
        <div className={`hw-panel ${styles.banner} ${styles.posttest}`}>
          <div>
            <div className={styles.label}>研究追访 {status.overdue ? '· 已到期' : '· 已到开放日'}</div>
            <p>请完成一项未在安排练习中展示过的匹配难度独立追问（约 5–10 分钟）。</p>
          </div>
          <Link to="/research/posttest" className={styles.action}>
            前往七日追访
          </Link>
        </div>
      )}
      {showDay14 && (
        <div className={`hw-panel ${styles.banner} ${styles.day14}`}>
          <div>
            <div className={styles.label}>自愿后续任务 · 研究观察</div>
            <p>共同开放的后续练习已开放，完全自愿；本次练习计入合格激活。</p>
            {error && <p className={styles.error}>{error}</p>}
          </div>
          <button
            type="button"
            className={styles.action}
            disabled={day14Loading}
            onClick={handleDay14}
          >
            {day14Loading ? '创建中…' : '进入面试大厅'}
          </button>
        </div>
      )}
    </div>
  )
}
