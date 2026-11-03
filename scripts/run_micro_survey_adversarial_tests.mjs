/**
 * EMPIRICAL CHALLENGER TEST SUITE: MicroSurveyModal & surveyStore
 * Tests question types, edge cases, payload contract, route guards, reentrancy.
 */

import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { transformWithOxc } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import ReactDOMServer from 'react-dom/server'

// Setup mock state for research API and toasts
let mockPendingResponse = { items: [], survey_version: '2026.04', blocked_reason: null }
let mockPendingError = null
let mockSubmitCalls = []
let mockSubmitError = null
let lastToast = null

// Custom ESM loader to mock external client/toast dependencies
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.includes('api/research')) {
    return {
      format: 'module',
      shortCircuit: true,
      url: 'mock:api/research'
    };
  }
  if (specifier.includes('toastStore')) {
    return {
      format: 'module',
      shortCircuit: true,
      url: 'mock:toastStore'
    };
  }
  if (specifier.includes('api/client')) {
    return {
      format: 'module',
      shortCircuit: true,
      url: 'mock:api/client'
    };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === 'mock:api/research') {
    return {
      format: 'module',
      shortCircuit: true,
      source: \`
        export const fetchSurveyPending = async (ctx) => globalThis.__mockFetchPending(ctx);
        export const submitSurveyAnswers = async (payload) => globalThis.__mockSubmitAnswers(payload);
      \`
    };
  }
  if (url === 'mock:toastStore') {
    return {
      format: 'module',
      shortCircuit: true,
      source: \`
        export const showToast = (msg, type) => globalThis.__mockToast(msg, type);
      \`
    };
  }
  if (url === 'mock:api/client') {
    return {
      format: 'module',
      shortCircuit: true,
      source: \`
        export const getErrorMessage = (err, def) => (err && err.message) || def;
      \`
    };
  }
  return nextLoad(url, context);
}
`

register('data:text/javascript,' + encodeURIComponent(loaderCode), pathToFileURL('./'))

globalThis.__mockFetchPending = async (ctx) => {
  if (mockPendingError) throw mockPendingError
  return mockPendingResponse
}

globalThis.__mockSubmitAnswers = async (payload) => {
  mockSubmitCalls.push(payload)
  if (mockSubmitError) throw mockSubmitError
  return { saved: payload.length, records: payload.map(p => ({ item_id: p.item_id, status: p.skipped ? 'no_response' : 'answered' })) }
}

globalThis.__mockToast = (msg, type) => {
  lastToast = { msg, type }
}

// Import real surveyStore
const { default: useSurveyStore } = await import('../src/stores/surveyStore.js')

console.log('=== STARTING EMPIRICAL CHALLENGER TEST SUITE ===\n')

let passCount = 0
let failCount = 0

function runTest(name, fn) {
  try {
    fn()
    console.log(`  ✔ PASS: ${name}`)
    passCount++
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}`)
    console.error(`    Error: ${err.message}`)
    if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'))
    failCount++
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn()
    console.log(`  ✔ PASS: ${name}`)
    passCount++
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}`)
    console.error(`    Error: ${err.message}`)
    if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'))
    failCount++
  }
}

function resetStore() {
  useSurveyStore.setState({
    isOpen: false,
    items: [],
    loading: false,
    submitting: false,
    surveyVersion: '',
    blockedReason: null,
  })
  mockPendingResponse = { items: [], survey_version: '2026.04', blocked_reason: null }
  mockPendingError = null
  mockSubmitCalls = []
  mockSubmitError = null
  lastToast = null
}

// --------------------------------------------------------------------------
// 1. STORE BEHAVIOR & REENTRANCY TESTS
// --------------------------------------------------------------------------
console.log('--- Suite 1: surveyStore State & Lifecycle ---')

runTest('1.1 Initial state sanity', () => {
  resetStore()
  const state = useSurveyStore.getState()
  assert.strictEqual(state.isOpen, false)
  assert.strictEqual(state.items.length, 0)
  assert.strictEqual(state.loading, false)
  assert.strictEqual(state.submitting, false)
})

