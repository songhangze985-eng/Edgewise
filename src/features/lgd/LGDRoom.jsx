import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import useLgdStore from '../../stores/lgdStore'
import useSessionStore from '../../stores/sessionStore'
import { getRoom, scoreLgd, requestLgdAgentTurn, saveLgdMemory } from '../../api/lgd'
import { getErrorMessage } from '../../api/client'
import { showToast } from '../../stores/toastStore'
import ResearchFollowupCard from '../../components/ResearchFollowupCard/ResearchFollowupCard'
import useTTS from '../../hooks/useTTS'
import useSettingsStore from '../../stores/settingsStore'
import useAuthStore from '../../stores/authStore'
import { getArmForcedTtsEnabled } from '../../config/tts'
import { buildAgentTtsProfiles } from '../../utils/lgdAgentTts'
import { trackResearchEvent } from '../../research/track'
import InterviewerCaptions from '../../components/a11y/InterviewerCaptions'
import KeyboardShortcutsHelp from '../../components/a11y/KeyboardShortcutsHelp'
import { useCountdownAnnouncer } from '../../hooks/useCountdownAnnouncer'
import { useRoomKeyboardShortcuts } from '../../hooks/useRoomKeyboardShortcuts'
import { formatScoreGrade } from '../../utils/scoreGrades'
import {
  AGENTS,
  DEFAULT_MATERIAL,
  DEFAULT_TOPIC,
  PHASE_DEFS,
  RESPONSES,
  ROLE_LABELS,
  STATEMENT_ORDER,
  agentById,
  getScriptById,
  pickAgentForFreeDiscussion,
} from './lgdScripts'
import styles from './LGDRoom.module.css'

const PHASES = PHASE_DEFS

/* ============================================
   Utility: format seconds to mm:ss
   ============================================ */
function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/* ============================================
   LGDRoom Component
   ============================================ */
