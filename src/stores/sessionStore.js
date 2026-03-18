import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useSessionStore = create(
  persist(
    (set, get) => ({
      sessions: [],
      stats: {
        totalSessions: 0,
        totalDuration: 0,
        avgScore: 0,
        streak: 0,
        lastPracticeDate: null,
      },

      addSession(session) {
        const newSession = {
          id: `s-${Date.now()}`,
          date: new Date().toISOString().split('T')[0],
          time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          ...session,
        }
        set((state) => {
          const sessions = [newSession, ...state.sessions].slice(0, 50)
          const totalSessions = sessions.length
          const totalDuration = sessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0)
          const scores = sessions.filter((s) => s.score).map((s) => s.score)
          const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0

          const today = new Date().toISOString().split('T')[0]
          const lastDate = state.stats.lastPracticeDate
          let streak = state.stats.streak
          if (lastDate !== today) {
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
            streak = lastDate === yesterday ? streak + 1 : 1
          }

          return {
            sessions,
            stats: {
              totalSessions,
              totalDuration,
              avgScore,
              streak,
              lastPracticeDate: today,
            },
          }
        })
        return newSession
      },

      getRecentSessions(limit = 5) {
        return get().sessions.slice(0, limit)
      },

      getSessionsByType(type) {
        return get().sessions.filter((s) => s.type === type)
      },
    }),
    { name: 'edgewise-sessions' }
  )
)

export default useSessionStore
