import { create } from 'zustand'

const INITIAL_STATE = {
  phase: 'lobby',
  topic: '',
  material: '',
  messages: [],
  agents: [],
  currentSpeaker: null,
  remainingSeconds: 0,
  userSpeakCount: 0,
  agentSpeakCounts: {},
  micGranted: false,
  votes: {},
  score: null,
  isSimulating: false,
}

const useLgdStore = create((set, get) => ({
  ...INITIAL_STATE,

  initRoom(topic, material) {
    set({
      ...INITIAL_STATE,
      phase: 'reading',
      topic,
      material,
      remainingSeconds: 30,
      isSimulating: true,
    })
  },

  setPhase(phase) {
    const durations = {
      reading: 30,
      sequential: 300,
      free_discussion: 180,
      voting: 60,
      summary: 60,
      completed: 0,
    }
    set({
      phase,
      remainingSeconds: durations[phase] ?? 0,
    })
  },

  addMessage(msg) {
    set((state) => ({
      messages: [
        ...state.messages,
        { ...msg, id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, timestamp: Date.now() },
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

  reset() {
    set(INITIAL_STATE)
  },
}))

export default useLgdStore
