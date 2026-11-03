import { useEffect, useState } from 'react'
import { fetchResearchOverview } from '../../../../api/researchAdmin'
import { getErrorMessage } from '../../../../api/client'
import StatCard from '../components/StatCard'
import Funnel from '../components/Funnel'
import ArmGrid from '../components/ArmGrid'
import SmallN from '../components/SmallN'
import styles from '../ResearchStats.module.css'

function fmtPct(v) {
  if (v == null) return '—'
  return `${(v * 100).toFixed(1)}%`
}

export default function OverviewTab({ filters, refreshKey }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [trendOpen, setTrendOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchResearchOverview(filters)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((err) => {
        if (!cancelled) {
          setData(null)
          setError(getErrorMessage(err, '加载失败'))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filters, refreshKey])

  if (loading) {
    return <div className={styles.skeletonGrid}>加载中…</div>
  }
  if (error) {
    return (
      <div className={styles.errorBox}>
        {error}
        <button type="button" onClick={() => setLoading(true)}>
          重试
        </button>
      </div>
    )
  }
  if (!data?.filtered_n) {
    return <p className={styles.empty}>当前筛选下还没有数据</p>
  }

  const k = data.kpis || {}
  return (
    <>
      <div className={styles.kpiGrid}>
        <StatCard title="注册用户" value={k.registered_users ?? '—'} sub="研究入口曝光基数" />
        <StatCard
          title="研究同意率"
          value={fmtPct(k.consent_rate?.rate)}
          sub={`${k.consent_rate?.numerator ?? '—'} / ${k.consent_rate?.denominator ?? '—'} · 撤回 ${k.consent_rate?.withdrawn ?? 0}`}
        />
        <StatCard
          title="合格激活率 (ITT)"
          value={fmtPct(k.qualified_activation_itt?.rate)}
          sub={`${k.qualified_activation_itt?.numerator ?? '—'} / ${k.qualified_activation_itt?.denominator ?? '—'}`}
        />
        <StatCard
          title="7 日后测完成率"
          value={fmtPct(k.posttest_7d_rate?.rate)}
          sub={`${k.posttest_7d_rate?.numerator ?? '—'} / ${k.posttest_7d_rate?.denominator ?? '—'} 已到期 · 失访 ${fmtPct(k.posttest_7d_rate?.attrition_rate)}`}
        />
        <StatCard
          title="微问卷展示作答率"
          value={fmtPct(k.micro_survey_response?.rate)}
          sub={`跳过率 ${fmtPct(k.micro_survey_response?.skip_rate)}`}
          warn={k.micro_survey_response?.rate != null && k.micro_survey_response.rate < 0.7}
        />
      </div>
      <div className={styles.twoCol}>
        <StatCard title="研究漏斗">
          <Funnel steps={data.funnel} />
        </StatCard>
        <StatCard title="后测完成与失访 (ZC × ZP)">
          <ArmGrid grid={data.posttest_grid} />
        </StatCard>
      </div>
      <StatCard title="各触发点完成情况">
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>触发点</th>
                <th>符合条件</th>
                <th>已触发</th>
                <th>已展示</th>
                <th>已作答</th>
                <th>跳过</th>
                <th>声明不答</th>
                <th>触发达成率</th>
                <th>展示作答率</th>
              </tr>
            </thead>
            <tbody>
              {(data.trigger_table || []).map((row) => (
                <tr key={row.trigger}>
                  <td>{row.label}</td>
                  <td><SmallN value={row.eligible} /></td>
                  <td><SmallN value={row.triggered} /></td>
                  <td><SmallN value={row.shown} /></td>
                  <td><SmallN value={row.answered} /></td>
                  <td><SmallN value={row.skipped} /></td>
                  <td><SmallN value={row.declined} /></td>
                  <td>{fmtPct(row.trigger_reach_rate)}</td>
                  <td className={row.display_response_rate != null && row.display_response_rate < 0.7 ? styles.warnText : ''}>
                    {fmtPct(row.display_response_rate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StatCard>
      <button type="button" className={styles.linkBtn} onClick={() => setTrendOpen((v) => !v)}>
        {trendOpen ? '收起' : '展开'}回收趋势
      </button>
      {trendOpen && (
        <StatCard title="每日趋势">
          {(data.daily_trend || []).length === 0 ? (
            <p className={styles.empty}>暂无趋势数据</p>
          ) : (
            <ul className={styles.trendList}>
              {data.daily_trend.map((d) => (
                <li key={d.date}>
                  {d.date} · 同意 {d.consent} · 作答 {d.answers} · 后测 {d.posttest}
                </li>
              ))}
            </ul>
          )}
        </StatCard>
      )}
    </>
  )
}
