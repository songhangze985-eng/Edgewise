import { useState } from 'react'
import { fetchResearchUser, fetchResearchUserTimeline } from '../../../../api/researchAdmin'
import { getErrorMessage } from '../../../../api/client'
import StatCard from '../components/StatCard'
import styles from '../ResearchStats.module.css'

export default function UserTimelineTab() {
  const [q, setQ] = useState('')
  const [profile, setProfile] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [error, setError] = useState(null)

  const search = async () => {
    setError(null)
    try {
      const p = await fetchResearchUser(q.trim())
      setProfile(p)
      const tl = await fetchResearchUserTimeline(q.trim())
      setTimeline(tl.timeline || [])
    } catch (err) {
      setProfile(null)
      setTimeline([])
      setError(getErrorMessage(err, '未找到用户'))
    }
  }

  return (
    <>
      <p className={styles.cardSub}>仅支持 12 位 user_hash 精确查询；每次查询写入审计日志。</p>
      <div className={styles.filterRow}>
        <input
          className={styles.textInput}
          placeholder="user_hash"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="button" className={styles.btnPrimary} onClick={search}>
          查询
        </button>
      </div>
      {error && <div className={styles.errorBox}>{error}</div>}
      {profile && (
        <div className={styles.twoCol}>
          <StatCard title="用户信息">
            <ul className={styles.metaList}>
              <li>哈希: {profile.user_hash}</li>
              <li>分组: {profile.arm}</li>
              <li>渠道: {profile.entry_channel || '—'}</li>
              <li>同意: {profile.consent_at || '—'}</li>
            </ul>
          </StatCard>
          <StatCard title="时间线">
            <ul className={styles.trendList}>
              {timeline.map((ev, idx) => (
                <li key={`${ev.id}-${idx}`}>
                  [{ev.source}] {ev.ts} · {ev.name}
                </li>
              ))}
            </ul>
          </StatCard>
        </div>
      )}
    </>
  )
}
