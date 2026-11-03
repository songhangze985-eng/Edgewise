import { useEffect, useRef, useState } from 'react'
import { DEMO_REVISION_MIN_SECONDS } from '../../config/experiment'
import { trackResearchEvent } from '../../research/track'
import styles from './DemoPanel.module.css'

const DEMO_FEEDBACK = {
  quote: '我们团队完成了整个项目',
  message:
    '依据示范原文：当前主要缺口在「个人贡献」——「我们」过多或缺少「我」的具体动作。建议多用「我」描述你的决策、分工与交付。',
  probe_question: '在这段经历里，你个人具体负责哪一部分、采取了哪些行动？',
}

export default function DemoPanel({ sessionId, questionId, minSeconds = DEMO_REVISION_MIN_SECONDS, onComplete }) {
  const [remaining, setRemaining] = useState(minSeconds)
  const startedAt = useRef(Date.now())

  useEffect(() => {
    trackResearchEvent('demo.view.start', { session_id: sessionId, question_id: questionId, context: 'revision' })
    const tick = setInterval(() => {
      setRemaining((prev) => (prev <= 1 ? 0 : prev - 1))
    }, 1000)
    return () => clearInterval(tick)
  }, [questionId, sessionId])

  const handleContinue = () => {
    const elapsed = (Date.now() - startedAt.current) / 1000
    const ratio = Math.min(1, elapsed / Math.max(minSeconds, 1))
    trackResearchEvent('demo.viewed', {
      session_id: sessionId,
      question_id: questionId,
      passive_time_ratio: ratio,
      assigned: true,
    })
    trackResearchEvent('demo.view.stop', { session_id: sessionId, passive_time_ratio: ratio })
    onComplete?.()
  }

  const canContinue = remaining <= 0

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="修订流程示范">
      <div className={styles.card}>
        <span className={styles.badge}>示范观看 · 不计入合格激活</span>
        <h3 className={styles.title}>答案修订闭环（观看示例）</h3>
        <p className={styles.script}>
          主动作答模式下，系统会在开放题后给出<strong>一条</strong>依据原文的缺口反馈，随后可选择修订或说明不修订，并回答变式追问。
        </p>
        <div className={styles.quote}>
          <div>示例原句：「{DEMO_FEEDBACK.quote}」</div>
          <div style={{ marginTop: '0.5rem' }}>{DEMO_FEEDBACK.message}</div>
        </div>
        <p className={styles.script}>
          变式追问：{DEMO_FEEDBACK.probe_question}
        </p>
        <p className={styles.timer}>
          {canContinue ? '已满足最短观看时长，可继续。' : `请继续观看约 ${remaining} 秒…`}
        </p>
        <div className={styles.actions}>
          <button type="button" disabled={!canContinue} onClick={handleContinue}>
            继续面试
          </button>
        </div>
      </div>
    </div>
  )
}
