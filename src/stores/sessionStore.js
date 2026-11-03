import { create } from 'zustand'
import * as dashboardApi from '../api/dashboard'
import * as interviewApi from '../api/interview'
import useResearchStore from './researchStore'

function mapSession(session) {
  const dimensions = session.metadata?.dimensions || null
  return {
    id: session.id,
    type: session.type,
    topic: session.topic || '练习会话',
    score: session.score,
    date: session.date,
    time: session.time,
    durationMinutes: session.duration_minutes,
    status: session.status,
    position: session.position,
    difficulty: session.difficulty,
    dimensions,
    metadata: session.metadata || {},
    deliverySummary: session.metadata?.delivery_summary || null,
  }
}

function aggregateRadar(sessions) {
  const keys = ['expression', 'logic', 'logicality', 'leadership', 'teamwork', 'adaptability']
  const labels = {
    expression: '表达力',
    logic: '逻辑力',
    logicality: '逻辑性',
    leadership: '领导力',
    teamwork: '协作力',
    adaptability: '应变力',
  }
  const totals = Object.fromEntries(keys.map((k) => [k, { sum: 0, n: 0 }]))
  const recent = sessions.slice(0, 5)
  for (const session of recent) {
    const dims = session.dimensions || {}
    for (const key of keys) {
      if (typeof dims[key] === 'number') {
        totals[key].sum += dims[key]
        totals[key].n += 1
      }
    }
  }
  return keys.map((key) => ({
    axis: labels[key],
    value: totals[key].n ? Math.round(totals[key].sum / totals[key].n) : 0,
    fullMark: 100,
  }))
}

const useSessionStore = create((set, get) => ({
  sessions: [],
  radarData: [
    { axis: '表达力', value: 0, fullMark: 100 },
    { axis: '逻辑力', value: 0, fullMark: 100 },
    { axis: '逻辑性', value: 0, fullMark: 100 },
    { axis: '领导力', value: 0, fullMark: 100 },
    { axis: '协作力', value: 0, fullMark: 100 },
    { axis: '应变力', value: 0, fullMark: 100 },
  ],
  stats: {
    totalSessions: 0,
    totalDuration: 0,
    avgScore: 0,
    streak: 0,
    credits: 0,
    lastPracticeDate: null,
  },
  loading: false,
  error: null,

  async refresh() {
    set({ loading: true, error: null })
    try {
      const [overview, recent] = await Promise.all([
        dashboardApi.getOverview(),
        dashboardApi.getRecentSessions(),
      ])
      const sessions = recent.map(mapSession)
      const totalDuration = sessions.reduce(
        (sum, s) => sum + (s.durationMinutes || 0),
        0
      )
      set({
        sessions,
        radarData: aggregateRadar(sessions),
        stats: {
          totalSessions: overview.total_sessions,
          totalDuration,
          avgScore: overview.avg_score,
          streak: overview.streak,
          credits: overview.credits,
          lastPracticeDate: sessions[0]?.date || null,
        },
        loading: false,
      })
      return sessions
    } catch (error) {
      set({ loading: false, error })
      throw error
    }
  },

  async recordAndComplete({
    type = 'interview',
    topic,
    position,
    difficulty,
    score,
    durationMinutes,
    dimensions = {},
    metadata = {},
    messages = null,
    transcript = null,
    sessionId = null,
  }) {
    let id = sessionId
    const researchMeta = useResearchStore.getState().getSessionMetadata()
    const mergedMetadata = { ...researchMeta, ...metadata }
    if (!id) {
      const created = await interviewApi.createSession(
        {
          type,
          topic,
          position,
          difficulty,
          metadata: mergedMetadata,
        },
        { skipErrorToast: true },
      )
      id = created.id
    }
    const completed = await interviewApi.completeSession(
      id,
      {
        score,
        duration_minutes: durationMinutes,
        dimensions,
        messages: messages || undefined,
        transcript: transcript || undefined,
        metadata: Object.keys(mergedMetadata).length ? mergedMetadata : undefined,
      },
      { skipErrorToast: true },
    )
    await get().refresh()
    return mapSession(completed)
  },

  getRecentSessions(limit = 5) {
    return get().sessions.slice(0, limit)
  },

  getSessionsByType(type) {
    return get().sessions.filter((s) => s.type === type)
  },

  getSessionById(id) {
    return get().sessions.find((s) => s.id === id) || null
  },
}))

export default useSessionStore
