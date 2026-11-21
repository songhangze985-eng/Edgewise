function createClientEventId() {
  const crypto = globalThis.crypto
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID()
  if (typeof crypto?.getRandomValues === 'function') {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
  }
  return null
}

export function formatResearchEvent(event, payload = {}, timestamp = new Date().toISOString()) {
  const clientEventId = createClientEventId()
  const props = { ...payload }
  delete props._client_event_id
  if (clientEventId) props._client_event_id = clientEventId
  return { event, ts: timestamp, props }
}

// Events queued before the API contract was corrected used top-level properties.
export function normalizeResearchEvent(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return { event: '', ts: null, props: {} }
  }
  const { event, ts, recorded_at, props, ...legacyProps } = entry
  return {
    event,
    ts: ts || recorded_at || null,
    props: { ...legacyProps, ...(props && typeof props === 'object' ? props : {}) },
  }
}

export function researchQueueKey(userId) {
  return userId ? `edgewise:research_event_retry_queue:${encodeURIComponent(userId)}` : null
}
