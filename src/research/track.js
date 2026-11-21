import { postResearchEvents } from '../api/research'
import { formatResearchEvent, normalizeResearchEvent, researchQueueKey } from './eventFormat'

let flushInFlight = false

function currentAccount() {
  try {
    const state = JSON.parse(localStorage.getItem('edgewise-auth') || '{}').state || {}
    if (state.user?.id && state.accessToken) return { id: state.user.id, token: state.accessToken, consent: state.user.researchConsent }
  } catch {
    // Storage is unavailable or the account is not yet known.
  }
  return null
}

function readOfflineQueue(key) {
  try {
    if (!key) return []
    const parsed = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeOfflineQueue(key, items) {
  try {
    if (!key) return false
    if (items.length) localStorage.setItem(key, JSON.stringify(items))
    else localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export async function flushOfflineResearchEvents() {
  if (flushInFlight) return 0
  const account = currentAccount()
  if (!account) return 0
  const key = researchQueueKey(account.id)
  flushInFlight = true
  let sent = 0
  try {
    while (currentAccount()?.id === account.id) {
      const batch = readOfflineQueue(key).slice(0, 100)
      if (!batch.length) break
      const result = await postResearchEvents(batch.map(normalizeResearchEvent), account.token)
      const remaining = readOfflineQueue(key)
      if (JSON.stringify(remaining.slice(0, batch.length)) !== JSON.stringify(batch)) break
      const outcomes = result?.outcomes
      const perEvent = Array.isArray(outcomes) && outcomes.length === batch.length
      if (!perEvent && result?.accepted !== batch.length) break
      const retry = perEvent
        ? batch.filter((_, index) => !['accepted', 'duplicate', 'rejected'].includes(outcomes[index]?.status))
        : []
      if (!writeOfflineQueue(key, [...remaining.slice(batch.length), ...retry])) break
      sent += Number.isInteger(result?.accepted) ? result.accepted : 0
      if (retry.length || (perEvent && outcomes.some(outcome => outcome?.status === 'rejected'))) {
        console.warn("Some research events were not accepted", { accepted: result?.accepted, total: batch.length, outcomes: result?.outcomes })
      }
      if (retry.length) break
    }
  } catch {
    // Keep unsent events for the same account to retry when connectivity returns.
  } finally {
    flushInFlight = false
    if (currentAccount()?.id && currentAccount()?.id !== account.id) {
      queueMicrotask(() => flushOfflineResearchEvents().catch(() => {}))
    }
  }
  return sent
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('online', () => {
    flushOfflineResearchEvents().catch(() => {})
  })
}

export function trackResearchEvent(event, payload = {}) {
  if (typeof event !== 'string' || !event) return
  const account = currentAccount()
  if (!account?.consent?.accepted || account.consent.withdrawnAt || !account.consent.acceptedAt) return
  const key = researchQueueKey(account.id)
  const queue = readOfflineQueue(key)
  queue.push(formatResearchEvent(event, { ...payload, _consent_accepted_at: account.consent.acceptedAt }))
  if (writeOfflineQueue(key, queue)) flushOfflineResearchEvents().catch(() => {})
}

export function getOfflineResearchQueueSize() {
  return readOfflineQueue(researchQueueKey(currentAccount()?.id)).length
}
