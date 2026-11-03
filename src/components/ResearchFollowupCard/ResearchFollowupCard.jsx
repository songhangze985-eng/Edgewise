import { useState } from 'react'
import { submitResearchFollowup } from '../../api/research'
import { getErrorMessage } from '../../api/client'
import styles from './ResearchFollowupCard.module.css'

const DECLINE_REASONS = [
  { id: 'time', label: '时间不够' },
  { id: 'disagree', label: '不认同反馈' },
  { id: 'good_enough', label: '当前回答已足够' },
  { id: 'other', label: '其他' },
]

export default function ResearchFollowupCard({ sessionId, onDone }) {
  const [revised, setRevised] = useState(null)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const finish = async (payload) => {
    if (!sessionId) {
      onDone?.()
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await submitResearchFollowup(
        sessionId,
        { viewed_feedback: true, ...payload },
        { skipErrorToast: true }
      )
      onDone?.()
    } catch (err) {
      setError(getErrorMessage(err, '保存研究反馈失败'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleReviseChoice = (willRevise) => {
    setRevised(willRevise)
    if (willRevise) {
      finish({ revised: true })
    }
  }

  const handleSkipReason = () => {
    finish({
      revised: false,
      declined_revision_reason: reason.trim() || '未填写',
    })
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <div className={styles.label}>研究跟进 · 可选</div>
        <h3 className={styles.title}>是否根据反馈修订回答？</h3>
        <p className={styles.desc}>
          用于记录完整准备路径（查看反馈 → 修订或说明不采纳理由）。跳过不影响产品使用。
        </p>
        {error && <p className={styles.error}>{error}</p>}
        {revised === null && (
          <div className={styles.actions}>
            <button type="button" disabled={submitting} onClick={() => handleReviseChoice(true)}>
              会修订
            </button>
            <button type="button" disabled={submitting} onClick={() => setRevised(false)}>
              暂不修订
            </button>
            <button type="button" className={styles.link} disabled={submitting} onClick={() => onDone?.()}>
              跳过
            </button>
          </div>
        )}
        {revised === false && (
          <div className={styles.reasonBlock}>
            <p className={styles.reasonHint}>可选：不采纳的主要原因</p>
            <div className={styles.reasons}>
              {DECLINE_REASONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.reasonChip} ${reason === item.label ? styles.selected : ''}`}
                  onClick={() => setReason(item.label)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className={styles.actions}>
              <button type="button" disabled={submitting} onClick={handleSkipReason}>
                提交并继续
              </button>
              <button type="button" className={styles.link} disabled={submitting} onClick={() => onDone?.()}>
                跳过
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
