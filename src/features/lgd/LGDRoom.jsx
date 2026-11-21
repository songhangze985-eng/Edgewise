import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import useLgdStore from '../../stores/lgdStore'
import useSessionStore from '../../stores/sessionStore'
import {
  getRoom,
  scoreLgd,
  requestLgdAgentTurn,
  saveLgdMemory,
  saveLgdHandoffReport,
  streamLgdAcpTurn,
  sendLgdRoomSignal,
  requestLgdObserverTag,
} from '../../api/lgd'
import {
  saveLgdReportHandoff,
  synthesizeLgdReportFromSession,
} from '../../utils/singleInterviewTaxonomy'
import { getErrorMessage } from '../../api/client'
import { showToast } from '../../stores/toastStore'
import ResearchFollowupCard from '../../components/ResearchFollowupCard/ResearchFollowupCard'
import useTTS from '../../hooks/useTTS'
import useSettingsStore from '../../stores/settingsStore'
import useAuthStore from '../../stores/authStore'
import { getArmForcedTtsEnabled } from '../../config/tts'
import { buildAgentTtsProfiles, computePsycholinguisticSpeechTempo } from '../../utils/lgdAgentTts'
import { trackResearchEvent } from '../../research/track'
import KeyboardShortcutsHelp from '../../components/a11y/KeyboardShortcutsHelp'
import { useCountdownAnnouncer } from '../../hooks/useCountdownAnnouncer'
import { useRoomKeyboardShortcuts } from '../../hooks/useRoomKeyboardShortcuts'
import { createBrowserSpeechRecognizer, isBrowserSttSupported } from '../../api/stt'
import {
  AGENTS,
  CLAIMABLE_IDENTITIES,
  DEFAULT_MATERIAL,
  DEFAULT_TOPIC,
  LGD_SCAFFOLD_LEVELS,
  PHASE_DEFS,
  RESPONSES,
  agentById,
  buildExaminerFollowupPrompts,
  buildLocalReadingWarmupStances,
  computeFreeDiscussionGoldenStage,
  computeLiveProgressiveSummary,
  computeLocalUrgencyBids,
  evaluateLocalObserverTags,
  getIdentityMeta,
  getOrderedStatementTurnIds,
  getScriptById,
  getTacticalCuesForContext,
  inferAgentClaimedIdentity,
  mapIdentityToScorerRole,
  resolveParticipantSeat,
} from './lgdScripts'
import {
  VISUAL_MODEL_META,
  buildSummaryCueItems,
  extractPrimaryConclusions,
  serializeBoardForPrompt,
} from './visualBoardModels'
import RoundtableCanvas from './components/RoundtableCanvas'
import RoomSlideDrawers from './components/RoomSlideDrawers'
import VisualBoardSheet from './components/VisualBoardSheet'
import styles from './LGDRoom.module.css'

const PHASES = PHASE_DEFS

const PHASE_SHORT_LABELS = {
  reading: '审题',
  personal_statement: '按序发言',
  free_discussion: '自由抢答',
  summary_report: '总结汇报',
  examiner_followup: '考官追问',
}

