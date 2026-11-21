import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { formatResearchEvent, normalizeResearchEvent, researchQueueKey } from '../src/research/eventFormat.js'

test('an account switch cannot send a queued event with another account token', async () => {
  const data = new Map()
  const localStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  }
  const calls = []
  let finishFirst
  const postResearchEvents = (events, token) => {
    calls.push({ events, token })
    if (calls.length === 1) return new Promise((resolve) => { finishFirst = resolve })
    return Promise.resolve({ accepted: events.length })
  }
  const code = fs.readFileSync(new URL('../src/research/track.js', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '')
    .replace(/export /g, '')
    + '\nglobalThis.track = trackResearchEvent;'
  const context = vm.createContext({ localStorage, postResearchEvents, formatResearchEvent, normalizeResearchEvent, researchQueueKey, queueMicrotask })
  vm.runInContext(code, context)
  const setAccount = (id) => localStorage.setItem('edgewise-auth', JSON.stringify({ state: { user: { id, researchConsent: { accepted: true, acceptedAt: '2026-01-01' } }, accessToken: `${id}-token` } }))

  setAccount('alice')
  context.track('report.view', { session_id: 'alice-session' })
  setAccount('bob')
  context.track('feedback.view', { session_id: 'bob-session' })
  finishFirst({ accepted: 1 })
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(calls.length, 2)
  assert.equal(calls[0].token, 'alice-token')
  assert.equal(calls[0].events[0].props.session_id, 'alice-session')
  assert.equal(calls[0].events[0].props._consent_accepted_at, '2026-01-01')
  assert.equal(calls[1].token, 'bob-token')
  assert.equal(calls[1].events[0].props.session_id, 'bob-session')
  assert.equal(localStorage.getItem(researchQueueKey('alice')), null)
  assert.equal(localStorage.getItem(researchQueueKey('bob')), null)
})

test('a successful mixed batch reports the accepted count and rejected outcomes', async () => {
  const key = researchQueueKey('alice')
  const entries = [{ event: 'report.view' }, { event: 'not.allowed' }]
  const data = new Map([
    ['edgewise-auth', JSON.stringify({ state: { user: { id: 'alice' }, accessToken: 'token' } })],
    [key, JSON.stringify(entries)],
  ])
  const localStorage = {
    getItem: (name) => data.get(name) ?? null,
    setItem: (name, value) => data.set(name, value),
    removeItem: (name) => data.delete(name),
  }
  const warnings = []
  const outcomes = [{ status: 'accepted', event_id: '1-0' }, { status: 'rejected', reason: 'event_not_allowed' }]
  const code = fs.readFileSync(new URL('../src/research/track.js', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '')
    .replace(/export /g, '')
    + '\nglobalThis.flush = flushOfflineResearchEvents;'
  const context = vm.createContext({
    localStorage, formatResearchEvent, normalizeResearchEvent, researchQueueKey, queueMicrotask,
    postResearchEvents: async () => ({ accepted: 1, outcomes }),
    console: { warn: (...args) => warnings.push(args) },
  })
  vm.runInContext(code, context)
  assert.equal(await context.flush(), 1)
  assert.equal(data.has(key), false)
  assert.equal(warnings.length, 1)
  assert.equal(warnings[0][1].outcomes[1].reason, 'event_not_allowed')
})

test('an offline retry retains the event identifier', async () => {
  const key = researchQueueKey('alice')
  const entry = formatResearchEvent('report.view', { session_id: 's1' })
  const data = new Map([
    ['edgewise-auth', JSON.stringify({ state: { user: { id: 'alice' }, accessToken: 'token' } })],
    [key, JSON.stringify([entry])],
  ])
  const localStorage = {
    getItem: (name) => data.get(name) ?? null,
    setItem: (name, value) => data.set(name, value),
    removeItem: (name) => data.delete(name),
  }
  const calls = []
  const postResearchEvents = async (events) => {
    calls.push(events[0].props._client_event_id)
    if (calls.length === 1) throw new Error('offline')
    return { accepted: 1 }
  }
  const code = fs.readFileSync(new URL('../src/research/track.js', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '').replace(/export /g, '') + '\nglobalThis.flush = flushOfflineResearchEvents;'
  const context = vm.createContext({ localStorage, postResearchEvents, formatResearchEvent, normalizeResearchEvent, researchQueueKey, queueMicrotask })
  vm.runInContext(code, context)
  assert.equal(await context.flush(), 0)
  assert.equal(await context.flush(), 1)
  assert.equal(calls[0], entry.props._client_event_id)
  assert.equal(calls[1], calls[0])
})

test('new events are not queued without active consent and a cycle start', () => {
  const data = new Map([['edgewise-auth', JSON.stringify({ state: { user: { id: 'alice', researchConsent: { accepted: false } }, accessToken: 'token' } })]])
  const localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }
  const code = fs.readFileSync(new URL('../src/research/track.js', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '').replace(/export /g, '') + '\nglobalThis.track = trackResearchEvent;'
  const context = vm.createContext({ localStorage, postResearchEvents: () => { throw new Error('must not send') }, formatResearchEvent, normalizeResearchEvent, researchQueueKey, queueMicrotask })
  vm.runInContext(code, context)
  context.track('report.view')
  assert.equal(data.has(researchQueueKey('alice')), false)
})

test('only unconfirmed events survive a mixed response', async () => {
  const key = researchQueueKey('alice')
  const queued = [{ event: 'report.view' }, { event: 'feedback.view' }, { event: 'nav.change' }]
  const data = new Map([
    ['edgewise-auth', JSON.stringify({ state: { user: { id: 'alice' }, accessToken: 'token' } })],
    [key, JSON.stringify(queued)],
  ])
  const localStorage = { getItem: name => data.get(name), setItem: (name, value) => data.set(name, value), removeItem: name => data.delete(name) }
  const code = fs.readFileSync(new URL('../src/research/track.js', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '').replace(/export /g, '') + '\nglobalThis.flush = flushOfflineResearchEvents;'
  const context = vm.createContext({
    localStorage, formatResearchEvent, normalizeResearchEvent, researchQueueKey, queueMicrotask,
    postResearchEvents: async () => ({ accepted: 1, outcomes: [{ status: 'duplicate' }, { status: 'retry' }, { status: 'rejected' }] }),
  })
  vm.runInContext(code, context)
  assert.equal(await context.flush(), 1)
  assert.deepEqual(JSON.parse(data.get(key)), [queued[1]])
})
