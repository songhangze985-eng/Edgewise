import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  fetchPair,
  setPairVisibility,
  submitPairAnswer,
} from '../../api/share'
import { getErrorMessage } from '../../api/client'
import useAuthStore from '../../stores/authStore'
import useResearchStore from '../../stores/researchStore'
import { trackResearchEvent } from '../../research/track'
import styles from './PairPractice.module.css'

export default function PairPractice() {
  const { pairId } = useParams()
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const captureFromUrl = useResearchStore((s) => s.captureFromUrl)
  const [pair, setPair] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    return fetchPair(pairId)
      .then((data) => {
        setPair(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(getErrorMessage(err, '加载失败'))
        setLoading(false)
      })
  }, [pairId])

  useEffect(() => {
    captureFromUrl()
  }, [captureFromUrl])

  useEffect(() => {
    if (!isAuthenticated) {
      const returnTo = `/pair/${pairId}?pair_id=${encodeURIComponent(pairId)}`
      navigate(`/login?redirect=${encodeURIComponent(returnTo)}`, { replace: true })
      return
    }
    load()
  }, [isAuthenticated, load, navigate, pairId])

  const myVisible =
    pair?.viewer_role === 'inviter' ? pair.visibility_inviter : pair?.visibility_invitee

  const handleSubmit = async () => {
    if (!draft.trim()) return
    setSaving(true)
    setError('')
    try {
      const data = await submitPairAnswer(pairId, draft.trim())
      setPair(data)
      setDraft('')
      trackResearchEvent('pair.answered', { pair_id: pairId, role: data.viewer_role })
    } catch (err) {
      setError(getErrorMessage(err, '提交失败'))
    } finally {
      setSaving(false)
    }
  }

  const handleVisibility = async (visible) => {
    setSaving(true)
    try {
      const data = await setPairVisibility(pairId, visible)
      setPair(data)
      trackResearchEvent('pair.visibility', {
        pair_id: pairId,
        visible,
        mutual: data.mutual_visible,
      })
    } catch (err) {
      setError(getErrorMessage(err, '更新失败'))
    } finally {
      setSaving(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <div className={styles.page}>
        <p className={styles.status}>跳转登录…</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.status}>加载中…</p>
      </div>
    )
  }

  if (error && !pair) {
    return (
      <div className={styles.page}>
        <Link to="/" className={styles.back}>
          ← 返回
        </Link>
        <p className={styles.error}>{error}</p>
      </div>
    )
  }

  const isInviter = pair.viewer_role === 'inviter'
  const isInvitee = pair.viewer_role === 'invitee'

  function renderAnswer(role, text) {
    if (!text) return <span className={styles.muted}>—</span>
    const mine = (role === 'inviter' && isInviter) || (role === 'invitee' && isInvitee)
    if (mine || pair.mutual_visible) return text
    return <span className={styles.muted}>已作答 · 双方开启可见后可互看</span>
  }

  return (
    <div className={styles.page}>
      <Link to="/" className={styles.back}>
        ← 返回概览
      </Link>
      <h1 className={styles.title}>双人追问练习</h1>
      <p className={styles.probe}>{pair.probe_text}</p>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>邀请者作答</div>
        <div className={styles.answerBox}>{renderAnswer('inviter', pair.inviter_answer)}</div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>受邀者作答</div>
        <div className={styles.answerBox}>{renderAnswer('invitee', pair.invitee_answer)}</div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>你的回答</div>
        <textarea
          className={styles.textarea}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="独立作答…"
        />
        <button type="button" className={styles.btn} disabled={saving} onClick={handleSubmit}>
          提交回答
        </button>
      </div>

      <label className={styles.toggleRow}>
        <input
          type="checkbox"
          checked={Boolean(myVisible)}
          onChange={(e) => handleVisibility(e.target.checked)}
          disabled={saving}
        />
        <span>允许对方看到我的回答（需双方均开启才互看）</span>
      </label>

      {pair.mutual_visible ? (
        <p className={styles.hint}>双方均已开启可见，可以互相查看完整作答。</p>
      ) : (
        <p className={styles.hint}>默认互不可见；开启后仍须对方也开启才会展示。</p>
      )}

      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  )
}
