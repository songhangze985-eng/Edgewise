import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import useSessionStore from '../../stores/sessionStore'
import {
  getSession,
  completeSession,
  patchSessionMetadata,
  postQuestionAttempt,
  postQuestionFollowup,
  scoreInterviewAnswer,
  postNegotiationTurn,
  submitReverseQa,
} from '../../api/interview'
import { listQuestions } from '../../api/questions'
import { getErrorMessage } from '../../api/client'
import { showToast } from '../../stores/toastStore'
import useSpeechToText from '../../hooks/useSpeechToText'
import WeChatSpeechTip from '../../components/ui/WeChatSpeechTip'
import useAnswerSpeechCapture from '../../hooks/useAnswerSpeechCapture'
import useTTS from '../../hooks/useTTS'
import { aggregateDeliverySummary, computeDeliveryMetrics, computeCpm } from './speechMetrics'
import useSettingsStore from '../../stores/settingsStore'
import useAuthStore from '../../stores/authStore'
import { useArmPolicy } from '../../config/experiment'
import { getArmForcedTtsEnabled } from '../../config/tts'
import DemoPanel from '../../components/RevisionPanel/DemoPanel'
import RevisionPanel from '../../components/RevisionPanel/RevisionPanel'
import { trackResearchEvent } from '../../research/track'
import { pickInterviewQuestions } from '../../utils/interviewQuestions'
import { aggregateSessionScore } from '../../utils/ruleScoring'
import {
  averageLogicalityFromRounds,
  computeWeightedRoundScore,
} from '../../utils/interviewRounds'
import ResearchFollowupCard from '../../components/ResearchFollowupCard/ResearchFollowupCard'
import InterviewerCaptions from '../../components/a11y/InterviewerCaptions'
import KeyboardShortcutsHelp from '../../components/a11y/KeyboardShortcutsHelp'
import StorySidePeek from '../stories/StorySidePeek'
import { useCountdownAnnouncer } from '../../hooks/useCountdownAnnouncer'
import { useRoomKeyboardShortcuts } from '../../hooks/useRoomKeyboardShortcuts'
import { useEffectiveReduceMotion } from '../../hooks/useEffectiveReduceMotion'
import {
  isEnglishInterviewLang,
  normalizeInterviewLang,
  shouldWarnEnglishStt,
} from '../../utils/interviewLang'
import styles from './InterviewRoom.module.css'

const mockQuestions = [
  '请简单做一下自我介绍。',
  '你认为自己最大的优势是什么？能给我举一个具体的例子吗？',
  '请描述一个你在团队中解决冲突的经历。',
  '你如何看待加班？如果项目紧急需要连续加班，你会如何应对？',
  '你对我们公司有什么了解？为什么选择应聘这个岗位？',
]

const mockQuestionsEn = [
  'Tell me about yourself.',
  'What do you consider your greatest strength? Can you give a concrete example?',
  'Describe a time you resolved a conflict on your team.',
  'How do you handle overtime or crunch time when a project is urgent?',
  'What do you know about our company, and why this role?',
]

const englishMockMessages = [
  { role: 'system', text: 'Interview started. Please get ready.' },
  {
    role: 'interviewer',
    text: 'Hello, welcome to today’s interview. Take a moment to relax — let me know when you’re ready to begin.',
  },
]

const DIFFICULTY_MAP = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
}

const HARD_ANSWER_SECONDS = 120
/** 高压模式 120s 作答计时是否在 TTS 朗读结束后才开始 */
const HARD_TIMER_STARTS_AFTER_TTS = true

const mockMessages = [
  { role: 'system', text: '面试开始，请做好准备。' },
  { role: 'interviewer', text: '你好，欢迎参加今天的面试。在开始之前，请先放松一下。准备好了我们就开始吧。' },
]

const DEMO_WATCH_SECONDS = 180
const DEMO_SCRIPT = [
  { role: 'system', text: '示范观看模式：请观看以下示例过程（时长与主动练习相当，无需作答）。' },
  { role: 'interviewer', text: '示例问题：请介绍一个你主导的项目，并说明关键成果。' },
  { role: 'user', text: '（示范）我曾在上一段实习中负责校园活动报名系统改版…' },
  { role: 'interviewer', text: '你提到转化率提升，具体采取了哪些行动？' },
  { role: 'user', text: '（示范）我们重新梳理了报名漏斗，并 A/B 测试了落地页文案…' },
  { role: 'system', text: '示范观看结束。本次不计入合格激活指标。' },
]

function followupIntensityOff(sessionMeta) {
  const raw = sessionMeta?.metadata?.followup_intensity
  return raw === 'off' || raw === 0 || raw === '0'
}

function followupDisplayMax(sessionMeta, armPolicy) {
  const raw = sessionMeta?.metadata?.followup_intensity
  if (raw === 'off' || raw === 0 || raw === '0') return 0
  if (raw === 1 || raw === '1') return 1
  if (raw === 3 || raw === '3') return 3
  if (sessionMeta?.difficulty === 'hard') return 3
  return armPolicy.followupMaxLayers?.() ?? 3
}

function formatFollowupMessage(layer, maxLayers, text) {
  return `【追问 ${layer}/${maxLayers}】${text}`
}

function isHighPressureDifficulty(sessionMeta) {
  const raw = sessionMeta?.difficulty ?? sessionMeta?.metadata?.difficulty
  if (!raw) return false
  const normalized = String(raw).toLowerCase()
  return (
    normalized === 'hard'
    || raw === '困难'
    || raw === '高压'
    || normalized === '高压'
  )
}