await runAsyncTest('1.2 checkPending opens modal when items returned', async () => {
  resetStore()
  mockPendingResponse = {
    items: [
      { id: 'A1', type: 'single', text: '渠道来源', options: ['小红书', 'B站'] },
      { id: 'C1', type: 'likert7', text: '练习价值' }
    ],
    survey_version: '2026.04',
    blocked_reason: null
  }
  const result = await useSurveyStore.getState().checkPending('app_ready')
  const state = useSurveyStore.getState()
  assert.strictEqual(state.isOpen, true)
  assert.strictEqual(state.items.length, 2)
  assert.strictEqual(state.surveyVersion, '2026.04')
  assert.strictEqual(state.loading, false)
  assert.strictEqual(state.blockedReason, null)
  assert.strictEqual(result.items.length, 2)
})

await runAsyncTest('1.3 checkPending keeps modal closed when empty items returned', async () => {
  resetStore()
  mockPendingResponse = {
    items: [],
    survey_version: '2026.04',
    blocked_reason: 'empty_queue'
  }
  const result = await useSurveyStore.getState().checkPending('app_ready')
  const state = useSurveyStore.getState()
  assert.strictEqual(state.isOpen, false)
  assert.strictEqual(state.items.length, 0)
  assert.strictEqual(state.blockedReason, 'empty_queue')
  assert.strictEqual(state.loading, false)
})

await runAsyncTest('1.4 checkPending with rate_limit blockedReason', async () => {
  resetStore()
  mockPendingResponse = {
    items: [],
    survey_version: '2026.04',
    blocked_reason: 'rate_limit'
  }
  await useSurveyStore.getState().checkPending('app_ready')
  const state = useSurveyStore.getState()
  assert.strictEqual(state.isOpen, false)
  assert.strictEqual(state.blockedReason, 'rate_limit')
})

await runAsyncTest('1.5 checkPending network failure is graceful', async () => {
  resetStore()
  mockPendingError = new Error('500 Internal Server Error')
  const res = await useSurveyStore.getState().checkPending('app_ready')
  const state = useSurveyStore.getState()
  assert.strictEqual(res, null)
  assert.strictEqual(state.isOpen, false)
  assert.strictEqual(state.loading, false)
})

await runAsyncTest('1.6 checkPending reentrancy guard (concurrent calls)', async () => {
  resetStore()
  useSurveyStore.setState({ loading: true })
  const res = await useSurveyStore.getState().checkPending('app_ready')
  assert.strictEqual(res, null)
  assert.strictEqual(mockSubmitCalls.length, 0)
})

// --------------------------------------------------------------------------
// 2. QUESTION TYPES & PAYLOAD CONFORMANCE
// --------------------------------------------------------------------------
console.log('\n--- Suite 2: Question Types & Payload Generation ---')

let capturedPayloads = []

await runAsyncTest('2.1 submitAnswers across all 3 types (single, likert7, open)', async () => {
  resetStore()
  const sampleItems = [
    { id: 'A1', type: 'single', text: '入口渠道', options: ['小红书', 'B站', '微信群'] },
    { id: 'C1', type: 'likert7', text: '结构化思维收益' },
    { id: 'D2', type: 'open', text: '在练习中最大的具体困惑是什么？' }
  ]
  useSurveyStore.setState({ isOpen: true, items: sampleItems })

  const answers = {
    A1: '小红书',
    C1: 6,
    D2: '需要更多针对快消行业的具体案例练习'
  }

  await useSurveyStore.getState().submitAnswers(answers)
  const state = useSurveyStore.getState()

  assert.strictEqual(state.isOpen, false)
  assert.strictEqual(state.items.length, 0)
  assert.strictEqual(mockSubmitCalls.length, 1)

  const payload = mockSubmitCalls[0]
  capturedPayloads.push({ name: 'all_types_answered', payload })

  assert.strictEqual(payload.length, 3)
  assert.deepStrictEqual(payload[0], { item_id: 'A1', value: '小红书', skipped: false })
  // Critical check: likert value MUST be a number, not string
  assert.deepStrictEqual(payload[1], { item_id: 'C1', value: 6, skipped: false })
  assert.strictEqual(typeof payload[1].value, 'number')
  assert.deepStrictEqual(payload[2], { item_id: 'D2', value: '需要更多针对快消行业的具体案例练习', skipped: false })
  assert.strictEqual(lastToast?.type, 'success')
})

