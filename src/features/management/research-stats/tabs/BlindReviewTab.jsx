import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchBlindReviewProgress } from '../../../../api/researchAdmin'
import { getErrorMessage } from '../../../../api/client'
import StatCard from '../components/StatCard'
import styles from '../ResearchStats.module.css'

export default function BlindReviewTab({ refreshKey }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    fetchBlindReviewProgress()
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(getErrorMessage(err, '加载失败')))
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  if (error) return <div className={styles.errorBox}>{error}</div>

  return (
    <>
      <StatCard title="后测双评进度">
        <p>待首评 {data?.awaiting_first_review ?? '—'}</p>
        <p>待第二位评分者 {data?.single_review ?? '—'}</p>
        <p>已完成两份评分 {data?.double_review ?? '—'}</p>
        <p>旧版评分待处理或核查 {data?.processing ?? '—'}</p>
        <p className={styles.cardSub}>{data?.note}</p>
        <Link to="/management" className={styles.linkBtn}>
          前往管理后台评分 →
        </Link>
      </StatCard>
      <p className={styles.cardSub}>本页不展示实验分组信息。</p>
    </>
  )
}
