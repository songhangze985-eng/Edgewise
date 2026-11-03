import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import styles from './AICopilot.module.css'
import { postCopilotMicroDone, postCopilotTriage } from '../../api/copilot'

const TRIAGE_SHORTCUTS = [
  { label: '说不清我做了什么', message: '项目经历里说不清自己做了什么，总说我们团队' },
  { label: '被追问就卡住', message: '面试官一追问细节我就卡壳答不上来' },
  { label: '回答没逻辑', message: '回答很啰嗦，感觉没有逻辑结构' },
  { label: '群面 / 结构化', message: '想练群面或结构化面试' },
]

/**
 * Minimal 2D flat color-plane peeking bot icon (Grok-inspired specification):
 * - 1:1 square canvas, solid dark charcoal background (#121316)
 * - No outlines/strokes, no gradients/textures, only 1-step flat tonal shading
 * - Peeking from bottom-left toward top-right, tilted 18° clockwise (left eye higher than right eye)
 * - Left & bottom edges naturally cropped by canvas frame; ample dark negative space at top-right
 * - Large round chubby face, no mouth, no nose, no eyebrows
 * - Pair of flat low-saturation coral/apricot oval cheek blushes
 * - Two solid near-black vertical capsule eyes (height ~2.8x width, stadium pill shape, no highlights)
 * - Chunky flat bangs/side-locks in 2 flat tones + minimal geometric bot ear/fin accents
 */
export function GrokBotIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="AI Copilot"
    >
      <defs>
        <clipPath id="grok-bot-canvas-clip">
          <rect x="0" y="0" width="100" height="100" rx="22" ry="22" />
        </clipPath>
      </defs>

      <g clipPath="url(#grok-bot-canvas-clip)">
        {/* Solid dark charcoal background (#121316) with generous top-right negative space */}
        <rect x="0" y="0" width="100" height="100" fill="#121316" />

        {/* Peeking character anchored at bottom-left, tilted 18° clockwise */}
        <g transform="translate(36, 68) rotate(18)">
          {/* Back hair / helmet mass (1-step darker flat shadow tone) */}
          <path
            d="M -48 36 C -52 -6, -34 -44, 2 -44 C 34 -44, 46 -14, 42 28 Z"
            fill="#B7C2D2"
          />

          {/* Minimal geometric bot ear/fin silhouettes (flat planes, no outlines) */}
          <path
            d="M -28 -36 L -36 -54 C -37 -57, -34 -59, -31 -57 L -14 -42 Z"
            fill="#B7C2D2"
          />
          <path
            d="M 16 -40 L 29 -56 C 32 -59, 36 -57, 35 -53 L 30 -32 Z"
            fill="#D9E1EC"
          />
          <rect x="33" y="-22" width="11" height="7" rx="3" fill="#B7C2D2" />

          {/* Large round chubby face — shadow plane (1-step tone difference) */}
          <ellipse cx="-2" cy="4" rx="36" ry="33" fill="#E3C7BC" />

          {/* Large round chubby face — main flat plane */}
          <ellipse cx="1" cy="2" rx="34" ry="31" fill="#F4DDD3" />

          {/* Side hair / bangs shadow layer (1-step darker flat tone) */}
          <path
            d="M -38 14 C -40 -16, -24 -38, 4 -38 C 24 -38, 37 -24, 38 -4 C 31 -12, 22 -16, 12 -14 C 4 -22, -10 -22, -18 -12 C -26 -4, -31 6, -38 14 Z"
            fill="#B7C2D2"
          />

          {/* Chunky simplified flat bangs & side locks (main flat tone, soft rounded tips) */}
          <path
            d="M -36 6 C -36 -22, -18 -40, 6 -40 C 26 -40, 38 -25, 38 -6 C 38 2, 33 5, 29 0 C 25 -8, 19 -14, 12 -14 C 8 -5, 1 -3, -4 -11 C -11 -4, -19 -4, -23 -12 C -27 -2, -33 6, -36 6 Z"
            fill="#D9E1EC"
          />

          {/* Low-saturation coral/apricot flat oval cheek blushes */}
          <ellipse cx="-16" cy="14" rx="6.5" ry="3.6" fill="#E0948E" />
          <ellipse cx="22" cy="14" rx="6.5" ry="3.6" fill="#E0948E" />

          {/* Two large vertical capsule eyes (height ~2.85x width, pure solid near-black, no highlights/eyebrows) */}
          <rect x="-11.2" y="-9" width="8.4" height="24" rx="4.2" ry="4.2" fill="#101114" />
          <rect x="7.8" y="-9" width="8.4" height="24" rx="4.2" ry="4.2" fill="#101114" />
        </g>
      </g>
    </svg>
  )
}

