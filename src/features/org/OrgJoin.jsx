import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchOrgJoinPreview, submitOrgJoin } from '../../api/org'
import { getErrorMessage } from '../../api/client'
import useAuthStore from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import PageBar from '../../components/ui/PageBar'
import styles from './Org.module.css'

export default function OrgJoin() {
  const { code } = useParams()
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [cohort, setCohort] = useState('')
  const [shareWithMentor, setShareWithMentor] = useState(false)
  const [shareScope, setShareScope] = useState('session')
  const [consentAccepted, setConsentAccepted] = useState(false)

  useEffect(() => {
    if (!code) return
    setLoading(true)
    fetchOrgJoinPreview(code)
      .then(setPreview)
      .catch((err) => setError(getErrorMessage(err, '邀请码无效')))
      .finally(() => setLoading(false))
  }, [code])

  useEffect(() => {
    if (!loading && preview && !isAuthenticated) {
      const returnTo = `/org/join/${code}`
      navigate(`/login?redirect=${encodeURIComponent(returnTo)}`, { replace: true })
    }
  }, [loading, preview, isAuthenticated, navigate, code])

  const handleJoin = async () => {
    if (!consentAccepted) {
      setError('请先勾选机构数据说明')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await submitOrgJoin(code, {
        cohort,
        org_consent_accepted: true,
        share_with_mentor: shareWithMentor,
        share_scope: shareScope,
      })
      showToast('已加入机构工作坊', 'success')
      navigate('/', { replace: true })
    } catch (err) {
      setError(getErrorMessage(err, '加入失败'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.page} style={{ padding: '2rem' }}>
        <p className={styles.empty}>加载机构信息…</p>
      </div>
    )
  }

  if (!preview) {
    return (
      <div className={styles.page} style={{ padding: '2rem' }}>
        <PageBar title="机构邀请" />
        <p className={styles.error}>{error || '邀请无效'}</p>
        <Link to="/login" className={styles.ghost}>返回登录</Link>
      </div>
    )
  }

  return (
    <div className={styles.page} style={{ padding: '1.5rem' }}>
      <PageBar title="加入高校工作坊" subtitle={preview.name} />
      <p className={styles.lead}>
        试点周期：{preview.pilot_period || '—'}。{preview.service_description}
      </p>

      <div className={styles.panel}>
        <h2>谁能看到什么？</h2>
        <ul className={styles.list}>
          <li>
            <strong>机构（就业指导中心）</strong>：仅看到<strong>汇总统计</strong>（参与人数、合格练习比例、工作坊完成情况）。
            分班人数不足 5 人时不展示该班明细（「人数不足，不展示」）。
          </li>
          <li>
            <strong>就业指导者</strong>：仅能看到您<strong>主动勾选分享</strong>的练习摘要（题目与修订进度），
            不含分数、排名或录用建议。
          </li>
          <li>
            <strong>产品研究</strong>：与研究知情同意<strong>分开</strong>；加入机构不代表自动参与论文研究。
          </li>
        </ul>
      </div>

      <div className={styles.panel}>
        <div className={styles.field}>
          <label htmlFor="cohort">班级 / 分组（用于机构汇总，可选）</label>
          <input
            id="cohort"
            value={cohort}
            onChange={(e) => setCohort(e.target.value)}
            placeholder="例如：2026 春 · 一班"
            maxLength={120}
          />
        </div>

        <div className={styles.checkboxRow}>
          <input
            id="shareMentor"
            type="checkbox"
            checked={shareWithMentor}
            onChange={(e) => setShareWithMentor(e.target.checked)}
          />
          <label htmlFor="shareMentor">
            允许就业指导者查看我分享的练习（您可在个人主页随时关闭或改为仅分享指定场次）
          </label>
        </div>

        {shareWithMentor && (
          <div className={styles.field}>
            <label htmlFor="scope">分享范围</label>
            <select id="scope" value={shareScope} onChange={(e) => setShareScope(e.target.value)}>
              <option value="session">仅我手动分享的场次</option>
              <option value="all">全部已完成的练习摘要（仍不含分数）</option>
            </select>
          </div>
        )}

        <div className={styles.checkboxRow}>
          <input
            id="orgConsent"
            type="checkbox"
            checked={consentAccepted}
            onChange={(e) => setConsentAccepted(e.target.checked)}
          />
          <label htmlFor="orgConsent">
            我已阅读并理解上述机构与指导者可见范围，自愿加入本试点。
          </label>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <button type="button" className={styles.primary} disabled={submitting} onClick={handleJoin}>
          {submitting ? '提交中…' : '确认加入'}
        </button>
        <Link to="/" className={styles.ghost}>暂不加入</Link>
      </div>

      <p className={styles.note}>
        邀请码 {preview.invite_code} · 机构不提供招聘筛选报告，谈锋也不向机构输出个人排名。
      </p>
    </div>
  )
}
