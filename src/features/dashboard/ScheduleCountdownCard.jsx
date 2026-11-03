import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listSchedules } from '../../api/schedule'
import { trackResearchEvent } from '../../research/track'
import {
  findNearestUpcoming,
  formatScheduleWhen,
  getCountdown,
  isWithinThreeDays,
  recommendPracticeForStage,
} from '../../utils/schedulePractice'
import styles from './Dashboard.module.css'

export default function ScheduleCountdownCard() {
  const [items, setItems] = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    listSchedules()
      .then((rows) => {
        if (!cancelled) setItems(rows)
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const nearest = useMemo(() => findNearestUpcoming(items), [items])
  const countdown = nearest ? getCountdown(nearest.at) : null
  const rec =
    nearest && countdown && !countdown.past && isWithinThreeDays(nearest.at)
      ? recommendPracticeForStage(nearest.stage, nearest.job_id)
      : null

  if (!loaded || !nearest) return null

  const handleRecClick = () => {
    if (!rec) return
    trackResearchEvent('schedule.recommendation_clicked', {
      schedule_id: nearest.id,
      stage: nearest.stage,
      kind: rec.kind,
      source: 'dashboard',
    })
  }

  return (
    <div className={styles['schedule-card']}>
      <div className={styles['schedule-card-head']}>
        <span className={styles['schedule-kicker']}>最近一场面试</span>
        <Link to="/schedule" className={styles['schedule-manage']}>
          管理日程 →
        </Link>
      </div>
      <div className={styles['schedule-title']}>
        {nearest.company} · {nearest.stage}
      </div>
      <div className={styles['schedule-meta']}>{formatScheduleWhen(nearest.at)}</div>
      {countdown && !countdown.past && (
        <div className={styles['schedule-countdown']} aria-live="polite">
          {countdown.label}
        </div>
      )}
      {rec ? (
        <Link to={rec.to} className={styles['schedule-rec']} onClick={handleRecClick}>
          <span className={styles['schedule-rec-label']}>面前建议 · {rec.title}</span>
          <span className={styles['schedule-rec-cta']}>去练习 →</span>
        </Link>
      ) : (
        <p className={styles['schedule-hint']}>面试前 3 天内会在这里显示针对性练习建议。</p>
      )}
    </div>
  )
}
