import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageBar from '../../components/ui/PageBar'
import {
  completeSession,
  getSession,
  postQuestionFollowup,
  scoreInterviewAnswer,
} from '../../api/interview'
import { getErrorMessage } from '../../api/client'
import useSpeechToText from '../../hooks/useSpeechToText'
import WeChatSpeechTip from '../../components/ui/WeChatSpeechTip'
import useAnswerSpeechCapture from '../../hooks/useAnswerSpeechCapture'
import useTTS from '../../hooks/useTTS'
import useSettingsStore from '../../stores/settingsStore'
import useSessionStore from '../../stores/sessionStore'
import { showToast } from '../../stores/toastStore'
import { trackResearchEvent } from '../../research/track'
import { computeWeightedRoundScore } from '../../utils/interviewRounds'
import { aggregateSessionScore } from '../../utils/ruleScoring'
import { computeDeliveryMetrics } from './speechMetrics'
import styles from './StructuredRoom.module.css'

function isStructuredSession(session) {
  return session?.metadata?.mode === 'structured'
}

function flattenQuestions(session) {
  const list = []
  for (const [roundIndex, round] of (session?.rounds || []).entries()) {
    for (const [questionIndex, q] of (round.questions || []).entries()) {
      list.push({ ...q, roundIndex, questionIndex })
    }
  }
  return list
}

function firstUnansweredIndex(questions) {
  return questions.findIndex((q) => !String(q.answer || '').trim())
}

