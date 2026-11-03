import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchOrgAggregate } from '../../api/org'
import { getErrorMessage } from '../../api/client'
import PageBar from '../../components/ui/PageBar'
import styles from './Org.module.css'

function formatRate(value) {
  if (value == null) return '—'
  return `${Math.round(value * 1000) / 10}%`
}

export default function OrgDashboard() {
  const { orgId } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!orgId) return
    setLoading(true)
    fetchOrgAggregate(orgId)
      .then(setData)
      .catch((err) => setError(getErrorMessage(err, '加载失败')))
      .finally(() => setLoading(false))
  }, [orgId])

  const totals = data?.totals

  return (
    <div className={styles.page} style={{ maxWidth: 960 }}>
      <PageBar
        title="机构看板"
        subtitle={data?.name || orgId}
        actions={
          <Link to="/org/mentor" className={styles.ghost}>
            指导者视图
          </Link>
        }
      />

      {loading && <p className={styles.empty}>加载汇总…</p>}
      {error && <p className={styles.error}>{error}</p>}

      {data && (
        <>
          <p className={styles.lead}>{data.disclaimer}</p>
          <p className={styles.note}>
            汇总阈值：每组至少 {data.min_group_size} 人；低于阈值的分组不展示明细（不可关闭）。
          </p>

          {!totals?.suppressed ? (
            <div className={styles.metricGrid}>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>参与人数</div>
                <div className={styles.metricValue}>{totals.member_count}</div>
              </div>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>合格激活比例</div>
                <div className={styles.metricValue}>{formatRate(totals.qualified_activation_rate)}</div>
              </div>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>工作坊完成比例</div>
                <div className={styles.metricValue}>{formatRate(totals.workshop_completion_rate)}</div>
              </div>
            </div>
          ) : (
            <p className={styles.suppressed}>{totals.suppressed_reason}</p>
          )}

          <div className={styles.panel}>
            <h2>分班汇总</h2>
            {data.groups?.length === 0 ? (
              <p className={styles.empty}>暂无成员分班数据</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>分组</th>
                    <th>人数</th>
                    <th>合格激活</th>
                    <th>工作坊完成</th>
                  </tr>
                </thead>
                <tbody>
                  {data.groups.map((g) => (
                    <tr key={g.label}>
                      <td>{g.label}</td>
                      <td>{g.member_count}</td>
                      <td className={g.suppressed ? styles.suppressed : ''}>
                        {g.suppressed ? g.suppressed_reason : formatRate(g.qualified_activation_rate)}
                      </td>
                      <td className={g.suppressed ? styles.suppressed : ''}>
                        {g.suppressed ? g.suppressed_reason : formatRate(g.workshop_completion_rate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className={styles.panel}>
            <h2>工作坊任务</h2>
            {data.workshops?.length === 0 ? (
              <p className={styles.empty}>尚未配置工作坊（可在管理后台创建）</p>
            ) : (
              <ul className={styles.list}>
                {data.workshops.map((ws) => (
                  <li key={ws.id}>
                    {ws.title}
                    {' · '}
                    {ws.mode === 'pair' ? '双人追问' : '修订闭环'}
                    {ws.task_slug ? (
                      <>
                        {' · '}
                        <Link to={`/tasks/${ws.task_slug}`}>任务页</Link>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
