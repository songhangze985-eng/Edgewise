import { postResearchEvents } from '../api/research'

/**
 * Fire-and-forget research telemetry. Safe when API unavailable.
 */
export function trackResearchEvent(event, payload = {}) {
  if (typeof event !== 'string' || !event) return
  const body = {
    event,
    ...payload,
    recorded_at: new Date().toISOString(),
  }
  try {
    postResearchEvents([body]).catch(() => {
      /* TODO: offline buffer when events API unavailable */
    })
  } catch {
    /* stub — no throw */
  }
}
