import { postResearchEvents } from '../api/research'

const OFFLINE_QUEUE_KEY = 'edgewise:research_event_retry_queue'
const MAX_OFFLINE_BUFFER = 100
let flushInFlight = false

function readOfflineQueue() {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeOfflineQueue(items) {
  try {
    if (typeof localStorage === 'undefined') return
    if (!items || items.length === 0) {
      localStorage.removeItem(OFFLINE_QUEUE_KEY)
    } else {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items.slice(-MAX_OFFLINE_BUFFER)))
    }
  } catch {
    /* ignore storage quota errors */
  }
}

function enqueueOfflineEvent(body) {
  const queue = readOfflineQueue()
  queue.push(body)
  writeOfflineQueue(queue)
}

/**
 * Flush any buffered research events that failed while offline.
 */
export async function flushOfflineResearchEvents() {
  if (flushInFlight) return 0
  const queue = readOfflineQueue()
  if (queue.length === 0) return 0
  flushInFlight = true
  try {
    await postResearchEvents(queue)
    writeOfflineQueue([])
    return queue.length
  } catch {
    return 0
  } finally {
    flushInFlight = false
  }
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('online', () => {
    flushOfflineResearchEvents().catch(() => {})
  })
}

/**
 * Fire-and-forget research telemetry with offline retry buffer.
 */
export function trackResearchEvent(event, payload = {}) {
  if (typeof event !== 'string' || !event) return
  const body = {
    event,
    ...payload,
    recorded_at: new Date().toISOString(),
  }
  try {
    const buffered = readOfflineQueue()
    const batch = buffered.length > 0 ? [...buffered.slice(-20), body] : [body]
    postResearchEvents(batch)
      .then(() => {
        if (buffered.length > 0) {
          const remaining = buffered.slice(0, Math.max(0, buffered.length - 20))
          writeOfflineQueue(remaining)
        }
      })
      .catch(() => {
        enqueueOfflineEvent(body)
      })
  } catch {
    enqueueOfflineEvent(body)
  }
}

export function getOfflineResearchQueueSize() {
  return readOfflineQueue().length
}