export default function StructuredRoom() {
  const { id: sessionId } = useParams()
  const navigate = useNavigate()
  const refresh = useSessionStore((s) => s.refresh)

  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [qIndex, setQIndex] = useState(0)
  const [answerText, setAnswerText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [panelView, setPanelView] = useState(null)
  const [followupText, setFollowupText] = useState('')
  const [followupAnswer, setFollowupAnswer] = useState('')
  const pendingFollowupRef = useRef(null)
  const [sessionRemaining, setSessionRemaining] = useState(null)
  const [questionRemaining, setQuestionRemaining] = useState(null)
  const [started, setStarted] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled)
  const ttsRate = useSettingsStore((s) => s.ttsRate)
  const ttsVoiceURI = useSettingsStore((s) => s.ttsVoiceURI)

  const ttsMutexRef = useRef(false)
  const lastSttFailedRef = useRef(false)
  const spokenRef = useRef(-1)
  const autoEndedRef = useRef(false)

  const structured = session?.metadata?.structured || {}
  const kind = structured.kind || 'civil'
  const showAll = kind === 'civil' && structured.show_all_questions !== false

  const questions = useMemo(() => flattenQuestions(session), [session])
  const currentQ = questions[qIndex] || null

  const { speak, stop: stopTts, isSpeaking, supported: ttsSupported } = useTTS()

  const {
    resetCapture,
    beginAnswerWindow,
    onFinalSpeechChunk,
    getSpeechPayload,
    markVoiceUsed,
  } = useAnswerSpeechCapture()

  useEffect(() => {
    ttsMutexRef.current = isSpeaking
  }, [isSpeaking])

  const handleSttTranscript = useCallback((text) => {
    setAnswerText(text)
    markVoiceUsed()
  }, [markVoiceUsed])

  const handleSttFinalChunk = useCallback(
    (piece) => {
      onFinalSpeechChunk(piece, ttsMutexRef)
    },
    [onFinalSpeechChunk],
  )

  const { supported: sttSupported, listening: sttListening, toggle: toggleStt } = useSpeechToText({
    onTranscript: handleSttTranscript,
    onFinalChunk: handleSttFinalChunk,
    onError: () => {
      lastSttFailedRef.current = true
    },
  })

  const loadSession = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    setLoadError('')
    try {
      const data = await getSession(sessionId, { skipErrorToast: true })
      if (!isStructuredSession(data)) {
        navigate(`/interview/room/${sessionId}`, { replace: true })
        return
      }
      setSession(data)
      const flat = flattenQuestions(data)
      const next = firstUnansweredIndex(flat)
      setQIndex(next >= 0 ? next : 0)
      const mins = Number(data.metadata?.structured?.total_minutes) || 20
      setSessionRemaining(mins * 60)
      if (data.metadata?.structured?.kind === 'soe') {
        const pq = Number(data.metadata.structured.per_question_minutes) || 4
        setQuestionRemaining(pq * 60)
      }
    } catch (err) {
      setLoadError(getErrorMessage(err, '加载会话失败'))
    } finally {
      setLoading(false)
    }
  }, [navigate, sessionId])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  useEffect(() => {
    const tick = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => () => stopTts(), [stopTts])

  const finishSession = useCallback(
    async (sessionSnap, reason = 'completed') => {
      const rounds = sessionSnap?.rounds || []
      const userTexts = []
      for (const rnd of rounds) {
        for (const q of rnd.questions || []) {
          if (q.answer) userTexts.push(String(q.answer))
        }
      }
      const scored = aggregateSessionScore(userTexts)
      let score = computeWeightedRoundScore(rounds)
      if (scored.score_status === 'insufficient') score = null
      try {
        await completeSession(
          sessionId,
          {
            score,
            duration_minutes: Math.max(1, Math.floor(elapsed / 60)),
            dimensions: scored.dimensions,
            transcript: [],
            messages: [],
            metadata: {
              rounds,
              score_status: scored.score_status,
              structured_summary: {
                kind: structured.kind,
                reason,
              },
            },
          },
          { skipErrorToast: true },
        )
        await refresh()
        navigate(`/analytics/report/${sessionId}`)
      } catch (err) {
        showToast(getErrorMessage(err, '保存结果失败'), 'error')
      }
    },
    [elapsed, navigate, refresh, sessionId, structured.kind],
  )

  useEffect(() => {
    if (!started || sessionRemaining == null) return undefined
    if (kind !== 'civil') return undefined
    const timer = setInterval(() => {
      setSessionRemaining((prev) => {
        if (prev == null) return prev
        if (prev <= 1) {
          clearInterval(timer)
          if (!autoEndedRef.current) {
            autoEndedRef.current = true
            finishSession(session, 'time_up')
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [started, sessionRemaining, kind, session, finishSession])

  useEffect(() => {
    if (!started || questionRemaining == null || kind !== 'soe') return undefined
    const timer = setInterval(() => {
      setQuestionRemaining((prev) => {
        if (prev == null) return prev
        if (prev <= 1) {
          clearInterval(timer)
          showToast('本题作答时间到，请提交当前内容', 'info')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [started, questionRemaining, kind, qIndex])

  const speakCurrentQuestion = useCallback(() => {
    if (!currentQ?.title) return
    if (ttsEnabled && ttsSupported) {
      speak(currentQ.title, { rate: ttsRate, voiceURI: ttsVoiceURI })
    }
  }, [currentQ, speak, ttsEnabled, ttsRate, ttsSupported, ttsVoiceURI])

  useEffect(() => {
    if (!started || !currentQ || spokenRef.current === qIndex) return
    spokenRef.current = qIndex
    resetCapture()
    setAnswerText('')
    setFollowupText('')
    setFollowupAnswer('')
    setPanelView(null)
    if (kind === 'soe') {
      const pq = Number(structured.per_question_minutes) || 4
      setQuestionRemaining(pq * 60)
    }
    beginAnswerWindow()
    speakCurrentQuestion()
  }, [
    started,
    currentQ,
    qIndex,
    kind,
    structured.per_question_minutes,
    resetCapture,
    beginAnswerWindow,
    speakCurrentQuestion,
  ])

  const buildDeliveryBody = (text) => {
    const { speech, usedVoice } = getSpeechPayload()
    const delivery = computeDeliveryMetrics(text, speech, { textOnly: !usedVoice })
    return {
      speech: usedVoice ? speech : undefined,
      delivery,
      stt_failed: lastSttFailedRef.current,
    }
  }

  const handleStart = () => {
    setStarted(true)
    trackResearchEvent('structured.started', {
      session_id: sessionId,
      kind,
      phase: 'room_enter',
    })
  }

  const advanceAfterPanel = async (updatedSession) => {
    const flat = flattenQuestions(updatedSession)
    const next = firstUnansweredIndex(flat)
    if (next < 0) {
      await finishSession(updatedSession)
      return
    }
    setQIndex(next)
    setSession(updatedSession)
  }

  const handleSubmit = async () => {
    if (!currentQ || submitting) return
    setSubmitting(true)
    const trimmed = answerText.trim()
    const body = buildDeliveryBody(trimmed)
    try {
      await scoreInterviewAnswer(sessionId, {
        round_index: currentQ.roundIndex,
        question_index: currentQ.questionIndex,
        answer_text: trimmed,
        ...body,
      })
      const updated = await getSession(sessionId, { skipErrorToast: true })
      setSession(updated)
      const q = updated.rounds?.[currentQ.roundIndex]?.questions?.[currentQ.questionIndex]
      const structuredScore = q?.structured_score
      pendingFollowupRef.current = null
      const enableFollowups =
        kind === 'soe'
        && structured.enable_followups !== false
        && updated.metadata?.followup_intensity !== 'off'
      if (enableFollowups && currentQ.id && trimmed.length >= 20) {
        pendingFollowupRef.current = { questionId: currentQ.id, answer: trimmed }
      }
      if (structuredScore?.panel) {
        setPanelView(structuredScore)
        trackResearchEvent('structured.category_score', {
          session_id: sessionId,
          category: structuredScore.category,
          panel_final: structuredScore.panel_final,
          question_index: currentQ.questionIndex,
        })
      } else {
        await advanceAfterPanel(updated)
      }
    } catch (err) {
      showToast(getErrorMessage(err, '提交失败'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleFollowupSubmit = async () => {
    setFollowupText('')
    setFollowupAnswer('')
    const updated = await getSession(sessionId, { skipErrorToast: true })
    await advanceAfterPanel(updated)
  }

  const handlePanelContinue = async () => {
    setPanelView(null)
    const pending = pendingFollowupRef.current
    pendingFollowupRef.current = null
    if (pending?.questionId) {
      try {
        const fu = await postQuestionFollowup(sessionId, pending.questionId, {
          answer_text: pending.answer,
          layer: 1,
        })
        if (fu?.followup?.text) {
          setFollowupText(fu.followup.text)
          return
        }
      } catch {
        /* skip */
      }
    }
    const updated = await getSession(sessionId, { skipErrorToast: true })
    await advanceAfterPanel(updated)
  }

  const formatClock = (sec) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  if (loading) {
    return <div className={styles.loading}>正在加载结构化面试…</div>
  }

  if (loadError) {
    return (
      <div className={styles.error}>
        {loadError}
        <button type="button" onClick={loadSession}>
          重试
        </button>
      </div>
    )
  }

  if (!started) {
    return (
      <div className={styles.room}>
        <PageBar title={kind === 'civil' ? '公考结构化' : '国企银行半结构化'} />
        <p className={styles.banner}>
          本模式使用<strong>谈锋自编练习题</strong>，不提供标准答案；评分均为<strong>模拟考官</strong>，去掉最高最低后取平均。
        </p>
        {showAll && (
          <div className={styles['question-list']}>
            <div className={styles['list-title']}>本场题目清单</div>
            <ol>
              {questions.map((q, i) => (
                <li key={q.id || i}>
                  <span className={styles['cat-tag']}>{q.category_label || q.structured_category}</span>
                  {q.title}
                </li>
              ))}
            </ol>
          </div>
        )}
        <button type="button" className={styles['btn-primary']} onClick={handleStart}>
          进入考场
        </button>
      </div>
    )
  }

  if (panelView) {
    const panel = panelView.panel || {}
    return (
      <div className={styles.room}>
        <PageBar title="模拟评分" />
        <div className={styles.panel}>
          <p className={styles['panel-disclaimer']}>{panel.disclaimer}</p>
          <p className={styles['panel-score']}>
            {panelView.category_label} · 模拟得分{' '}
            <strong>{panelView.panel_final}</strong>
          </p>
          <div className={styles['raw-scores']}>
            {(panel.raw_scores || []).map((s, i) => (
              <span key={i} className={styles['score-chip']}>
                考官{i + 1}: {s}
              </span>
            ))}
          </div>
          {panel.dropped_high_low && (
            <p className={styles.hint}>
              去掉最高 {panel.dropped_high_low.high}、最低 {panel.dropped_high_low.low} 后取平均
            </p>
          )}
          <p className={styles['structure-tip']}>{panelView.structure_tip}</p>
          {!followupText && (
            <button type="button" className={styles['btn-primary']} onClick={handlePanelContinue}>
              下一题
            </button>
          )}
        </div>
      </div>
    )
  }

  if (followupText) {
    return (
      <div className={styles.room}>
        <PageBar title="半结构化追问" />
        <div className={styles.panel}>
          <p className={styles['followup-label']}>追问 1/1</p>
          <p className={styles['question-text']}>{followupText}</p>
          <textarea
            className={styles.textarea}
            value={followupAnswer}
            onChange={(e) => setFollowupAnswer(e.target.value)}
            placeholder="补充回答（可选，不计入模拟打分）"
            rows={5}
          />
          <button type="button" className={styles['btn-primary']} onClick={handleFollowupSubmit}>
            继续
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.room}>
      <PageBar title={kind === 'civil' ? '公考结构化' : '国企银行半结构化'} />

      <div className={styles['top-bar']}>
        <span>
          第 {qIndex + 1} / {questions.length} 题
          {currentQ?.category_label && (
            <span className={styles['cat-tag']}> · {currentQ.category_label}</span>
          )}
        </span>
        {kind === 'civil' && sessionRemaining != null && (
          <span className={styles.timer}>整场 {formatClock(sessionRemaining)}</span>
        )}
        {kind === 'soe' && questionRemaining != null && (
          <span className={styles.timer}>本题 {formatClock(questionRemaining)}</span>
        )}
        <button type="button" className={styles['btn-ghost']} onClick={() => navigate('/interview/structured/lobby')}>
          退出
        </button>
      </div>

      <div className={styles.layout}>
        {showAll && (
          <aside className={styles.sidebar}>
            <div className={styles['list-title']}>题目清单</div>
            <ul>
              {questions.map((q, i) => (
                <li key={q.id || i} className={i === qIndex ? styles.active : ''}>
                  {i + 1}. {q.structured_category}
                </li>
              ))}
            </ul>
          </aside>
        )}

        <div className={styles.main}>
          <div className={styles['avatar-row']}>
            <div className={styles.avatar} aria-hidden="true">
              AI
            </div>
            <span className={styles.hint}>考官语音 {ttsSupported && ttsEnabled ? '已开启' : '（文字题面）'}</span>
          </div>

          <p className={styles['question-text']}>{currentQ?.title}</p>
          {currentQ?.answer_structure && (
            <p className={styles['structure-tip']}>结构提示：{currentQ.answer_structure}</p>
          )}

          <WeChatSpeechTip />

          <textarea
            className={styles.textarea}
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            placeholder="在此作答，或使用下方语音输入"
            rows={8}
          />

          <div className={`${styles['action-row']} action-row`}>
            {sttSupported && (
              <button type="button" className={styles['btn-ghost']} onClick={toggleStt}>
                {sttListening ? '停止语音' : '语音输入'}
              </button>
            )}
            <button
              type="button"
              className={styles['btn-primary']}
              disabled={submitting}
              onClick={handleSubmit}
            >
              {submitting ? '提交中…' : '提交并模拟评分'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
