import { useEffect, useState } from 'react'
import { submitRevisionDecision } from '../../api/interview'
import { getErrorMessage } from '../../api/client'
import { trackResearchEvent } from '../../research/track'
import styles from './RevisionPanel.module.css'

const DECLINE_REASONS = [
  '不认同反馈依据',
  '当前回答已足够',
  '时间不够',
  '其他',
]

export default function RevisionPanel({
  sessionId,
  questionId,
  roundIndex,
  questionIndex,
  feedback,
  initialAnswer,
  required = false,
  assigned = false,
  onComplete,
  onSkip,
}) {
  const [phase, setPhase] = useState('feedback')
  const [revisedText, setRevisedText] = useState(initialAnswer || '')
  const [declineReason, setDeclineReason] = useState('')
  const [customReason, setCustomReason] = useState('')
  const [probeAnswer, setProbeAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!feedback) return
    trackResearchEvent('revision.feedback_shown', {
      session_id: sessionId,
      question_id: questionId,
      round_index: roundIndex,
      gap_key: feedback.gap_key,
      assigned,
    })
    if (!assigned) {
      trackResearchEvent('feedback.view', {
        session_id: sessionId,
        question_id: questionId,
        assigned: false,
      })
    }
  }, [assigned, feedback, questionId, roundIndex, sessionId])

  const resolvedDeclineReason = () => {
    if (declineReason === '其他') return customReason.trim()
    return declineReason.trim()
  }

  const finish = async (payload) => {
    setSubmitting(true)
    setError('')
    try {
      await submitRevisionDecision(
        sessionId,
        questionId,
        {
          round_index: roundIndex,
          question_index: questionIndex,
          feedback_viewed: true,
          ...payload,
        },
        { skipErrorToast: true },
      )
      onComplete?.()
    } catch (err) {
      setError(getErrorMessage(err, '保存修订结果失败'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleChooseRevise = () => {
    setPhase('revise')
  }

  const handleChooseDecline = () => {
    setPhase('decline')
  }

  const handleSubmitRevise = () => {
    const text = revisedText.trim()
    if (!text) {
      setError('请填写修订后的回答')
      return
    }
    if (!probeAnswer.trim()) {
      setError('请先回答变式追问')
      return
    }
    finish({
      decision: 'revise',
      revised_text: text,
      probe_answer: probeAnswer.trim(),
    })
  }

  const handleSubmitDecline = () => {
    const reason = resolvedDeclineReason()
    if (!reason) {
      setError('说明不修订时需要填写原因')
      return
    }
    if (!probeAnswer.trim()) {
      setError('请先回答变式追问')
      return
    }
    finish({
      decision: 'decline',
      decline_reason: reason,
      probe_answer: probeAnswer.trim(),
    })
  }

  const handleSkip = () => {
    if (required) return
    submitRevisionDecision(
      sessionId,
      questionId,
      {
        round_index: roundIndex,
        question_index: questionIndex,
        decision: 'skip',
      },
      { skipErrorToast: true },
    )
      .catch(() => {})
      .finally(() => onSkip?.())
  }

  if (!feedback) {
    return null
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="答案修订反馈">
      <div className={styles.card}>
        <div className={styles.label}>依据反馈 · 单点缺口</div>
        <h3 className={styles.title}>请查看反馈后再决定如何调整</h3>
        <blockquote className={styles.quote}>「{feedback.quote}」</blockquote>
        <p className={styles.feedback}>{feedback.message}</p>

        {phase === 'feedback' && (
          <div className={styles.actions}>
            <button type="button" className={styles.primary} disabled={submitting} onClick={handleChooseRevise}>
              修订回答
            </button>
            <button type="button" disabled={submitting} onClick={handleChooseDecline}>
              不修订
            </button>
            {!required && (
              <button type="button" className={styles.link} disabled={submitting} onClick={handleSkip}>
                跳过
              </button>
            )}
          </div>
        )}

        {phase === 'revise' && (
          <>
            <p className={styles.hint}>在原文基础上改写，突出「我」的行动与结果（不会替你生成标准答案）。</p>
            <textarea
              className={styles.textarea}
              value={revisedText}
              onChange={(e) => setRevisedText(e.target.value)}
              rows={5}
            />
          </>
        )}

        {phase === 'decline' && (
          <>
            <p className={styles.hint}>请说明不采纳本条反馈的主要原因（必填）。</p>
            <div className={styles.actions}>
              {DECLINE_REASONS.map((label) => (
                <button
                  key={label}
                  type="button"
                  className={declineReason === label ? styles.primary : ''}
                  onClick={() => setDeclineReason(label)}
                >
                  {label}
                </button>
              ))}
            </div>
            {declineReason === '其他' && (
              <textarea
                className={styles.textarea}
                placeholder="请简要说明…"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                rows={3}
              />
            )}
          </>
        )}

        {(phase === 'revise' || phase === 'decline') && (
          <div className={styles.probe}>
            <q>{feedback.probe_question}</q>
            <textarea
              className={styles.textarea}
              placeholder="变式追问作答…"
              value={probeAnswer}
              onChange={(e) => setProbeAnswer(e.target.value)}
              rows={3}
            />
            <div className={styles.actions}>
              {phase === 'revise' ? (
                <button type="button" className={styles.primary} disabled={submitting} onClick={handleSubmitRevise}>
                  提交修订
                </button>
              ) : (
                <button type="button" className={styles.primary} disabled={submitting} onClick={handleSubmitDecline}>
                  提交说明
                </button>
              )}
              <button type="button" disabled={submitting} onClick={() => setPhase('feedback')}>
                返回
              </button>
            </div>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>
  )
}
