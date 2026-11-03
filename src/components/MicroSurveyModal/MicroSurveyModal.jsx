import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import useSurveyStore from '../../stores/surveyStore'
import styles from './MicroSurveyModal.module.css'

export default function MicroSurveyModal() {
  const isOpen = useSurveyStore((s) => s.isOpen)
  const items = useSurveyStore((s) => s.items)
  const submitting = useSurveyStore((s) => s.submitting)
  const submitAnswers = useSurveyStore((s) => s.submitAnswers)
  const skipAll = useSurveyStore((s) => s.skipAll)

  const [answers, setAnswers] = useState({})

  // Reset local answer state whenever items change
  useEffect(() => {
    setAnswers({})
  }, [items])

  // Support ESC key to gracefully skip
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !submitting) {
        skipAll()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, submitting, skipAll])

  if (!isOpen || !items || items.length === 0) return null

  const handleSelectOption = (itemId, option) => {
    setAnswers((prev) => ({
      ...prev,
      [itemId]: option,
    }))
  }

  const handleLikertSelect = (itemId, score) => {
    setAnswers((prev) => ({
      ...prev,
      [itemId]: score,
    }))
  }

  const handleOpenTextChange = (itemId, text) => {
    setAnswers((prev) => ({
      ...prev,
      [itemId]: text,
    }))
  }

  // Check if at least one question has an answer
  const hasAnyAnswer = items.some((item) => {
    const val = answers[item.id]
    return val !== undefined && val !== null && String(val).trim() !== ''
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!hasAnyAnswer || submitting) return
    submitAnswers(answers)
  }

  const handleSkip = (e) => {
    e.preventDefault()
    if (submitting) return
    skipAll()
  }

  return createPortal(
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="micro-survey-modal-title"
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.kicker}>
            <span className={styles.badge}>Research</span>
            <span>体验调研 · 共 {items.length} 题</span>
          </div>
          <h2 id="micro-survey-modal-title" className={styles.title}>
            微问卷 · 助力研究
          </h2>
          <p className={styles.lead}>
            仅需约 30 秒，帮助我们改进练习机制与研究质量（回答仅用于学术分析与体验改进）。
          </p>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={handleSkip}
            disabled={submitting}
            aria-label="稍后填写"
            title="稍后填写"
          >
            ×
          </button>
        </div>

        <div className={styles.body}>
          {items.map((item, index) => {
            const currentVal = answers[item.id]
            return (
              <div key={item.id} className={styles.questionCard}>
                <div className={styles.questionMeta}>
                  <span className={styles.questionIndex}>Q{index + 1}</span>
                  <span className={styles.itemId}>[{item.id}]</span>
                </div>
                <div className={styles.questionText}>{item.text}</div>

                {item.type === 'single' && (
                  <div className={styles.optionsList} role="radiogroup" aria-label={item.text}>
                    {item.options?.map((opt) => {
                      const isSelected = currentVal === opt
                      return (
                        <button
                          key={opt}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          className={`${styles.optionBtn} ${
                            isSelected ? styles.optionBtnActive : ''
                          }`}
                          onClick={() => handleSelectOption(item.id, opt)}
                          disabled={submitting}
                        >
                          <span className={styles.optionIndicator}>
                            {isSelected && <span className={styles.optionDot} />}
                          </span>
                          <span>{opt}</span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {item.type === 'likert7' && (
                  <div className={styles.likertContainer}>
                    <div className={styles.likertScale} role="radiogroup" aria-label={item.text}>
                      {[1, 2, 3, 4, 5, 6, 7].map((num) => {
                        const isSelected = currentVal === num
                        return (
                          <button
                            key={num}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            className={`${styles.likertBtn} ${
                              isSelected ? styles.likertBtnActive : ''
                            }`}
                            onClick={() => handleLikertSelect(item.id, num)}
                            disabled={submitting}
                          >
                            {num}
                          </button>
                        )
                      })}
                    </div>
                    <div className={styles.likertAnchors}>
                      <span>1 完全不同意</span>
                      <span>4 中立</span>
                      <span>7 完全同意</span>
                    </div>
                  </div>
                )}

                {item.type === 'open' && (
                  <div className={styles.openContainer}>
                    <textarea
                      className={styles.openTextarea}
                      value={currentVal || ''}
                      onChange={(e) => handleOpenTextChange(item.id, e.target.value)}
                      placeholder="请分享您的想法或具体体会…"
                      disabled={submitting}
                      rows={3}
                    />
                    <span className={styles.charCount}>
                      {(currentVal || '').length} 字
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.skipBtn}
            onClick={handleSkip}
            disabled={submitting}
          >
            稍后跳过
          </button>
          <button
            type="button"
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={submitting || !hasAnyAnswer}
          >
            {submitting ? '提交中…' : '提交回答'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
