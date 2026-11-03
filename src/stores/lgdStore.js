import { create } from 'zustand'
import { PHASE_DEFS } from '../features/lgd/lgdScripts'

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
}

function secondsForPhase(phasePlan, phase) {
  const row = (phasePlan || []).find((p) => p.name === phase)
  if (row && row.seconds) return row.seconds
  return DEFAULT_PHASE_SECONDS[phase] ?? 0
}

const useLgdStore = create((set, get) => ({
  ...INITIAL_STATE,

  initRoom(topic, material, options = {}) {
    const phasePlan = options.phases?.length ? options.phases : []
    set({
      ...INITIAL_STATE,
      phase: 'reading',
      topic,
      material,
      topicType: options.topicType || null,
      userRole: options.userRole || 'member',
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
    set(INITIAL_STATE)
  },
}))

export { PHASE_DEFS, DEFAULT_PHASE_SECONDS }
export default useLgdStore