export default function LGDRoom() {
  const navigate = useNavigate()
  const { id: roomId } = useParams()
  const recordAndComplete = useSessionStore((s) => s.recordAndComplete)

  const phase = useLgdStore((s) => s.phase)
  const phasePlan = useLgdStore((s) => s.phasePlan)
  const topic = useLgdStore((s) => s.topic)
  const material = useLgdStore((s) => s.material)
  const messages = useLgdStore((s) => s.messages)
  const currentSpeaker = useLgdStore((s) => s.currentSpeaker)
  const remainingSeconds = useLgdStore((s) => s.remainingSeconds)
  const micGranted = useLgdStore((s) => s.micGranted)
  const score = useLgdStore((s) => s.score)
  const userRole = useLgdStore((s) => s.userRole)
  const notes = useLgdStore((s) => s.notes)
  const setNotes = useLgdStore((s) => s.setNotes)
  const setLastSandboxMeta = useLgdStore((s) => s.setLastSandboxMeta)
  const lgdMetrics = useLgdStore((s) => s.lgdMetrics)
  const seatStates = useLgdStore((s) => s.seatStates)
  const seatThoughts = useLgdStore((s) => s.seatThoughts)
  const typingLockActive = useLgdStore((s) => s.typingLockActive)
  const observerTags = useLgdStore((s) => s.observerTags)
  const userSpeakCount = useLgdStore((s) => s.userSpeakCount)
  const agentSpeakCounts = useLgdStore((s) => s.agentSpeakCounts)
  const seatDrawDone = useLgdStore((s) => s.seatDrawDone)
  const identityMode = useLgdStore((s) => s.identityMode)
  const seatMap = useLgdStore((s) => s.seatMap)
  const userSeat = useLgdStore((s) => s.userSeat)
  const participantRoles = useLgdStore((s) => s.participantRoles)
  const speakerQueue = useLgdStore((s) => s.speakerQueue)
  const visualBoard = useLgdStore((s) => s.visualBoard)
  const boardAuthorized = useLgdStore((s) => s.boardAuthorized)
  const boardAlignmentCount = useLgdStore((s) => s.boardAlignmentCount)
  const highlightedBoardNode = useLgdStore((s) => s.highlightedBoardNode)
  const advancementQuota = useLgdStore((s) => s.advancementQuota)

  const inputRef = useRef(null)
  const simulationRef = useRef(null)
  const timerRef = useRef(null)
  const typewriterRef = useRef(null)
  const mountedRef = useRef(true)
  const activeAbortRef = useRef(null)
  const typingLockTimerRef = useRef(null)
  const typingSignalThrottleRef = useRef(0)
  const interruptedClearTimerRef = useRef(null)
  const biddingBadgeTimerRef = useRef(null)
  const activeStreamAgentRef = useRef(null)
  const resumeFreeDiscussionRef = useRef(null)
  const shuffleAnimTimerRef = useRef(null)
  const buzzWindowTimerRef = useRef(null)
  const utteranceDecayTimerRef = useRef(null)
  const sttRef = useRef(null)
  const handYieldTimerRef = useRef(null)
  const responseIndexRef = useRef({})
  const startTimeRef = useRef(Date.now())
  const agentTtsProfilesRef = useRef([])
  const roomMetaRef = useRef({
    userRole: 'undetermined',
    roleMode: 'undetermined',
    pickedRole: 'member',
    topicType: null,
    roomId: null,
    scriptId: 'standard_flow',
    memoryEnabled: true,
    apiMode: 'hybrid_sandbox',
  })
  const statementOrderRef = useRef([])
  const statementIndexRef = useRef(0)
  const advanceUserStatementRef = useRef(null)
  const userSpokeInSummaryRef = useRef(false)
  const pendingUserRoleAnnouncementRef = useRef(null)
  const followupRoundHandlerRef = useRef(null)
  const scribeWarnedRef = useRef(false)
  const assistTagLoggedRef = useRef(false)
  const finalizedRef = useRef(false)
  const turnEpochRef = useRef(0)

  const [inputValue, setInputValue] = useState('')
  const [displayingMessage, setDisplayingMessage] = useState(null)
  const [recentUtterance, setRecentUtterance] = useState(null)
  const [handRaised, setHandRaised] = useState(false)
  const [completedSessionId, setCompletedSessionId] = useState(null)
  const [showResearchFollowup, setShowResearchFollowup] = useState(false)
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false)
  const [openDrawer, setOpenDrawer] = useState(null)
  const [readingCollapsed, setReadingCollapsed] = useState(false)
  const [activeDockMenu, setActiveDockMenu] = useState(null)
  const [isShufflingSeats, setIsShufflingSeats] = useState(false)
  const [buzzWindowActive, setBuzzWindowActive] = useState(false)
  const [shockwaveTick, setShockwaveTick] = useState(0)
  const [completedStatementIds, setCompletedStatementIds] = useState([])
  const [scaffoldLevel, setScaffoldLevel] = useState('keywords')
  const [electedReporterId, setElectedReporterId] = useState(null)
  const [isVoiceListening, setIsVoiceListening] = useState(false)

  const ttsEnabledSetting = useSettingsStore((s) => s.ttsEnabled)
  const keyboardShortcutsEnabled = useSettingsStore((s) => s.keyboardShortcutsEnabled)
  const experimentAssignment = useAuthStore((s) => s.user?.experimentAssignment)
  const effectiveTtsEnabled = getArmForcedTtsEnabled(experimentAssignment) ?? ttsEnabledSetting
  const { speak: speakTts, stop: stopTts, supported: ttsSupported } = useTTS()
  const phaseCountdownAnnounce = useCountdownAnnouncer(remainingSeconds, {
    enabled: seatDrawDone && phase !== 'completed' && phase !== 'lobby',
    label: '阶段剩余',
  })

  useEffect(() => {
    agentTtsProfilesRef.current = buildAgentTtsProfiles(AGENTS.length)
  }, [])

  function showStageUtterance(payload, holdMs = 2400) {
    clearTimeout(utteranceDecayTimerRef.current)
    setRecentUtterance(payload)
    utteranceDecayTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setRecentUtterance(null)
    }, holdMs)
  }

  function triggerBuzzWindow(durationMs = 1600) {
    clearTimeout(buzzWindowTimerRef.current)
    setBuzzWindowActive(true)
    buzzWindowTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setBuzzWindowActive(false)
    }, durationMs)
  }

  /* ---- Initialize room on mount (on-table seat shuffle, zero modal clutter) ---- */
  useEffect(() => {
    mountedRef.current = true
    let cancelled = false

    async function boot() {
      const mem = useLgdStore.getState().memorySnapshot
      let nextTopic = mem?.last_topic || DEFAULT_TOPIC
      let nextMaterial = DEFAULT_MATERIAL
      let phases = []
      let role = mem?.user_role || 'undetermined'
      let roleMode = mem?.role_mode || 'undetermined'
      let topicType = null
      let nextScriptId = mem?.script_id || 'standard_flow'
      let nextMemoryEnabled = mem?.memory_enabled ?? true
      let nextApiMode = mem?.api_mode || 'hybrid_sandbox'
      let nextAdvancementQuota = mem?.advancement_quota || 3

      if (roomId && roomId !== 'new') {
        try {
          const room = await getRoom(roomId)
          if (!cancelled) {
            nextTopic = room.topic || nextTopic
            nextMaterial = room.material || nextMaterial
            phases = room.phases || []
            role = room.user_role || role
            roleMode = room.role_mode || (role === 'undetermined' ? 'undetermined' : roleMode)
            topicType = room.topic_type || null
            nextScriptId = room.script_id || nextScriptId
            nextMemoryEnabled = room.memory_enabled ?? nextMemoryEnabled
            nextApiMode = room.api_mode || nextApiMode
            nextAdvancementQuota = room.advancement_quota || nextAdvancementQuota
            roomMetaRef.current = {
              userRole: role,
              roleMode,
              pickedRole: role && role !== 'undetermined' ? role : 'member',
              topicType,
              roomId: room.id,
              scriptId: nextScriptId,
              memoryEnabled: nextMemoryEnabled,
              apiMode: nextApiMode,
              advancementQuota: nextAdvancementQuota,
            }
            trackResearchEvent('lgd.role', {
              room_id: room.id,
              user_role: role,
              role_mode: roleMode,
              topic_type: topicType,
            })
          }
        } catch {
          /* fallback to defaults */
        }
      }
      if (!cancelled) {
        const entryIdentityMode = roleMode === 'random' ? 'random' : 'undetermined'
        useLgdStore.getState().initRoom(nextTopic, nextMaterial, {
          phases,
          userRole: role,
          roleMode: entryIdentityMode,
          identityMode: entryIdentityMode,
          topicType,
          scriptId: nextScriptId,
          memoryEnabled: nextMemoryEnabled,
          apiMode: nextApiMode,
          advancementQuota: nextAdvancementQuota,
          skipSeatDraw: false,
        })
      }
    }
    boot()

    return () => {
      cancelled = true
      mountedRef.current = false
      if (activeAbortRef.current) {
        activeAbortRef.current.abort('unmount')
        activeAbortRef.current = null
      }
      stopTts()
      if (sttRef.current) {
        sttRef.current.stop()
        sttRef.current = null
      }
      clearTimeout(handYieldTimerRef.current)
      clearTimeout(typingLockTimerRef.current)
      clearTimeout(interruptedClearTimerRef.current)
      clearTimeout(biddingBadgeTimerRef.current)
      clearTimeout(shuffleAnimTimerRef.current)
      clearTimeout(buzzWindowTimerRef.current)
      clearTimeout(utteranceDecayTimerRef.current)
      clearInterval(timerRef.current)
      clearTimeout(simulationRef.current)
      clearInterval(typewriterRef.current)
      useLgdStore.getState().reset()
    }
  }, [roomId, stopTts])

  /* ---- Reading phase async ACP stance warmup ---- */
  useEffect(() => {
    if (phase !== 'reading' || !seatDrawDone) return
    const st = useLgdStore.getState()
    const activeTopic = topic || DEFAULT_TOPIC
    const localStances = buildLocalReadingWarmupStances(
      activeTopic,
      st.seatMap,
      st.identityMode,
      st.participantRoles,
    )
    const stateMap = {}
    localStances.forEach((item) => {
      stateMap[item.agent_id] = 'reading'
      st.setSeatThought(item.agent_id, item.thought)
    })
    st.setBulkSeatStates(stateMap)

    if (st.apiMode !== 'fast_script_only') {
      const targetRoomId = roomMetaRef.current.roomId || roomId || 'live'
      sendLgdRoomSignal(targetRoomId, {
        action: 'reading_warmup',
        holder: 'system',
        topic: activeTopic,
        material: material || DEFAULT_MATERIAL,
        seat_map: st.seatMap,
        identity_mode: st.identityMode,
        participant_roles: st.participantRoles,
        visual_board_summary: serializeBoardForPrompt(st.visualBoard, st.boardAuthorized),
      })
        .then((res) => {
          if (!mountedRef.current || useLgdStore.getState().phase !== 'reading') return
          if (Array.isArray(res?.stances)) {
            const nextStates = {}
            res.stances.forEach((item) => {
              nextStates[item.agent_id] = item.ui_state || 'reading'
              if (item.thought) {
                useLgdStore.getState().setSeatThought(item.agent_id, item.thought)
              }
            })
            useLgdStore.getState().setBulkSeatStates(nextStates)
          }
        })
        .catch(() => {})
    }
  }, [phase, seatDrawDone, topic, material, roomId])

  /* ---- Timer tick ---- */
  useEffect(() => {
    clearInterval(timerRef.current)
    if (!seatDrawDone || phase === 'lobby' || phase === 'completed') return

    timerRef.current = setInterval(() => {
      if (!mountedRef.current) return
      const state = useLgdStore.getState()
      if (state.remainingSeconds <= 1) {
        clearInterval(timerRef.current)
        if (state.phase === 'examiner_followup') {
          finalizeLgdSession()
        } else {
          advancePhase(state.phase)
        }
      } else {
        state.tick()
      }
    }, 1000)

    return () => clearInterval(timerRef.current)
  }, [phase, seatDrawDone])

  /* ---- Phase transition logic ---- */
  const advancePhase = useCallback(
    (currentPhase) => {
      if (!mountedRef.current) return
      const state = useLgdStore.getState()

      if (activeAbortRef.current) {
        activeAbortRef.current.abort('phase_transition')
        activeAbortRef.current = null
      }
      turnEpochRef.current += 1
      stopTts()
      clearTimeout(simulationRef.current)
      clearTimeout(typingLockTimerRef.current)
      clearTimeout(biddingBadgeTimerRef.current)
      clearTimeout(buzzWindowTimerRef.current)
      clearInterval(typewriterRef.current)
      setDisplayingMessage(null)
      setRecentUtterance(null)
      setBuzzWindowActive(false)
      state.setTypingLock(false)
      state.clearSeatThoughts()
      state.clearSpeakerQueue()
      const resetSeats = { user: 'listening' }
      AGENTS.forEach((ag) => {
        resetSeats[ag.id] = 'listening'
      })
      state.setBulkSeatStates(resetSeats)

      const transitions = {
        reading: 'personal_statement',
        personal_statement: 'free_discussion',
        free_discussion: 'summary_report',
        summary_report: 'examiner_followup',
        examiner_followup: 'completed',
      }

      const next = transitions[currentPhase]
      if (next === 'completed') {
        finalizeLgdSession()
        return
      }
      if (next) {
        state.setPhase(next)
        statementOrderRef.current = getOrderedStatementTurnIds(state.scriptId, state.seatMap)
        statementIndexRef.current = 0
        setCompletedStatementIds([])
        state.addMessage({
          senderId: 'system',
          senderName: '系统',
          senderRole: '',
          content: getPhaseAnnouncement(next, state.identityMode),
          isUser: false,
          isSystem: true,
          phase: next,
        })
        trackResearchEvent('lgd.phase_entered', { phase: next, room_id: roomMetaRef.current.roomId })
      }
    },
    [stopTts],
  )

  /* ---- Run simulation based on phase ---- */
  useEffect(() => {
    if (!seatDrawDone) return
    if (phase === 'personal_statement') {
      runPersonalStatementSimulation()
    } else if (phase === 'free_discussion') {
      runFreeDiscussionSimulation()
    } else if (phase === 'summary_report') {
      runSummaryReportSimulation()
    } else if (phase === 'examiner_followup') {
      runExaminerFollowupSimulation()
    }

    return () => {
      resumeFreeDiscussionRef.current = null
      followupRoundHandlerRef.current = null
      clearTimeout(simulationRef.current)
      clearInterval(typewriterRef.current)
    }
  }, [phase, seatDrawDone, advancePhase])

  /* ---- On-Table Seat Shuffle Handlers ---- */
  function handleRerollSeats() {
    setIsShufflingSeats(true)
    const out = useLgdStore.getState().rerollRoomSeats()
    roomMetaRef.current.userRole =
      useLgdStore.getState().identityMode === 'undetermined'
        ? 'undetermined'
        : mapIdentityToScorerRole(out.participantRoles.user)
    clearTimeout(shuffleAnimTimerRef.current)
    shuffleAnimTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setIsShufflingSeats(false)
    }, 340)
  }

  function handleSelectEntryIdentityMode(mode) {
    const out = useLgdStore
      .getState()
      .selectIdentityMode(mode, roomMetaRef.current.pickedRole || 'member')
    roomMetaRef.current.roleMode = mode
    roomMetaRef.current.userRole = out.userRole
  }

  function handleConfirmSeatDraw() {
    const st = useLgdStore.getState()
    startTimeRef.current = Date.now()
    statementOrderRef.current = getOrderedStatementTurnIds(st.scriptId, st.seatMap)
    const assignedUserRoleId = st.participantRoles?.user || 'undetermined'
    const assignedMeta = getIdentityMeta(assignedUserRoleId)
    roomMetaRef.current.userRole =
      st.identityMode === 'undetermined' ? 'undetermined' : assignedMeta.scorerRole
    if (assignedUserRoleId === 'reporter') {
      setElectedReporterId('user')
    }
    setReadingCollapsed(false)
    setShockwaveTick((n) => n + 1)
    st.confirmSeatDraw()
    const quota = st.advancementQuota || 3
    const zoneLabel = st.userSeat <= 4 ? '1~4号' : '5~8号'
    st.addMessage({
      senderId: 'system',
      senderName: '主面试官 · 顾总监',
      senderRole: '主持人',
      content:
        `【主面试官 · 顾总监】宣读考场规则：本场 8 人无领导小组讨论采用「8进${quota}」淘汰制，考官全程静默观察。`
        + `你抽中 ${st.userSeat}号位（${st.identityMode === 'undetermined' ? '身份待定·发言可认领' : `${assignedMeta.icon} ${assignedMeta.label}`}）；`
        + `副面试官A（苏经理）重点盯梢 ${zoneLabel} 半区情绪与霸麦红线，副面试官B（周PM）全程记录时间戳里程碑。现在进入独立审题，请全程禁言列提纲。`,
      isUser: false,
      isSystem: true,
      phase: 'reading',
    })
    trackResearchEvent('lgd.phase_entered', {
      phase: 'reading',
      room_id: roomMetaRef.current.roomId,
      user_seat: st.userSeat,
      identity_mode: st.identityMode,
    })
  }

  function handleClaimUserIdentity(roleId) {
    const st = useLgdStore.getState()
    const prevRole = st.participantRoles?.user || 'undetermined'
    st.claimParticipantRole('user', roleId)
    const meta = getIdentityMeta(roleId)
    roomMetaRef.current.userRole = roleId === 'undetermined' ? 'undetermined' : meta.scorerRole
    if (roleId !== 'undetermined' && roleId !== prevRole) {
      pendingUserRoleAnnouncementRef.current = roleId
      if (roleId === 'reporter') {
        setElectedReporterId('user')
      }
      showToast(`已认领「${meta.icon} ${meta.label}」`, 'info')
    } else if (roleId === 'undetermined') {
      pendingUserRoleAnnouncementRef.current = null
    }
    setActiveDockMenu(null)
    trackResearchEvent('lgd.identity_claimed', {
      room_id: roomMetaRef.current.roomId,
      claimed_role: roleId,
      user_seat: st.userSeat,
      phase: st.phase,
    })
  }

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

  async function resolveSandboxAgentLine(agent, phaseName, fallbackContent, turnIdx = 0) {
    const st = useLgdStore.getState()
    const dynSeat = resolveParticipantSeat(agent.id, st.seatMap)
    if (st.apiMode === 'fast_script_only') {
      setLastSandboxMeta({
        sandbox_id: `sbx-${dynSeat}号-${agent.id}`,
        seat_number: dynSeat,
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
        seat_map: st.seatMap,
        identity_mode: st.identityMode,
        participant_roles: st.participantRoles,
        visual_board_summary: serializeBoardForPrompt(st.visualBoard, st.boardAuthorized),
      })
      if (res && res.content) {
        setLastSandboxMeta(res)
        return res.content
      }
    } catch {
      /* fallback to local script */
    }
    setLastSandboxMeta({
      sandbox_id: `sbx-${dynSeat}号-${agent.id}`,
      seat_number: dynSeat,
      context_limit: agent.contextLimit || 4,
      script_badge: getScriptById(st.scriptId).badge,
      engine_source: 'local_sandbox_fallback',
    })
    return fallbackContent
  }

  async function finalizeLgdSession() {
    if (finalizedRef.current) return
    finalizedRef.current = true
    if (activeAbortRef.current) {
      activeAbortRef.current.abort('session_finalize')
      activeAbortRef.current = null
    }
    turnEpochRef.current += 1
    const lgdState = useLgdStore.getState()
    const transcript = buildTranscriptFromMessages(lgdState.messages)
    const claimedUserKey = lgdState.participantRoles?.user
    const role =
      claimedUserKey && claimedUserKey !== 'undetermined'
        ? mapIdentityToScorerRole(claimedUserKey)
        : roomMetaRef.current.userRole || userRole || 'undetermined'
    let scorePayload = null
    try {
      scorePayload = await scoreLgd({
        transcript,
        user_role: role,
        participant_count: 8,
        user_was_reporter:
          (role === 'reporter' || electedReporterId === 'user') && userSpokeInSummaryRef.current,
        topic_type: lgdState.topicType || roomMetaRef.current.topicType || 'open',
        visual_board: lgdState.visualBoard
          ? {
              ...lgdState.visualBoard,
              authorized: lgdState.boardAuthorized,
              alignmentCount: lgdState.boardAlignmentCount,
              reporterAssistCount: lgdState.reporterAssistCount,
              unspeakingEdits: lgdState.boardUnspeakingEdits,
            }
          : null,
        followup_qa: lgdState.followupQa || [],
        listener_notes: lgdState.notes || '',
        advancement_quota: lgdState.advancementQuota || 3,
        seat_map: lgdState.seatMap,
        participant_roles: lgdState.participantRoles,
      })
    } catch {
      scorePayload = null
    }
    const rawMetrics = scorePayload?.lgd_metrics || null
    const metrics = rawMetrics
      ? {
          ...rawMetrics,
          observer_annotations:
            rawMetrics.observer_annotations?.length > 0
              ? rawMetrics.observer_annotations
              : lgdState.observerTags,
        }
      : lgdState.observerTags.length > 0
        ? { observer_annotations: lgdState.observerTags }
        : null
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

    // Generate & persist `lgd_report.json` Context Handoff object for 1v1 Single Interview
    const lgdReportJson = synthesizeLgdReportFromSession({
      transcript,
      lgdMetrics: metrics,
      topic: lgdState.topic || DEFAULT_TOPIC,
      roomId: roomMetaRef.current.roomId || roomId,
      userRole: role,
      userSeat: lgdState.userSeat || 4,
    })
    saveLgdReportHandoff(lgdReportJson)
    saveLgdHandoffReport(lgdReportJson).catch(() => {})

    if (lgdState.memoryEnabled) {
      const weakDims = []
      if (metrics?.talk_share?.status !== 'optimal') weakDims.push('talk_share')
      if ((metrics?.built_on_others?.count || 0) < 1) weakDims.push('built_on_others')
      if ((metrics?.progress?.count || 0) < 1) weakDims.push('progress')
      const memUpdate = {
        memory_enabled: true,
        last_topic: lgdState.topic || DEFAULT_TOPIC,
        user_role: role,
        role_mode: lgdState.identityMode || 'undetermined',
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
        user_seat: lgdState.userSeat,
        identity_mode: lgdState.identityMode,
        claimed_role: claimedUserKey || null,
        script_id: lgdState.scriptId,
        topic_type: roomMetaRef.current.topicType,
        user_was_reporter:
          (role === 'reporter' || electedReporterId === 'user') && userSpokeInSummaryRef.current,
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

  /* ---- Stream an ACP/A2A Turn with Kinetic Roundtable Visual Feedback ---- */
  async function runAcpStreamTurn({
    targetAgent = null,
    phaseName,
    fallbackContent = undefined,
    turnIdx = 0,
    allowServerBidding = false,
    onComplete,
  }) {
    if (!mountedRef.current) return
    const st = useLgdStore.getState()
    const turnEpoch = turnEpochRef.current
    const abortCtrl = new AbortController()
    activeAbortRef.current = abortCtrl
    const resolvedTarget = targetAgent
      ? {
          ...targetAgent,
          seat: resolveParticipantSeat(targetAgent.id, st.seatMap),
        }
      : null
    activeStreamAgentRef.current = {
      agent: resolvedTarget,
      agentId: resolvedTarget?.id || null,
      uiState: 'thinking',
      spokenAcc: '',
    }

    if (resolvedTarget) {
      st.setCurrentSpeaker(resolvedTarget.id)
      st.setSeatState(resolvedTarget.id, 'thinking')
      st.removeFromSpeakerQueue(resolvedTarget.id)
    }

    const llmCfg = st.llmConfig || {}
    const phaseSecondsRow = (st.phasePlan || []).find((p) => p.name === phaseName)
    const totalPhaseSec = phaseSecondsRow?.seconds || (phaseName === 'free_discussion' ? 600 : 480)
    const initTempo = computePsycholinguisticSpeechTempo({
      agentId: resolvedTarget?.id || 'ice_breaker',
      remainingSeconds: st.remainingSeconds,
      totalPhaseSeconds: totalPhaseSec,
      phase: phaseName,
    })
    let turnSettled = false
    let activeIntent = ''

    const targetRoomId = roomMetaRef.current.roomId || roomId || 'live'
    try {
      const result = await streamLgdAcpTurn(
        targetRoomId,
        {
          agent_id: allowServerBidding ? undefined : resolvedTarget?.id,
          topic: st.topic || DEFAULT_TOPIC,
          material: st.material || DEFAULT_MATERIAL,
          phase: phaseName,
          transcript: buildTranscriptFromMessages(st.messages),
          script_id: st.scriptId || roomMetaRef.current.scriptId || 'standard_flow',
          memory_enabled: st.memoryEnabled ?? true,
          memory_snapshot: st.memoryEnabled ? st.memorySnapshot : null,
          remaining_seconds: st.remainingSeconds,
          total_phase_seconds: totalPhaseSec,
          turn_index: turnIdx,
          api_mode: st.apiMode || 'hybrid_sandbox',
          api_key: llmCfg.apiKey || undefined,
          base_url: llmCfg.baseUrl || undefined,
          model: llmCfg.model || undefined,
          seat_map: st.seatMap,
          identity_mode: st.identityMode,
          participant_roles: st.participantRoles,
          visual_board_summary: serializeBoardForPrompt(st.visualBoard, st.boardAuthorized),
        },
        {
          signal: abortCtrl.signal,
          fallbackText: fallbackContent,
          chunkDelayMs: initTempo.chunkDelayMs,
          onEvent: (ev) => {
            if (!mountedRef.current) return
            const curStore = useLgdStore.getState()

            if (ev.type === 'turn_aborted') {
              if (turnSettled) return
              turnSettled = true
              const abortReason = abortCtrl.signal.reason
              if (
                abortReason === 'phase_transition' ||
                abortReason === 'unmount' ||
                abortReason === 'session_finalize'
              ) {
                return
              }
              const ag =
                agentById(ev.agent_id, curStore.seatMap, curStore.participantRoles) ||
                activeStreamAgentRef.current?.agent ||
                resolvedTarget
              const partial = String(
                ev.partial_content ?? activeStreamAgentRef.current?.spokenAcc ?? '',
              ).trim()
              setDisplayingMessage(null)
              if (ag) {
                curStore.clearSeatThoughts(ag.id)
                if (partial.length >= 2) {
                  curStore.addMessage({
                    senderId: ag.id,
                    senderName: ag.name,
                    senderRole: ag.role,
                    content: `${partial}——（被 ${curStore.userSeat || 4}号 抢答打断）`,
                    isUser: false,
                    meta: {
                      interrupted_by_user: true,
                      sandbox: `${ag.seat}号沙箱`,
                      intent: activeIntent || undefined,
                    },
                  })
                  curStore.setSeatState(ag.id, 'interrupted')
                  clearTimeout(interruptedClearTimerRef.current)
                  interruptedClearTimerRef.current = setTimeout(() => {
                    if (mountedRef.current) {
                      useLgdStore.getState().setSeatState(ag.id, 'listening')
                    }
                  }, 2200)
                } else {
                  curStore.setSeatState(ag.id, 'listening')
                }
              }
              return
            }

            if (turnEpochRef.current !== turnEpoch || curStore.phase !== phaseName) return

            if (ev.type === 'bidding_round') {
              activeIntent = ev.intent || ''
              setBuzzWindowActive(false)
              setShockwaveTick((n) => n + 1)
              curStore.setLastBiddingResult(ev)
              curStore.syncSpeakerQueueFromBids(
                ev.speaker_queue || ev.candidates || [],
                ev.winner_agent_id,
              )
              const winnerAg = agentById(
                ev.winner_agent_id,
                curStore.seatMap,
                curStore.participantRoles,
              )
              if (winnerAg) {
                activeStreamAgentRef.current = {
                  agent: winnerAg,
                  agentId: winnerAg.id,
                  uiState: 'thinking',
                  spokenAcc: '',
                }
                curStore.setCurrentSpeaker(winnerAg.id)
              }
              const bidStates = {}
              ;(ev.candidates || []).slice(1, 3).forEach((cand) => {
                if (cand.agent_id && cand.agent_id !== ev.winner_agent_id) {
                  bidStates[cand.agent_id] = 'bidding'
                }
              })
              if (ev.winner_agent_id) {
                bidStates[ev.winner_agent_id] = 'thinking'
              }
              curStore.setBulkSeatStates(bidStates)
              clearTimeout(biddingBadgeTimerRef.current)
              biddingBadgeTimerRef.current = setTimeout(() => {
                if (!mountedRef.current) return
                const latest = useLgdStore.getState()
                const cleared = {}
                ;(ev.candidates || []).slice(1, 3).forEach((cand) => {
                  if (latest.seatStates[cand.agent_id] === 'bidding') {
                    cleared[cand.agent_id] = 'listening'
                  }
                })
                if (Object.keys(cleared).length > 0) {
                  latest.setBulkSeatStates(cleared)
                }
              }, 950)
              return
            }

            if (ev.type === 'seat_state' && ev.agent_id) {
              curStore.setSeatState(ev.agent_id, ev.ui_state)
              const ag =
                agentById(ev.agent_id, curStore.seatMap, curStore.participantRoles) ||
                resolvedTarget
              activeStreamAgentRef.current = {
                ...(activeStreamAgentRef.current || {}),
                agent: ag,
                agentId: ev.agent_id,
                uiState: ev.ui_state,
              }
              if (ev.ui_state === 'thinking' && ag) {
                curStore.setCurrentSpeaker(ag.id)
              }
              return
            }

            if (ev.type === 'agent_thought_chunk' && ev.agent_id) {
              curStore.setSeatThought(ev.agent_id, ev.thought)
              return
            }

            if (ev.type === 'agent_message_chunk') {
              const ag =
                agentById(ev.agent_id, curStore.seatMap, curStore.participantRoles) ||
                activeStreamAgentRef.current?.agent ||
                resolvedTarget
              if (!ag) return
              let liveRoleLabel = ag.role
              if (
                curStore.identityMode === 'undetermined' &&
                (!curStore.participantRoles?.[ag.id] ||
                  curStore.participantRoles[ag.id] === 'undetermined')
              ) {
                const claimMeta = inferAgentClaimedIdentity(
                  ag.id,
                  curStore.participantRoles,
                  phaseName,
                )
                liveRoleLabel = claimMeta.short
              }
              activeStreamAgentRef.current = {
                agent: ag,
                agentId: ag.id,
                uiState: 'speaking',
                spokenAcc: ev.accumulated || '',
              }
              curStore.setCurrentSpeaker(ag.id)
              curStore.setSeatState(ag.id, 'speaking')
              setBuzzWindowActive(false)
              setDisplayingMessage({
                senderId: ag.id,
                seat: ag.seat,
                senderName: ag.name,
                senderRole: liveRoleLabel,
                content: ev.accumulated || '',
                emoji: ag.emoji,
                color: ag.color,
              })
              return
            }

            if (ev.type === 'message_final') {
              if (turnSettled) return
              turnSettled = true
              const baseAg =
                agentById(ev.agent_id, curStore.seatMap, curStore.participantRoles) ||
                activeStreamAgentRef.current?.agent ||
                resolvedTarget
              setDisplayingMessage(null)
              if (!baseAg) {
                onComplete?.({ ok: false })
                return
              }

              let claimedRoleInfo = null
              let finalRoleLabel = baseAg.role
              const existingRole = curStore.participantRoles?.[baseAg.id]
              if (
                curStore.identityMode === 'undetermined' &&
                (!existingRole || existingRole === 'undetermined')
              ) {
                const claimMeta = ev.claimed_role
                  ? getIdentityMeta(ev.claimed_role)
                  : inferAgentClaimedIdentity(baseAg.id, curStore.participantRoles, phaseName)
                curStore.claimParticipantRole(baseAg.id, claimMeta.id)
                claimedRoleInfo = claimMeta
                finalRoleLabel = claimMeta.short
              } else if (existingRole) {
                finalRoleLabel = getIdentityMeta(existingRole).short
              }

              const finalText = String(ev.content || '').trim()
              curStore.setSeatState(baseAg.id, 'listening')
              curStore.clearSeatThoughts(baseAg.id)
              curStore.removeFromSpeakerQueue(baseAg.id)
              setLastSandboxMeta(ev)
              if (finalText) {
                showStageUtterance(
                  {
                    seat: baseAg.seat,
                    senderName: baseAg.name,
                    content: finalText,
                    color: baseAg.color,
                  },
                  2400,
                )
                curStore.addMessage({
                  senderId: baseAg.id,
                  senderName: baseAg.name,
                  senderRole: finalRoleLabel,
                  content: finalText,
                  isUser: false,
                  meta: {
                    interruption: baseAg.behavior === 'interrupt',
                    summary: phaseName === 'summary_report',
                    sandbox: `${baseAg.seat}号沙箱`,
                    intent: ev.intent || activeIntent || undefined,
                    thought: ev.thought || undefined,
                    claimed_role: claimedRoleInfo?.id || undefined,
                    claimed_role_label: claimedRoleInfo
                      ? `${claimedRoleInfo.icon} ${claimedRoleInfo.label}`
                      : undefined,
                    engine_source: ev.engine_source,
                  },
                })
                curStore.incrementAgentSpeakCount(baseAg.id)
              }

              const ttsOn = effectiveTtsEnabled && ttsSupported && Boolean(finalText)
              if (!ttsOn) {
                curStore.setCurrentSpeaker(null)
                onComplete?.({ ok: true, agent: baseAg })
                return
              }
              const profile = agentTtsProfile(baseAg, phaseName, totalPhaseSec)
              speakTts(finalText, {
                enqueue: true,
                voiceURI: profile.voiceURI,
                pitch: profile.pitch,
                rate: profile.rate,
                onend: () => {
                  if (mountedRef.current && turnEpochRef.current === turnEpoch) {
                    useLgdStore.getState().setCurrentSpeaker(null)
                    onComplete?.({ ok: true, agent: baseAg })
                  }
                },
              })
            }
          },
        },
      )

      if (activeAbortRef.current === abortCtrl) {
        activeAbortRef.current = null
      }
      if (result?.locked && mountedRef.current && turnEpochRef.current === turnEpoch) {
        setDisplayingMessage(null)
        onComplete?.({ locked: true })
      } else if (result?.aborted && mountedRef.current && turnEpochRef.current === turnEpoch) {
        onComplete?.({ aborted: true })
      }
    } catch {
      if (activeAbortRef.current === abortCtrl) {
        activeAbortRef.current = null
      }
      if (
        !turnSettled &&
        resolvedTarget &&
        fallbackContent &&
        mountedRef.current &&
        turnEpochRef.current === turnEpoch
      ) {
        const line = await resolveSandboxAgentLine(
          resolvedTarget,
          phaseName,
          fallbackContent,
          turnIdx,
        )
        if (!mountedRef.current || turnEpochRef.current !== turnEpoch) return
        deliverAgentLine(
          resolvedTarget,
          line,
          () => {
            if (!mountedRef.current || turnEpochRef.current !== turnEpoch) return
            useLgdStore.getState().setCurrentSpeaker(null)
            onComplete?.({ ok: true, agent: resolvedTarget })
          },
          { sandbox: `${resolvedTarget.seat}号沙箱` },
        )
      }
    }
  }

  /* ---- Sequential Personal Statement (`1号 → 8号` Orbital Relay) ---- */
  function runPersonalStatementSimulation() {
    const initState = useLgdStore.getState()
    if (!statementOrderRef.current.length) {
      statementOrderRef.current = getOrderedStatementTurnIds(initState.scriptId, initState.seatMap)
    }

    function syncStatementQueuePreview() {
      const cur = useLgdStore.getState()
      const order = statementOrderRef.current
      setCompletedStatementIds(order.slice(0, statementIndexRef.current))
      const upcomingIds = order.slice(statementIndexRef.current + 1, statementIndexRef.current + 4)
      const preview = upcomingIds.map((pid, idx) => {
        const p = agentById(pid, cur.seatMap, cur.participantRoles)
        return {
          id: pid,
          seat: p?.seat || 4,
          name: pid === 'user' ? '你' : p?.name || '队友',
          emoji: p?.emoji || '👤',
          color: p?.color || '#9b6fc7',
          roleShort: p?.role || '待定',
          source: pid === 'user' ? 'user_grab' : 'seat_order',
          rank: idx + 1,
        }
      })
      useLgdStore.setState({ speakerQueue: preview })
    }

    function speakNext() {
      if (!mountedRef.current) return
      const state = useLgdStore.getState()
      if (state.phase !== 'personal_statement') return
      const order = statementOrderRef.current
      if (statementIndexRef.current >= order.length) {
        advancePhase('personal_statement')
        return
      }
      const seatId = order[statementIndexRef.current]
      syncStatementQueuePreview()

      if (seatId === 'user') {
        setShockwaveTick((n) => n + 1)
        useLgdStore.getState().setCurrentSpeaker('user')
        useLgdStore.getState().setSeatState('user', 'speaking')
        useLgdStore.getState().grabMic()
        if (inputRef.current) inputRef.current.focus()
        const finishUserTurn = () => {
          if (!mountedRef.current) return
          const st = useLgdStore.getState()
          if (st.phase !== 'personal_statement') return
          clearTimeout(simulationRef.current)
          advanceUserStatementRef.current = null
          if (st.micGranted) st.releaseMic()
          st.setSeatState('user', 'listening')
          st.setCurrentSpeaker(null)
          statementIndexRef.current += 1
          setCompletedStatementIds(statementOrderRef.current.slice(0, statementIndexRef.current))
          simulationRef.current = setTimeout(speakNext, 650)
        }
        advanceUserStatementRef.current = finishUserTurn
        simulationRef.current = setTimeout(finishUserTurn, 60000)
        return
      }

      const agent = agentById(seatId, state.seatMap, state.participantRoles)
      const pool = RESPONSES.personal_statement[seatId] || []
      const idx = getResponseIndex(seatId, 'personal_statement')
      const fallbackContent = pool[idx % pool.length]
      if (!agent || !fallbackContent) {
        statementIndexRef.current += 1
        simulationRef.current = setTimeout(speakNext, 350)
        return
      }

      const turnEpoch = turnEpochRef.current
      simulationRef.current = setTimeout(() => {
        if (
          !mountedRef.current ||
          turnEpochRef.current !== turnEpoch ||
          useLgdStore.getState().phase !== 'personal_statement'
        ) {
          return
        }
        runAcpStreamTurn({
          targetAgent: agent,
          phaseName: 'personal_statement',
          fallbackContent,
          turnIdx: idx,
          allowServerBidding: false,
          onComplete: () => {
            if (
              !mountedRef.current ||
              turnEpochRef.current !== turnEpoch ||
              useLgdStore.getState().phase !== 'personal_statement'
            ) {
              return
            }
            statementIndexRef.current += 1
            setCompletedStatementIds(statementOrderRef.current.slice(0, statementIndexRef.current))
            simulationRef.current = setTimeout(speakNext, 750)
          },
        })
      }, 480)
    }

    simulationRef.current = setTimeout(speakNext, 850)
  }

  /* ---- Free Discussion Phase (Kinetic Buzz-In Window + Contender Sparks + Barge-in) ---- */
  function runFreeDiscussionSimulation() {
    const seedState = useLgdStore.getState()
    const seedBids = computeLocalUrgencyBids({
      messages: seedState.messages,
      scriptId: seedState.scriptId,
      remainingSeconds: seedState.remainingSeconds,
      totalPhaseSeconds: 600,
      memorySnapshot: seedState.memorySnapshot,
      turnIndex: 0,
      seatMap: seedState.seatMap,
      identityMode: seedState.identityMode,
      participantRoles: seedState.participantRoles,
      visualBoardSummary: serializeBoardForPrompt(
        seedState.visualBoard,
        seedState.boardAuthorized,
      ),
    })
    seedState.syncSpeakerQueueFromBids(seedBids, null)
    triggerBuzzWindow(1500)

    function scheduleNext(customDelayMs = null) {
      if (!mountedRef.current) return
      const state = useLgdStore.getState()
      if (state.phase !== 'free_discussion') return
      if (state.micGranted || state.typingLockActive) {
        simulationRef.current = setTimeout(() => scheduleNext(1100), 1100)
        return
      }

      if (state.speakerQueue[0]?.id === 'user') {
        state.dequeueSpeakerQueueHead()
        state.grabMic()
        state.setCurrentSpeaker('user')
        state.setSeatState('user', 'speaking')
        setBuzzWindowActive(false)
        setShockwaveTick((n) => n + 1)
        const targetRoomId = roomMetaRef.current.roomId || roomId || 'live'
        if (state.apiMode !== 'fast_script_only') {
          sendLgdRoomSignal(targetRoomId, {
            action: 'grab_mic',
            holder: 'user',
            ttl_seconds: 25,
          }).catch(() => {})
        }
        showToast(`已轮到你（${state.userSeat}号）发言`, 'success')
        if (inputRef.current) inputRef.current.focus()
        return
      }

      const gapTempo = computePsycholinguisticSpeechTempo({
        agentId: 'timekeeper',
        remainingSeconds: state.remainingSeconds,
        totalPhaseSeconds: 600,
        phase: 'free_discussion',
      })
      const delay =
        customDelayMs ??
        Math.round((1550 + Math.random() * 850) * gapTempo.turnGapScale)
      triggerBuzzWindow(delay)

      simulationRef.current = setTimeout(() => {
        if (!mountedRef.current) return
        const st = useLgdStore.getState()
        if (st.phase !== 'free_discussion' || st.micGranted || st.typingLockActive) {
          scheduleNext(1100)
          return
        }

        if (st.speakerQueue[0]?.id === 'user') {
          scheduleNext(0)
          return
        }

        const turnIdx = getResponseIndex('room_bidding', 'free_discussion')
        const turnEpoch = turnEpochRef.current

        const lastPublic = [...st.messages]
          .reverse()
          .find((m) => !m.isSystem && m.role !== 'system')
        let queuedAgent = null
        if (
          st.speakerQueue.length > 0 &&
          st.speakerQueue[0].id !== 'user' &&
          st.speakerQueue[0].id !== lastPublic?.senderId
        ) {
          const head = st.dequeueSpeakerQueueHead()
          queuedAgent = head ? agentById(head.id, st.seatMap, st.participantRoles) : null
        }

        runAcpStreamTurn({
          targetAgent: queuedAgent,
          phaseName: 'free_discussion',
          fallbackContent: undefined,
          turnIdx,
          allowServerBidding: !queuedAgent,
          onComplete: (outcome) => {
            if (
              !mountedRef.current ||
              turnEpochRef.current !== turnEpoch ||
              useLgdStore.getState().phase !== 'free_discussion'
            ) {
              return
            }
            if (outcome?.locked || outcome?.aborted) {
              scheduleNext(1300)
              return
            }
            const afterSt = useLgdStore.getState()
            if (afterSt.speakerQueue[0]?.id === 'user') {
              scheduleNext(150)
              return
            }
            const nextBids = computeLocalUrgencyBids({
              messages: afterSt.messages,
              scriptId: afterSt.scriptId,
              remainingSeconds: afterSt.remainingSeconds,
              totalPhaseSeconds: 600,
              memorySnapshot: afterSt.memorySnapshot,
              turnIndex: turnIdx + 1,
              seatMap: afterSt.seatMap,
              identityMode: afterSt.identityMode,
              participantRoles: afterSt.participantRoles,
              visualBoardSummary: serializeBoardForPrompt(
                afterSt.visualBoard,
                afterSt.boardAuthorized,
              ),
            })
            afterSt.syncSpeakerQueueFromBids(nextBids, null)
            scheduleNext()
          },
        })
      }, delay)
    }

    resumeFreeDiscussionRef.current = (delayMs = 1400) => {
      clearTimeout(simulationRef.current)
      if (!mountedRef.current || useLgdStore.getState().phase !== 'free_discussion') return
      scheduleNext(delayMs)
    }

    simulationRef.current = setTimeout(() => scheduleNext(1450), 1450)
  }

  function runSummaryReportSimulation() {
    const st = useLgdStore.getState()
    const userRoleNow =
      st.participantRoles?.user === 'reporter'
        ? 'reporter'
        : roomMetaRef.current.userRole || userRole
    const userIsReporter = userRoleNow === 'reporter' || electedReporterId === 'user'
    if (userIsReporter) {
      setShockwaveTick((n) => n + 1)
      st.setCurrentSpeaker('user')
      st.setSeatState('user', 'speaking')
      st.grabMic()
      showStageUtterance(
        {
          seat: st.userSeat,
          senderName: '系统提示',
          content: `请结合共享提词锚点代表小组总结核心标准与分步方案（限时 3 分钟）`,
          color: '#9b6fc7',
        },
        4000,
      )
      simulationRef.current = setTimeout(() => {
        if (!mountedRef.current || useLgdStore.getState().phase !== 'summary_report') return
        advancePhase('summary_report')
      }, 180000)
      return
    }

    const roleMatchedReporter = AGENTS.find((a) => st.participantRoles?.[a.id] === 'reporter')
    const baseReporter =
      AGENTS.find((a) => a.id === electedReporterId) ||
      roleMatchedReporter ||
      AGENTS.find((a) => a.id === 'logician') ||
      AGENTS[0]
    const reporterAgent = agentById(baseReporter.id, st.seatMap, st.participantRoles)
    const pool =
      RESPONSES.summary_report[baseReporter.id] || RESPONSES.summary_report.logician || []
    const fallbackContent = pool[0]
    const turnEpoch = turnEpochRef.current
    simulationRef.current = setTimeout(() => {
      if (
        !mountedRef.current ||
        turnEpochRef.current !== turnEpoch ||
        useLgdStore.getState().phase !== 'summary_report'
      ) {
        return
      }
      runAcpStreamTurn({
        targetAgent: reporterAgent,
        phaseName: 'summary_report',
        fallbackContent,
        turnIdx: 0,
        allowServerBidding: false,
        onComplete: () => {
          if (
            !mountedRef.current ||
            turnEpochRef.current !== turnEpoch ||
            useLgdStore.getState().phase !== 'summary_report'
          ) {
            return
          }
          simulationRef.current = setTimeout(() => {
            if (mountedRef.current && useLgdStore.getState().phase === 'summary_report') {
              advancePhase('summary_report')
            }
          }, 1200)
        },
      })
    }, 900)
  }

  /* ---- Stage 5: Examiner Follow-up Pressure Q&A (`考官追加提问与收尾`) ---- */
  function runExaminerFollowupSimulation() {
    const initSt = useLgdStore.getState()
    const prompts = buildExaminerFollowupPrompts({
      topic: initSt.topic || DEFAULT_TOPIC,
      topicType: initSt.topicType || roomMetaRef.current.topicType || 'open',
      visualBoard: initSt.visualBoard,
      userSeat: initSt.userSeat,
    })

    function poseQuestionStep(stepIdx) {
      if (!mountedRef.current) return
      const cur = useLgdStore.getState()
      if (cur.phase !== 'examiner_followup') return
      const item = prompts[stepIdx]
      if (!item) {
        finalizeLgdSession()
        return
      }
      cur.setFollowupStep(stepIdx)
      showStageUtterance(
        {
          seat: null,
          senderName: item.examinerName,
          content: item.prompt,
          color: item.color,
        },
        4800,
      )
      cur.addMessage({
        senderId: `examiner_${item.examiner}`,
        senderName: item.examinerName,
        senderRole: '考官追问',
        content: item.prompt,
        isUser: false,
        isSystem: false,
        phase: 'examiner_followup',
        meta: { examiner_probe: true, step: stepIdx },
      })
      setShockwaveTick((n) => n + 1)
      cur.grabMic()
      cur.setCurrentSpeaker('user')
      cur.setSeatState('user', 'speaking')
      if (inputRef.current) inputRef.current.focus()
    }

    followupRoundHandlerRef.current = (userReplyText) => {
      const cur = useLgdStore.getState()
      const stepNow = cur.followupStep || 0
      const activePrompt = prompts[stepNow] || prompts[0]
      cur.appendFollowupQa({
        step: stepNow,
        examiner: activePrompt?.examiner || 'business',
        question: activePrompt?.prompt || '',
        answer: userReplyText,
      })

      if (stepNow === 0 && prompts[1]) {
        simulationRef.current = setTimeout(() => {
          poseQuestionStep(1)
        }, 850)
      } else {
        // Brief teammate solidarity nod before wrapping up
        const backupAg = agentById('mediator', cur.seatMap, cur.participantRoles) || AGENTS[0]
        const backupLine =
          RESPONSES.examiner_followup?.mediator?.[0] ||
          `补充支撑 ${cur.userSeat}号同学的回答：这正是本组依据统一评判标准锁定的最小闭环共识，汇报完毕，感谢两位考官！`
        simulationRef.current = setTimeout(() => {
          if (!mountedRef.current || useLgdStore.getState().phase !== 'examiner_followup') return
          showStageUtterance(
            {
              seat: backupAg.seat,
              senderName: backupAg.name,
              content: backupLine,
              color: backupAg.color,
            },
            2200,
          )
          useLgdStore.getState().addMessage({
            senderId: backupAg.id,
            senderName: backupAg.name,
            senderRole: backupAg.role,
            content: backupLine,
            isUser: false,
            phase: 'examiner_followup',
            meta: { followup_rescue: true, sandbox: `${backupAg.seat}号沙箱` },
          })
          simulationRef.current = setTimeout(() => {
            if (mountedRef.current) finalizeLgdSession()
          }, 1300)
        }, 700)
      }
    }

    simulationRef.current = setTimeout(() => poseQuestionStep(0), 650)
  }

  function releaseTypingLock({ notifyBackend = true, resumeDiscussion = true } = {}) {
    clearTimeout(typingLockTimerRef.current)
    const st = useLgdStore.getState()
    const wasLocked = st.typingLockActive
    if (wasLocked) {
      st.setTypingLock(false)
    }
    if (!st.micGranted) {
      st.setSeatState('user', 'listening')
    }
    if (notifyBackend && wasLocked && st.apiMode !== 'fast_script_only') {
      const targetRoomId = roomMetaRef.current.roomId || roomId || 'live'
      sendLgdRoomSignal(targetRoomId, { action: 'typing_stop', holder: 'user' }).catch(() => {})
    }
    if (resumeDiscussion && wasLocked && st.phase === 'free_discussion' && !st.micGranted) {
      resumeFreeDiscussionRef.current?.(1400)
    }
  }

  function stopAgentSpeech(reason = 'user_barge_in') {
    if (activeAbortRef.current) {
      activeAbortRef.current.abort(reason)
      activeAbortRef.current = null
    }
    turnEpochRef.current += 1
    stopTts()
    clearTimeout(simulationRef.current)
    clearInterval(typewriterRef.current)
    setDisplayingMessage(null)
    useLgdStore.getState().setCurrentSpeaker(null)
  }

  function agentTtsProfile(agent, phaseOverride = null, totalPhaseOverride = null) {
    const idx = AGENTS.findIndex((a) => a.id === agent.id)
    const base = agentTtsProfilesRef.current[idx] || { voiceURI: null, pitch: 1, rate: 1.05 }
    const curSt = useLgdStore.getState()
    const effPhase = phaseOverride || curSt.phase || 'free_discussion'
    const row = (curSt.phasePlan || []).find((p) => p.name === effPhase)
    const effTotal = totalPhaseOverride || row?.seconds || (effPhase === 'free_discussion' ? 600 : 180)
    const dynTempo = computePsycholinguisticSpeechTempo({
      agentId: agent.id,
      remainingSeconds: curSt.remainingSeconds,
      totalPhaseSeconds: effTotal,
      phase: effPhase,
    })
    return {
      ...base,
      pitch: dynTempo.effectivePitch,
      rate: dynTempo.effectiveRate,
      typewriterDelayMs: dynTempo.typewriterDelayMs,
      tempoLabel: dynTempo.tempoLabel,
    }
  }

  function deliverAgentLine(agent, fullContent, onComplete, meta = null) {
    const ttsOn = effectiveTtsEnabled && ttsSupported
    const profile = agentTtsProfile(agent)
    typewriteMessage(agent, fullContent, ttsOn ? null : onComplete, meta, profile.typewriterDelayMs)
    if (!ttsOn) return
    speakTts(fullContent, {
      enqueue: true,
      voiceURI: profile.voiceURI,
      pitch: profile.pitch,
      rate: profile.rate,
      onend: () => {
        onComplete?.()
      },
    })
  }

  function typewriteMessage(agent, fullContent, onComplete, meta = null, intervalMs = 35) {
    let charIndex = 0
    const partialMsg = {
      senderId: agent.id,
      seat: agent.seat,
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
      charIndex += 1
      if (charIndex >= fullContent.length) {
        clearInterval(typewriterRef.current)
        setDisplayingMessage(null)
        showStageUtterance(
          {
            seat: agent.seat,
            senderName: agent.name,
            content: fullContent,
            color: agent.color,
          },
          2200,
        )

        const state = useLgdStore.getState()
        let claimedMeta = null
        if (
          state.identityMode === 'undetermined' &&
          (!state.participantRoles?.[agent.id] ||
            state.participantRoles[agent.id] === 'undetermined')
        ) {
          claimedMeta = inferAgentClaimedIdentity(agent.id, state.participantRoles, state.phase)
          state.claimParticipantRole(agent.id, claimedMeta.id)
        }
        state.addMessage({
          ...partialMsg,
          senderRole: claimedMeta ? claimedMeta.short : partialMsg.senderRole,
          content: fullContent,
          meta: {
            ...(meta || {}),
            ...(claimedMeta
              ? {
                  claimed_role: claimedMeta.id,
                  claimed_role_label: `${claimedMeta.icon} ${claimedMeta.label}`,
                }
              : {}),
          },
        })
        state.incrementAgentSpeakCount(agent.id)

        if (onComplete) onComplete()
      } else {
        setDisplayingMessage((prev) =>
          prev ? { ...prev, content: fullContent.slice(0, charIndex) } : null,
        )
      }
    }, Math.max(14, Number(intervalMs) || 35))
  }

  function getResponseIndex(agentId, phaseName) {
    const key = `${agentId}_${phaseName}`
    const current = responseIndexRef.current[key] || 0
    responseIndexRef.current[key] = current + 1
    return current
  }

  function getPhaseAnnouncement(p, idMode = 'undetermined') {
    const map = {
      personal_statement:
        idMode === 'undetermined'
          ? '【主面试官 · 顾总监】独立审题结束！现在开始个人观点陈述（1→8号顺时针依次破冰，可认领身份，不展开辩论）'
          : '【主面试官 · 顾总监】独立审题结束！现在开始个人观点陈述（1→8号顺时针依次陈述初步方案）',
      free_discussion:
        '【主面试官 · 顾总监】进入核心计分环节——自由讨论与共识收敛（建议按 2:6:2 黄金时间比先立评判标准再筛选项，严守倾听与协作红线）',
      summary_report:
        '【主面试官 · 顾总监】自由讨论时间到，请全员立即停止交谈！请推选的唯一代表面向考官做总结陈词',
      examiner_followup:
        '【主面试官 · 顾总监】汇报完毕，进入考官追加提问环节（三面试官将针对方案边界与协作贡献发起追问，随后进行 5 分钟闭门 Calibration 校准）',
      completed: '讨论结束',
    }
    return map[p] || ''
  }

  /* ---- User Controls: Typing Lock, Send, Buzz-In, Queue, Voice ---- */
  function handleInputChange(e) {
    const val = e.target.value
    setInputValue(val)
    const st = useLgdStore.getState()
    if (st.phase !== 'free_discussion') return

    if (val.trim().length > 0) {
      st.setTypingLock(true, 15000)
      setBuzzWindowActive(false)
      if (!st.micGranted) {
        st.setSeatState('user', 'thinking')
      }
      if (activeAbortRef.current && !displayingMessage) {
        stopAgentSpeech('user_typing')
      }
      clearTimeout(typingLockTimerRef.current)
      typingLockTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          releaseTypingLock({ notifyBackend: true, resumeDiscussion: true })
        }
      }, 15000)

      const now = Date.now()
      if (st.apiMode !== 'fast_script_only' && now - typingSignalThrottleRef.current > 3000) {
        typingSignalThrottleRef.current = now
        const targetRoomId = roomMetaRef.current.roomId || roomId || 'live'
        sendLgdRoomSignal(targetRoomId, {
          action: 'typing_start',
          holder: 'user',
          ttl_seconds: 15,
        }).catch(() => {})
      }
    } else {
      releaseTypingLock({ notifyBackend: true, resumeDiscussion: true })
    }
  }

  function handleSend() {
    const text = inputValue.trim()
    if (!text) return

    stopAgentSpeech('user_barge_in')
    releaseTypingLock({ notifyBackend: false, resumeDiscussion: false })
    setActiveDockMenu(null)

    const st = useLgdStore.getState()
    st.resetUnspeakingEdits()
    scribeWarnedRef.current = false
    st.removeFromSpeakerQueue('user')
    const priorMsgsSnapshot = [...st.messages]
    const currentPhase = st.phase
    const userRoleKey = st.participantRoles?.user || 'undetermined'
    const roleMeta = getIdentityMeta(userRoleKey)
    const scorerRole =
      userRoleKey === 'undetermined'
        ? roomMetaRef.current.userRole || 'member'
        : roleMeta.scorerRole
    const announcedClaimKey = pendingUserRoleAnnouncementRef.current
    const announcedClaimMeta = announcedClaimKey ? getIdentityMeta(announcedClaimKey) : null
    pendingUserRoleAnnouncementRef.current = null

    if (currentPhase === 'summary_report') {
      userSpokeInSummaryRef.current = true
    }

    showStageUtterance(
      {
        seat: st.userSeat,
        senderName: '你',
        content: text,
        color: '#9b6fc7',
      },
      2800,
    )

    st.addMessage({
      senderId: 'user',
      senderName: '你',
      senderRole: userRoleKey === 'undetermined' ? '待定' : roleMeta.short,
      content: text,
      isUser: true,
      meta: {
        ...(currentPhase === 'summary_report' ? { summary: true } : {}),
        sandbox: `${st.userSeat || 4}号玩家`,
        ...(userRoleKey !== 'undetermined' ? { claimed_role: userRoleKey } : {}),
        ...(announcedClaimMeta
          ? { claimed_role_label: `${announcedClaimMeta.icon} ${announcedClaimMeta.label}` }
          : {}),
      },
    })

    setInputValue('')
    if (useLgdStore.getState().micGranted) {
      useLgdStore.getState().releaseMic()
    }
    useLgdStore.getState().setSeatState('user', 'listening')

    if (st.apiMode !== 'fast_script_only') {
      const targetRoomId = roomMetaRef.current.roomId || roomId || 'live'
      sendLgdRoomSignal(targetRoomId, { action: 'release_mic', holder: 'user' }).catch(() => {})
    }

    const elapsedSec = Math.max(1, Math.floor((Date.now() - startTimeRef.current) / 1000))
    if (st.apiMode === 'fast_script_only') {
      const localTags = evaluateLocalObserverTags(
        { content: text },
        priorMsgsSnapshot,
        scorerRole,
        currentPhase,
        elapsedSec,
      )
      if (localTags.length > 0) {
        useLgdStore.getState().appendObserverTags(localTags)
      }
    } else {
      requestLgdObserverTag({
        utterance: {
          speaker: `${st.userSeat}号·你`,
          text,
          phase: currentPhase,
          isUser: true,
          role: 'user',
        },
        transcript_prior: buildTranscriptFromMessages(priorMsgsSnapshot),
        user_role: scorerRole === 'undetermined' ? 'member' : scorerRole,
        phase: currentPhase,
        elapsed_seconds: elapsedSec,
      })
        .then((res) => {
          const incoming = res?.annotations || res?.tags
          if (Array.isArray(incoming) && incoming.length > 0) {
            useLgdStore.getState().appendObserverTags(incoming)
          }
        })
        .catch(() => {
          const localTags = evaluateLocalObserverTags(
            { content: text },
            priorMsgsSnapshot,
            scorerRole,
            currentPhase,
            elapsedSec,
          )
          if (localTags.length > 0) {
            useLgdStore.getState().appendObserverTags(localTags)
          }
        })
    }

    if (currentPhase === 'personal_statement' && typeof advanceUserStatementRef.current === 'function') {
      const nextStep = advanceUserStatementRef.current
      advanceUserStatementRef.current = null
      nextStep()
    } else if (currentPhase === 'free_discussion') {
      resumeFreeDiscussionRef.current?.(1400)
    } else if (
      currentPhase === 'examiner_followup' &&
      typeof followupRoundHandlerRef.current === 'function'
    ) {
      followupRoundHandlerRef.current(text)
    }
    if (inputRef.current) inputRef.current.focus()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleGrabMic() {
    const state = useLgdStore.getState()
    const targetRoomId = roomMetaRef.current.roomId || roomId || 'live'
    if (state.micGranted) {
      state.releaseMic()
      state.setSeatState('user', 'listening')
      if (state.apiMode !== 'fast_script_only') {
        sendLgdRoomSignal(targetRoomId, { action: 'release_mic', holder: 'user' }).catch(() => {})
      }
      if (state.phase === 'free_discussion') {
        resumeFreeDiscussionRef.current?.(1400)
      }
    } else {
      stopAgentSpeech('user_barge_in')
      setBuzzWindowActive(false)
      setShockwaveTick((n) => n + 1)
      state.removeFromSpeakerQueue('user')
      state.grabMic()
      state.setCurrentSpeaker('user')
      state.setSeatState('user', 'speaking')
      if (state.apiMode !== 'fast_script_only') {
        sendLgdRoomSignal(targetRoomId, {
          action: 'grab_mic',
          holder: 'user',
          ttl_seconds: 25,
        }).catch(() => {})
      }
      if (inputRef.current) inputRef.current.focus()
    }
  }

  function handleToggleQueueSpeak() {
    const st = useLgdStore.getState()
    if (!canInteract) return

    const alreadyQueued = st.speakerQueue.some((item) => item.id === 'user')
    if (alreadyQueued) {
      st.removeFromSpeakerQueue('user')
      if (!st.micGranted) st.setSeatState('user', 'listening')
      return
    }

    if (st.phase === 'personal_statement') {
      const order = statementOrderRef.current
      const curIdx = statementIndexRef.current
      const userPos = order.indexOf('user')
      if (userPos > curIdx + 1) {
        const nextOrder = [...order]
        nextOrder.splice(userPos, 1)
        nextOrder.splice(curIdx + 1, 0, 'user')
        statementOrderRef.current = nextOrder
        st.enqueueUserToSpeak(st.participantRoles?.user)
        st.setSeatState('user', 'bidding')
        showToast(`已排入下一顺位（${st.userSeat}号）`, 'success')
        return
      }
      handleGrabMic()
      return
    }

    const floorBusy = Boolean(
      (st.currentSpeaker && st.currentSpeaker !== 'user') ||
        activeAbortRef.current ||
        displayingMessage,
    )
    if (!floorBusy && !st.micGranted) {
      handleGrabMic()
      return
    }

    st.enqueueUserToSpeak(st.participantRoles?.user)
    st.setSeatState('user', 'bidding')
    trackResearchEvent('lgd.queue_joined', {
      room_id: roomMetaRef.current.roomId,
      user_seat: st.userSeat,
      identity_mode: st.identityMode,
      claimed_role: st.participantRoles?.user || 'undetermined',
    })
    showToast(`已预约顺位 #1`, 'success')
    if (inputRef.current) inputRef.current.focus()
  }

  function handleToggleHandRaise() {
    const nextRaised = !handRaised
    setHandRaised(nextRaised)
    clearTimeout(handYieldTimerRef.current)
    if (!nextRaised) return

    const st = useLgdStore.getState()
    trackResearchEvent('lgd.hand_raised', { room_id: roomMetaRef.current.roomId, phase: st.phase })

    if (st.phase === 'free_discussion' && !st.micGranted) {
      st.setSeatState('mediator', 'yielding')
      handYieldTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return
        const cur = useLgdStore.getState()
        if (cur.phase !== 'free_discussion' || cur.micGranted) return
        stopAgentSpeech('user_hand_raise')
        const mediator = agentById('mediator', cur.seatMap, cur.participantRoles) || AGENTS[0]
        const yieldLine = `看到 ${cur.userSeat || 4}号 举手示意，先请 ${cur.userSeat || 4}号 发言！`
        showStageUtterance(
          {
            seat: mediator.seat,
            senderName: mediator.name,
            content: yieldLine,
            color: mediator.color,
          },
          2200,
        )
        cur.addMessage({
          senderId: mediator.id,
          senderName: mediator.name,
          senderRole: mediator.role,
          content: yieldLine,
          isUser: false,
          meta: { floor_yield: true, sandbox: `${mediator.seat}号沙箱` },
        })
        cur.setSeatState('mediator', 'listening')
        cur.removeFromSpeakerQueue('user')
        cur.setCurrentSpeaker('user')
        cur.setSeatState('user', 'speaking')
        cur.grabMic()
        setShockwaveTick((n) => n + 1)
        setHandRaised(false)
        if (inputRef.current) inputRef.current.focus()
      }, 850)
    }
  }

  function handleElectReporter(targetId) {
    setElectedReporterId(targetId)
    const st = useLgdStore.getState()
    if (targetId === 'user') {
      roomMetaRef.current.userRole = 'reporter'
      st.claimParticipantRole('user', 'reporter')
      showToast('已自荐担任本组汇报人', 'success')
    } else {
      const picked = agentById(targetId, st.seatMap, st.participantRoles)
      showToast(`已推选 ${picked?.seat || ''}号·${picked?.name || '队友'} 担任汇报人`, 'info')
    }
  }

  function handleSyncSummaryToNotes() {
    const summary = computeLiveProgressiveSummary(messages, topic, userSeat)
    const block = [
      `【共识摘要 · ${summary.topic}】`,
      `共识：${summary.agreedPoints.length ? summary.agreedPoints.join(' ｜ ') : '待收敛'}`,
      `分歧：${summary.activeClashes.length ? summary.activeClashes.join(' ｜ ') : '暂无'}`,
      `${userSeat}号（我）：${summary.userContributions.length ? summary.userContributions.join(' ｜ ') : '尚未发言'}`,
    ].join('\n')
    setNotes(notes ? `${notes}\n\n${block}` : block)
    showToast('已存至随手笔记', 'success')
  }

  function handleQuickCaptureUtterance(utt) {
    if (!utt?.content) return
    const elapsedSec = Math.max(1, Math.floor((Date.now() - startTimeRef.current) / 1000))
    const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0')
    const ss = String(elapsedSec % 60).padStart(2, '0')
    const who = utt.seat ? `${utt.seat}号·${utt.senderName}` : utt.senderName || '队友'
    const snippet = String(utt.content).trim().slice(0, 68)
    const line = `[${mm}:${ss} ${who}] ${snippet}`
    const curNotes = useLgdStore.getState().notes || ''
    setNotes(curNotes ? `${curNotes}\n${line}` : line)
    showToast(`✍️ 已边听边记：摘录 ${who} 要点`, 'success')
  }

  /* ---- Visual Board Iron Law 1, 2 & 3 Handlers ---- */
  function handleUpdateVisualBoard(updater, opts = {}) {
    const st = useLgdStore.getState()
    st.updateVisualBoard(updater, opts)
    const after = useLgdStore.getState()
    if (
      opts?.countEdit !== false &&
      after.phase === 'free_discussion' &&
      after.boardUnspeakingEdits >= 4 &&
      !scribeWarnedRef.current
    ) {
      scribeWarnedRef.current = true
      const elapsedSec = Math.max(1, Math.floor((Date.now() - startTimeRef.current) / 1000))
      const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0')
      const ss = String(elapsedSec % 60).padStart(2, '0')
      after.appendObserverTags([
        {
          id: `obs-scribe-${Date.now().toString(36)}`,
          ts_label: `${mm}:${ss}`,
          phase: after.phase,
          examiner: 'hr',
          examiner_name: '组织行为 HRBP · 苏经理',
          tag: '埋头画手预警',
          delta: -1,
          polarity: 'warning',
          quote: '连续编辑看板未同步发言',
          reason: '铁律2：严禁沦为沉默纯速记员，请立刻点击「转纸对齐」开口控场。',
        },
      ])
      showToast('铁律2提醒：切勿沦为沉默速记员，快点「🔄 转纸对齐」发声引导！', 'info')
    }
  }

  function handleRequestBoardAuthorization() {
    const st = useLgdStore.getState()
    st.authorizeVisualBoard()
    if (!st.seatDrawDone || st.phase === 'reading') {
      showToast('已开启三栏看板结构，进入自由讨论后将实时同步全场焦点', 'success')
      return
    }
    const authLine =
      '为了方便大家对齐进度、不遗漏好观点，我帮大家开启共享结构化看板实时整理核心标准与分支，大家看可以吗？'
    const priorMsgs = [...st.messages]
    st.resetUnspeakingEdits()
    scribeWarnedRef.current = false
    showStageUtterance(
      {
        seat: st.userSeat,
        senderName: '你',
        content: authLine,
        color: '#9b6fc7',
      },
      2800,
    )
    st.addMessage({
      senderId: 'user',
      senderName: '你',
      senderRole: getIdentityMeta(st.participantRoles?.user || 'undetermined').short,
      content: authLine,
      isUser: true,
      phase: st.phase,
      meta: { board_auth: true, sandbox: `${st.userSeat || 4}号玩家` },
    })
    const elapsedSec = Math.max(1, Math.floor((Date.now() - startTimeRef.current) / 1000))
    const tags = evaluateLocalObserverTags(
      { content: authLine },
      priorMsgs,
      effectiveUserRole,
      st.phase,
      elapsedSec,
    )
    if (tags.length > 0) st.appendObserverTags(tags)
    showToast('已获团队授权开启共享看板 (+团队授权控屏)', 'success')
  }

  function handleBroadcastBoardAlignment() {
    const st = useLgdStore.getState()
    st.recordBoardAlignment()
    st.resetUnspeakingEdits()
    scribeWarnedRef.current = false
    const topConc = extractPrimaryConclusions(st.visualBoard)[0] || st.visualBoard?.target || '核心主线'
    const critLabels = (st.visualBoard?.criteria || [])
      .map((c) => c.label)
      .filter(Boolean)
      .slice(0, 3)
      .join('、')
    const alignLine = `大家请看共享看板对齐一下进度：按【${critLabels || '既定评判标准'}】，当前核心锚点聚焦在「${topConc}」，超时发散点已收入右侧暂存区（Parking Lot），我们集中推进下一模块好吗？`

    if (st.seatDrawDone && (st.phase === 'free_discussion' || st.phase === 'personal_statement')) {
      const priorMsgs = [...st.messages]
      showStageUtterance(
        {
          seat: st.userSeat,
          senderName: '你',
          content: alignLine,
          color: '#9b6fc7',
        },
        3000,
      )
      st.addMessage({
        senderId: 'user',
        senderName: '你',
        senderRole: getIdentityMeta(st.participantRoles?.user || 'undetermined').short,
        content: alignLine,
        isUser: true,
        phase: st.phase,
        meta: { board_alignment: true, sandbox: `${st.userSeat || 4}号玩家` },
      })
      const elapsedSec = Math.max(1, Math.floor((Date.now() - startTimeRef.current) / 1000))
      const tags = evaluateLocalObserverTags(
        { content: alignLine },
        priorMsgs,
        effectiveUserRole,
        st.phase,
        elapsedSec,
      )
      if (tags.length > 0) st.appendObserverTags(tags)
    }
    setOpenDrawer(null)
    showToast('🔄 已转纸对齐全场焦点，AI 队友已同步看板锚点', 'success')
  }

  function handleClickSummaryCue(cue) {
    if (!cue) return
    const st = useLgdStore.getState()
    st.triggerReporterAssist(cue.id)
    const userIsReporter =
      st.participantRoles?.user === 'reporter' ||
      electedReporterId === 'user' ||
      roomMetaRef.current.userRole === 'reporter'
    if (userIsReporter) {
      setInputValue((prev) =>
        prev ? `${prev}；${cue.badge}为${cue.text}` : `【${cue.badge}】${cue.text}`,
      )
      if (inputRef.current) inputRef.current.focus()
      showToast(`已填入提词锚点「${cue.badge}」`, 'info')
    } else {
      if (!assistTagLoggedRef.current) {
        assistTagLoggedRef.current = true
        const elapsedSec = Math.max(1, Math.floor((Date.now() - startTimeRef.current) / 1000))
        const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0')
        const ss = String(elapsedSec % 60).padStart(2, '0')
        st.appendObserverTags([
          {
            id: `obs-assist-${Date.now().toString(36)}`,
            ts_label: `${mm}:${ss}`,
            phase: 'summary_report',
            examiner: 'hr',
            examiner_name: '组织行为 HRBP · 苏经理',
            tag: '汇报副驾助攻',
            delta: 1,
            polarity: 'positive',
            quote: `${cue.badge}：${cue.text}`,
            reason: '铁律3：队友担任汇报人时主动用结构化看板为其指路补位，彰显无私团队精神。',
          },
        ])
      }
      showToast(`✨ 副驾助攻：已为汇报队友高亮「${cue.badge} · ${cue.text}」`, 'success')
    }
  }

  function handleApplyTacticalCue(cue) {
    if (!cue?.template) return
    const st = useLgdStore.getState()
    if (!st.micGranted && canInteract) {
      stopAgentSpeech()
      st.grabMic()
      st.setCurrentSpeaker('user')
      st.setSeatState('user', 'speaking')
      setShockwaveTick((n) => n + 1)
    }
    setInputValue(cue.template)
    setActiveDockMenu(null)
    if (inputRef.current) inputRef.current.focus()
  }

  function handleToggleVoiceInput() {
    if (isVoiceListening && sttRef.current) {
      sttRef.current.stop()
      setIsVoiceListening(false)
      return
    }
    if (!isBrowserSttSupported()) {
      showToast('当前浏览器未开启语音识别，请直接输入或点击抢答', 'info')
      return
    }
    const st = useLgdStore.getState()
    if (!st.micGranted && canInteract) {
      stopAgentSpeech()
      st.grabMic()
      st.setCurrentSpeaker('user')
      st.setSeatState('user', 'speaking')
      setShockwaveTick((n) => n + 1)
    }
    const recognizer = createBrowserSpeechRecognizer({
      lang: 'zh-CN',
      continuous: false,
      interimResults: true,
      onInterim: (interim) => {
        if (interim) setInputValue(interim)
      },
      onFinal: (finalText) => {
        if (finalText) {
          setInputValue((prev) =>
            prev && !prev.endsWith(finalText) ? `${prev}${finalText}` : finalText,
          )
        }
      },
      onError: () => setIsVoiceListening(false),
      onEnd: () => setIsVoiceListening(false),
    })
    sttRef.current = recognizer
    if (recognizer.start()) {
      setIsVoiceListening(true)
    }
  }

  /* ---- Participants & Derived Stage Props ---- */
  const participants = useMemo(() => {
    const uRoleKey = participantRoles?.user || 'undetermined'
    const uMeta = getIdentityMeta(uRoleKey)
    const userNode = {
      id: 'user',
      seat: resolveParticipantSeat('user', seatMap),
      name: '你',
      role: uRoleKey === 'undetermined' ? '待定' : uMeta.short,
      roleIcon: uRoleKey === 'undetermined' ? '⏳' : uMeta.icon,
      roleKey: uRoleKey,
      color: '#9b6fc7',
      emoji: '👤',
      speakCount: userSpeakCount,
    }
    const aiNodes = AGENTS.map((ag) => {
      const rKey = participantRoles?.[ag.id]
      const isUndet = identityMode === 'undetermined' && (!rKey || rKey === 'undetermined')
      const rMeta = rKey ? getIdentityMeta(rKey) : null
      return {
        ...ag,
        seat: resolveParticipantSeat(ag.id, seatMap),
        role: isUndet ? '待定' : rMeta ? rMeta.short : ag.role,
        roleIcon: isUndet ? '⏳' : rMeta ? rMeta.icon : '💬',
        roleKey: isUndet ? 'undetermined' : rKey || 'member',
        speakCount: agentSpeakCounts[ag.id] || 0,
      }
    })
    return [userNode, ...aiNodes]
  }, [participantRoles, seatMap, identityMode, userSpeakCount, agentSpeakCounts])

  function findAgent(id) {
    return agentById(id, seatMap, participantRoles)
  }

  const phaseIndex = PHASES.findIndex((p) => p.key === phase)
  const totalPhaseSeconds = useMemo(() => {
    const row = (phasePlan || []).find((p) => p.name === phase)
    return (
      row?.seconds ||
      (phase === 'free_discussion' ? 600 : phase === 'examiner_followup' ? 120 : 180)
    )
  }, [phasePlan, phase])

  const goldenStage = useMemo(
    () => computeFreeDiscussionGoldenStage(remainingSeconds, totalPhaseSeconds),
    [remainingSeconds, totalPhaseSeconds],
  )

  const microBoardAnchor = useMemo(() => {
    if (!boardAuthorized || !visualBoard) return ''
    const meta = VISUAL_MODEL_META.find((m) => m.id === visualBoard.modelType)
    const topConc = extractPrimaryConclusions(visualBoard)[0] || visualBoard.target || ''
    return `${meta?.label || '看板'} · ${topConc}`
  }, [boardAuthorized, visualBoard])

  const summaryCueItems = useMemo(() => buildSummaryCueItems(visualBoard), [visualBoard])

  const activeSpeechTempo = useMemo(() => {
    if (!seatDrawDone || phase === 'reading' || phase === 'completed') return null
    const speakerId =
      currentSpeaker && currentSpeaker !== 'user' ? currentSpeaker : 'timekeeper'
    return computePsycholinguisticSpeechTempo({
      agentId: speakerId,
      remainingSeconds,
      totalPhaseSeconds,
      phase,
    })
  }, [seatDrawDone, phase, currentSpeaker, remainingSeconds, totalPhaseSeconds])

  const canInteract =
    seatDrawDone &&
    (phase === 'personal_statement' ||
      phase === 'free_discussion' ||
      phase === 'summary_report' ||
      phase === 'examiner_followup')
  const canTypeDirectly =
    canInteract && (micGranted || phase === 'free_discussion' || phase === 'examiner_followup')

  const userIdentityKey = participantRoles?.user || 'undetermined'
  const userIdentityMeta = getIdentityMeta(userIdentityKey)
  const effectiveUserRole =
    userIdentityKey === 'undetermined'
      ? 'member'
      : userIdentityMeta.scorerRole || roomMetaRef.current.userRole || userRole || 'member'
  const liveSummary = computeLiveProgressiveSummary(messages, topic || DEFAULT_TOPIC, userSeat)
  const tacticalCues = getTacticalCuesForContext(phase, effectiveUserRole, scaffoldLevel, seatMap)
  const userQueueRank = speakerQueue.findIndex((q) => q.id === 'user') + 1

  const claimedByOthers = {}
  Object.entries(participantRoles || {}).forEach(([pid, rKey]) => {
    if (pid !== 'user' && rKey && rKey !== 'undetermined') {
      claimedByOthers[rKey] = resolveParticipantSeat(pid, seatMap)
    }
  })

  const liveUtterance = displayingMessage
    ? {
        seat: displayingMessage.seat,
        senderName: displayingMessage.senderName,
        content: displayingMessage.content,
        color: displayingMessage.color,
        streaming: true,
      }
    : recentUtterance

  useRoomKeyboardShortcuts({
    enabled: keyboardShortcutsEnabled && canInteract,
    onToggleMic: handleGrabMic,
    onSubmit: handleSend,
    canToggleMic: () => canInteract,
    canSubmit: () => canTypeDirectly && Boolean(inputValue.trim()),
  })

  function toggleDrawer(target) {
    setOpenDrawer((cur) => (cur === target ? null : target))
  }

  return (
    <div className={styles['lgd-room']}>
      <div className="sr-only" aria-live="polite">
        {phaseCountdownAnnounce}
      </div>

      {/* 1. Floating Top Micro-HUD (Zero Clutter, On-Demand Drawers Only) */}
      <header className={styles['top-micro-hud']}>
        <div className={styles['phase-cluster']}>
          <div className={styles['phase-pips']} aria-hidden="true">
            {PHASES.map((p, idx) => (
              <span
                key={p.key}
                className={`${styles['phase-pip']} ${idx === phaseIndex ? styles['phase-pip-active'] : ''} ${idx < phaseIndex ? styles['phase-pip-done'] : ''}`}
                title={p.label}
              />
            ))}
          </div>
          <span className={styles['phase-title']}>
            {!seatDrawDone ? '圆桌入座' : PHASE_SHORT_LABELS[phase] || PHASES[phaseIndex]?.label}
          </span>
          {seatDrawDone && phase !== 'completed' && (
            <button
              type="button"
              className={styles['phase-skip-btn']}
              onClick={() => advancePhase(phase)}
              aria-label="快进至下一阶段"
              title="跳至下一阶段"
            >
              »
            </button>
          )}
        </div>

        <div className={styles['hud-actions']}>
          <button
            type="button"
            className={`${styles['hud-icon-btn']} ${openDrawer === 'material' ? styles['hud-icon-active'] : ''}`}
            onClick={() => {
              if (seatDrawDone && phase === 'reading' && readingCollapsed) {
                setReadingCollapsed(false)
              } else {
                toggleDrawer('material')
              }
            }}
            aria-label="查看讨论材料"
            title="讨论材料"
          >
            <span>📄</span>
            <span className={styles['hud-label-hide-sm']}>材料</span>
          </button>

          <button
            type="button"
            className={`${styles['hud-icon-btn']} ${openDrawer === 'transcript' ? styles['hud-icon-active'] : ''}`}
            onClick={() => toggleDrawer('transcript')}
            aria-label="打开完整发言记录抽屉"
            title="发言记录与共识"
          >
            <span>💬</span>
            <span className={styles['hud-label-hide-sm']}>记录</span>
            {messages.length > 0 && <span className={styles['hud-count']}>{messages.length}</span>}
          </button>

          <button
            type="button"
            className={`${styles['hud-icon-btn']} ${openDrawer === 'notes' ? styles['hud-icon-active'] : ''}`}
            onClick={() => toggleDrawer('notes')}
            aria-label="边听边记浮动速记本"
            title="边听边记浮动速记本（不遮挡圆桌）"
          >
            <span>📝</span>
            <span className={styles['hud-label-hide-sm']}>速记</span>
          </button>

          <button
            type="button"
            className={`${styles['hud-icon-btn']} ${openDrawer === 'board' || boardAuthorized ? styles['hud-icon-active'] : ''}`}
            onClick={() => toggleDrawer('board')}
            aria-label="打开三栏结构化看板"
            title="三栏结构化看板与随手草稿"
          >
            <span>📋</span>
            <span className={styles['hud-label-hide-sm']}>看板</span>
          </button>

          <button
            type="button"
            className={`${styles['hud-icon-btn']} ${openDrawer === 'observer' ? styles['hud-icon-active'] : ''}`}
            onClick={() => toggleDrawer('observer')}
            aria-label="三面试官旁路观察台"
            title={`三面试官协同观察台（8进${advancementQuota || 3}）`}
          >
            <span>👁</span>
            {observerTags.length > 0 && (
              <span className={styles['hud-count']}>{observerTags.length}</span>
            )}
          </button>

          <button
            type="button"
            className={styles['hud-icon-btn']}
            onClick={() => setShowKeyboardHelp(true)}
            aria-label="快捷键说明"
            title="键盘快捷键"
          >
            <span>⌨</span>
          </button>

          <button
            type="button"
            className={styles['hud-icon-btn']}
            onClick={() => navigate('/lgd/lobby')}
            aria-label="退出房间"
            title="返回群面大厅"
          >
            <span>✕</span>
          </button>
        </div>
      </header>

      {/* 2. Pure Spatial Roundtable Centerpiece Stage */}
      <RoundtableCanvas
        participants={participants}
        seatDrawDone={seatDrawDone}
        isShufflingSeats={isShufflingSeats}
        identityMode={identityMode}
        userSeat={userSeat}
        phase={phase}
        remainingSeconds={remainingSeconds}
        totalPhaseSeconds={totalPhaseSeconds}
        currentSpeaker={currentSpeaker}
        micGranted={micGranted}
        typingLockActive={typingLockActive}
        handRaised={handRaised}
        buzzWindowActive={buzzWindowActive}
        shockwaveTick={shockwaveTick}
        seatStates={seatStates}
        seatThoughts={seatThoughts}
        speakerQueue={speakerQueue}
        completedStatementIds={completedStatementIds}
        liveUtterance={liveUtterance}
        boardAuthorized={boardAuthorized}
        microBoardAnchor={microBoardAnchor}
        goldenStage={goldenStage}
        activeSpeechTempo={activeSpeechTempo}
        onOpenBoard={() => setOpenDrawer('board')}
        onQuickCaptureUtterance={handleQuickCaptureUtterance}
        onSelectIdentityMode={handleSelectEntryIdentityMode}
        onRerollSeats={handleRerollSeats}
        onConfirmSeatDraw={handleConfirmSeatDraw}
      />

      {/* 3. Single-Line Floating Buzz-In & Input Capsule */}
      <footer className={styles['bottom-dock-area']}>
        {canInteract && activeDockMenu === 'identity' && (
          <div className={styles['dock-popover']} role="region" aria-label="认领发言身份">
            {CLAIMABLE_IDENTITIES.map((item) => {
              const selected = userIdentityKey === item.id
              const takenSeat = claimedByOthers[item.id]
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles['pop-chip']} ${selected ? styles['pop-chip-active'] : ''}`}
                  onClick={() => handleClaimUserIdentity(item.id)}
                  title={item.hint}
                >
                  <span>
                    {item.icon} {item.short}
                  </span>
                  {takenSeat && !selected && (
                    <span className={styles['pop-seat-dot']}>{takenSeat}号</span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {canInteract && activeDockMenu === 'cues' && (
          <div className={styles['dock-popover']} role="region" aria-label="发言破局提示">
            {LGD_SCAFFOLD_LEVELS.map((lvl) => (
              <button
                key={lvl.id}
                type="button"
                className={`${styles['pop-chip']} ${scaffoldLevel === lvl.id ? styles['pop-chip-active'] : ''}`}
                onClick={() => setScaffoldLevel(lvl.id)}
              >
                {lvl.label}
              </button>
            ))}
            {tacticalCues.map((cue, idx) => (
              <button
                key={`${cue.tag}-${idx}`}
                type="button"
                className={styles['pop-chip']}
                onClick={() => handleApplyTacticalCue(cue)}
              >
                <strong>{cue.tag}</strong>
                <span>{cue.text}</span>
              </button>
            ))}
          </div>
        )}

        {seatDrawDone && phase === 'summary_report' && summaryCueItems.length > 0 && (
          <div className={styles['summary-cue-strip']} role="region" aria-label="总结汇报结构化提词条">
            <span className={styles['summary-cue-lead']}>🎯 提词/助攻</span>
            {summaryCueItems.map((cue) => (
              <button
                key={cue.id}
                type="button"
                className={`${styles['summary-cue-pill']} ${highlightedBoardNode === cue.id ? styles['summary-cue-pill-active'] : ''}`}
                onClick={() => handleClickSummaryCue(cue)}
                title="自己汇报可填入要点，队友汇报可点击为其同步高亮助攻"
              >
                <strong>{cue.badge}</strong>
                <span>{cue.text}</span>
              </button>
            ))}
          </div>
        )}

        <div className={styles['dock-capsule']}>
          <button
            type="button"
            className={`${styles['buzz-trigger-btn']} ${micGranted ? styles['buzz-trigger-live'] : buzzWindowActive && canInteract ? styles['buzz-trigger-window'] : ''}`}
            onClick={handleGrabMic}
            disabled={!canInteract}
            aria-label={micGranted ? '释放话筒' : '立即抢答发言'}
            title="立即抢答控麦（快捷键 Space）"
          >
            <span>{micGranted ? '🔊' : '⚡'}</span>
            <span>{micGranted ? '控麦中' : '抢答'}</span>
          </button>

          <button
            type="button"
            className={`${styles['dock-round-btn']} ${userQueueRank > 0 ? styles['dock-round-queued'] : ''}`}
            onClick={handleToggleQueueSpeak}
            disabled={!canInteract}
            aria-label={userQueueRank > 0 ? '取消排麦' : '顺位排麦'}
            title="加入下一顺位排序发言（不打断当前发言人）"
          >
            {userQueueRank > 0 ? `#${userQueueRank}` : '⏭'}
          </button>

          <button
            type="button"
            className={`${styles['dock-round-btn']} ${handRaised ? styles['dock-round-queued'] : ''}`}
            onClick={handleToggleHandRaise}
            disabled={!canInteract}
            aria-label="举手礼貌示意"
            title="举手示意协调员让麦"
          >
            {handRaised ? '🙋' : '✋'}
          </button>

          <button
            type="button"
            className={`${styles['dock-round-btn']} ${activeDockMenu === 'identity' ? styles['hud-icon-active'] : ''}`}
            onClick={() => setActiveDockMenu((m) => (m === 'identity' ? null : 'identity'))}
            disabled={!canInteract}
            aria-label="选择发言身份"
            title={`当前身份：${userIdentityMeta.short}（点击切换）`}
          >
            {userIdentityKey === 'undetermined' ? '🎭' : userIdentityMeta.icon}
          </button>

          <button
            type="button"
            className={`${styles['dock-round-btn']} ${activeDockMenu === 'cues' ? styles['hud-icon-active'] : ''}`}
            onClick={() => setActiveDockMenu((m) => (m === 'cues' ? null : 'cues'))}
            disabled={!canInteract}
            aria-label="破局思路提示"
            title="按需查看发言切入点"
          >
            💡
          </button>

          <input
            ref={inputRef}
            type="text"
            className={styles['dock-input']}
            placeholder={
              !seatDrawDone
                ? '点击圆桌中央「开始」入座…'
                : phase === 'examiner_followup'
                  ? '回应考官压力追问（捍卫评判标准与底线指标），按 Enter 发送…'
                  : micGranted
                    ? `${userSeat}号发言中，按 Enter 发送…`
                    : phase === 'free_discussion'
                      ? '直接输入锁麦，或点「⚡ 抢答」夺麦…'
                      : canInteract
                        ? '轮到或抢答后发言…'
                        : '审题构思中…'
            }
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={!canTypeDirectly}
          />

          <button
            type="button"
            className={`${styles['dock-round-btn']} ${isVoiceListening ? styles['dock-round-listening'] : ''}`}
            onClick={handleToggleVoiceInput}
            disabled={!canInteract}
            aria-label={isVoiceListening ? '停止语音输入' : '语音输入'}
            title="语音直接转文字"
          >
            🎙
          </button>

          <button
            type="button"
            className={styles['dock-send-btn']}
            onClick={handleSend}
            disabled={!canTypeDirectly || !inputValue.trim()}
            aria-label="发送发言"
            title="发送发言（Enter）"
          >
            ↑
          </button>
        </div>
      </footer>

      {/* 4. On-Demand Drawers, Structured Three-Column Visual Board & Post-Session Evaluation Sheet */}
      <VisualBoardSheet
        open={openDrawer === 'board'}
        onClose={() => setOpenDrawer(null)}
        visualBoard={visualBoard}
        boardAuthorized={boardAuthorized}
        boardAlignmentCount={boardAlignmentCount}
        phase={phase}
        remainingSeconds={remainingSeconds}
        totalPhaseSeconds={totalPhaseSeconds}
        messages={messages}
        notes={notes}
        onChangeNotes={setNotes}
        onUpdateBoard={handleUpdateVisualBoard}
        onRequestAuthorization={handleRequestBoardAuthorization}
        onBroadcastAlignment={handleBroadcastBoardAlignment}
      />

      <RoomSlideDrawers
        openDrawer={openDrawer}
        onCloseDrawer={() => setOpenDrawer(null)}
        seatDrawDone={seatDrawDone}
        phase={phase}
        readingCollapsed={readingCollapsed}
        onCollapseReading={() => setReadingCollapsed(true)}
        onAdvanceFromReading={() => advancePhase('reading')}
        remainingSeconds={remainingSeconds}
        topic={topic}
        material={material}
        notes={notes}
        onChangeNotes={setNotes}
        messages={messages}
        findAgent={findAgent}
        liveSummary={liveSummary}
        onSyncSummaryToNotes={handleSyncSummaryToNotes}
        seatMap={seatMap}
        userSeat={userSeat}
        userIdentityKey={userIdentityKey}
        electedReporterId={electedReporterId}
        onElectReporter={handleElectReporter}
        observerTags={observerTags}
        participantRoles={participantRoles}
        advancementQuota={advancementQuota}
        score={score}
        lgdMetrics={lgdMetrics}
        onBackLobby={() => navigate('/lgd/lobby')}
        onProceedSingleInterview={() => navigate('/interview/lobby?from_lgd=1')}
      />

      {showResearchFollowup && completedSessionId && (
        <ResearchFollowupCard
          sessionId={completedSessionId}
          onDone={() => setShowResearchFollowup(false)}
        />
      )}

      <KeyboardShortcutsHelp open={showKeyboardHelp} onClose={() => setShowKeyboardHelp(false)} />
    </div>
  )
}