export default function InterviewRoom() {
  const navigate = useNavigate()
  const { id: sessionId } = useParams()
  const refresh = useSessionStore((s) => s.refresh)
  const [sessionMeta, setSessionMeta] = useState(null)
  const [questions, setQuestions] = useState([])
  const [questionsLoading, setQuestionsLoading] = useState(true)
  const [messages, setMessages] = useState(mockMessages)
  const [input, setInput] = useState('')
  const [currentQ, setCurrentQ] = useState(0)
  const [isThinking, setIsThinking] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [answerRemaining, setAnswerRemaining] = useState(HARD_ANSWER_SECONDS)
  const [showExit, setShowExit] = useState(false)
  const [finished, setFinished] = useState(false)
  const [showResearchFollowup, setShowResearchFollowup] = useState(false)
  const [questionFilterNotice, setQuestionFilterNotice] = useState('')
  const [sessionRounds, setSessionRounds] = useState(null)
  const [roundIndex, setRoundIndex] = useState(0)
  const [qInRound, setQInRound] = useState(0)
  const [showRoundTransition, setShowRoundTransition] = useState(false)
  const [showReverseQa, setShowReverseQa] = useState(false)
  const [reverseQaDrafts, setReverseQaDrafts] = useState(['', '', ''])
  const [negotiationDone, setNegotiationDone] = useState(false)
  const [negotiationBusy, setNegotiationBusy] = useState(false)
  const pendingAfterReverseQaRef = useRef(null)
  const negotiationIntroRef = useRef('')
  const sessionRoundsRef = useRef(null)
  const [demoMode, setDemoMode] = useState(false)
  const [demoRemaining, setDemoRemaining] = useState(DEMO_WATCH_SECONDS)
  const demoFinishedRef = useRef(false)
  const messagesRef = useRef(mockMessages)
  const messagesEndRef = useRef(null)
  const timerRef = useRef(null)
  const inputRef = useRef('')
  const advanceLockRef = useRef(false)
  const advanceInterviewRef = useRef(() => {})
  const [isComposing, setIsComposing] = useState(false)
  const [ellipsisDots, setEllipsisDots] = useState('·')
  const [isShaking, setIsShaking] = useState(false)
  const skipShakeOnMountRef = useRef(true)
  const wasInGreetingRef = useRef(true)
  const [interviewStarted, setInterviewStarted] = useState(false)
  const [answerTimerReady, setAnswerTimerReady] = useState(!HARD_TIMER_STARTS_AFTER_TTS)
  const lastSpokenQRef = useRef(-1)
  const sttListeningRef = useRef(false)
  const sttResumeRef = useRef(false)
  const ttsMutexRef = useRef(false)
  const liveHintShownRef = useRef(false)
  const listeningSinceRef = useRef(null)
  const [liveHint, setLiveHint] = useState('')

  const ttsEnabledSetting = useSettingsStore((s) => s.ttsEnabled)
  const deliveryLiveHintEnabled = useSettingsStore((s) => s.deliveryLiveHintEnabled)
  const ttsRate = useSettingsStore((s) => s.ttsRate)
  const ttsVoiceURI = useSettingsStore((s) => s.ttsVoiceURI)
  const setTtsEnabled = useSettingsStore((s) => s.setTtsEnabled)
  const captionsEnabled = useSettingsStore((s) => s.captionsEnabled)
  const keyboardShortcutsEnabled = useSettingsStore((s) => s.keyboardShortcutsEnabled)
  const reduceMotion = useEffectiveReduceMotion()
  const [captionSentenceIndex, setCaptionSentenceIndex] = useState(0)
  const [spokenCaptionText, setSpokenCaptionText] = useState('')
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false)
  const [storyPeekOpen, setStoryPeekOpen] = useState(false)
  const storySidePeekEnabled = useSettingsStore((s) => s.storySidePeekEnabled)
  const experimentAssignment = useAuthStore((s) => s.user?.experimentAssignment)
  const armPolicy = useArmPolicy(experimentAssignment)
  const armForcedTts = getArmForcedTtsEnabled(experimentAssignment)
  const [revisionGate, setRevisionGate] = useState(null)
  const [followupGate, setFollowupGate] = useState(null)
  const followupGateRef = useRef(null)
  const pendingAdvanceRef = useRef(null)
  const lastSttFailedRef = useRef(false)
  const effectiveTtsEnabled = armForcedTts ?? ttsEnabledSetting

  const interviewLang = useMemo(
    () => normalizeInterviewLang(sessionMeta?.metadata?.lang),
    [sessionMeta?.metadata?.lang],
  )
  const englishInterview = isEnglishInterviewLang(interviewLang)
  const englishSttWarn = shouldWarnEnglishStt(interviewLang)

  const { speak, stop: stopTts, isSpeaking, supported: ttsSupported } = useTTS()

  const {
    resetCapture,
    beginAnswerWindow,
    markVoiceUsed,
    onFinalSpeechChunk,
    getSpeechPayload,
  } = useAnswerSpeechCapture()

  useEffect(() => {
    ttsMutexRef.current = isSpeaking
  }, [isSpeaking])

  useEffect(() => {
    inputRef.current = input
  }, [input])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    followupGateRef.current = followupGate
  }, [followupGate])

  const multiRound = Boolean(sessionRounds?.length)
  const currentRound = multiRound ? sessionRounds[roundIndex] : null
  const roundType = currentRound?.type || 'standard'
  const isNegotiationRound = multiRound && roundType === 'negotiation'
  const isHrRound = multiRound && roundType === 'hr'
  const currentHrQuestion = isHrRound ? currentRound?.questions?.[qIndex] : null
  const roundQuestions = multiRound
    ? (currentRound?.questions || []).map((q) => q.title)
    : (questions.length ? questions : englishInterview ? mockQuestionsEn : mockQuestions)
  const activeQuestions = roundQuestions
  const negotiationBlock = currentRound?.negotiation
  const currentOffer =
    negotiationBlock?.final_offer ?? negotiationBlock?.initial_offer ?? null
  const totalRounds = sessionRounds?.length || 1
  const questionsInRound = multiRound ? (currentRound?.questions?.length || 0) : activeQuestions.length
  const qIndex = multiRound ? qInRound : currentQ
  const setQIndex = multiRound ? setQInRound : setCurrentQ
  const inGreetingPhase = !demoMode && !finished && !interviewStarted
  const highPressure = isHighPressureDifficulty(sessionMeta)
  const pressureActive = highPressure && !demoMode && !finished && !questionsLoading
  const answerCritical = pressureActive && answerRemaining <= 10 && answerRemaining > 0
  const answerUrgent = pressureActive && answerRemaining <= 3 && answerRemaining > 0
  const assignedExperimentTask =
    sessionMeta?.metadata?.source === 'experiment_assigned_practice'
    || sessionMeta?.metadata?.research_session_source === 'experiment_assigned_practice'
  const storyPeekAllowed =
    storySidePeekEnabled
    && !demoMode
    && !finished
    && !assignedExperimentTask
    && !isNegotiationRound
    && !isHrRound
    && roundType !== 'case'
    && roundType !== 'system_design'

  useEffect(() => {
    if (!storyPeekAllowed) setStoryPeekOpen(false)
  }, [storyPeekAllowed])

  const answerCountdownAnnounce = useCountdownAnnouncer(answerRemaining, {
    enabled: pressureActive && answerTimerReady && !finished,
    label: '作答剩余',
  })
  const oneWayMode =
    sessionMeta?.metadata?.mode === 'one_way'
    || sessionMeta?.metadata?.interview_mode === 'one_way'
  const liveHintAllowed =
    deliveryLiveHintEnabled && !highPressure && !oneWayMode && !demoMode && interviewStarted

  useEffect(() => {
    resetCapture()
    liveHintShownRef.current = false
    setLiveHint('')
  }, [roundIndex, qIndex, resetCapture])

  useEffect(() => {
    if (demoMode || inGreetingPhase || !interviewStarted || finished) return
    if (pressureActive && !answerTimerReady) return
    beginAnswerWindow()
  }, [
    answerTimerReady,
    beginAnswerWindow,
    demoMode,
    finished,
    inGreetingPhase,
    interviewStarted,
    pressureActive,
    qIndex,
    roundIndex,
  ])

  const handleSttTranscript = useCallback((text) => {
    setInput(text)
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
    toggle: toggleStt,
    start: startStt,
    stop: stopStt,
  } = useSpeechToText({
    lang: interviewLang,
    onTranscript: handleSttTranscript,
    onFinalChunk: handleSttFinalChunk,
    onError: () => {
      lastSttFailedRef.current = true
      trackResearchEvent('stt.error', { session_id: sessionId, context: 'interview' })
    },
  })

  const buildDeliveryBody = useCallback(
    (text) => {
      const { speech, usedVoice } = getSpeechPayload()
      const textOnly = !usedVoice
      const delivery = computeDeliveryMetrics(text, speech, { textOnly, lang: interviewLang })
      trackResearchEvent('delivery.computed', {
        session_id: sessionId,
        round_index: roundIndex,
        question_index: qIndex,
        text_only: delivery.text_only,
        cpm: delivery.cpm,
        wpm: delivery.wpm,
      })
      resetCapture()
      liveHintShownRef.current = false
      setLiveHint('')
      return {
        speech: usedVoice ? speech : undefined,
        delivery,
      }
    },
    [getSpeechPayload, interviewLang, qIndex, resetCapture, roundIndex, sessionId],
  )

  useEffect(() => {
    if (!sttListening || !liveHintAllowed || ttsMutexRef.current) {
      listeningSinceRef.current = null
      if (!sttListening) {
        liveHintShownRef.current = false
        setLiveHint('')
      }
      return undefined
    }
    if (listeningSinceRef.current == null) {
      listeningSinceRef.current = performance.now()
    }
    const tick = setInterval(() => {
      if (ttsMutexRef.current || liveHintShownRef.current) return
      const elapsed = performance.now() - (listeningSinceRef.current || performance.now())
      if (elapsed < 15000) return
      const { speech, usedVoice } = getSpeechPayload()
      if (!usedVoice || !speech?.segments?.length) return
      const cpm = computeCpm(inputRef.current, speech, interviewLang)
      if (cpm == null) return
      const lo = englishInterview ? 110 : 180
      const hi = englishInterview ? 160 : 260
      if (cpm >= lo && cpm <= hi) return
      const unit = englishInterview ? '词/分' : '字/分'
      const tip =
        cpm < lo
          ? `语速偏慢，可稍加快节奏（建议 ${lo}–${hi} ${unit}）`
          : `语速偏快，可适当放慢（建议 ${lo}–${hi} ${unit}）`
      setLiveHint(tip)
      liveHintShownRef.current = true
      trackResearchEvent('delivery.live_hint_shown', {
        session_id: sessionId,
        cpm,
        round_index: roundIndex,
        question_index: qIndex,
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [englishInterview, getSpeechPayload, interviewLang, liveHintAllowed, qIndex, roundIndex, sessionId, sttListening])

  useEffect(() => {
    sttListeningRef.current = sttListening
  }, [sttListening])

  useEffect(() => {
    if (ttsSupported === false) {
      trackResearchEvent('tts.unsupported')
    }
  }, [ttsSupported])

  const wrapTtsOpts = useCallback(
    (opts = {}) => ({
      rate: ttsRate,
      voiceURI: ttsVoiceURI,
      lang: interviewLang,
      pitch: 1,
      ...opts,
      onChunkStart: (index) => {
        setCaptionSentenceIndex(index)
        opts.onChunkStart?.(index)
      },
      onstart: () => {
        if (sttListeningRef.current) {
          sttResumeRef.current = true
          stopStt()
        } else {
          sttResumeRef.current = false
        }
        opts.onstart?.()
      },
      onend: () => {
        if (sttResumeRef.current) {
          startStt()
          sttResumeRef.current = false
        }
        opts.onend?.()
      },
    }),
    [interviewLang, startStt, stopStt, ttsRate, ttsVoiceURI],
  )

  const speakWithCaption = useCallback(
    (text, opts = {}) => {
      const trimmed = String(text || '').trim()
      if (trimmed) {
        setSpokenCaptionText(trimmed)
        setCaptionSentenceIndex(0)
      }
      return speak(trimmed, wrapTtsOpts(opts))
    },
    [speak, wrapTtsOpts],
  )

  const loadQuestions = useCallback(async () => {
    if (!sessionId || sessionId === 'new') {
      setQuestions(mockQuestions)
      setQuestionsLoading(false)
      return
    }
    setQuestionsLoading(true)
    try {
      const session = await getSession(sessionId, { skipErrorToast: true })
      if (session.metadata?.mode === 'structured') {
        navigate(`/interview/structured/${sessionId}`, { replace: true })
        return
      }
      setSessionMeta(session)
      if (isEnglishInterviewLang(session.metadata?.lang) && session.metadata?.participation_mode !== 'demo') {
        setMessages(englishMockMessages)
        messagesRef.current = englishMockMessages
      }
      if (session.rounds?.length) {
        setSessionRounds(session.rounds)
        sessionRoundsRef.current = session.rounds
        setRoundIndex(0)
        setQInRound(0)
        if (session.metadata?.rounds_notice) {
          setQuestionFilterNotice(session.metadata.rounds_notice)
          if (session.metadata.rounds_notice.includes('放宽')) {
            showToast(session.metadata.rounds_notice, 'info')
            trackResearchEvent('question.pool_relaxed', {
              session_id: sessionId,
              notice: session.metadata.rounds_notice,
            })
          }
        }
      }
      if (session.metadata?.participation_mode === 'demo') {
        setDemoMode(true)
        setMessages(DEMO_SCRIPT)
        messagesRef.current = DEMO_SCRIPT
        setFinished(false)
        setCurrentQ(0)
      }

      if (session.rounds?.length) {
        setQuestionsLoading(false)
        return
      }

      const cachedIds = session.metadata?.question_ids
      if (cachedIds?.length) {
        const all = await listQuestions()
        const byId = new Map(all.map((q) => [q.id, q]))
        const titles = cachedIds.map((id) => byId.get(id)?.title).filter(Boolean)
        if (titles.length) {
          setQuestions(titles)
          setQuestionsLoading(false)
          return
        }
      }

      const allQuestions = await listQuestions()
      const { picked, notice } = pickInterviewQuestions(allQuestions, session, 5)
      setQuestionFilterNotice(notice || '')
      if (notice) {
        showToast(notice, 'info')
      }
      if (picked.length) {
        setQuestions(picked.map((q) => q.title))
        patchSessionMetadata(sessionId, {
          question_ids: picked.map((q) => q.id),
          ...(notice ? { question_filter_notice: notice } : {}),
        }).catch(() => {})
      } else {
        setQuestions(mockQuestions)
      }
    } catch (err) {
      setQuestions(mockQuestions)
      showToast(getErrorMessage(err, '加载面试题目失败，已使用默认题库'), 'error')
    } finally {
      setQuestionsLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    loadQuestions()
  }, [loadQuestions])

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!pressureActive) return undefined
    setAnswerRemaining(HARD_ANSWER_SECONDS)
    if (HARD_TIMER_STARTS_AFTER_TTS && effectiveTtsEnabled) {
      setAnswerTimerReady(false)
    } else {
      setAnswerTimerReady(true)
    }
  }, [qIndex, pressureActive, effectiveTtsEnabled])

  useEffect(() => {
    if (!HARD_TIMER_STARTS_AFTER_TTS) return
    if (!isSpeaking && interviewStarted && !inGreetingPhase) {
      setAnswerTimerReady(true)
    }
  }, [isSpeaking, interviewStarted, inGreetingPhase])

  useEffect(() => {
    if (!effectiveTtsEnabled || !ttsSupported || demoMode || finished || !interviewStarted) return
    if (inGreetingPhase || isNegotiationRound) return
    if (lastSpokenQRef.current === qIndex) return
    lastSpokenQRef.current = qIndex
    const text = activeQuestions[qIndex]
    if (text) {
      speakWithCaption(text)
    }
  }, [
    activeQuestions,
    qIndex,
    demoMode,
    effectiveTtsEnabled,
    finished,
    inGreetingPhase,
    interviewStarted,
    speakWithCaption,
    ttsSupported,
    isNegotiationRound,
  ])

  useEffect(() => {
    if (!isNegotiationRound || demoMode || !interviewStarted) return
    setNegotiationDone(false)
    const neg = currentRound?.negotiation
    if (!neg?.initial_offer) return
    const key = `${roundIndex}-${neg.initial_offer}`
    if (negotiationIntroRef.current === key) return
    negotiationIntroRef.current = key
    const intro = [
      '【谈薪模拟】以下报价为练习假设，不代表真实市场薪酬。',
      '',
      `我们初步报价：税前 ${neg.initial_offer} 元/月。`,
      '请说明期望区间与理由，或回复「接受 offer」/「拒绝」。',
    ].join('\n')
    setMessages((prev) => {
      const next = [...prev, { role: 'interviewer', text: intro }]
      messagesRef.current = next
      return next
    })
  }, [isNegotiationRound, interviewStarted, demoMode, roundIndex, currentRound?.negotiation])

  const formatTime = (s) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  const persistScore = async (score, dimensions, transcript, extraMetadata = {}) => {
    if (!sessionId || sessionId === 'new') return
    const durationMinutes = Math.max(1, Math.floor(elapsed / 60))
    try {
      await completeSession(
        sessionId,
        {
          score,
          duration_minutes: durationMinutes,
          dimensions,
          messages: transcript,
          transcript,
          metadata: extraMetadata,
        },
        { skipErrorToast: true },
      )
      await refresh()
    } catch (err) {
      showToast(getErrorMessage(err, '保存面试结果失败'), 'error')
    }
  }

  const finishInterview = useCallback((transcriptSnapshot) => {
    const closing = [
      { role: 'interviewer', text: '好的，感谢你的回答。今天的面试到此结束，我们会尽快给你反馈。祝你一切顺利！' },
      { role: 'system', text: '面试结束。正在生成复盘报告...' },
    ]
    setMessages((prev) => {
      const finalMessages = [...prev, ...closing]
      messagesRef.current = finalMessages
      return finalMessages
    })
    const roundsSnap = sessionRoundsRef.current
    let score
    let dimensions
    const extraMetadata = {}
    if (roundsSnap?.length) {
      const logicality = averageLogicalityFromRounds(roundsSnap)
      const userTexts = transcriptSnapshot.filter((m) => m.role === 'user').map((m) => m.text)
      const scored = aggregateSessionScore(userTexts)
      score = computeWeightedRoundScore(roundsSnap)
      if (scored.score_status === 'insufficient') {
        score = null
      } else if (score == null) {
        score = scored.overall
      }
      dimensions = {
        ...scored.dimensions,
        logicality,
        logic: scored.dimensions.logic ?? logicality,
      }
      extraMetadata.rounds = roundsSnap
      extraMetadata.delivery_summary = aggregateDeliverySummary(roundsSnap)
      extraMetadata.score_status = scored.score_status
      if (scored.score_status === 'insufficient') {
        trackResearchEvent('report.insufficient', { session_id: sessionId })
      }
    } else {
      const userTexts = transcriptSnapshot.filter((m) => m.role === 'user').map((m) => m.text)
      const scored = aggregateSessionScore(userTexts)
      score = scored.score_status === 'insufficient' ? null : scored.overall
      dimensions = scored.dimensions
      extraMetadata.score_status = scored.score_status
      if (scored.score_status === 'insufficient') {
        trackResearchEvent('report.insufficient', { session_id: sessionId })
      }
    }
    setFinished(true)
    setShowRoundTransition(false)
    persistScore(score, dimensions, transcriptSnapshot, extraMetadata).then(() => {
      setShowResearchFollowup(true)
    })
  }, [elapsed, sessionId, refresh])

  const finishRoundOrInterview = useCallback(
    (baseMessages) => {
      const rnd = sessionRoundsRef.current?.[roundIndex]
      if (rnd?.type === 'hr') {
        trackResearchEvent('round.hr.completed', {
          session_id: sessionId,
          round_index: roundIndex,
          round_name: rnd?.name,
        })
      }
      if (multiRound && roundIndex < (sessionRoundsRef.current?.length || 0) - 1) {
        trackResearchEvent('interview.round.complete', {
          round_index: roundIndex,
          round_name: sessionRoundsRef.current?.[roundIndex]?.name,
        })
        setShowRoundTransition(true)
      } else {
        finishInterview(baseMessages)
      }
      setIsThinking(false)
      advanceLockRef.current = false
    },
    [finishInterview, multiRound, roundIndex, sessionId],
  )

  const maybeShowReverseQa = useCallback(
    (baseMessages) => {
      const rnd = sessionRoundsRef.current?.[roundIndex]
      if (rnd?.reverse_qa) {
        pendingAfterReverseQaRef.current = baseMessages
        setReverseQaDrafts(['', '', ''])
        setShowReverseQa(true)
        setIsThinking(false)
        advanceLockRef.current = false
        return
      }
      finishRoundOrInterview(baseMessages)
    },
    [finishRoundOrInterview, roundIndex],
  )

  const proceedAfterAnswer = useCallback(
    (baseMessages) => {
      const nextQ = qIndex + 1
      if (nextQ < activeQuestions.length) {
        const withNext = [
          ...baseMessages,
          { role: 'interviewer', text: `好的，理解了。接下来下一个问题：\n\n${activeQuestions[nextQ]}` },
        ]
        setMessages(withNext)
        messagesRef.current = withNext
        setQIndex(nextQ)
        lastSpokenQRef.current = -1
        setIsThinking(false)
        advanceLockRef.current = false
        return
      }
      maybeShowReverseQa(baseMessages)
    },
    [activeQuestions, maybeShowReverseQa, qIndex, setQIndex],
  )

  const beginFollowupChain = useCallback(
    async (baseMessages, qMeta, ri, qi) => {
      if (
        !qMeta
        || !sessionId
        || sessionId === 'new'
        || demoMode
        || !armPolicy.followupEnabled()
        || followupIntensityOff(sessionMeta)
      ) {
        setTimeout(() => proceedAfterAnswer(baseMessages), 2000)
        return
      }
      const openType = qMeta.type === 'general' || qMeta.type === 'resume_specific'
      if (!openType) {
        setTimeout(() => proceedAfterAnswer(baseMessages), 2000)
        return
      }

      const maxLayers = followupDisplayMax(sessionMeta, armPolicy)
      if (maxLayers <= 0) {
        setTimeout(() => proceedAfterAnswer(baseMessages), 2000)
        return
      }

      setIsThinking(true)
      await new Promise((resolve) => {
        window.setTimeout(resolve, 1000 + Math.random() * 1000)
      })

      try {
        const resp = await postQuestionFollowup(
          sessionId,
          qMeta.id,
          { round_index: ri, question_index: qi },
          { skipErrorToast: true },
        )
        if (!resp?.followup?.text) {
          setIsThinking(false)
          advanceLockRef.current = false
          setTimeout(() => proceedAfterAnswer(baseMessages), 800)
          return
        }
        const layer = resp.followup.layer || 1
        const line = formatFollowupMessage(layer, maxLayers, resp.followup.text)
        trackResearchEvent('followup.shown', {
          session_id: sessionId,
          question_id: qMeta.id,
          round_index: ri,
          layer,
          gap_type: resp.followup.gap_type,
        })
        const withFollowup = [...baseMessages, { role: 'interviewer', text: line }]
        setMessages(withFollowup)
        messagesRef.current = withFollowup
        if (effectiveTtsEnabled && ttsSupported) {
          speakWithCaption(resp.followup.text)
        }
        setFollowupGate({
          baseMessages: withFollowup,
          questionId: qMeta.id,
          roundIndex: ri,
          questionIndex: qi,
          layer,
          maxLayers,
          text: resp.followup.text,
        })
      } catch {
        trackResearchEvent('followup.skipped', {
          session_id: sessionId,
          question_id: qMeta.id,
          round_index: ri,
          reason: 'generate_failed',
        })
        setTimeout(() => proceedAfterAnswer(baseMessages), 800)
      } finally {
        setIsThinking(false)
        advanceLockRef.current = false
      }
    },
    [
      armPolicy,
      demoMode,
      effectiveTtsEnabled,
      proceedAfterAnswer,
      sessionId,
      sessionMeta,
      speak,
      ttsSupported,
      wrapTtsOpts,
    ],
  )

  const clearRevisionGate = useCallback(async () => {
    setRevisionGate(null)
    const pending = pendingAdvanceRef.current
    pendingAdvanceRef.current = null
    if (sessionId && sessionId !== 'new') {
      try {
        const refreshed = await getSession(sessionId, { skipErrorToast: true })
        if (refreshed.rounds) {
          sessionRoundsRef.current = refreshed.rounds
          setSessionRounds(refreshed.rounds)
        }
      } catch {
        /* best-effort */
      }
    }
    if (pending) {
      const { messages, roundIndex: ri, questionIndex: qi, questionId } = pending
      const qMeta = sessionRoundsRef.current?.[ri]?.questions?.[qi]
        || (questionId
          ? sessionRoundsRef.current?.flatMap((r) => r.questions || []).find((q) => q.id === questionId)
          : null)
      await beginFollowupChain(messages, qMeta, ri, qi)
    }
  }, [beginFollowupChain, sessionId])

  const advanceInterview = useCallback(async (answerText, { timedOut = false } = {}) => {
    if (
      advanceLockRef.current
      || isThinking
      || finished
      || questionsLoading
      || demoMode
      || showRoundTransition
    ) {
      return
    }

    const trimmed = (answerText ?? '').trim()
    if (!timedOut && !trimmed) return

    const activeFollowup = followupGateRef.current
    if (activeFollowup) {
      advanceLockRef.current = true
      setIsThinking(true)
      const userMessages = [...activeFollowup.baseMessages, { role: 'user', text: trimmed }]
      setMessages(userMessages)
      messagesRef.current = userMessages
      setInput('')
      trackResearchEvent('followup.answered', {
        session_id: sessionId,
        question_id: activeFollowup.questionId,
        round_index: activeFollowup.roundIndex,
        layer: activeFollowup.layer,
        text_length: trimmed.length,
      })
      try {
        const deliveryBody = buildDeliveryBody(trimmed)
        const resp = await postQuestionFollowup(
          sessionId,
          activeFollowup.questionId,
          {
            round_index: activeFollowup.roundIndex,
            question_index: activeFollowup.questionIndex,
            answer_text: trimmed,
            stt_failed: lastSttFailedRef.current,
            ...deliveryBody,
          },
          { skipErrorToast: true },
        )
        lastSttFailedRef.current = false
        const refreshed = await getSession(sessionId, { skipErrorToast: true })
        if (refreshed.rounds) {
          sessionRoundsRef.current = refreshed.rounds
          setSessionRounds(refreshed.rounds)
        }
        if (resp?.followup?.text) {
          await new Promise((resolve) => {
            window.setTimeout(resolve, 1000 + Math.random() * 1000)
          })
          const layer = resp.followup.layer || activeFollowup.layer + 1
          const line = formatFollowupMessage(layer, activeFollowup.maxLayers, resp.followup.text)
          trackResearchEvent('followup.shown', {
            session_id: sessionId,
            question_id: activeFollowup.questionId,
            round_index: activeFollowup.roundIndex,
            layer,
            gap_type: resp.followup.gap_type,
          })
          const withNext = [...userMessages, { role: 'interviewer', text: line }]
          setMessages(withNext)
          messagesRef.current = withNext
          if (effectiveTtsEnabled && ttsSupported) {
            speakWithCaption(resp.followup.text)
          }
          setFollowupGate({
            ...activeFollowup,
            baseMessages: withNext,
            layer,
            text: resp.followup.text,
          })
        } else {
          setFollowupGate(null)
          proceedAfterAnswer(userMessages)
        }
      } catch {
        trackResearchEvent('followup.skipped', {
          session_id: sessionId,
          question_id: activeFollowup.questionId,
          round_index: activeFollowup.roundIndex,
          reason: 'answer_failed',
        })
        setFollowupGate(null)
        proceedAfterAnswer(userMessages)
      } finally {
        setIsThinking(false)
        advanceLockRef.current = false
      }
      return
    }

    advanceLockRef.current = true
    setIsThinking(true)

    const baseMessages = [...messagesRef.current]
    if (timedOut && !trimmed) {
      baseMessages.push({ role: 'system', text: '作答时间到，已自动进入下一题。' })
    } else if (trimmed) {
      baseMessages.push({ role: 'user', text: trimmed })
      if (timedOut) {
        baseMessages.push({ role: 'system', text: '作答时间到，已提交当前回答。' })
      }
    }

    setMessages(baseMessages)
    messagesRef.current = baseMessages
    setInput('')

    if (trimmed) {
      trackResearchEvent('interview.answer.submit', {
        session_id: sessionId,
        text_length: trimmed.length,
        round_index: roundIndex,
        question_index: qIndex,
      })
    }

    const roundsSnap = sessionRoundsRef.current
    const multi = Boolean(roundsSnap?.length)
    let revisionUi = null
    if (multi && sessionId && sessionId !== 'new' && trimmed) {
      const qMeta = roundsSnap[roundIndex]?.questions?.[qIndex]
      const openType = qMeta?.type === 'general' || qMeta?.type === 'resume_specific'
      if (qMeta) {
        try {
          if (openType) {
            const deliveryBody = buildDeliveryBody(trimmed)
            const attempt = await postQuestionAttempt(
              sessionId,
              qMeta.id,
              {
                round_index: roundIndex,
                question_index: qIndex,
                answer_text: trimmed,
                stt_failed: lastSttFailedRef.current,
                ...deliveryBody,
              },
              { skipErrorToast: true },
            )
            if (deliveryBody.delivery) {
              qMeta.delivery = deliveryBody.delivery
              if (deliveryBody.speech) qMeta.speech = deliveryBody.speech
            }
            lastSttFailedRef.current = false
            const refreshed = await getSession(sessionId, { skipErrorToast: true })
            if (refreshed.rounds) {
              sessionRoundsRef.current = refreshed.rounds
              setSessionRounds(refreshed.rounds)
            }
            if (attempt.feedback) {
              const assigned = Boolean(attempt.assigned)
              const mode = armPolicy.revisionParticipationMode()
              if (mode === 'demo') {
                revisionUi = {
                  kind: 'demo',
                  questionId: qMeta.id,
                }
              } else {
                revisionUi = {
                  kind: 'revision',
                  questionId: qMeta.id,
                  feedback: attempt.feedback,
                  initialAnswer: trimmed,
                  required: mode === 'active',
                  assigned,
                }
              }
            }
          } else {
            const deliveryBody = buildDeliveryBody(trimmed)
            await scoreInterviewAnswer(
              sessionId,
              {
                round_index: roundIndex,
                question_index: qIndex,
                answer_text: trimmed,
                stt_failed: lastSttFailedRef.current,
                ...deliveryBody,
              },
              { skipErrorToast: true },
            )
            if (deliveryBody.delivery) {
              qMeta.delivery = deliveryBody.delivery
              if (deliveryBody.speech) qMeta.speech = deliveryBody.speech
            }
            lastSttFailedRef.current = false
            const refreshed = await getSession(sessionId, { skipErrorToast: true })
            if (refreshed.rounds) {
              sessionRoundsRef.current = refreshed.rounds
              setSessionRounds(refreshed.rounds)
            }
          }
          if (qMeta.type) {
            trackResearchEvent('question.type', { type: qMeta.type, round_index: roundIndex })
          }
        } catch {
          lastSttFailedRef.current = false
          /* scoring / revision best-effort */
        }
      }
    }

    if (revisionUi) {
      pendingAdvanceRef.current = {
        messages: baseMessages,
        roundIndex,
        questionIndex: qIndex,
        questionId: revisionUi.questionId,
      }
      setIsThinking(false)
      setRevisionGate({
        ...revisionUi,
        roundIndex,
        questionIndex: qIndex,
      })
      advanceLockRef.current = false
      return
    }

    const qMetaFollowup = multi && roundsSnap ? roundsSnap[roundIndex]?.questions?.[qIndex] : null
    if (qMetaFollowup && sessionId && sessionId !== 'new' && trimmed) {
      setIsThinking(false)
      await beginFollowupChain(baseMessages, qMetaFollowup, roundIndex, qIndex)
      return
    }

    setTimeout(() => {
      proceedAfterAnswer(baseMessages)
    }, 2000)
  }, [
    armPolicy,
    beginFollowupChain,
    demoMode,
    effectiveTtsEnabled,
    finishInterview,
    finished,
    isThinking,
    proceedAfterAnswer,
    qIndex,
    roundIndex,
    questionsLoading,
    sessionId,
    showRoundTransition,
    speak,
    ttsSupported,
    wrapTtsOpts,
    buildDeliveryBody,
  ])

  const handleSubmitReverseQa = async (skipped) => {
    if (!sessionId || sessionId === 'new') {
      setShowReverseQa(false)
      finishRoundOrInterview(pendingAfterReverseQaRef.current || messagesRef.current)
      return
    }
    const questions = skipped
      ? []
      : reverseQaDrafts.map((d) => d.trim()).filter(Boolean).slice(0, 3)
    try {
      const resp = await submitReverseQa(
        sessionId,
        { round_index: roundIndex, questions },
        { skipErrorToast: true },
      )
      trackResearchEvent('reverse_qa.count', {
        session_id: sessionId,
        round_index: roundIndex,
        count: questions.length,
        skipped: resp?.skipped,
      })
      const refreshed = await getSession(sessionId, { skipErrorToast: true })
      if (refreshed.rounds) {
        sessionRoundsRef.current = refreshed.rounds
        setSessionRounds(refreshed.rounds)
      }
      if (resp?.skipped && resp?.items?.length) {
        showToast('未反问：可参考示例问题，本次不扣分', 'info')
      }
    } catch (err) {
      showToast(getErrorMessage(err, '保存反问失败'), 'error')
    }
    setShowReverseQa(false)
    finishRoundOrInterview(pendingAfterReverseQaRef.current || messagesRef.current)
  }

  const handleSendNegotiation = async () => {
    const trimmed = input.trim()
    if (!trimmed || negotiationBusy || negotiationDone || !sessionId || sessionId === 'new') return
    setNegotiationBusy(true)
    setIsThinking(true)
    const baseMessages = [...messagesRef.current, { role: 'user', text: trimmed }]
    setMessages(baseMessages)
    messagesRef.current = baseMessages
    setInput('')
    try {
      const resp = await postNegotiationTurn(
        sessionId,
        { round_index: roundIndex, message: trimmed },
        { skipErrorToast: true },
      )
      const hrText = resp?.hr_reply || '收到，请继续说明你的期望。'
      const withHr = [...baseMessages, { role: 'interviewer', text: hrText }]
      setMessages(withHr)
      messagesRef.current = withHr
      if (resp?.negotiation) {
        const rounds = [...(sessionRoundsRef.current || [])]
        if (rounds[roundIndex]) {
          rounds[roundIndex] = {
            ...rounds[roundIndex],
            negotiation: resp.negotiation,
            score: resp.round_score ?? rounds[roundIndex].score,
          }
          sessionRoundsRef.current = rounds
          setSessionRounds(rounds)
        }
      }
      if (resp?.done) {
        setNegotiationDone(true)
        maybeShowReverseQa(withHr)
      }
    } catch (err) {
      showToast(getErrorMessage(err, '谈薪回合提交失败'), 'error')
    } finally {
      setNegotiationBusy(false)
      setIsThinking(false)
    }
  }

  const handleDeclinePersonal = async () => {
    if (!currentHrQuestion?.declinable || isThinking || demoMode) return
    setIsThinking(true)
    const baseMessages = [
      ...messagesRef.current,
      { role: 'user', text: '【不便回答】' },
      { role: 'interviewer', text: '理解，我们尊重你的边界，这道题跳过。' },
    ]
    setMessages(baseMessages)
    messagesRef.current = baseMessages
    try {
      if (sessionId && sessionId !== 'new') {
        await scoreInterviewAnswer(
          sessionId,
          {
            round_index: roundIndex,
            question_index: qIndex,
            answer_text: '',
            declined_personal: true,
          },
          { skipErrorToast: true },
        )
        const refreshed = await getSession(sessionId, { skipErrorToast: true })
        if (refreshed.rounds) {
          sessionRoundsRef.current = refreshed.rounds
          setSessionRounds(refreshed.rounds)
        }
      }
      proceedAfterAnswer(baseMessages)
    } catch {
      proceedAfterAnswer(baseMessages)
    }
  }

  const handleEnterNextRound = () => {
    const nextRound = roundIndex + 1
    setRoundIndex(nextRound)
    setQInRound(0)
    lastSpokenQRef.current = -1
    setShowRoundTransition(false)
    setNegotiationDone(false)
    negotiationIntroRef.current = ''
    const rnd = sessionRoundsRef.current?.[nextRound]
    const firstQ = rnd?.questions?.[0]?.title
    if (firstQ) {
      setMessages((prev) => {
        const withNext = [
          ...prev,
          {
            role: 'interviewer',
            text: `${rnd?.name || '下一轮'}开始。\n\n${firstQ}`,
          },
        ]
        messagesRef.current = withNext
        return withNext
      })
    }
  }

  const handleEndInterviewEarly = () => {
    finishInterview(messagesRef.current)
  }

  useEffect(() => {
    advanceInterviewRef.current = advanceInterview
  }, [advanceInterview])

  useEffect(() => {
    if (!pressureActive || !answerTimerReady || isThinking || finished) return undefined

    const tick = setInterval(() => {
      setAnswerRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(tick)
          advanceInterviewRef.current(inputRef.current, { timedOut: true })
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(tick)
  }, [pressureActive, answerTimerReady, isThinking, finished, qIndex])

  useEffect(() => {
    if (!demoMode || demoFinishedRef.current) return undefined
    const tick = setInterval(() => {
      setDemoRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(tick)
          if (!demoFinishedRef.current) {
            demoFinishedRef.current = true
            setFinished(true)
            const dimensions = {
              expression: 0,
              logic: 0,
              leadership: 0,
              teamwork: 0,
              adaptability: 0,
            }
            persistScore(0, dimensions, messagesRef.current).then(() => {
              setShowResearchFollowup(false)
              showToast('示范观看已完成', 'success')
              const linked = sessionMeta?.metadata?.task_continuity === 'linked'
              if (linked) {
                navigate('/interview/lobby?continuity=1')
              } else {
                navigate('/interview/lobby')
              }
            })
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [demoMode, navigate, sessionMeta])

  const handleSend = () => {
    if (isSpeaking) stopTts()
    if (isNegotiationRound && interviewStarted && !negotiationDone) {
      handleSendNegotiation()
      return
    }
    advanceInterview(input, { timedOut: false })
  }

  const handleKeyDown = (e) => {
    if (keyboardShortcutsEnabled) {
      if ((e.key === ' ' || e.code === 'Space') && !e.shiftKey) {
        e.preventDefault()
      }
      return
    }
    if (e.key !== ' ' && e.code !== 'Space') return
    if (e.shiftKey) return
    if (e.nativeEvent.isComposing || isComposing) return
    if (!input.trim() || isThinking || finished || demoMode) return
    e.preventDefault()
    handleSend()
  }

  const handleMicClick = () => {
    if (isSpeaking) {
      stopTts()
    }
    if (!sttSupported || englishSttWarn) {
      showToast(
        englishInterview
          ? '当前环境可能不支持英文语音输入，请直接用英文打字作答'
          : '当前浏览器不支持语音输入，请改用文字作答',
        'error',
      )
      return
    }
    if (isThinking || finished || demoMode) return
    if (!sttListening) markVoiceUsed()
    toggleStt()
  }

  useRoomKeyboardShortcuts({
    enabled: keyboardShortcutsEnabled && !demoMode && !finished && !inGreetingPhase,
    onToggleMic: handleMicClick,
    onSubmit: handleSend,
    canToggleMic: () =>
      sttSupported && !englishSttWarn && !isThinking && !finished && !demoMode && !inGreetingPhase,
    canSubmit: () =>
      Boolean(input.trim()) && !isThinking && !finished && !demoMode && !sttListening,
  })

  const handleExit = () => {
    stopTts()
    clearInterval(timerRef.current)
    navigate('/interview/lobby')
  }

  const handleStartInterview = () => {
    setInterviewStarted(true)
    lastSpokenQRef.current = 0
    if (effectiveTtsEnabled && ttsSupported) {
      const welcome = messagesRef.current.find((m) => m.role === 'interviewer')?.text
      const firstQ = activeQuestions[0]
      const script = welcome ? `${welcome}\n\n${firstQ}` : firstQ
      speakWithCaption(script)
    }
  }

  const handleTtsToggle = () => {
    if (getArmForcedTtsEnabled(experimentAssignment) !== null) return
    const next = !ttsEnabledSetting
    setTtsEnabled(next)
    trackResearchEvent('tts.toggle', { enabled: next, context: 'interview' })
    if (!next) stopTts()
  }

  const handleTtsReplay = () => {
    if (!effectiveTtsEnabled || !ttsSupported || inGreetingPhase) return
    const text = activeQuestions[qIndex]
    if (!text) return
    trackResearchEvent('tts.replay', { context: 'interview' })
    speakWithCaption(text)
  }

  const roleLabel = sessionMeta?.topic || '资深HR · 结构化面试'
  const heroQuestion = isNegotiationRound
    ? '谈薪模拟：请基于下方假设报价回应 HR'
    : activeQuestions[qIndex]
  const captionDisplayText = spokenCaptionText || heroQuestion || ''

  useEffect(() => {
    if (inGreetingPhase || demoMode) return
    if (!heroQuestion) return
    if (isSpeaking && effectiveTtsEnabled) return
    setSpokenCaptionText(heroQuestion)
    setCaptionSentenceIndex(0)
  }, [heroQuestion, inGreetingPhase, demoMode, isSpeaking, effectiveTtsEnabled])

  const roundAnsweredCount = multiRound
    ? (currentRound?.questions || []).filter((q) => q.answer).length
    : qIndex

  const triggerUiShake = useCallback(() => {
    if (reduceMotion) return
    setIsShaking(true)
    window.setTimeout(() => setIsShaking(false), 520)
  }, [reduceMotion])

  useEffect(() => {
    if (!inGreetingPhase) return undefined
    let step = 1
    const id = setInterval(() => {
      step = step >= 6 ? 1 : step + 1
      setEllipsisDots('·'.repeat(step))
    }, 380)
    return () => clearInterval(id)
  }, [inGreetingPhase])

  useEffect(() => {
    if (skipShakeOnMountRef.current) {
      skipShakeOnMountRef.current = false
      return
    }
    if (qIndex === 0) return
    triggerUiShake()
  }, [qIndex, triggerUiShake])

  useEffect(() => {
    if (wasInGreetingRef.current && !inGreetingPhase) {
      wasInGreetingRef.current = false
      triggerUiShake()
    }
  }, [inGreetingPhase, triggerUiShake])

  const cardClass = [
    styles['interview-card'],
    highPressure ? styles['card-pressure'] : '',
    answerCritical ? styles['card-pressure-warn'] : '',
    answerUrgent ? styles['card-pressure-urgent'] : '',
  ].filter(Boolean).join(' ')

  if (questionsLoading) {
    return (
      <div className={styles.room}>
        <p className={styles.loading}>正在加载面试题目…</p>
      </div>
    )
  }

  return (
    <div className={`${styles.room} ${highPressure ? styles['room-pressure'] : ''} ${isShaking ? styles['room-shake'] : ''}`}>
      <div className="sr-only" aria-live="polite">
        {answerCountdownAnnounce}
      </div>
      <div className={cardClass}>
        {questionFilterNotice && !demoMode && (
          <div className={styles['filter-notice']} role="status">
            {questionFilterNotice}
          </div>
        )}

        {demoMode && (
          <div className={styles['demo-strip']}>
            <span className={styles['demo-tag']}>DEMO</span>
            示范观看 · 剩余 {formatTime(demoRemaining)}（无需输入）
          </div>
        )}

        {!demoMode && (
          <section className={styles['hero-question']} aria-labelledby="interview-hero-heading">
            <div className={styles['hero-toolbar']}>
              <div className={styles['hero-toolbar-left']}>
                <div className={styles['interviewer-avatar']}>
                  <span>AI</span>
                </div>
                <div className={styles['interviewer-info']}>
                  <div className={styles['interviewer-name']}>面试官 · 陈明</div>
                  <div className={styles['interviewer-role']}>{roleLabel}</div>
                </div>
                <div className={`${styles['status-dot']} ${isThinking ? styles.thinking : styles.ready}`} />
              </div>
              <div className={styles['hero-toolbar-center']}>
                <div className={styles['progress-pills']}>
                  {activeQuestions.map((_, i) => (
                    <div
                      key={i}
                      className={`${styles.pill} ${i < qIndex ? styles.done : ''} ${i === qIndex ? styles.current : ''}`}
                    />
                  ))}
                </div>
                <div className={styles['progress-text']}>
                  {multiRound
                    ? isNegotiationRound
                      ? `第 ${roundIndex + 1} / ${totalRounds} 轮 · 谈薪模拟`
                      : `第 ${roundIndex + 1} / ${totalRounds} 轮 · 第 ${Math.min(qIndex + 1, questionsInRound)} / ${questionsInRound} 题`
                    : `问题 ${Math.min(qIndex + 1, activeQuestions.length)} / ${activeQuestions.length}`}
                </div>
              </div>
              <div className={styles['hero-toolbar-right']}>
                {pressureActive && (
                  <div
                    className={`${styles['answer-timer']} ${answerCritical ? styles['answer-timer-warn'] : ''} ${answerUrgent ? styles['answer-timer-urgent'] : ''}`}
                    aria-hidden="true"
                  >
                    <span className={styles['answer-timer-label']}>作答</span>
                    <span className={styles['answer-timer-value']}>{formatTime(answerRemaining)}</span>
                  </div>
                )}
                <div className={styles.timer}>
                  <span className={styles['timer-icon']}>⏱</span>
                  <span className={styles['timer-value']}>{formatTime(elapsed)}</span>
                </div>
                <button className={styles['exit-btn']} onClick={() => setShowExit(true)} aria-label="退出面试">
                  退出
                </button>
              </div>
            </div>
            <div className={styles['hero-meta']}>
              {!isNegotiationRound && <span className={styles['hero-tag']}>Q{qIndex + 1}</span>}
              {isHrRound && <span className={styles['hero-tag']}>HR</span>}
              {isNegotiationRound && <span className={styles['hero-tag']}>谈薪</span>}
              {highPressure && <span className={styles['hero-pressure-badge']}>高压模式</span>}
            </div>
            {isNegotiationRound && interviewStarted && currentOffer != null && (
              <div className={styles['offer-card']} role="status">
                <div className={styles['offer-card-label']}>假设报价（模拟）</div>
                <div className={styles['offer-card-value']}>{currentOffer} 元/月 · 税前</div>
                <p className={styles['offer-card-note']}>
                  该数字仅用于本次练习，不代表真实市场薪酬。
                </p>
              </div>
            )}
            {isHrRound && currentHrQuestion?.declinable && !inGreetingPhase && (
              <button
                type="button"
                className={styles['decline-personal-btn']}
                onClick={handleDeclinePersonal}
                disabled={isThinking || demoMode}
                aria-label="不便回答，跳过此题"
              >
                不便回答（跳过此题）
              </button>
            )}
            <h2
              id="interview-hero-heading"
              className={`${styles['hero-text']} ${isSpeaking ? styles['hero-text-speaking'] : ''}`}
            >
              {inGreetingPhase ? (
                <span className={styles['hero-greeting']}>
                  <span className={styles['hero-ellipsis']} aria-label="等待开始">
                    {ellipsisDots}
                  </span>
                  <button
                    type="button"
                    className={styles['start-interview-btn']}
                    onClick={handleStartInterview}
                    aria-label="开始面试"
                  >
                    开始面试
                  </button>
                </span>
              ) : (
                <>
                  {isSpeaking && effectiveTtsEnabled && !reduceMotion && (
                    <div className={styles['tts-waveform']} aria-hidden="true">
                      {Array.from({ length: 16 }, (_, i) => (
                        <span key={i} className={styles['tts-wave-bar']} style={{ '--i': i }} />
                      ))}
                      <span className={styles['tts-speaking-label']}>正在朗读</span>
                    </div>
                  )}
                  {isSpeaking && effectiveTtsEnabled && reduceMotion && (
                    <span className={styles['tts-speaking-label']}>正在朗读</span>
                  )}
                  {!captionsEnabled && heroQuestion}
                </>
              )}
            </h2>
            {captionsEnabled && !inGreetingPhase && (
              <InterviewerCaptions
                text={captionDisplayText}
                activeSentenceIndex={captionSentenceIndex}
                speaking={isSpeaking && effectiveTtsEnabled}
              />
            )}
          </section>
        )}

        <div className={styles['messages-area']}>
          <div className={styles['messages-label']}>对话记录</div>
          {messages.map((msg, i) => (
            <div key={i} className={`${styles.message} ${styles[`msg-${msg.role}`]}`}>
              {msg.role === 'interviewer' && (
                <div className={styles['msg-avatar']}>AI</div>
              )}
              <div className={styles['msg-bubble']}>
                {msg.text.split('\n').map((line, j) => (
                  <span key={j}>{line}{j < msg.text.split('\n').length - 1 && <br />}</span>
                ))}
              </div>
            </div>
          ))}
          {isThinking && (
            <div className={`${styles.message} ${styles['msg-interviewer']}`}>
              <div className={styles['msg-avatar']}>AI</div>
              <div className={styles['msg-bubble']}>
                <div className={styles['thinking-dots']}>
                  <span /><span /><span />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className={styles['input-area']}>
          <WeChatSpeechTip />
          {englishSttWarn && (
            <p className={styles['input-hint']} role="status">
              当前环境可能不支持英文语音识别；请直接用英文打字作答，同样会计入表达指标（填充词、语速等）。
            </p>
          )}
          <div className={styles['input-hint']}>
            {keyboardShortcutsEnabled
              ? 'Space 麦克风 · Ctrl+Enter 发送 · Shift+Space 输入空格'
              : '空格发送 · Shift+空格输入空格'}
            {pressureActive && ' · 高压模式每题限时作答'}
            {' · '}
            <button
              type="button"
              className={styles['keyboard-help-link']}
              onClick={() => setShowKeyboardHelp(true)}
              aria-label="打开键盘快捷键说明"
            >
              快捷键说明
            </button>
          </div>
          <div className={`${styles['composer-row']} composer-row`}>
            {ttsSupported && (
              <div className={styles['tts-controls']}>
                <button
                  type="button"
                  className={styles['tts-btn']}
                  onClick={handleTtsToggle}
                  disabled={inGreetingPhase || getArmForcedTtsEnabled(experimentAssignment) !== null}
                  aria-label={effectiveTtsEnabled ? '关闭朗读' : '开启朗读'}
                  title={effectiveTtsEnabled ? '关闭朗读' : '开启朗读'}
                >
                  {effectiveTtsEnabled ? '🔊' : '🔇'}
                </button>
                <button
                  type="button"
                  className={styles['tts-btn']}
                  onClick={handleTtsReplay}
                  disabled={!effectiveTtsEnabled || inGreetingPhase || isThinking}
                  aria-label="重听当前题目"
                  title="重听"
                >
                  重听
                </button>
              </div>
            )}
            {sttSupported && !englishSttWarn && (
              <div className={styles['mic-wrap']}>
                {liveHint ? (
                  <div className={styles['live-hint']} role="status">
                    {liveHint}
                  </div>
                ) : null}
                <button
                  type="button"
                  className={`${styles['mic-btn']} ${sttListening ? styles['mic-btn-active'] : ''}`}
                  onClick={handleMicClick}
                  disabled={isThinking || finished || demoMode || inGreetingPhase}
                  aria-label={sttListening ? '停止语音输入' : '开始语音输入'}
                  title={sttListening ? '停止语音输入' : '语音输入'}
                >
                  <span className={styles['mic-icon']} aria-hidden="true">🎤</span>
                </button>
              </div>
            )}
            <div
              className={`${styles['input-shell']} ${sttListening ? styles['input-shell-listening'] : ''}`}
            >
              {sttListening ? (
                <div className={styles['waveform']} aria-live="polite" aria-label="正在聆听">
                  {Array.from({ length: 24 }, (_, i) => (
                    <span key={i} className={styles['wave-bar']} style={{ '--i': i }} />
                  ))}
                  <span className={styles['wave-label']}>聆听中…</span>
                </div>
              ) : (
                <textarea
                  className={styles['input-field']}
                  placeholder="输入你的回答..."
                  value={input}
                  onChange={(e) => {
                    if (isSpeaking) stopTts()
                    setInput(e.target.value)
                  }}
                  onKeyDown={handleKeyDown}
                  onCompositionStart={() => setIsComposing(true)}
                  onCompositionEnd={() => setIsComposing(false)}
                  rows={2}
                  disabled={
                    isThinking
                    || finished
                    || demoMode
                    || inGreetingPhase
                    || showRoundTransition
                    || showReverseQa
                    || (isNegotiationRound && negotiationDone)
                  }
                />
              )}
              <button
                type="button"
                className={styles['send-btn']}
                onClick={handleSend}
                disabled={!input.trim() || isThinking || finished || demoMode || sttListening}
                aria-label="发送回答"
              >
                <span aria-hidden="true">↑</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {showReverseQa && !finished && (
        <div className={styles['modal-overlay']} role="dialog" aria-modal="true" aria-label="结尾反问">
          <div className={styles['modal-card']}>
            <div className={styles['modal-title']}>结尾反问环节</div>
            <div className={styles['modal-desc']}>
              可选 0–3 个反问（不反问不会扣分，我们会给出示例参考）。
            </div>
            {reverseQaDrafts.map((draft, i) => (
              <input
                key={i}
                type="text"
                className={styles['reverse-qa-input']}
                placeholder={`反问 ${i + 1}（可选）`}
                value={draft}
                onChange={(e) => {
                  const next = [...reverseQaDrafts]
                  next[i] = e.target.value
                  setReverseQaDrafts(next)
                }}
              />
            ))}
            <div className={styles['modal-actions']}>
              <button
                type="button"
                className={styles['modal-cancel']}
                onClick={() => handleSubmitReverseQa(true)}
              >
                暂不问 · 看示例
              </button>
              <button
                type="button"
                className={styles['modal-confirm']}
                onClick={() => handleSubmitReverseQa(false)}
              >
                提交反问
              </button>
            </div>
          </div>
        </div>
      )}

      {showRoundTransition && multiRound && !finished && (
        <div className={styles['modal-overlay']} role="dialog" aria-modal="true" aria-label="轮间过渡">
          <div className={styles['modal-card']}>
            <div className={styles['modal-title']}>{currentRound?.name || '本轮'}已完成</div>
            <div className={styles['modal-desc']}>
              本轮共 {questionsInRound} 题，已完成 {roundAnsweredCount} 题（不展示分数）。
              {roundIndex < totalRounds - 1 ? ' 可进入下一轮，或提前结束面试。' : ''}
            </div>
            <div className={styles['modal-actions']}>
              {roundIndex < totalRounds - 1 && (
                <button type="button" className={styles['modal-cancel']} onClick={handleEnterNextRound}>
                  进入下一轮
                </button>
              )}
              <button type="button" className={styles['modal-confirm']} onClick={handleEndInterviewEarly}>
                结束面试
              </button>
            </div>
          </div>
        </div>
      )}

      {revisionGate?.kind === 'revision' && (
        <RevisionPanel
          sessionId={sessionId}
          questionId={revisionGate.questionId}
          roundIndex={revisionGate.roundIndex}
          questionIndex={revisionGate.questionIndex}
          feedback={revisionGate.feedback}
          initialAnswer={revisionGate.initialAnswer}
          required={revisionGate.required}
          assigned={revisionGate.assigned}
          onComplete={clearRevisionGate}
          onSkip={clearRevisionGate}
        />
      )}

      {revisionGate?.kind === 'demo' && (
        <DemoPanel
          sessionId={sessionId}
          questionId={revisionGate.questionId}
          onComplete={clearRevisionGate}
        />
      )}

      {showResearchFollowup && finished && !demoMode && (
        <ResearchFollowupCard
          sessionId={sessionId}
          onDone={() => {
            setShowResearchFollowup(false)
            const linked = sessionMeta?.metadata?.task_continuity === 'linked'
            const assigned = sessionMeta?.metadata?.source === 'experiment_assigned_practice'
            if (linked && assigned) {
              navigate('/interview/lobby?continuity=1')
              return
            }
            navigate(`/analytics/report/${sessionId}`)
          }}
        />
      )}

      <KeyboardShortcutsHelp open={showKeyboardHelp} onClose={() => setShowKeyboardHelp(false)} />

      {storyPeekAllowed ? (
        <StorySidePeek open={storyPeekOpen} onToggle={() => setStoryPeekOpen((v) => !v)} />
      ) : null}

      {showExit && (
        <div className={styles['modal-overlay']} onClick={(e) => e.target === e.currentTarget && setShowExit(false)} role="dialog" aria-modal="true" aria-label="退出确认">
          <div className={styles['modal-card']}>
            <div className={styles['modal-title']}>确认退出？</div>
            <div className={styles['modal-desc']}>
              退出后本次面试进度将不会保存。已回答的内容不会生成复盘报告。
            </div>
            <div className={styles['modal-actions']}>
              <button className={styles['modal-cancel']} onClick={() => setShowExit(false)}>
                继续面试
              </button>
              <button className={styles['modal-confirm']} onClick={handleExit}>
                确认退出
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
