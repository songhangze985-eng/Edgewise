import { useState } from 'react'
import { fetchResearchUser, fetchResearchUserTimeline } from '../../../../api/researchAdmin'
import { getErrorMessage } from '../../../../api/client'
import StatCard from '../components/StatCard'
import styles from '../ResearchStats.module.css'

export default function UserTimelineTab() {
  const [q, setQ] = useState('')
  const [profile, setProfile] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [eventQuality, setEventQuality] = useState(null)
  const [error, setError] = useState(null)

  const search = async () => {
    setError(null)
    try {
      const p = await fetchResearchUser(q.trim())
      setProfile(p)
      const tl = await fetchResearchUserTimeline(q.trim())
      setTimeline(tl.timeline || [])
      setEventQuality(tl.event_quality || null)
    } catch (err) {
      setProfile(null)
      setTimeline([])
      setEventQuality(null)
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
            {eventQuality && (
              <p className={styles.cardSub}>
                最近最多 {eventQuality.event_limit} 条事件：检查 {eventQuality.events_checked} 条，
                重复标识 {eventQuality.repeated_id_groups} 组，内容不一致 {eventQuality.conflicting_id_groups} 组，
                无客户端标识 {eventQuality.events_without_client_id} 条。结果不代表全量数据，也不自动合并记录。
              </p>
            )}
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