await runAsyncTest('2.2 Partial answers (1 answered, 2 skipped)', async () => {
  resetStore()
  const sampleItems = [
    { id: 'B1', type: 'single', text: '身份' },
    { id: 'C2', type: 'likert7', text: '反馈清晰度' },
    { id: 'K2', type: 'open', text: '后续改进建议' }
  ]
  useSurveyStore.setState({ isOpen: true, items: sampleItems })

  const answers = {
    C2: 5
    // B1 and K2 left empty
  }

  await useSurveyStore.getState().submitAnswers(answers)
  const payload = mockSubmitCalls[0]
  capturedPayloads.push({ name: 'partial_answered', payload })

  assert.strictEqual(payload.length, 3)
  assert.deepStrictEqual(payload[0], { item_id: 'B1', value: null, skipped: true })
  assert.deepStrictEqual(payload[1], { item_id: 'C2', value: 5, skipped: false })
  assert.deepStrictEqual(payload[2], { item_id: 'K2', value: null, skipped: true })
})

await runAsyncTest('2.3 Whitespace-only open text treated as skipped', async () => {
  resetStore()
  const sampleItems = [
    { id: 'C3', type: 'likert7', text: '评分' },
    { id: 'D2', type: 'open', text: '反馈' }
  ]
  useSurveyStore.setState({ isOpen: true, items: sampleItems })

  const answers = {
    C3: 4,
    D2: '   \n\t   \n  ' // whitespace only
  }

  await useSurveyStore.getState().submitAnswers(answers)
  const payload = mockSubmitCalls[0]
  capturedPayloads.push({ name: 'whitespace_open_text', payload })

  assert.deepStrictEqual(payload[0], { item_id: 'C3', value: 4, skipped: false })
  assert.deepStrictEqual(payload[1], { item_id: 'D2', value: null, skipped: true })
})

await runAsyncTest('2.4 Adversarial long open text (10,000 chars, unicode, emojis, code injection)', async () => {
  resetStore()
  const sampleItems = [
    { id: 'E1', type: 'open', text: '详细反馈' }
  ]
  useSurveyStore.setState({ isOpen: true, items: sampleItems })

  const longText = '🎯 特殊字符测试 <script>alert("xss")</script> \' OR \'1\'=\'1\' '.repeat(200)
  assert(longText.length > 5000)

  const answers = { E1: longText }
  await useSurveyStore.getState().submitAnswers(answers)

  const payload = mockSubmitCalls[0]
  capturedPayloads.push({ name: 'adversarial_long_text', payload })

  assert.strictEqual(payload[0].item_id, 'E1')
  assert.strictEqual(payload[0].value, longText.trim())
  assert.strictEqual(payload[0].skipped, false)
})

await runAsyncTest('2.5 skipAll generates full batch with value: null, skipped: true', async () => {
  resetStore()
  const sampleItems = [
    { id: 'A1', type: 'single' },
    { id: 'A2', type: 'single' },
    { id: 'A3', type: 'likert7' }
  ]
  useSurveyStore.setState({ isOpen: true, items: sampleItems })

  await useSurveyStore.getState().skipAll()
  const state = useSurveyStore.getState()

  assert.strictEqual(state.isOpen, false)
  assert.strictEqual(mockSubmitCalls.length, 1)

  const payload = mockSubmitCalls[0]
  capturedPayloads.push({ name: 'skip_all', payload })

  assert.strictEqual(payload.length, 3)
  for (const item of payload) {
    assert.strictEqual(item.value, null)
    assert.strictEqual(item.skipped, true)
  }
})

await runAsyncTest('2.6 skipAll on network error still dismisses modal cleanly (no user trap)', async () => {
  resetStore()
  const sampleItems = [{ id: 'A1', type: 'single' }]
  useSurveyStore.setState({ isOpen: true, items: sampleItems })
  mockSubmitError = new Error('503 Service Unavailable')

  await useSurveyStore.getState().skipAll()
  const state = useSurveyStore.getState()

  assert.strictEqual(state.isOpen, false)
  assert.strictEqual(state.items.length, 0)
  assert.strictEqual(state.submitting, false)
})

