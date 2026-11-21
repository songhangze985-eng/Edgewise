import test from 'node:test'
import assert from 'node:assert/strict'
import { formatResearchEvent, normalizeResearchEvent, researchQueueKey } from '../src/research/eventFormat.js'

test('research telemetry uses the backend event envelope', () => {
  const entry = formatResearchEvent('report.view', { session_id: 's1' }, '2026-01-01T00:00:00Z')
  assert.equal(entry.event, 'report.view')
  assert.equal(entry.ts, '2026-01-01T00:00:00Z')
  assert.equal(entry.props.session_id, 's1')
  assert.match(entry.props._client_event_id, /^[a-f0-9-]{32,36}$/)
  assert.notEqual(entry.props._client_event_id, formatResearchEvent('report.view').props._client_event_id)
  assert.equal(normalizeResearchEvent(JSON.parse(JSON.stringify(entry))).props._client_event_id, entry.props._client_event_id)
})

test('offline queues are scoped to the authenticated user', () => {
  assert.notEqual(researchQueueKey('alice'), researchQueueKey('bob'))
  assert.equal(researchQueueKey(null), null)
})

test('previously queued telemetry is normalized without losing its fields', () => {
  assert.deepEqual(normalizeResearchEvent({ event: 'report.view', session_id: 's1', recorded_at: '2026-01-01' }), {
    event: 'report.view', ts: '2026-01-01', props: { session_id: 's1' },
  })
})

test('a malformed old queue entry does not prevent a batch being sent', () => {
  assert.deepEqual(normalizeResearchEvent(null), { event: '', ts: null, props: {} })
  assert.deepEqual(normalizeResearchEvent('bad'), { event: '', ts: null, props: {} })
})
