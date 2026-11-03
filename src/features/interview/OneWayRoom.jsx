import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageBar from '../../components/ui/PageBar'
import {
  completeSession,
  getSession,
  patchSessionMetadata,
  scoreInterviewAnswer,
} from '../../api/interview'
import { getErrorMessage } from '../../api/client'
import useSpeechToText from '../../hooks/useSpeechToText'
import WeChatSpeechTip from '../../components/ui/WeChatSpeechTip'
import useAnswerSpeechCapture from '../../hooks/useAnswerSpeechCapture'
import usePresence from '../../hooks/usePresence'
import useTTS from '../../hooks/useTTS'
import useLocalRecorder from './useLocalRecorder'
import {
  aggregateDeliverySummary,
  computeDeliveryMetrics,
} from './speechMetrics'
import { aggregatePresenceSummary } from './presenceMetrics'
import useSettingsStore from '../../stores/settingsStore'
import useSessionStore from '../../stores/sessionStore'
import { showToast } from '../../stores/toastStore'
import { trackResearchEvent } from '../../research/track'
import {
  averageLogicalityFromRounds,
  computeWeightedRoundScore,
} from '../../utils/interviewRounds'
import { aggregateSessionScore } from '../../utils/ruleScoring'
import styles from './OneWayRoom.module.css'

const PRACTICE_QUESTION =
  '【练习题 · 不计分】请用约一分钟介绍你自己，熟悉准备倒计时与录制流程。'

function isOneWaySession(session) {
  const meta = session?.metadata || {}
  return meta.mode === 'one_way' || meta.interview_mode === 'one_way'
}

function flattenQuestions(session) {
  const rounds = session?.rounds || []
  const list = []
  rounds.forEach((round, roundIndex) => {
    ;(round.questions || []).forEach((q, questionIndex) => {
      list.push({
        ...q,
        roundIndex,
        questionIndex,
        title: q.title || '',
      })
    })
  })
  return list
}

function firstUnansweredIndex(questions) {
  return questions.findIndex((q) => !String(q.answer || '').trim())
}

function transcriptFromSession(sessionSnap) {
  const lines = []
  for (const rnd of sessionSnap?.rounds || []) {
    for (const q of rnd.questions || []) {
      if (q.title) lines.push({ role: 'interviewer', text: q.title })
      const ans = String(q.answer || '').trim()
      if (ans) lines.push({ role: 'user', text: ans })
    }
  }
  return lines
}

