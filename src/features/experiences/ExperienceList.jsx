import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import { listExperiences } from '../../api/experiences'
import { listCreatorSeries } from '../../api/series'
import { getErrorMessage } from '../../api/client'
import { creatorSeriesVariant } from '../../config/experiment'
import PageBar from '../../components/ui/PageBar'
import styles from './Experiences.module.css'

export default function ExperienceList() {
  const navigate = useNavigate()
  const experimentAssignment = useAuthStore((s) => s.user?.experimentAssignment)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [stage, setStage] = useState('')
  const [seriesLink, setSeriesLink] = useState(null)

  const variant = useMemo(
    () => creatorSeriesVariant(experimentAssignment),
    [experimentAssignment],
  )

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    const params = {}
    if (company.trim()) params.company = company.trim()
    if (role.trim()) params.role = role.trim()
    if (stage.trim()) params.stage = stage.trim()
    return listExperiences(params)
      .then(setRows)
      .catch((err) => setError(getErrorMessage(err, '加载面经失败')))
      .finally(() => setLoading(false))
  }, [company, role, stage])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    listCreatorSeries({ variant })
      .then((list) => {
        const pick = list.find((s) => s.variant === variant) || list[0]
        setSeriesLink(pick || null)
      })
      .catch(() => setSeriesLink(null))
  }, [variant])

  return (
    <div className={styles.page}>
      <PageBar
        title="面经库"
        subtitle="用户投稿 · 人工审核后公开"
        actions={
          <Link to="/experiences/submit" className={styles['primary-btn']}>
            投稿面经
          </Link>
        }
      />

      {seriesLink && (
        <div className={styles.disclosure}>
          创作者专栏：
          <Link to={`/series/${seriesLink.id}`}>{seriesLink.topic}</Link>
          {variant === 'conclusion' ? '（实验：结论对照视角）' : '（互补追问视角）'}
        </div>
      )}

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <input
            placeholder="公司"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            aria-label="筛选公司"
          />
          <input
            placeholder="岗位"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            aria-label="筛选岗位"
          />
          <input
            placeholder="环节"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            aria-label="筛选环节"
          />
          <button type="button" className={styles['ghost-btn']} onClick={load}>
            筛选
          </button>
        </div>
      </div>

      {loading && <p className={styles.empty}>加载中…</p>}
      {!loading && error && <p className={styles.empty}>{error}</p>}
      {!loading && !error && rows.length === 0 && (
        <p className={styles.empty}>
          暂无已审核面经。你可以
          {' '}
          <Link to="/experiences/submit">提交结构化面经</Link>
          ，审核通过后会出现在这里。我们不会展示未经审核或虚构的内容。
        </p>
      )}

      <div className={styles['card-list']}>
        {rows.map((row) => (
          <article
            key={row.id}
            className={styles.card}
            onClick={() => navigate(`/experiences/${row.id}`)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigate(`/experiences/${row.id}`)
            }}
            role="button"
            tabIndex={0}
          >
            <h3>{row.company}</h3>
            <p className={styles.meta}>
              {row.role}
              {' · '}
              {row.stage}
              {' · '}
              {row.date_month}
            </p>
            <p className={styles.hint}>
              {row.questions.length}
              {' '}
              道题已收录
            </p>
          </article>
        ))}
      </div>
    </div>
  )
}
