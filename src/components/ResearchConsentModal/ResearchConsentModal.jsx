import { useState } from 'react'
import { createPortal } from 'react-dom'
import { submitResearchConsent } from '../../api/research'
import useAuthStore from '../../stores/authStore'
import { getErrorMessage } from '../../api/client'
import { triggerSurveyCheck } from '../../stores/surveyStore'
import styles from './ResearchConsentModal.module.css'

export default function ResearchConsentModal({ onResolved, mode = 'initial' }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleChoice = async (accepted) => {
    setSubmitting(true)
    setError('')
    try {
      const consent = await submitResearchConsent(accepted)
      await useAuthStore.getState().fetchMe()
      if (accepted) {
        triggerSurveyCheck('consent')
      }
      onResolved?.(consent)
    } catch (err) {
      setError(getErrorMessage(err, '提交选择失败，请稍后重试'))
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="研究知情同意">
      <div className={styles.modal}>
        <div className={styles.kicker}>Research · 创意营销与准备任务研究</div>
        <h2 className={styles.title}>
          {mode === 'withdraw' ? '撤回研究同意？' : '是否参与产品使用研究？'}
        </h2>
        <p className={styles.lead}>
          我们正在开展与谈锋 Edgewise 相关的创意营销与面试准备路径研究，用于改进产品与论文分析。
        </p>
        <ul className={styles.list}>
          <li>可能收集：练习会话记录、对话转写、得分维度、入口渠道与任务编号（如有）。</li>
          <li>可选关联：您自愿填写的个人资料；不含未授权的外部数据抓取。</li>
          <li>完全自愿：拒绝后仍可正常使用产品；未同意用户的会话不会纳入研究导出。</li>
          <li>您可在个人资料中随时撤回或重新确认研究同意。</li>
        </ul>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          {mode === 'withdraw' ? (
            <>
              <button
                type="button"
                className={styles.decline}
                disabled={submitting}
                onClick={() => onResolved?.()}
              >
                取消
              </button>
              <button
                type="button"
                className={styles.accept}
                disabled={submitting}
                onClick={() => handleChoice(false)}
              >
                确认撤回
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={styles.decline}
                disabled={submitting}
                onClick={() => handleChoice(false)}
              >
                暂不参与
              </button>
              <button
                type="button"
                className={styles.accept}
                disabled={submitting}
                onClick={() => handleChoice(true)}
              >
                同意并参与
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
