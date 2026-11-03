import { create } from 'zustand'
import { PHASE_DEFS } from '../features/lgd/lgdScripts'

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
    set({
      ...INITIAL_STATE,
      memorySnapshot: mem,
      llmConfig: get().llmConfig,
      phase: 'reading',
      topic,
      material,
      topicType: options.topicType || null,
      userRole: options.userRole || 'member',
      scriptId: options.scriptId || 'standard_flow',
      memoryEnabled: options.memoryEnabled ?? true,
      apiMode: options.apiMode || 'hybrid_sandbox',
      notes: (options.memoryEnabled !== false && mem?.notes) ? mem.notes : '',
      phasePlan,
      remainingSeconds: secondsForPhase(phasePlan, 'reading') || DEFAULT_PHASE_SECONDS.reading,
      isSimulating: true,
    })
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

