import { create } from 'zustand'
import {
  DEFAULT_SEAT_MAP,
  PHASE_DEFS,
  buildSortedSpeakerQueue,
  generateInitialParticipantRoles,
  generateShuffledSeats,
  mapIdentityToScorerRole,
} from '../features/lgd/lgdScripts.js'
import { createInitialVisualBoard } from '../features/lgd/visualBoardModels.js'

const LGD_MEMORY_STORAGE_KEY = 'edgewise.lgd.memory.v1'
const LGD_API_CONFIG_KEY = 'edgewise.lgd.api_config.v1'

function loadLocalMemory() {
  try {
    const raw = localStorage.getItem(LGD_MEMORY_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveLocalMemory(data) {
  try {
    localStorage.setItem(LGD_MEMORY_STORAGE_KEY, JSON.stringify(data))
  } catch {
    /* ignore */
  }
}

function loadLocalApiConfig() {
  try {
    const raw = localStorage.getItem(LGD_API_CONFIG_KEY)
    if (!raw) {
      return {
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
      }
    }
    return JSON.parse(raw)
  } catch {
    return {
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
    }
  }
}

function saveLocalApiConfig(cfg) {
  try {
    localStorage.setItem(LGD_API_CONFIG_KEY, JSON.stringify(cfg))
  } catch {
    /* ignore */
  }
}

const DEFAULT_PHASE_SECONDS = {
  reading: 90,
  personal_statement: 480,
  free_discussion: 600,
  summary_report: 180,
  examiner_followup: 120,
  completed: 0,
}

const INITIAL_STATE = {
  phase: 'lobby',
  topic: '',
  material: '',
  topicType: null,
  userRole: 'member',
  scriptId: 'standard_flow',
  memoryEnabled: true,
  apiMode: 'hybrid_sandbox',
  phasePlan: [],
  messages: [],
  agents: [],
  currentSpeaker: null,
  remainingSeconds: 0,
  userSpeakCount: 0,
  agentSpeakCounts: {},
  micGranted: false,
  votes: {},
  score: null,
  lgdMetrics: null,
  isSimulating: false,
  notes: '',
  lastSandboxMeta: null,
  seatStates: {},
  seatThoughts: {},
  lastBiddingResult: null,
  typingLockActive: false,
  typingLockUntil: 0,
  observerTags: [],
  seatDrawDone: false,
  identityMode: 'undetermined',
  seatMap: { ...DEFAULT_SEAT_MAP },
  userSeat: 4,
  participantRoles: {},
  speakerQueue: [],
  visualBoard: null,
  boardAuthorized: false,
  boardAlignmentCount: 0,
  boardUnspeakingEdits: 0,
  highlightedBoardNode: null,
  reporterAssistCount: 0,
  followupQa: [],
  followupStep: 0,
  advancementQuota: 3,
}

function secondsForPhase(phasePlan, phase) {
  const row = (phasePlan || []).find((p) => p.name === phase)
  if (row && row.seconds) return row.seconds
  return DEFAULT_PHASE_SECONDS[phase] ?? 0
}

const useLgdStore = create((set, get) => ({
  ...INITIAL_STATE,
  memorySnapshot: loadLocalMemory(),
  llmConfig: loadLocalApiConfig(),

  initRoom(topic, material, options = {}) {
    const phasePlan = options.phases?.length ? options.phases : []
    const mem = get().memorySnapshot
    const shuffled = options.seatMap
      ? { seatMap: options.seatMap, userSeat: options.seatMap.user || 4 }
      : generateShuffledSeats()
    const requestedMode =
      options.identityMode ||
      (options.roleMode === 'random'
        ? 'random'
        : options.roleMode === 'undetermined' || options.userRole === 'undetermined'
          ? 'undetermined'
          : 'undetermined')
    const initialRoles = generateInitialParticipantRoles(
      requestedMode,
      shuffled.seatMap,
      options.userRole && options.userRole !== 'undetermined' ? options.userRole : 'member',
    )
    const resolvedUserRole =
      requestedMode === 'undetermined'
        ? 'undetermined'
        : mapIdentityToScorerRole(initialRoles.user)
    set({
      ...INITIAL_STATE,
      memorySnapshot: mem,
      llmConfig: get().llmConfig,
      phase: 'reading',
      topic,
      material,
      topicType: options.topicType || null,
      userRole: resolvedUserRole,
      scriptId: options.scriptId || 'standard_flow',
      memoryEnabled: options.memoryEnabled ?? true,
      apiMode: options.apiMode || 'hybrid_sandbox',
      notes: (options.memoryEnabled !== false && mem?.notes) ? mem.notes : '',
      phasePlan,
      remainingSeconds: secondsForPhase(phasePlan, 'reading') || DEFAULT_PHASE_SECONDS.reading,
      isSimulating: true,
      seatDrawDone: Boolean(options.skipSeatDraw),
      identityMode: requestedMode,
      seatMap: shuffled.seatMap,
      userSeat: shuffled.userSeat,
      participantRoles: initialRoles,
      speakerQueue: [],
      visualBoard: createInitialVisualBoard({
        topic,
        material,
        topicType: options.topicType || 'open',
      }),
      boardAuthorized: false,
      boardAlignmentCount: 0,
      boardUnspeakingEdits: 0,
      highlightedBoardNode: null,
      reporterAssistCount: 0,
      followupQa: [],
      followupStep: 0,
      advancementQuota: Math.max(1, Math.min(4, Number(options.advancementQuota || mem?.advancement_quota || 3))),
    })
  },

  setAdvancementQuota(quota) {
    set({ advancementQuota: Math.max(1, Math.min(4, Number(quota) || 3)) })
  },

  rerollRoomSeats() {
    const state = get()
    const shuffled = generateShuffledSeats()
    const roles = generateInitialParticipantRoles(
      state.identityMode,
      shuffled.seatMap,
      state.userRole !== 'undetermined' ? state.userRole : 'member',
    )
    set({
      seatMap: shuffled.seatMap,
      userSeat: shuffled.userSeat,
      participantRoles: roles,
      userRole:
        state.identityMode === 'undetermined'
          ? 'undetermined'
          : mapIdentityToScorerRole(roles.user),
    })
    return { seatMap: shuffled.seatMap, userSeat: shuffled.userSeat, participantRoles: roles }
  },

  selectIdentityMode(mode, pickedRole = 'member') {
    const state = get()
    const normMode = mode === 'random' ? 'random' : mode === 'pick' ? 'pick' : 'undetermined'
    const roles = generateInitialParticipantRoles(normMode, state.seatMap, pickedRole)
    const nextUserRole =
      normMode === 'undetermined' ? 'undetermined' : mapIdentityToScorerRole(roles.user)
    set({
      identityMode: normMode,
      participantRoles: roles,
      userRole: nextUserRole,
    })
    return { identityMode: normMode, participantRoles: roles, userRole: nextUserRole }
  },

  confirmSeatDraw() {
    set({ seatDrawDone: true })
  },

  claimParticipantRole(participantId, roleId) {
    if (!participantId || !roleId) return
    set((state) => {
      const nextRoles = {
        ...state.participantRoles,
        [participantId]: roleId,
      }
      const nextUserRole =
        participantId === 'user'
          ? roleId === 'undetermined'
            ? 'undetermined'
            : mapIdentityToScorerRole(roleId)
          : state.userRole
      const nextQueue = state.speakerQueue.map((item) =>
        item.id === participantId ? { ...item, roleId } : item,
      )
      return {
        participantRoles: nextRoles,
        userRole: nextUserRole,
        speakerQueue: nextQueue,
      }
    })
  },

  enqueueUserToSpeak(pendingRoleId = null) {
    set((state) => {
      const roleKey = pendingRoleId || state.participantRoles?.user || 'undetermined'
      const userEntry = {
        id: 'user',
        seat: state.userSeat || 4,
        name: '你',
        emoji: '👤',
        color: '#9b6fc7',
        roleId: roleKey,
        roleShort: roleKey === 'undetermined' ? '待定' : roleKey,
        source: 'user_grab',
        enqueuedAt: Date.now(),
      }
      const withoutUser = state.speakerQueue.filter((item) => item.id !== 'user')
      const merged = [userEntry, ...withoutUser].map((item, idx) => ({
        ...item,
        rank: idx + 1,
      }))
      return { speakerQueue: merged }
    })
  },

  removeFromSpeakerQueue(participantId) {
    set((state) => ({
      speakerQueue: state.speakerQueue
        .filter((item) => item.id !== participantId)
        .map((item, idx) => ({ ...item, rank: idx + 1 })),
    }))
  },

  dequeueSpeakerQueueHead() {
    const cur = get().speakerQueue
    if (!cur.length) return null
    const [head, ...rest] = cur
    set({
      speakerQueue: rest.map((item, idx) => ({ ...item, rank: idx + 1 })),
    })
    return head
  },

  syncSpeakerQueueFromBids(bids, activeSpeakerId = null) {
    set((state) => ({
      speakerQueue: buildSortedSpeakerQueue({
        bids,
        existingQueue: state.speakerQueue,
        activeSpeakerId: activeSpeakerId ?? state.currentSpeaker,
        seatMap: state.seatMap,
        participantRoles: state.participantRoles,
        identityMode: state.identityMode,
      }),
    }))
  },

  clearSpeakerQueue() {
    set({ speakerQueue: [] })
  },

  setPhase(phase) {
    const { phasePlan } = get()
    set({
      phase,
      remainingSeconds: secondsForPhase(phasePlan, phase),
    })
  },

  addMessage(msg) {
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...msg,
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: Date.now(),
          phase: msg.phase || state.phase,
        },
      ],
    }))
  },

  setNotes(notes) {
    set({ notes })
  },

  setLastSandboxMeta(meta) {
    set({ lastSandboxMeta: meta })
  },

  updateMemorySnapshot(patch) {
    const next = {
      ...(get().memorySnapshot || {}),
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    saveLocalMemory(next)
    set({ memorySnapshot: next })
    return next
  },

  updateLlmConfig(patch) {
    const next = {
      ...(get().llmConfig || {}),
      ...patch,
    }
    saveLocalApiConfig(next)
    set({ llmConfig: next })
    return next
  },

  grabMic() {
    set({ micGranted: true, currentSpeaker: 'user' })
  },

  releaseMic() {
    set((state) => ({
      micGranted: false,
      currentSpeaker: null,
      userSpeakCount: state.userSpeakCount + 1,
    }))
  },

  vote(targetId) {
    set((state) => ({
      votes: { ...state.votes, [targetId]: (state.votes[targetId] || 0) + 1 },
    }))
  },

  tick() {
    set((state) => {
      if (state.remainingSeconds <= 0) return state
      return { remainingSeconds: state.remainingSeconds - 1 }
    })
  },

  setCurrentSpeaker(id) {
    set({ currentSpeaker: id })
  },

  setIsSimulating(val) {
    set({ isSimulating: val })
  },

  incrementAgentSpeakCount(agentId) {
    set((state) => ({
      agentSpeakCounts: {
        ...state.agentSpeakCounts,
        [agentId]: (state.agentSpeakCounts[agentId] || 0) + 1,
      },
    }))
  },

  setScore(score) {
    set({ score })
  },

  setLgdMetrics(metrics) {
    set({ lgdMetrics: metrics })
  },

  setSeatState(seatId, uiState) {
    if (!seatId) return
    set((state) => ({
      seatStates: {
        ...state.seatStates,
        [seatId]: uiState || 'listening',
      },
    }))
  },

  setBulkSeatStates(nextMap) {
    set((state) => ({
      seatStates: {
        ...state.seatStates,
        ...(nextMap || {}),
      },
    }))
  },

  setSeatThought(seatId, thought) {
    if (!seatId) return
    set((state) => ({
      seatThoughts: {
        ...state.seatThoughts,
        [seatId]: thought || '',
      },
    }))
  },

  clearSeatThoughts(seatId = null) {
    if (seatId) {
      set((state) => {
        const next = { ...state.seatThoughts }
        delete next[seatId]
        return { seatThoughts: next }
      })
      return
    }
    set({ seatThoughts: {} })
  },

  setLastBiddingResult(result) {
    set({ lastBiddingResult: result || null })
  },

  setTypingLock(active, ttlMs = 15000) {
    set({
      typingLockActive: Boolean(active),
      typingLockUntil: active ? Date.now() + Math.max(1000, ttlMs) : 0,
    })
  },

  appendObserverTags(tags) {
    const list = Array.isArray(tags) ? tags : tags ? [tags] : []
    if (!list.length) return
    set((state) => ({
      observerTags: [...state.observerTags, ...list].slice(-60),
    }))
  },

  updateVisualBoard(updater, { countEdit = true } = {}) {
    set((state) => {
      const base =
        state.visualBoard ||
        createInitialVisualBoard({
          topic: state.topic,
          material: state.material,
          topicType: state.topicType || 'open',
        })
      const nextBoard = typeof updater === 'function' ? updater(base) : { ...base, ...(updater || {}) }
      const shouldCount = countEdit && state.phase === 'free_discussion'
      return {
        visualBoard: nextBoard,
        boardUnspeakingEdits: shouldCount ? state.boardUnspeakingEdits + 1 : state.boardUnspeakingEdits,
      }
    })
  },

  authorizeVisualBoard() {
    set({ boardAuthorized: true })
  },

  recordBoardAlignment() {
    set((state) => ({
      boardAuthorized: true,
      boardAlignmentCount: state.boardAlignmentCount + 1,
    }))
  },

  resetUnspeakingEdits() {
    set({ boardUnspeakingEdits: 0 })
  },

  triggerReporterAssist(nodeId) {
    set((state) => ({
      highlightedBoardNode: nodeId,
      reporterAssistCount: state.reporterAssistCount + 1,
    }))
  },

  appendFollowupQa(entry) {
    if (!entry) return
    set((state) => ({
      followupQa: [...state.followupQa, entry],
    }))
  },

  setFollowupStep(step) {
    set({ followupStep: Number(step) || 0 })
  },

  reset() {
    set((state) => ({
      ...INITIAL_STATE,
      memorySnapshot: state.memorySnapshot,
      llmConfig: state.llmConfig,
    }))
  },
}))

export { PHASE_DEFS, DEFAULT_PHASE_SECONDS }
export default useLgdStore