function microTaskGapNote(need, answer) {
  const t = answer.trim()
  if (!t) return '先写一句再继续。'
  if (need === 'ownership' && !/我/.test(t)) {
    return '这句里还没有「我」的具体动作，试着写你亲自完成的一步。'
  }
  if (need === 'structure') {
    const markers = ['背景', '任务', '行动', '结果'].filter((p) => t.includes(p))
    if (markers.length < 2) {
      return '可以按「背景 → 任务 → 行动 → 结果」再补全一两句。'
    }
  }
  if (need === 'followup' && t.length < 15) {
    return '追问回答可以再具体一点（方法、工具或数字任选其一）。'
  }
  return '可以带着这句话进入完整练习，继续展开细节。'
}

export default function AICopilot() {
  const location = useLocation()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('idle')
  const [step, setStep] = useState('intake')
  const [baseMessage, setBaseMessage] = useState('')
  const [triage, setTriage] = useState(null)
  const [microAnswer, setMicroAnswer] = useState('')
  const [gapNote, setGapNote] = useState('')
  const [carryConsent, setCarryConsent] = useState(false)
  const [errorHint, setErrorHint] = useState('')
  const sessionNoRecommendRef = useRef(false)
  const messagesEndRef = useRef(null)

  const elevatedFab = [
    '/interview/room',
    '/interview/oneway',
    '/interview/structured/',
    '/case/room',
    '/lgd/room',
    '/challenge',
    '/studio',
  ].some((prefix) => location.pathname.startsWith(prefix))
    || location.pathname.includes('/questions/')

  const resetFlow = useCallback(() => {
    setStep('intake')
    setBaseMessage('')
    setTriage(null)
    setMicroAnswer('')
    setGapNote('')
    setCarryConsent(false)
    setInput('')
    setErrorHint('')
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [step, triage, gapNote, errorHint])

  const applyTriageResult = useCallback((data, message) => {
    setTriage(data)
    setBaseMessage(message)
    if (data.clarifying_question) {
      setStep('clarify')
      setInput('')
      return
    }
    if (data.need === 'out_of_scope') {
      setStep('out_of_scope')
      return
    }
    setStep('result')
  }, [])

  const runTriage = useCallback(
    async ({ message, rejectedNeed = null, clarifyAnswer = null }) => {
      if (!message.trim() || status === 'running') return
      setStatus('running')
      setErrorHint('')
      try {
        const data = await postCopilotTriage({
          message: message.trim(),
          rejected_need: rejectedNeed || undefined,
          clarify_answer: clarifyAnswer || undefined,
        })
        applyTriageResult(data, message.trim())
      } catch (err) {
        setErrorHint(err?.response?.data?.detail || '诊断暂不可用，请稍后再试。')
      } finally {
        setStatus('idle')
      }
    },
    [status, applyTriageResult],
  )

  const handleIntakeSubmit = useCallback(
    (text) => {
      const task = (text ?? input).trim()
      if (!task) return
      setInput('')
      runTriage({ message: task })
    },
    [input, runTriage],
  )

  const handleClarifySubmit = useCallback(() => {
    const answer = input.trim()
    if (!answer || !baseMessage) return
    setInput('')
    runTriage({ message: baseMessage, clarifyAnswer: answer })
  }, [input, baseMessage, runTriage])

  const handleRejectTriage = useCallback(() => {
    if (!triage?.need || !baseMessage) return
    runTriage({ message: baseMessage, rejectedNeed: triage.need })
  }, [triage, baseMessage, runTriage])

  const handleDecline = useCallback(() => {
    sessionNoRecommendRef.current = true
    setStep('declined')
  }, [])

  const handleStartMicro = useCallback(() => {
    setStep('micro')
    setMicroAnswer('')
    setGapNote('')
  }, [])

  const handleMicroSubmit = useCallback(async () => {
    const answer = microAnswer.trim()
    if (!answer || !triage) return
    setStatus('running')
    setGapNote(microTaskGapNote(triage.need, answer))
    try {
      await postCopilotMicroDone({
        triage_id: triage.triage_id,
        need: triage.need,
        answer,
      })
      if (sessionNoRecommendRef.current) {
        setStep('declined')
      } else {
        setStep('invite')
      }
    } catch {
      setErrorHint('记录微任务失败，仍可自行前往练习入口。')
      setStep('invite')
    } finally {
      setStatus('idle')
    }
  }, [microAnswer, triage])

  const handleClose = useCallback(() => {
    setIsClosing(true)
    setTimeout(() => {
      setIsOpen(false)
      setIsClosing(false)
      sessionNoRecommendRef.current = false
      resetFlow()
    }, 280)
  }, [resetFlow])

  const handlePracticeStart = useCallback(() => {
    if (!triage?.route?.path) return
    if (carryConsent && microAnswer.trim()) {
      try {
        sessionStorage.setItem('edgewise.copilot_seed', microAnswer.trim())
      } catch {
        /* ignore */
      }
    }
    navigate(triage.route.path)
    handleClose()
  }, [triage, carryConsent, microAnswer, navigate, handleClose])

  const handleToggle = useCallback(() => {
    if (isOpen) handleClose()
    else {
      resetFlow()
      setIsOpen(true)
    }
  }, [isOpen, handleClose, resetFlow])

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (step === 'intake') handleIntakeSubmit()
        else if (step === 'clarify') handleClarifySubmit()
      }
    },
    [step, handleIntakeSubmit, handleClarifySubmit],
  )

  return (
    <>
      <button
        className={`${styles['toggle-btn']} ${!isOpen ? styles.pulse : ''} ${isOpen ? styles['toggle-active'] : ''} ${elevatedFab ? styles['toggle-elevated'] : ''}`}
        onClick={handleToggle}
        data-page-agent-ignore="true"
        type="button"
        aria-label="AI Copilot 准备诊断助手"
      >
        <div className={styles['toggle-well']}>
          <div className={styles['toggle-cap']}>
            <GrokBotIcon className={styles['toggle-icon']} />
          </div>
        </div>
      </button>

      {(isOpen || isClosing) && (
        <>
          {/* Point-to-surface expansion from bottom-right corner to full-screen edge ambient light */}
          <div
            className={`${styles['edge-glow-overlay']} ${isClosing ? styles['edge-glow-closing'] : ''}`}
            data-page-agent-ignore="true"
            aria-hidden="true"
          >
            <div className={styles['edge-glow-wave']} />
            <div className={styles['edge-glow-border']} />
          </div>

          {/* Full-screen bottom dock presentation */}
          <div
            className={`${styles.panel} ${isClosing ? styles['panel-closing'] : ''}`}
            data-page-agent-ignore="true"
            role="region"
            aria-label="AI Copilot 全屏底部诊断舱"
          >
            <div className={styles['panel-top-row']}>
              <div className={styles['panel-header']}>
                <div className={styles['header-left']}>
                  <GrokBotIcon className={styles['header-icon']} />
                  <span className={styles['header-title']}>AI Copilot · 准备诊断助手</span>
                  <span className={`${styles['status-dot']} ${styles.ready}`} />
                </div>
                <div className={styles['panel-desc']}>
                  先判断你卡在哪一步，再给一个可在底部舱内直接完成的微练习；不代替内推、代写或薪资建议。
                </div>
              </div>
              <button
                type="button"
                className={styles['close-btn']}
                onClick={handleClose}
                aria-label="关闭诊断助手"
              >
                ✕
              </button>
            </div>

            <div className={styles['bottom-dock-body']}>
              <div className={styles['messages-area']}>
                {step === 'intake' && (
                  <div className={styles['intake-horizontal']}>
                    <span className={styles['triage-lead']}>你现在最卡的是哪一步？</span>
                    <div className={styles['suggestions-bar']}>
                      {TRIAGE_SHORTCUTS.map((s) => (
                        <button
                          key={s.label}
                          type="button"
                          className={styles['suggestion-chip']}
                          onClick={() => handleIntakeSubmit(s.message)}
                          disabled={status === 'running'}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {step === 'clarify' && triage?.clarifying_question && (
                  <div className={styles['result-card']}>
                    <p className={styles['result-judgment']}>{triage.clarifying_question}</p>
                    <p className={styles['result-meta']}>只问这一题，便于分流到合适的微任务。</p>
                  </div>
                )}

                {step === 'result' && triage && (
                  <div className={styles['result-card']}>
                    <p className={styles['result-judgment']}>{triage.judgment}</p>
                    {triage.micro_task?.prompt && (
                      <p className={styles['micro-prompt']}>{triage.micro_task.prompt}</p>
                    )}
                    <div className={styles['result-actions']}>
                      {triage.micro_task && (
                        <button
                          type="button"
                          className={styles['primary-btn']}
                          onClick={handleStartMicro}
                          disabled={status === 'running'}
                        >
                          开始微练习
                        </button>
                      )}
                      {triage.route && !sessionNoRecommendRef.current && (
                        <button
                          type="button"
                          className={styles['ghost-btn']}
                          onClick={() => navigate(triage.route.path)}
                        >
                          {triage.route.label}
                        </button>
                      )}
                      <button type="button" className={styles['ghost-btn']} onClick={handleRejectTriage}>
                        不是这个
                      </button>
                      <button type="button" className={styles['ghost-btn']} onClick={handleDecline}>
                        不需要
                      </button>
                    </div>
                  </div>
                )}

                {step === 'out_of_scope' && triage && (
                  <div className={styles['result-card']}>
                    <p className={styles['result-judgment']}>{triage.judgment}</p>
                    {triage.limitation && (
                      <p className={styles['limitation-text']}>{triage.limitation}</p>
                    )}
                    <div className={styles['result-actions']}>
                      {triage.route && (
                        <button
                          type="button"
                          className={styles['ghost-btn']}
                          onClick={() => navigate(triage.route.path)}
                        >
                          {triage.route.label}
                        </button>
                      )}
                      <button type="button" className={styles['ghost-btn']} onClick={handleDecline}>
                        关闭
                      </button>
                    </div>
                  </div>
                )}

                {step === 'micro' && triage?.micro_task && (
                  <div className={styles['result-card']}>
                    <p className={styles['micro-prompt']}>{triage.micro_task.prompt}</p>
                    <div className={styles['micro-row']}>
                      <textarea
                        className={styles['micro-textarea']}
                        value={microAnswer}
                        onChange={(e) => setMicroAnswer(e.target.value)}
                        placeholder={triage.micro_task.placeholder || '在这里回答…'}
                        rows={2}
                        disabled={status === 'running'}
                      />
                      <button
                        type="button"
                        className={styles['primary-btn']}
                        onClick={handleMicroSubmit}
                        disabled={!microAnswer.trim() || status === 'running'}
                      >
                        完成微任务
                      </button>
                    </div>
                  </div>
                )}

                {step === 'invite' && triage && (
                  <div className={styles['result-card']}>
                    {gapNote && <p className={styles['gap-note']}>{gapNote}</p>}
                    {triage.route && (
                      <div className={styles['invite-actions-row']}>
                        <label className={styles['consent-row']}>
                          <input
                            type="checkbox"
                            checked={carryConsent}
                            onChange={(e) => setCarryConsent(e.target.checked)}
                          />
                          <span>同意将上面的回答暂存在本机，进入练习时便于你对照展开（不会自动上传）。</span>
                        </label>
                        <button
                          type="button"
                          className={styles['primary-btn']}
                          onClick={handlePracticeStart}
                        >
                          {triage.route.label}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {step === 'declined' && (
                  <p className={styles['declined-hint']}>好的，本次不再推荐练习。需要时重新打开助手即可。</p>
                )}

                {errorHint && <p className={styles['error-hint']}>{errorHint}</p>}
                {status === 'running' && (
                  <div className={styles['running-indicator']}>
                    <div className={styles['running-dots']}>
                      <span /><span /><span />
                    </div>
                    <span>正在诊断…</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {(step === 'intake' || step === 'clarify') && (
                <div className={styles['input-area']}>
                  <input
                    className={styles['input-field']}
                    type="text"
                    placeholder={step === 'clarify' ? '补充一句即可…' : '用一句话描述你的困难（回车发送）…'}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={status === 'running'}
                  />
                  <button
                    type="button"
                    className={styles['send-btn']}
                    onClick={step === 'clarify' ? handleClarifySubmit : () => handleIntakeSubmit()}
                    disabled={!input.trim() || status === 'running'}
                  >
                    发送 ▶
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}

