import styles from './ResearchStats.module.css'

export default function FilterBar({ meta, filters, onChange, filteredN, consentedTotal, onClear }) {
  return (
    <div className={styles.filterBar}>
      <div className={styles.filterRow}>
        <label className={styles.filterField}>
          时间
          <input
            type="date"
            value={filters.from?.slice(0, 10) || ''}
            onChange={(e) => onChange({ from: e.target.value ? `${e.target.value}T00:00:00+08:00` : '' })}
          />
        </label>
        <span className={styles.filterSep}>至</span>
        <label className={styles.filterField}>
          <input
            type="date"
            value={filters.to?.slice(0, 10) || ''}
            onChange={(e) => onChange({ to: e.target.value ? `${e.target.value}T23:59:59+08:00` : '' })}
          />
        </label>
        <label className={styles.filterField}>
          实验组 ZC
          <select
            value={filters.zc}
            onChange={(e) => onChange({ zc: e.target.value })}
          >
            <option value="">全部</option>
            <option value="0">常规 (0)</option>
            <option value="1">连续 (1)</option>
          </select>
        </label>
        <label className={styles.filterField}>
          ZP
          <select value={filters.zp} onChange={(e) => onChange({ zp: e.target.value })}>
            <option value="">全部</option>
            <option value="0">示范 (0)</option>
            <option value="1">主动 (1)</option>
          </select>
        </label>
        <label className={styles.filterField}>
          渠道
          <select value={filters.channel} onChange={(e) => onChange({ channel: e.target.value })}>
            <option value="">全部</option>
            {(meta?.channels || []).map((c) => (
              <option key={c.id} value={c.id === '__other__' ? '' : c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filterField}>
          规则版本
          <select
            value={filters.rule_version}
            onChange={(e) => onChange({ rule_version: e.target.value })}
          >
            <option value="">最新</option>
            {(meta?.rule_versions || []).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filterField}>
          题库版本
          <select
            value={filters.survey_version}
            onChange={(e) => onChange({ survey_version: e.target.value })}
          >
            <option value="">当前</option>
            {(meta?.survey_versions || []).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <span className={styles.consentTag}>仅统计已同意</span>
      </div>
      <div className={styles.filterSummary}>
        筛选后 n = {filteredN ?? '—'} / 已同意 {consentedTotal ?? '—'}
        <button type="button" className={styles.linkBtn} onClick={onClear}>
          清空筛选
        </button>
      </div>
    </div>
  )
}
