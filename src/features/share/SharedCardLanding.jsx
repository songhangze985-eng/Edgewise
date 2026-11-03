import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import RevisionCard from './RevisionCard'
import { fetchShareCard } from '../../api/share'
import { getErrorMessage } from '../../api/client'
import useAuthStore from '../../stores/authStore'
import useResearchStore from '../../stores/researchStore'
import { trackResearchEvent } from '../../research/track'
import styles from './SharedCardLanding.module.css'

export default function SharedCardLanding() {
  const { shareId } = useParams()
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const captureFromUrl = useResearchStore((s) => s.captureFromUrl)
  const [card, setCard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [probeDraft, setProbeDraft] = useState('')
  const [probeStarted, setProbeStarted] = useState(false)

  useEffect(() => {
    captureFromUrl()
  }, [captureFromUrl])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchShareCard(shareId)
      .then((data) => {
        if (!cancelled) {
          setCard(data)
          setLoading(false)
          trackResearchEvent('share.card_opened', { share_id: shareId, revoked: data.revoked })
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err, '卡片不存在或已失效'))
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [shareId])

  const startProbe = () => {
    if (!isAuthenticated) {
      const returnTo = `/s/${shareId}?share_id=${encodeURIComponent(shareId)}`
      navigate(`/login?redirect=${encodeURIComponent(returnTo)}`)
      return
    }
    setProbeStarted(true)
    trackResearchEvent('share.probe_started', { share_id: shareId })
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.status}>加载中…</p>
      </div>
    )
  }

  if (error || !card) {
    return (
      <div className={styles.page}>
        <Link to="/promo" className={styles.topLink}>
          ← 了解谈锋
        </Link>
        <p className={styles.status}>{error || '无法加载'}</p>
      </div>
    )
  }

  if (card.revoked) {
    return (
      <div className={styles.page}>
        <Link to="/promo" className={styles.topLink}>
          ← 了解谈锋
        </Link>
        <div className={styles.revoked}>分享者已撤回</div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <Link to="/promo" className={styles.topLink}>
        ← 了解谈锋
      </Link>
      <div className={styles.center}>
        <RevisionCard
          questionTitle={card.question_title}
          gapLabel={card.gap_label}
          methodText={card.method_text}
          probeText={card.probe_text}
          includeExcerpt={card.include_excerpt}
          excerpt={card.excerpt}
        />

        <div className={styles.probePanel}>
          <h2>试答这道追问</h2>
          {!probeStarted ? (
            <button type="button" className={styles.btn} onClick={startProbe}>
              {isAuthenticated ? '开始试答' : '登录后开始试答'}
            </button>
          ) : (
            <>
              <textarea
                className={styles.textarea}
                value={probeDraft}
                onChange={(e) => setProbeDraft(e.target.value)}
                placeholder="在这里独立作答，不会展示给他人…"
              />
              <p className={styles.note}>
                这是本地练习草稿，不会自动上传。完整反馈请进入模拟面试。
              </p>
              <button
                type="button"
                className={styles.btn}
                onClick={() => navigate('/interview/lobby?utm_source=share_card')}
              >
                进入完整练习
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