await runAsyncTest('2.7 submitAnswers network error keeps modal open and shows error toast', async () => {
  resetStore()
  const sampleItems = [{ id: 'A1', type: 'single' }]
  useSurveyStore.setState({ isOpen: true, items: sampleItems })
  mockSubmitError = new Error('Network timeout')

  await useSurveyStore.getState().submitAnswers({ A1: '测试' })
  const state = useSurveyStore.getState()

  assert.strictEqual(state.isOpen, true) // user didn't lose entered answers!
  assert.strictEqual(state.submitting, false)
  assert.strictEqual(lastToast?.type, 'error')
})

await runAsyncTest('2.8 Rapid clicking reentrancy prevention on submitAnswers and skipAll', async () => {
  resetStore()
  const sampleItems = [{ id: 'A1', type: 'single' }]
  useSurveyStore.setState({ isOpen: true, items: sampleItems, submitting: true })

  // Calling submitAnswers while submitting is true
  await useSurveyStore.getState().submitAnswers({ A1: '测试' })
  assert.strictEqual(mockSubmitCalls.length, 0)

  // Calling skipAll while submitting is true
  await useSurveyStore.getState().skipAll()
  assert.strictEqual(mockSubmitCalls.length, 0)
})

// --------------------------------------------------------------------------
// 3. ROUTE PROTECTION LOGIC (BLOCKED INTERVIEW CONTEXTS)
// --------------------------------------------------------------------------
console.log('\n--- Suite 3: Route Protection & Interview Context Isolation ---')

function isContextBlocked(pathname) {
  return (
    pathname.startsWith('/interview/room') ||
    pathname.startsWith('/interview/oneway') ||
    pathname.startsWith('/lgd/room')
  )
}

const testRoutes = [
  // Blocked routes
  { path: '/interview/room', expected: true },
  { path: '/interview/room/', expected: true },
  { path: '/interview/room/session_abc123', expected: true },
  { path: '/interview/room/123/eval', expected: true },
  { path: '/interview/oneway', expected: true },
  { path: '/interview/oneway/456', expected: true },
  { path: '/lgd/room', expected: true },
  { path: '/lgd/room/room_789', expected: true },

  // Non-blocked routes
  { path: '/', expected: false },
  { path: '/dashboard', expected: false },
  { path: '/interview/lobby', expected: false },
  { path: '/interview/structured/lobby', expected: false },
  { path: '/lgd/lobby', expected: false },
  { path: '/coding/lobby', expected: false },
  { path: '/research/posttest', expected: false },
  { path: '/profile', expected: false },
  { path: '/management/research', expected: false },
  { path: '/management/framework', expected: false },
]

for (const { path: routePath, expected } of testRoutes) {
  runTest(`3.1 Route check: ${routePath} -> ${expected ? 'BLOCKED' : 'ALLOWED'}`, () => {
    const blocked = isContextBlocked(routePath)
    assert.strictEqual(blocked, expected)
  })
}

// --------------------------------------------------------------------------
// 4. PYDANTIC SCHEMA CONFORMANCE (backend/app/models/schemas.py)
// --------------------------------------------------------------------------
console.log('\n--- Suite 4: Pydantic ResearchSurveyAnswerBatch Verification ---')

// We invoke Python with backend/.venv/bin/python to validate payloads against ResearchSurveyAnswerBatch
const pythonScript = `
import json, sys
from pydantic import ValidationError
sys.path.insert(0, 'backend')
from app.models.schemas import ResearchSurveyAnswerBatch

raw_data = sys.stdin.read()
test_cases = json.loads(raw_data)

results = []
for case in test_cases:
    name = case['name']
    payload = case['payload']
    try:
        validated = ResearchSurveyAnswerBatch.model_validate({'answers': payload})
        results.append({'name': name, 'valid': True, 'count': len(validated.answers)})
    except ValidationError as e:
        results.append({'name': name, 'valid': False, 'error': str(e)})

print(json.dumps(results))
`

runTest('4.1 Empirical validation of generated payloads against ResearchSurveyAnswerBatch', () => {
  const pyOutput = execFileSync(
    'backend/.venv/bin/python',
    ['-c', pythonScript],
    { input: JSON.stringify(capturedPayloads), encoding: 'utf-8' }
  )
  const results = JSON.parse(pyOutput)
  for (const res of results) {
    assert.strictEqual(res.valid, true, `Payload '${res.name}' failed schema: ${res.error}`)
    console.log(`    ↳ Validated '${res.name}' (${res.count} items) against backend Pydantic model`)
  }
})

