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
      <StatCard title="盲评队列">
        <p>待评: {data?.pending ?? '—'}</p>
        <p className={styles.cardSub}>{data?.note}</p>
        <Link to="/management" className={styles.linkBtn}>
          前往管理后台评分 →
        </Link>
      </StatCard>
      <p className={styles.cardSub}>本页不展示实验分组信息。</p>
    </>
  )
}