export default function LGDRoom() {
  const navigate = useNavigate()
  const { id: roomId } = useParams()
  const recordAndComplete = useSessionStore((s) => s.recordAndComplete)
  const phase = useLgdStore((s) => s.phase)
  const topic = useLgdStore((s) => s.topic)
  const material = useLgdStore((s) => s.material)
  const messages = useLgdStore((s) => s.messages)
  const currentSpeaker = useLgdStore((s) => s.currentSpeaker)
  const remainingSeconds = useLgdStore((s) => s.remainingSeconds)
  const micGranted = useLgdStore((s) => s.micGranted)
  const score = useLgdStore((s) => s.score)
  const userRole = useLgdStore((s) => s.userRole)
  const scriptId = useLgdStore((s) => s.scriptId)
  const memoryEnabled = useLgdStore((s) => s.memoryEnabled)
  const apiMode = useLgdStore((s) => s.apiMode)
  const notes = useLgdStore((s) => s.notes)
  const setNotes = useLgdStore((s) => s.setNotes)
  const lastSandboxMeta = useLgdStore((s) => s.lastSandboxMeta)
  const setLastSandboxMeta = useLgdStore((s) => s.setLastSandboxMeta)
  const lgdMetrics = useLgdStore((s) => s.lgdMetrics)

  const chatRef = useRef(null)
  const inputRef = useRef(null)
  const simulationRef = useRef(null)
  const timerRef = useRef(null)
  const typewriterRef = useRef(null)
  const mountedRef = useRef(true)

  const [inputValue, setInputValue] = useState('')
  const [typingAgent, setTypingAgent] = useState(null)
  const [displayingMessage, setDisplayingMessage] = useState(null)
  const [handRaised, setHandRaised] = useState(false)
  const [completedSessionId, setCompletedSessionId] = useState(null)
  const [showResearchFollowup, setShowResearchFollowup] = useState(false)
  const [showMaterialModal, setShowMaterialModal] = useState(false)
  const [showNotesModal, setShowNotesModal] = useState(false)
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false)
  const [captionSentenceIndex, setCaptionSentenceIndex] = useState(0)
  const [spokenCaptionText, setSpokenCaptionText] = useState('')
  const [captionSpeaking, setCaptionSpeaking] = useState(false)

  const responseIndexRef = useRef({})
  const startTimeRef = useRef(Date.now())
  const agentTtsProfilesRef = useRef([])
  const roomMetaRef = useRef({
    userRole: 'member',
    topicType: null,
    roomId: null,
    scriptId: 'standard_flow',
    memoryEnabled: true,
    apiMode: 'hybrid_sandbox',
  })
  const statementIndexRef = useRef(0)
  const advanceUserStatementRef = useRef(null)
  const userSpokeInSummaryRef = useRef(false)
  const finalizedRef = useRef(false)
  const turnEpochRef = useRef(0)

  const ttsEnabledSetting = useSettingsStore((s) => s.ttsEnabled)
  const captionsEnabled = useSettingsStore((s) => s.captionsEnabled)
  const keyboardShortcutsEnabled = useSettingsStore((s) => s.keyboardShortcutsEnabled)
  const experimentAssignment = useAuthStore((s) => s.user?.experimentAssignment)
  const effectiveTtsEnabled = getArmForcedTtsEnabled(experimentAssignment) ?? ttsEnabledSetting
  const { speak: speakTts, stop: stopTts, isSpeaking, supported: ttsSupported } = useTTS()
  const phaseCountdownAnnounce = useCountdownAnnouncer(remainingSeconds, {
    enabled: phase !== 'completed' && phase !== 'lobby',
    label: '阶段剩余',
  })

  useEffect(() => {
    agentTtsProfilesRef.current = buildAgentTtsProfiles(AGENTS.length)
  }, [])

  /* ---- Auto-scroll chat ---- */
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight
    }
  }, [messages, typingAgent, displayingMessage])

  /* ---- Initialize room on mount ---- */
  useEffect(() => {
    mountedRef.current = true
    let cancelled = false

    async function boot() {
      const mem = useLgdStore.getState().memorySnapshot
      let nextTopic = mem?.last_topic || DEFAULT_TOPIC
      let nextMaterial = DEFAULT_MATERIAL
      let phases = []
      let role = mem?.user_role || 'member'
      let topicType = null
      let nextScriptId = mem?.script_id || 'standard_flow'
      let nextMemoryEnabled = mem?.memory_enabled ?? true
      let nextApiMode = mem?.api_mode || 'hybrid_sandbox'

      if (roomId && roomId !== 'new') {
        try {
          const room = await getRoom(roomId)
          if (!cancelled) {
            nextTopic = room.topic || nextTopic
            nextMaterial = room.material || nextMaterial
            phases = room.phases || []
            role = room.user_role || role
            topicType = room.topic_type || null
            nextScriptId = room.script_id || nextScriptId
            nextMemoryEnabled = room.memory_enabled ?? nextMemoryEnabled
            nextApiMode = room.api_mode || nextApiMode
            roomMetaRef.current = {
              userRole: role,
              topicType,
              roomId: room.id,
              scriptId: nextScriptId,
              memoryEnabled: nextMemoryEnabled,
              apiMode: nextApiMode,
            }
            trackResearchEvent('lgd.role', {
              room_id: room.id,
              user_role: role,
              topic_type: topicType,
            })
          }
        } catch {
          /* fallback to defaults */
        }
      }
      if (!cancelled) {
        useLgdStore.getState().initRoom(nextTopic, nextMaterial, {
          phases,
          userRole: role,
          topicType,
          scriptId: nextScriptId,
          memoryEnabled: nextMemoryEnabled,
          apiMode: nextApiMode,
        })
        trackResearchEvent('lgd.phase_entered', { phase: 'reading', room_id: roomMetaRef.current.roomId })
      }
    }
    boot()

    return () => {
      cancelled = true
      mountedRef.current = false
      stopTts()
      clearInterval(timerRef.current)
      clearTimeout(simulationRef.current)
      clearInterval(typewriterRef.current)
      useLgdStore.getState().reset()
    }
  }, [roomId, stopTts])

  /* ---- Timer tick ---- */
  useEffect(() => {
    clearInterval(timerRef.current)
    if (phase === 'lobby' || phase === 'completed') return

    timerRef.current = setInterval(() => {
      if (!mountedRef.current) return
      const state = useLgdStore.getState()
      if (state.remainingSeconds <= 1) {
        clearInterval(timerRef.current)
        if (state.phase === 'summary_report') {
          finalizeLgdSession()
        } else {
          advancePhase(state.phase)
        }
      } else {
        state.tick()
      }
    }, 1000)

    return () => clearInterval(timerRef.current)
  }, [phase])

  /* ---- Phase transition logic ---- */
  const advancePhase = useCallback((currentPhase) => {
    if (!mountedRef.current) return
    const state = useLgdStore.getState()

    turnEpochRef.current += 1
    stopTts()
    clearTimeout(simulationRef.current)
    clearInterval(typewriterRef.current)
    setTypingAgent(null)
    setDisplayingMessage(null)

    const transitions = {
      reading: 'personal_statement',
      personal_statement: 'free_discussion',
      free_discussion: 'summary_report',
      summary_report: 'completed',
    }

    const next = transitions[currentPhase]
    if (next) {
      if (next === 'completed') return
      state.setPhase(next)
      statementIndexRef.current = 0
      state.addMessage({
        senderId: 'system',
        senderName: '系统',
        senderRole: '',
        content: getPhaseAnnouncement(next),
        isUser: false,
        isSystem: true,
        phase: next,
      })
      trackResearchEvent('lgd.phase_entered', { phase: next, room_id: roomMetaRef.current.roomId })
    }
  }, [stopTts])

  /* ---- Run simulation based on phase ---- */
  useEffect(() => {
    if (phase === 'personal_statement') {
      runPersonalStatementSimulation()
    } else if (phase === 'free_discussion') {
      runFreeDiscussionSimulation()
    } else if (phase === 'summary_report') {
      runSummaryReportSimulation()
    }

    return () => {
      clearTimeout(simulationRef.current)
      clearInterval(typewriterRef.current)
    }
  }, [phase, advancePhase])

  function buildTranscriptFromMessages(messageList) {
    return messageList.map((msg) => ({
      role: msg.isSystem ? 'system' : msg.isUser ? 'user' : 'agent',
      speaker: msg.senderName,
      text: msg.content,
      senderId: msg.senderId,
      senderRole: msg.senderRole,
      phase: msg.phase,
      meta: msg.meta,
      isUser: msg.isUser,
    }))
  }

  /**
   * Fetch an isolated sandbox turn for `agent` via `/api/v1/lgd/agent-turn`,
   * falling back seamlessly to local fast-training scripts if offline.
   */
  async function resolveSandboxAgentLine(agent, phaseName, fallbackContent, turnIdx = 0) {
    const st = useLgdStore.getState()
    if (st.apiMode === 'fast_script_only') {
      setLastSandboxMeta({
        sandbox_id: `sbx-${agent.seat || ''}号-${agent.id}`,
        seat_number: agent.seat,
        context_limit: agent.contextLimit || 4,
        script_badge: getScriptById(st.scriptId).badge,
        engine_source: 'fast_script_only',
      })
      return fallbackContent
    }
    try {
      const llmCfg = st.llmConfig || {}
      const res = await requestLgdAgentTurn({
        agent_id: agent.id,
        topic: st.topic || DEFAULT_TOPIC,
        material: st.material || DEFAULT_MATERIAL,
        phase: phaseName,
        transcript: buildTranscriptFromMessages(st.messages),
        script_id: st.scriptId || roomMetaRef.current.scriptId || 'standard_flow',
        memory_enabled: st.memoryEnabled ?? true,
        turn_index: turnIdx,
        api_key: llmCfg.apiKey || undefined,
        base_url: llmCfg.baseUrl || undefined,
        model: llmCfg.model || undefined,
      })
      if (res && res.content) {
        setLastSandboxMeta(res)
        return res.content
      }
    } catch {
      /* fallback to local script */
    }
    setLastSandboxMeta({
      sandbox_id: `sbx-${agent.seat || ''}号-${agent.id}`,
      seat_number: agent.seat,
      context_limit: agent.contextLimit || 4,
      script_badge: getScriptById(st.scriptId).badge,
      engine_source: 'local_sandbox_fallback',
    })
    return fallbackContent
  }

  async function finalizeLgdSession() {
    if (finalizedRef.current) return
    finalizedRef.current = true
    turnEpochRef.current += 1
    const lgdState = useLgdStore.getState()
    const transcript = buildTranscriptFromMessages(lgdState.messages)
    const role = roomMetaRef.current.userRole || userRole
    let scorePayload = null
    try {
      scorePayload = await scoreLgd({
        transcript,
        user_role: role,
        participant_count: 8,
        user_was_reporter: role === 'reporter' && userSpokeInSummaryRef.current,
      })
    } catch {
      scorePayload = null
    }
    const metrics = scorePayload?.lgd_metrics
    const generatedScore = {
      overall: scorePayload?.score ?? metrics?.overall_score ?? null,
      expression: scorePayload?.dimensions?.expression,
      logic: scorePayload?.dimensions?.logic,
      teamwork: scorePayload?.dimensions?.teamwork,
      leadership: scorePayload?.dimensions?.leadership,
      feedback: metrics?.feedback || '评分为规则估算，仅供参考。',
      lgd_metrics: metrics,
    }
    useLgdStore.getState().setScore(generatedScore)
    if (metrics) {
      useLgdStore.getState().setLgdMetrics(metrics)
      trackResearchEvent('lgd.metrics', {
        room_id: roomMetaRef.current.roomId,
        spoke: metrics.spoke,
        overall_score: metrics.overall_score,
      })
    }

    // Persist weakness dimensions & training setup into Memory Mode
    if (lgdState.memoryEnabled) {
      const weakDims = []
      if (metrics?.talk_share?.status !== 'optimal') weakDims.push('talk_share')
      if ((metrics?.built_on_others?.count || 0) < 1) weakDims.push('built_on_others')
      if ((metrics?.progress?.count || 0) < 1) weakDims.push('progress')
      const memUpdate = {
        memory_enabled: true,
        last_topic: lgdState.topic || DEFAULT_TOPIC,
        user_role: role,
        script_id: lgdState.scriptId || 'standard_flow',
        api_mode: lgdState.apiMode || 'hybrid_sandbox',
        weak_dimensions: weakDims,
        last_score: generatedScore.overall,
        notes: lgdState.notes || '',
      }
      lgdState.updateMemorySnapshot(memUpdate)
      saveLgdMemory(memUpdate).catch(() => {})
    }

    const dimensions = {
      expression: generatedScore.expression,
      logic: generatedScore.logic,
      leadership: generatedScore.leadership,
      teamwork: generatedScore.teamwork,
    }
    recordAndComplete({
      type: 'lgd',
      topic: lgdState.topic || 'LGD 群面讨论',
      score: generatedScore.overall,
      durationMinutes: Math.max(1, Math.floor((Date.now() - startTimeRef.current) / 60000)),
      dimensions,
      messages: transcript,
      transcript,
      metadata: {
        room_id: roomId,
        user_role: role,
        script_id: lgdState.scriptId,
        topic_type: roomMetaRef.current.topicType,
        user_was_reporter: role === 'reporter' && userSpokeInSummaryRef.current,
        participant_count: 8,
        lgd_metrics: metrics,
        lgd_timeline: metrics?.timeline,
      },
    })
      .then((session) => {
        if (session?.id) {
          setCompletedSessionId(session.id)
          setShowResearchFollowup(true)
        }
      })
      .catch((err) => {
        showToast(getErrorMessage(err, '保存 LGD 练习结果失败'), 'error')
      })
    useLgdStore.getState().setPhase('completed')
  }

  /* ---- Personal statement (Werewolf-style sequential order, 1 min each) ---- */
  function runPersonalStatementSimulation() {
    function speakNext() {
      if (!mountedRef.current) return
      const state = useLgdStore.getState()
      if (state.phase !== 'personal_statement') return
      const activeScript = getScriptById(state.scriptId)
      const order = activeScript.turnOrder || STATEMENT_ORDER
      if (statementIndexRef.current >= order.length) {
        advancePhase('personal_statement')
        return
      }
      const seatId = order[statementIndexRef.current]
      if (seatId === 'user') {
        useLgdStore.getState().setCurrentSpeaker('user')
        useLgdStore.getState().grabMic()
        const finishUserTurn = () => {
          if (!mountedRef.current) return
          const st = useLgdStore.getState()
          if (st.phase !== 'personal_statement') return
          clearTimeout(simulationRef.current)
          advanceUserStatementRef.current = null
          if (st.micGranted) st.releaseMic()
          st.setCurrentSpeaker(null)
          statementIndexRef.current += 1
          simulationRef.current = setTimeout(speakNext, 700)
        }
        advanceUserStatementRef.current = finishUserTurn
        simulationRef.current = setTimeout(finishUserTurn, 60000)
        return
      }

      const agent = agentById(seatId)
      const pool = RESPONSES.personal_statement[seatId] || []
      const idx = getResponseIndex(seatId, 'personal_statement')
      const fallbackContent = pool[idx % pool.length]
      if (!agent || !fallbackContent) {
        statementIndexRef.current += 1
        simulationRef.current = setTimeout(speakNext, 400)
        return
      }

      const turnEpoch = turnEpochRef.current
      setTypingAgent(agent)
      state.setCurrentSpeaker(agent.id)
      simulationRef.current = setTimeout(async () => {
        if (!mountedRef.current || turnEpochRef.current !== turnEpoch || useLgdStore.getState().phase !== 'personal_statement') return
        const content = await resolveSandboxAgentLine(agent, 'personal_statement', fallbackContent, idx)
        if (!mountedRef.current || turnEpochRef.current !== turnEpoch || useLgdStore.getState().phase !== 'personal_statement') return
        setTypingAgent(null)
        deliverAgentLine(agent, content, () => {
          if (!mountedRef.current || turnEpochRef.current !== turnEpoch || useLgdStore.getState().phase !== 'personal_statement') return
          useLgdStore.getState().setCurrentSpeaker(null)
          statementIndexRef.current += 1
          simulationRef.current = setTimeout(speakNext, 900)
        }, { interruption: agent.behavior === 'interrupt', sandbox: `${agent.seat}号沙箱` })
      }, 950)
    }

    simulationRef.current = setTimeout(speakNext, 1200)
  }

  /* ---- Free Discussion Phase ---- */
  function runFreeDiscussionSimulation() {
    function scheduleNext() {
      if (!mountedRef.current) return
      const state = useLgdStore.getState()
      if (state.phase !== 'free_discussion') return
      if (state.micGranted) {
        simulationRef.current = setTimeout(scheduleNext, 2000)
        return
      }

      const delay = 2600 + Math.random() * 2400
      simulationRef.current = setTimeout(() => {
        if (!mountedRef.current) return
        const st = useLgdStore.getState()
        if (st.phase !== 'free_discussion' || st.micGranted) {
          scheduleNext()
          return
        }

        const agent = pickAgentForFreeDiscussion(st.scriptId)
        const pool = RESPONSES.free_discussion[agent.id] || []
        const idx = getResponseIndex(agent.id, 'free_discussion')
        const fallbackContent = pool[idx % pool.length]

        if (!fallbackContent) {
          scheduleNext()
          return
        }

        const turnEpoch = turnEpochRef.current
        setTypingAgent(agent)
        st.setCurrentSpeaker(agent.id)

        simulationRef.current = setTimeout(async () => {
          const cur = useLgdStore.getState()
          if (!mountedRef.current || turnEpochRef.current !== turnEpoch || cur.phase !== 'free_discussion' || cur.micGranted) return
          const content = await resolveSandboxAgentLine(agent, 'free_discussion', fallbackContent, idx)
          const after = useLgdStore.getState()
          if (!mountedRef.current || turnEpochRef.current !== turnEpoch || after.phase !== 'free_discussion' || after.micGranted) return
          setTypingAgent(null)
          deliverAgentLine(agent, content, () => {
            if (!mountedRef.current || turnEpochRef.current !== turnEpoch || useLgdStore.getState().phase !== 'free_discussion') return
            useLgdStore.getState().setCurrentSpeaker(null)
            scheduleNext()
          }, { interruption: agent.behavior === 'interrupt', sandbox: `${agent.seat}号沙箱` })
        }, 1000)
      }, delay)
    }

    simulationRef.current = setTimeout(scheduleNext, 1800)
  }

  function runSummaryReportSimulation() {
    const role = roomMetaRef.current.userRole || userRole
    if (role === 'reporter') {
      useLgdStore.getState().setCurrentSpeaker('user')
      useLgdStore.getState().grabMic()
      useLgdStore.getState().addMessage({
        senderId: 'system',
        senderName: '系统',
        senderRole: '',
        content: '你是本组汇报人，请在 3 分钟内总结：小组结论、主要理由与仍存分歧。',
        isUser: false,
        isSystem: true,
        phase: 'summary_report',
      })
      simulationRef.current = setTimeout(() => {
        if (!mountedRef.current) return
        finalizeLgdSession()
      }, 180000)
      return
    }

    const reporterAgent = AGENTS.find((a) => a.id === 'logician') || AGENTS[0]
    const pool = RESPONSES.summary_report[reporterAgent.id] || []
    const fallbackContent = pool[0]
    const turnEpoch = turnEpochRef.current
    setTypingAgent(reporterAgent)
    useLgdStore.getState().setCurrentSpeaker(reporterAgent.id)
    simulationRef.current = setTimeout(async () => {
      if (!mountedRef.current || turnEpochRef.current !== turnEpoch || useLgdStore.getState().phase !== 'summary_report') return
      const content = await resolveSandboxAgentLine(reporterAgent, 'summary_report', fallbackContent, 0)
      if (!mountedRef.current || turnEpochRef.current !== turnEpoch || useLgdStore.getState().phase !== 'summary_report') return
      setTypingAgent(null)
      deliverAgentLine(
        reporterAgent,
        content,
        () => {
          if (!mountedRef.current || turnEpochRef.current !== turnEpoch || useLgdStore.getState().phase !== 'summary_report') return
          useLgdStore.getState().setCurrentSpeaker(null)
          finalizeLgdSession()
        },
        { summary: true, sandbox: `${reporterAgent.seat}号沙箱` },
      )
    }, 1200)
  }

  function stopAgentSpeech() {
    turnEpochRef.current += 1
    stopTts()
    clearInterval(typewriterRef.current)
    setDisplayingMessage(null)
    setTypingAgent(null)
    useLgdStore.getState().setCurrentSpeaker(null)
  }

  function agentTtsProfile(agent) {
    const idx = AGENTS.findIndex((a) => a.id === agent.id)
    return agentTtsProfilesRef.current[idx] || { voiceURI: null, pitch: 1, rate: 1.05 }
  }

  function deliverAgentLine(agent, fullContent, onComplete, meta = null) {
    const ttsOn = effectiveTtsEnabled && ttsSupported
    setSpokenCaptionText(fullContent)
    setCaptionSentenceIndex(0)
    setCaptionSpeaking(ttsOn)
    typewriteMessage(agent, fullContent, ttsOn ? null : onComplete, meta)
    if (!ttsOn) {
      setCaptionSpeaking(false)
      return
    }
    const profile = agentTtsProfile(agent)
    speakTts(fullContent, {
      enqueue: true,
      voiceURI: profile.voiceURI,
      pitch: profile.pitch,
      rate: profile.rate,
      onChunkStart: (index) => setCaptionSentenceIndex(index),
      onend: () => {
        setCaptionSpeaking(false)
        onComplete?.()
      },
    })
  }

  /* ---- Typewriter effect ---- */
  function typewriteMessage(agent, fullContent, onComplete, meta = null) {
    let charIndex = 0
    const partialMsg = {
      senderId: agent.id,
      senderName: agent.name,
      senderRole: agent.role,
      content: '',
      isUser: false,
    }

    setDisplayingMessage({ ...partialMsg, emoji: agent.emoji, color: agent.color })

    typewriterRef.current = setInterval(() => {
      if (!mountedRef.current) {
        clearInterval(typewriterRef.current)
        return
      }
      charIndex++
      if (charIndex >= fullContent.length) {
        clearInterval(typewriterRef.current)
        setDisplayingMessage(null)

        const state = useLgdStore.getState()
        state.addMessage({ ...partialMsg, content: fullContent, meta: meta || undefined })
        state.incrementAgentSpeakCount(agent.id)

        if (onComplete) onComplete()
      } else {
        setDisplayingMessage((prev) =>
          prev ? { ...prev, content: fullContent.slice(0, charIndex) } : null,
        )
      }
    }, 35)
  }

  /* ---- Response index tracker ---- */
  function getResponseIndex(agentId, phaseName) {
    const key = `${agentId}_${phaseName}`
    const current = responseIndexRef.current[key] || 0
    responseIndexRef.current[key] = current + 1
    return current
  }

  /* ---- Phase announcements ---- */
  function getPhaseAnnouncement(p) {
    const map = {
      personal_statement: '个人陈述开始：按顺序发言，每人限时 1 分钟',
      free_discussion: '自由讨论开始，可抢麦发言（含抢话者/跑题者脚本）',
      summary_report: '总结汇报开始：汇报人 3 分钟代表小组陈述',
      completed: '讨论结束，正在生成评分报告…',
    }
    return map[p] || ''
  }

  /* ---- User actions ---- */
  function handleSend() {
    const text = inputValue.trim()
    if (!text) return

    stopAgentSpeech()

    const st = useLgdStore.getState()
    if (st.phase === 'summary_report') {
      userSpokeInSummaryRef.current = true
    }
    st.addMessage({
      senderId: 'user',
      senderName: '你',
      senderRole: ROLE_LABELS[roomMetaRef.current.userRole || userRole] || '成员',
      content: text,
      isUser: true,
      meta:
        st.phase === 'summary_report'
          ? { summary: true, sandbox: '4号玩家' }
          : { sandbox: '4号玩家' },
    })

    setInputValue('')
    if (useLgdStore.getState().micGranted) {
      useLgdStore.getState().releaseMic()
    }
    if (st.phase === 'personal_statement' && typeof advanceUserStatementRef.current === 'function') {
      const nextStep = advanceUserStatementRef.current
      advanceUserStatementRef.current = null
      nextStep()
    }
    if (inputRef.current) inputRef.current.focus()
  }

  function handleKeyDown(e) {
    if (keyboardShortcutsEnabled) {
      if ((e.key === ' ' || e.code === 'Space') && !e.shiftKey) {
        e.preventDefault()
      }
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleGrabMic() {
    const state = useLgdStore.getState()
    if (state.micGranted) {
      state.releaseMic()
    } else {
      stopAgentSpeech()
      state.grabMic()
      if (inputRef.current) inputRef.current.focus()
    }
  }

  /* ---- Seat positions ---- */
  function getSeatPositions() {
    const userProfile = {
      id: 'user',
      seat: 4,
      name: '你',
      role: ROLE_LABELS[roomMetaRef.current.userRole || userRole] || '成员',
      color: '#9b6fc7',
      emoji: '👤',
    }
    const allSeats = [...AGENTS, userProfile].sort((a, b) => (a.seat || 99) - (b.seat || 99))
    const total = allSeats.length
    const radius = 155
    const cx = 190
    const cy = 190

    return allSeats.map((seat, i) => {
      const angle = (2 * Math.PI * i) / total - Math.PI / 2
      return {
        ...seat,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        angleDeg: (Math.atan2(radius * Math.sin(angle), radius * Math.cos(angle)) * 180) / Math.PI,
      }
    })
  }

  const seatPositions = getSeatPositions()

  /* ---- Find agent ---- */
  function findAgent(id) {
    if (id === 'user') {
      return {
        id: 'user',
        seat: 4,
        name: '你',
        role: ROLE_LABELS[roomMetaRef.current.userRole || userRole] || '成员',
        color: '#9b6fc7',
        emoji: '👤',
      }
    }
    return agentById(id)
  }

  /* ---- Phase index ---- */
  const phaseIndex = PHASES.findIndex((p) => p.key === phase)
  const canInteract =
    phase === 'personal_statement' || phase === 'free_discussion' || phase === 'summary_report'
  const activeScript = getScriptById(scriptId)

  const readingCaptionText =
    phase === 'reading' && topic
      ? [topic, material].filter(Boolean).join('\n\n')
      : spokenCaptionText

  useRoomKeyboardShortcuts({
    enabled: keyboardShortcutsEnabled && canInteract,
    onToggleMic: handleGrabMic,
    onSubmit: handleSend,
    canToggleMic: () => canInteract,
    canSubmit: () => canInteract && micGranted && Boolean(inputValue.trim()),
  })

  /* ============================================
     RENDER
     ============================================ */
  return (
    <div className={styles['lgd-room']}>
      <div className="sr-only" aria-live="polite">
        {phaseCountdownAnnounce}
      </div>
      {/* Single Unified Top Status Bar */}
      <div className={styles['phase-bar']}>
        <div className={styles['phase-indicator']}>
          {PHASES.map((p, i) => (
            <div
              key={p.key}
              className={`${styles['phase-step']} ${i === phaseIndex ? styles.active : ''} ${i < phaseIndex ? styles.completed : ''}`}
              title={p.label}
            />
          ))}
        </div>
        <span className={styles['phase-label']}>
          {PHASES[phaseIndex]?.label || phase}
        </span>
        <span className={styles['sandbox-pill']}>{activeScript.badge}</span>
        <span
          className={`${styles.timer} ${remainingSeconds < 60 && remainingSeconds > 0 ? styles.urgent : ''}`}
          aria-hidden="true"
        >
          {formatTime(remainingSeconds)}
        </span>
        {phase !== 'reading' && phase !== 'completed' && (
          <button
            type="button"
            className={styles['material-reopen-btn']}
            onClick={() => setShowMaterialModal(true)}
            aria-label="打开讨论材料"
          >
            材料
          </button>
        )}
        <button
          type="button"
          className={styles['keyboard-help-btn']}
          onClick={() => setShowKeyboardHelp(true)}
          aria-label="键盘快捷键说明"
        >
          快捷键
        </button>
      </div>

      {/* Main Area */}
      <div className={styles['main-area']}>
        {/* Roundtable */}
        <div className={styles['roundtable-panel']}>
          <div className={styles['roundtable-container']}>
            <div className={styles['table-center']}>
              <div className={styles['table-center-label']}>8人圆桌</div>
            </div>

            {seatPositions.map((seat) => {
              const dx = seat.x - 190
              const dy = seat.y - 190
              const lineAngle = (Math.atan2(dy, dx) * 180) / Math.PI
              return (
                <div
                  key={`line-${seat.id}`}
                  className={styles['table-line']}
                  style={{ transform: `rotate(${lineAngle}deg)` }}
                />
              )
            })}

            {seatPositions.map((seat) => {
              const isActive = currentSpeaker === seat.id
              const isUser = seat.id === 'user'
              const isSpeaking = isActive

              return (
                <div
                  key={seat.id}
                  className={`${styles.seat} ${isActive ? styles.active : ''} ${isUser ? styles['user-seat'] : ''} ${isSpeaking ? styles.speaking : ''}`}
                  style={{
                    left: `${seat.x}px`,
                    top: `${seat.y}px`,
                    borderColor: seat.color,
                  }}
                >
                  <div
                    className={styles['seat-inner']}
                    style={{ borderColor: isActive ? seat.color : undefined }}
                  >
                    <span className={styles['seat-emoji']}>{seat.emoji}</span>
                    <span className={styles['seat-name']}>
                      {seat.seat}号·{seat.name}
                    </span>
                  </div>
                  <span
                    className={styles['seat-role']}
                    style={{
                      borderColor: isActive ? seat.color : undefined,
                      color: isActive ? seat.color : undefined,
                    }}
                  >
                    {seat.role}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Chat Panel */}
        <div className={styles['chat-panel']}>
          <div className={styles['chat-header']}>
            <span className={styles['chat-title']}>{topic || '群面讨论'}</span>
            <span className={styles['chat-count']}>{messages.length} 条</span>
          </div>

          {captionsEnabled && (readingCaptionText || spokenCaptionText) && (
            <InterviewerCaptions
              text={phase === 'reading' ? readingCaptionText : spokenCaptionText}
              activeSentenceIndex={captionSentenceIndex}
              speaking={(captionSpeaking || isSpeaking) && effectiveTtsEnabled && phase !== 'reading'}
              className={styles['lgd-captions']}
            />
          )}

          <div className={styles['chat-stream']} ref={chatRef}>
            {messages.length === 0 && (
              <div className={styles['system-message']}>等待发言</div>
            )}
            {messages.map((msg) => {
              if (msg.isSystem) {
                return (
                  <div key={msg.id} className={styles['system-message']}>
                    {msg.content}
                  </div>
                )
              }

              const agent = findAgent(msg.senderId)
              return (
                <div
                  key={msg.id}
                  className={`${styles.message} ${msg.isUser ? styles['user-message'] : ''}`}
                >
                  <div className={styles['msg-avatar']} style={{ borderColor: agent?.color }}>
                    {agent?.emoji || '?'}
                  </div>
                  <div className={styles['msg-body']}>
                    <div className={styles['msg-header']}>
                      <span className={styles['msg-name']}>
                        {agent?.seat ? `${agent.seat}号·` : ''}
                        {msg.senderName}
                      </span>
                      <span
                        className={styles['msg-role-badge']}
                        style={{ color: agent?.color, borderColor: agent?.color }}
                      >
                        {msg.senderRole}
                      </span>
                    </div>
                    <div className={styles['msg-content']}>{msg.content}</div>
                  </div>
                </div>
              )
            })}

            {displayingMessage && (
              <div className={styles.message}>
                <div className={styles['msg-avatar']} style={{ borderColor: displayingMessage.color }}>
                  {displayingMessage.emoji}
                </div>
                <div className={styles['msg-body']}>
                  <div className={styles['msg-header']}>
                    <span className={styles['msg-name']}>{displayingMessage.senderName}</span>
                    <span
                      className={styles['msg-role-badge']}
                      style={{ color: displayingMessage.color, borderColor: displayingMessage.color }}
                    >
                      {displayingMessage.senderRole}
                    </span>
                  </div>
                  <div className={styles['msg-content']}>
                    {displayingMessage.content}
                    <span style={{ opacity: 0.4 }}>|</span>
                  </div>
                </div>
              </div>
            )}

            {typingAgent && !displayingMessage && (
              <div className={styles['typing-indicator']}>
                <div className={styles['typing-avatar']} style={{ borderColor: typingAgent.color }}>
                  {typingAgent.emoji}
                </div>
                <div className={styles['typing-dots']}>
                  <span />
                  <span />
                  <span />
                </div>
                <span className={styles['typing-name']}>
                  {typingAgent.seat}号·{typingAgent.name} 发言中...
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className={styles['controls-bar']}>
        <div className={styles['controls-actions']}>
          <button
            type="button"
            className={`${styles['hw-btn']} ${styles['mic-btn']} ${micGranted ? styles.granted : ''}`}
            onClick={handleGrabMic}
            disabled={!canInteract}
            aria-label={micGranted ? '释放麦克风' : '抢麦发言'}
          >
            <span className={styles['hw-btn-well']}>
              <span className={styles['hw-btn-cap']}>
                {micGranted ? '🔊' : '🎤'}
                <span className={styles['hw-btn-label']}>
                  {micGranted ? '释放' : '抢麦'}
                </span>
              </span>
            </span>
          </button>

          <button
            type="button"
            className={`${styles['hw-btn']} ${styles['hand-btn']}`}
            onClick={() => setHandRaised(!handRaised)}
            disabled={!canInteract}
            aria-label={handRaised ? '取消举手' : '举手示意'}
          >
            <span className={styles['hw-btn-well']}>
              <span className={styles['hw-btn-cap']}>
                {handRaised ? '🙋' : '✋'}
                <span className={styles['hw-btn-label']}>
                  {handRaised ? '已举手' : '举手'}
                </span>
              </span>
            </span>
          </button>

          <button
            type="button"
            className={`${styles['hw-btn']} ${styles['note-btn']}`}
            onClick={() => setShowNotesModal(true)}
            aria-label="打开讨论笔记"
          >
            <span className={styles['hw-btn-well']}>
              <span className={styles['hw-btn-cap']}>
                📝
                <span className={styles['hw-btn-label']}>笔记</span>
              </span>
            </span>
          </button>

          <button
            type="button"
            className={`${styles['hw-btn']} ${styles['exit-btn']}`}
            onClick={() => navigate('/lgd/lobby')}
            aria-label="退出群面房间"
          >
            <span className={styles['hw-btn-well']}>
              <span className={styles['hw-btn-cap']}>
                🚪
                <span className={styles['hw-btn-label']}>退出</span>
              </span>
            </span>
          </button>
        </div>

        <div className={styles['input-row']}>
          <input
            ref={inputRef}
            type="text"
            className={styles['message-input']}
            placeholder={
              micGranted
                ? '输入发言内容...'
                : canInteract
                  ? '点击「抢麦」后输入发言...'
                  : '当前阶段不可发言'
            }
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!micGranted}
          />
          <button
            type="button"
            className={styles['send-btn']}
            onClick={handleSend}
            disabled={!micGranted || !inputValue.trim()}
            aria-label="发送发言"
          >
            发送
          </button>
        </div>
      </div>

      {/* Reading Phase Overlay */}
      {phase === 'reading' && (
        <div className={styles['reading-overlay']}>
          <div className={styles['reading-card']}>
            <div className={styles['reading-topic']}>{topic}</div>
            <div className={styles['reading-material']}>{material}</div>
            <div className={styles['reading-footer']}>
              <span className={styles['reading-timer']}>{formatTime(remainingSeconds)}</span>
              <button
                type="button"
                className={styles['reading-start-btn']}
                onClick={() => advancePhase('reading')}
                aria-label="进入发言阶段"
              >
                进入发言
              </button>
            </div>
          </div>
        </div>
      )}

      {showMaterialModal && (
        <div
          className={styles['material-modal-overlay']}
          role="dialog"
          aria-modal="true"
          aria-label="讨论材料"
          onClick={(e) => e.target === e.currentTarget && setShowMaterialModal(false)}
        >
          <div className={styles['material-modal']}>
            <div className={styles['material-modal-head']}>
              <h2>讨论材料</h2>
              <button type="button" className={styles['material-modal-close']} onClick={() => setShowMaterialModal(false)}>
                关闭
              </button>
            </div>
            <div className={styles['material-modal-topic']}>{topic}</div>
            <div className={styles['material-modal-body']}>{material}</div>
          </div>
        </div>
      )}

      {showNotesModal && (
        <div
          className={styles['material-modal-overlay']}
          role="dialog"
          aria-modal="true"
          aria-label="讨论笔记"
          onClick={(e) => e.target === e.currentTarget && setShowNotesModal(false)}
        >
          <div className={styles['material-modal']}>
            <div className={styles['material-modal-head']}>
              <h2>讨论笔记</h2>
              <button type="button" className={styles['material-modal-close']} onClick={() => setShowNotesModal(false)}>
                完成
              </button>
            </div>
            <div className={styles['notes-modal-body']}>
              <textarea
                className={styles['notes-textarea']}
                rows={8}
                placeholder="记录要点与框架..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Summary / Completed Overlay */}
      {showResearchFollowup && completedSessionId && (
        <ResearchFollowupCard
          sessionId={completedSessionId}
          onDone={() => setShowResearchFollowup(false)}
        />
      )}

      <KeyboardShortcutsHelp open={showKeyboardHelp} onClose={() => setShowKeyboardHelp(false)} />

      {phase === 'completed' && score && (
        <div className={styles['summary-overlay']}>
          <div className={styles['summary-card']}>
            <div className={styles['summary-title']}>群面评分</div>
            <div className={styles['score-grid']}>
              <div className={styles['score-item']}>
                <div className={styles['score-value']}>{score.overall ?? '—'}</div>
                <div className={styles['score-label']}>综合评分</div>
              </div>
              <div className={styles['score-item']}>
                <div className={styles['score-value']}>
                  {lgdMetrics?.talk_share?.display ?? (lgdMetrics?.spoke === false ? '未发言' : score.expression ?? '—')}
                </div>
                <div className={styles['score-label']}>发言占比</div>
              </div>
              <div className={styles['score-item']}>
                <div className={styles['score-value']}>
                  {lgdMetrics?.built_on_others?.display ?? (lgdMetrics?.spoke === false ? '未发言' : '—')}
                </div>
                <div className={styles['score-label']}>承接观点</div>
              </div>
              <div className={styles['score-item']}>
                <div className={styles['score-value']}>
                  {lgdMetrics?.progress?.display ?? (lgdMetrics?.spoke === false ? '未发言' : '—')}
                </div>
                <div className={styles['score-label']}>推进进度</div>
              </div>
            </div>
            <div className={styles['summary-feedback']}>{score.feedback}</div>
            <div className={styles['summary-actions']}>
              <button
                type="button"
                className={`${styles['hw-btn']} ${styles['note-btn']}`}
                onClick={() => navigate('/lgd/lobby')}
              >
                <span className={styles['hw-btn-well']}>
                  <span className={styles['hw-btn-cap']}>
                    🏠
                    <span className={styles['hw-btn-label']}>返回大厅</span>
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