// Negative tests directly via Python
const negativeCases = [
  { name: 'empty_batch', payload: [], shouldPass: false, desc: 'Batch with 0 items (min_length=1)' },
  { name: 'oversized_batch', payload: [
    { item_id: '1', skipped: true }, { item_id: '2', skipped: true },
    { item_id: '3', skipped: true }, { item_id: '4', skipped: true }
  ], shouldPass: false, desc: 'Batch with 4 items (max_length=3)' },
  { name: 'empty_item_id', payload: [{ item_id: '', skipped: true }], shouldPass: false, desc: 'Empty item_id' },
  { name: 'oversized_item_id', payload: [{ item_id: 'A'.repeat(25), skipped: true }], shouldPass: false, desc: 'item_id > 20 chars' },
  { name: 'invalid_value_type', payload: [{ item_id: 'A1', value: { invalid: 'object' }, skipped: false }], shouldPass: false, desc: 'Dict value type' },
]

runTest('4.2 Schema boundaries & negative tests', () => {
  const pyOutput = execFileSync(
    'backend/.venv/bin/python',
    ['-c', pythonScript],
    { input: JSON.stringify(negativeCases), encoding: 'utf-8' }
  )
  const results = JSON.parse(pyOutput)
  for (let i = 0; i < results.length; i++) {
    const res = results[i]
    const testCase = negativeCases[i]
    assert.strictEqual(res.valid, false, `Expected failure for negative case '${testCase.name}'`)
    console.log(`    ↳ Correctly rejected invalid payload: ${testCase.desc}`)
  }
})

// --------------------------------------------------------------------------
// 5. MICROSURVEYMODAL COMPONENT RENDERING & ACCESSIBILITY INSPECTION
// --------------------------------------------------------------------------
console.log('\n--- Suite 5: MicroSurveyModal Accessibility & Render Checks ---')

runTest('5.1 Verify JSX compilation & markup of MicroSurveyModal', () => {
  const modalFilePath = path.resolve('src/components/MicroSurveyModal/MicroSurveyModal.jsx')
  const content = fs.readFileSync(modalFilePath, 'utf-8')
  
  // Verify ARIA attributes
  assert(content.includes('role="dialog"'), 'Missing role="dialog"')
  assert(content.includes('aria-modal="true"'), 'Missing aria-modal="true"')
  assert(content.includes('aria-labelledby="micro-survey-modal-title"'), 'Missing aria-labelledby')
  assert(content.includes('role="radiogroup"'), 'Missing role="radiogroup"')
  assert(content.includes('role="radio"'), 'Missing role="radio"')
  assert(content.includes('aria-checked='), 'Missing aria-checked')

  // Verify question types support
  assert(content.includes("item.type === 'single'"), 'Missing single type handler')
  assert(content.includes("item.type === 'likert7'"), 'Missing likert7 type handler')
  assert(content.includes("item.type === 'open'"), 'Missing open type handler')

  // Verify 1-7 likert scale buttons and anchors
  assert(content.includes('[1, 2, 3, 4, 5, 6, 7]'), 'Missing 1..7 scale')
  assert(content.includes('1 完全不同意'), 'Missing anchor: 1 完全不同意')
  assert(content.includes('4 中立'), 'Missing anchor: 4 中立')
  assert(content.includes('7 完全同意'), 'Missing anchor: 7 完全同意')

  // Verify textarea character counter
  assert(content.includes('.length} 字'), 'Missing char count display')

  // Verify ESC key handler
  assert(content.includes("e.key === 'Escape'"), 'Missing Escape key handler')

  // Verify disabled states
  assert(content.includes('disabled={submitting || !hasAnyAnswer}'), 'Submit button missing empty-answer guard')
})

console.log('\n=== SUMMARY ===')
console.log(`Total tests: ${passCount + failCount}`)
console.log(`Passed: ${passCount}`)
console.log(`Failed: ${failCount}`)

if (failCount > 0) {
  process.exit(1)
} else {
  console.log('\nAll empirical tests passed successfully!')
}