export default function OneWayRoom() {
  const { id: sessionId } = useParams()
  const navigate = useNavigate()
  const refresh = useSessionStore((s) => s.refresh)

  const [session, setSession] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)

  const [formalStarted, setFormalStarted] = useState(false)
  const [phase, setPhase] = useState('idle')
  const [isPractice, setIsPractice] = useState(true)
  const [formalQIndex, setFormalQIndex] = useState(0)
  const [countdown, setCountdown] = useState(0)
  const [takeNo, setTakeNo] = useState(1)
  const [answerText, setAnswerText] = useState('')
  const [playbackUrl, setPlaybackUrl] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [textOnly, setTextOnly] = useState(false)

  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled)
  const ttsRate = useSettingsStore((s) => s.ttsRate)
  const ttsVoiceURI = useSettingsStore((s) => s.ttsVoiceURI)
  const presenceAnalysisEnabled = useSettingsStore((s) => s.presenceAnalysisEnabled)

  const ttsMutexRef = useRef(false)
  const lastSttFailedRef = useRef(false)
  const cameraTrackedRef = useRef(false)
  const transcriptRef = useRef([])
  const spokenFormalRef = useRef(-1)

  const oneWayConfig = session?.metadata?.one_way || {}
  const prepSec = Number(oneWayConfig.prep_sec ?? 30)
  const answerSec = Number(oneWayConfig.answer_sec ?? 120)
  const maxRetakes = oneWayConfig.max_retakes

  const formalQuestions = useMemo(() => flattenQuestions(session), [session])
  const currentFormalQ = formalQuestions[formalQIndex] || null
  const activeQuestionText = isPractice
    ? PRACTICE_QUESTION
    : currentFormalQ?.title || ''

  const retakesUsed = takeNo - 1
  const canRetake =
    maxRetakes == null
    || (typeof maxRetakes === 'number' && retakesUsed < maxRetakes)

  const { speak, stop: stopTts, isSpeaking, supported: ttsSupported } = useTTS()

  const {
    resetCapture,
    beginAnswerWindow,
    markVoiceUsed,
    onFinalSpeechChunk,
    getSpeechPayload,
  } = useAnswerSpeechCapture()

  const handleCameraStatus = useCallback(
    (status) => {
      if (cameraTrackedRef.current) return
      cameraTrackedRef.current = true
      trackResearchEvent('oneway.camera', {
        session_id: sessionId,
        status,
      })
    },
    [sessionId],
  )

  const {
    videoRef,
    cameraMode,
    recording,
    ensureMedia,
    startRecording,
    stopRecording,
    clearAll,
    hasLocalVideo,
  } = useLocalRecorder({ onCameraStatus: handleCameraStatus })

  const presenceActive =
    presenceAnalysisEnabled
    && !textOnly
    && hasLocalVideo
    && (phase === 'answer' || phase === 'practice_answer')

  const {
    liveHint: presenceLiveHint,
    resetCapture: resetPresenceCapture,
    getPresencePayload,
    status: presenceStatus,
  } = usePresence({
    videoRef,
    enabled: presenceAnalysisEnabled && hasLocalVideo && !textOnly,
    active: presenceActive,
    sessionId,
  })

  useEffect(() => {
    ttsMutexRef.current = isSpeaking
  }, [isSpeaking])

  const handleSttTranscript = useCallback((text) => {
    setAnswerText(text)
  }, [])

  const handleSttFinalChunk = useCallback(
    (piece) => {
      onFinalSpeechChunk(piece, ttsMutexRef)
    },
    [onFinalSpeechChunk],
  )

  const {
    supported: sttSupported,
    listening: sttListening,
    start: startStt,
    stop: stopStt,
  } = useSpeechToText({
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
      if (!isOneWaySession(data)) {
        navigate(`/interview/room/${sessionId}`, { replace: true })
        return
      }
      setSession(data)
      const started = Boolean(data.metadata?.one_way_formal_started)
      setFormalStarted(started)
      setIsPractice(!started)
      const flat = flattenQuestions(data)
      const nextIdx = firstUnansweredIndex(flat)
      setFormalQIndex(nextIdx >= 0 ? nextIdx : flat.length)
      if (started && nextIdx < 0 && flat.length) {
        setPhase('complete')
      } else if (started) {
        setPhase('question')
      } else {
        setPhase('practice')
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

  useEffect(() => () => {
    stopTts()
    stopStt()
    clearAll()
  }, [clearAll, stopStt, stopTts])

  const wrapTtsOpts = useCallback(
    (opts = {}) => ({
      rate: ttsRate,
      voiceURI: ttsVoiceURI,
      pitch: 1,
      ...opts,
      onend: () => {
        opts.onend?.()
        setPhase((p) => (String(p).startsWith('practice') ? 'practice_prep' : 'prep'))
        setCountdown(prepSec)
      },
    }),
    [prepSec, ttsRate, ttsVoiceURI],
  )

  const speakQuestion = useCallback(() => {
    if (!activeQuestionText) return
    setPhase(isPractice ? 'practice_tts' : 'question')
    if (ttsEnabled && ttsSupported) {
      speak(activeQuestionText, wrapTtsOpts())
    } else {
      setPhase(isPractice ? 'practice_prep' : 'prep')
      setCountdown(prepSec)
    }
  }, [activeQuestionText, isPractice, prepSec, speak, ttsEnabled, ttsSupported, wrapTtsOpts])

  useEffect(() => {
    if (loading || loadError) return
    if (phase === 'practice' && isPractice) {
      speakQuestion()
    }
  }, [isPractice, loadError, loading, phase, speakQuestion])

  useEffect(() => {
    if (loading || loadError || isPractice) return
    if (phase !== 'question' || !currentFormalQ) return
    if (spokenFormalRef.current === formalQIndex) return
    spokenFormalRef.current = formalQIndex
    speakQuestion()
  }, [
    currentFormalQ,
    formalQIndex,
    isPractice,
    loadError,
    loading,
    phase,
    speakQuestion,
  ])

  useEffect(() => {
    if (phase !== 'prep' && phase !== 'practice_prep') return undefined
    if (countdown <= 0) {
      setPhase(phase === 'practice_prep' ? 'practice_answer' : 'answer')
      return undefined
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown, phase])

  const finishAnswerWindow = useCallback(async () => {
    stopStt()
    stopTts()
    const url = textOnly ? null : await stopRecording()
    setPlaybackUrl(url)
    setPhase(isPractice ? 'practice_review' : 'review')
  }, [isPractice, stopRecording, stopStt, stopTts, textOnly])

  const beginAnswerPhase = useCallback(async () => {
    resetCapture()
    resetPresenceCapture()
    setAnswerText('')
    setPlaybackUrl(null)
    lastSttFailedRef.current = false
    beginAnswerWindow()
    setCountdown(answerSec)

    const stream = await ensureMedia()
    if (!stream) {
      setTextOnly(true)
      if (sttSupported) {
        markVoiceUsed()
        startStt()
      }
      return
    }
    setTextOnly(false)
    markVoiceUsed()
    const started = await startRecording()
    if (!started) {
      setTextOnly(true)
      if (sttSupported) startStt()
      return
    }
    if (sttSupported) startStt()
  }, [
    answerSec,
    beginAnswerWindow,
    ensureMedia,
    markVoiceUsed,
    resetCapture,
    resetPresenceCapture,
    startRecording,
    startStt,
    sttSupported,
  ])

  useEffect(() => {
    if (phase !== 'answer' && phase !== 'practice_answer') return
    beginAnswerPhase()
  }, [beginAnswerPhase, phase])

  useEffect(() => {
    if (phase !== 'answer' && phase !== 'practice_answer') return undefined
    if (countdown <= 0) {
      void finishAnswerWindow()
      return undefined
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown, finishAnswerWindow, phase])

  const resetTake = () => {
    setTakeNo(1)
    setAnswerText('')
    setPlaybackUrl(null)
    resetCapture()
    speakQuestion()
  }

  const handleRetake = () => {
    if (!canRetake) return
    trackResearchEvent('oneway.retake', {
      session_id: sessionId,
      question_index: formalQIndex,
      take_no: takeNo + 1,
    })
    setTakeNo((n) => n + 1)
    setPhase('prep')
    setCountdown(prepSec)
  }

  const buildDeliveryBody = (text) => {
    const { speech, usedVoice } = getSpeechPayload()
    const textOnlyAnswer = textOnly || !usedVoice
    const delivery = computeDeliveryMetrics(text, speech, { textOnly: textOnlyAnswer })
    const presence = presenceAnalysisEnabled ? getPresencePayload() : null
    return {
      speech: usedVoice ? speech : undefined,
      delivery,
      presence: presence || undefined,
      stt_failed: lastSttFailedRef.current,
    }
  }

  const handleStartFormal = async () => {
    setIsPractice(false)
    setFormalStarted(true)
    setTakeNo(1)
    spokenFormalRef.current = -1
    trackResearchEvent('oneway.started', {
      session_id: sessionId,
      prep_sec: prepSec,
      answer_sec: answerSec,
      max_retakes: maxRetakes,
      question_count: formalQuestions.length,
    })
    try {
      await patchSessionMetadata(sessionId, { one_way_formal_started: true })
    } catch {
      /* continue locally */
    }
    setPhase('question')
  }

  const handleSubmitFormal = async () => {
    if (!currentFormalQ || submitting) return
    setSubmitting(true)
    const trimmed = answerText.trim()
    const body = buildDeliveryBody(trimmed)
    try {
      await scoreInterviewAnswer(sessionId, {
        round_index: currentFormalQ.roundIndex,
        question_index: currentFormalQ.questionIndex,
        answer_text: trimmed,
        stt_failed: body.stt_failed,
        speech: body.speech,
        delivery: body.delivery,
        presence: body.presence,
        take_no: takeNo,
        takes_used: takeNo,
      })
      transcriptRef.current = [
        ...transcriptRef.current,
        { role: 'interviewer', text: currentFormalQ.title },
        { role: 'user', text: trimmed || '（未识别到有效作答）' },
      ]
      const updated = await getSession(sessionId, { skipErrorToast: true })
      setSession(updated)
      const flat = flattenQuestions(updated)
      const nextIdx = firstUnansweredIndex(flat)
      if (nextIdx < 0) {
        await finishSession(updated)
        return
      }
      setFormalQIndex(nextIdx)
      setTakeNo(1)
      spokenFormalRef.current = -1
      setPhase('question')
    } catch (err) {
      showToast(getErrorMessage(err, '提交失败，请重试'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const finishSession = async (sessionSnap) => {
    setPhase('complete')
    const rounds = sessionSnap?.rounds || []
    const logicality = averageLogicalityFromRounds(rounds)
    const transcript =
      transcriptRef.current.length > 0 ? transcriptRef.current : transcriptFromSession(sessionSnap)
    const userTexts = transcript.filter((m) => m.role === 'user').map((m) => m.text)
    const scored = aggregateSessionScore(userTexts)
    let score = computeWeightedRoundScore(rounds)
    if (scored.score_status === 'insufficient') score = null
    const dimensions = {
      ...scored.dimensions,
      logicality,
      logic: scored.dimensions.logic ?? logicality,
    }
    const durationMinutes = Math.max(1, Math.floor(elapsed / 60))
    try {
      await completeSession(
        sessionId,
        {
          score,
          duration_minutes: durationMinutes,
          dimensions,
          transcript,
          messages: transcript,
          metadata: {
            rounds,
            delivery_summary: aggregateDeliverySummary(rounds),
            presence_summary: aggregatePresenceSummary(rounds),
            score_status: scored.score_status,
          },
        },
        { skipErrorToast: true },
      )
      await refresh()
      trackResearchEvent('oneway.completed', {
        session_id: sessionId,
        question_count: formalQuestions.length,
      })
      showToast('单向面试已完成', 'success')
      navigate(`/analytics/report/${sessionId}`)
    } catch (err) {
      showToast(getErrorMessage(err, '保存结果失败'), 'error')
    }
  }

  const handleExit = () => {
    stopTts()
    stopStt()
    clearAll()
    navigate('/interview/lobby')
  }

  if (loading) {
    return <div className={styles.loading}>正在加载单向面试…</div>
  }

  if (loadError) {
    return (
      <div className={styles.error}>
        {loadError}
        <div>
          <button type="button" className={styles['btn-secondary']} onClick={loadSession}>
            重试
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'complete') {
    return (
      <div className={styles.loading}>
        正在生成报告…
      </div>
    )
  }

  const timerUrgent =
    (phase === 'answer' || phase === 'practice_answer') && countdown <= 10 && countdown > 0

  const showReview = phase === 'review' || phase === 'practice_review'
  const inCountdown =
    phase === 'prep'
    || phase === 'practice_prep'
    || phase === 'answer'
    || phase === 'practice_answer'

  return (
    <div className={styles.room}>
      <PageBar title="AI 初面模拟（单向）" />

      <p className={styles.banner}>
        录像只保存在你的浏览器里，不会上传到服务器。正式题提交后无法返回上一题。
      </p>

      <div className={styles['top-bar']}>
        <span className={styles['phase-label']}>
          {isPractice ? '练习题' : `正式题 ${formalQIndex + 1} / ${formalQuestions.length}`}
        </span>
        {!isPractice && formalStarted && (
          <span className={styles.progress}>
            准备 {prepSec}s · 作答 {answerSec}s
            {maxRetakes == null ? ' · 无限重录' : ` · 重录 ${maxRetakes} 次`}
          </span>
        )}
        <button type="button" className={styles['btn-danger']} onClick={handleExit}>
          退出
        </button>
      </div>

      <div className={styles.layout}>
        <div className={styles.panel}>
          <p className={styles['question-text']}>{activeQuestionText}</p>
          <WeChatSpeechTip />
          {textOnly && (
            <p className={styles.hint}>
              真实 AI 面试通常要求开启摄像头和麦克风；当前为文字作答模式。
            </p>
          )}
          {cameraMode === 'off' && !textOnly && (
            <p className={styles.hint}>摄像头未开启，已降级为仅麦克风录制。</p>
          )}
          {inCountdown && (
            <div className={`${styles.timer} ${timerUrgent ? styles['timer-urgent'] : ''}`}>
              {phase === 'prep' || phase === 'practice_prep' ? '准备' : '作答'}{' '}
              {countdown}s
            </div>
          )}
          {showReview && (
            <>
              {textOnly ? (
                <textarea
                  className={styles.transcript}
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  placeholder="请输入你的回答…"
                />
              ) : (
                <div className={styles['transcript-readonly']}>
                  {answerText.trim() || '（未识别到语音，可重录或在文字模式下补充）'}
                </div>
              )}
              {playbackUrl && (
                <video className={styles.playback} src={playbackUrl} controls playsInline />
              )}
            </>
          )}
        </div>

        <div className={styles.panel}>
          <div className={styles['video-wrap']}>
            {hasLocalVideo ? (
              <video ref={videoRef} className={styles.video} muted playsInline autoPlay />
            ) : (
              <div className={styles['video-placeholder']}>
                {textOnly ? '文字作答模式' : '摄像头预览'}
              </div>
            )}
            {recording && (
              <span className={styles['rec-badge']}>
                <span className={styles['rec-dot']} />
                REC
              </span>
            )}
          </div>
          {sttListening && !showReview && (
            <p className={styles.hint}>正在听写你的回答…</p>
          )}
          {presenceAnalysisEnabled && hasLocalVideo && !textOnly && (
            <p className={styles.hint}>
              {presenceStatus === 'loading'
                ? '镜头仪态：正在加载本地分析模型…'
                : presenceStatus === 'simplified'
                  ? '镜头仪态：简化版本地采样（未上传视频）'
                  : presenceStatus === 'skipped'
                    ? '镜头仪态：已跳过（加载或性能原因）'
                    : presenceLiveHint || '镜头仪态：本地分析中，不上传录像'}
            </p>
          )}
        </div>
      </div>

      <div className={styles.actions}>
        {phase === 'practice_review' && (
          <>
            <button type="button" className={styles['btn-secondary']} onClick={resetTake}>
              再练一次
            </button>
            <button type="button" className={styles['btn-primary']} onClick={handleStartFormal}>
              进入正式面试
            </button>
          </>
        )}
        {phase === 'review' && (
          <>
            {canRetake && (
              <button
                type="button"
                className={styles['btn-secondary']}
                onClick={handleRetake}
                disabled={submitting}
              >
                重录（已用 {retakesUsed}{maxRetakes != null ? ` / ${maxRetakes}` : ''}）
              </button>
            )}
            <button
              type="button"
              className={styles['btn-primary']}
              onClick={handleSubmitFormal}
              disabled={submitting}
            >
              {submitting ? '提交中…' : '提交本题'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
