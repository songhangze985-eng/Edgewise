import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

test('an open survey closes on account change and a late survey cannot reopen it', async () => {
  const bob = { id: 'bob', researchConsent: { accepted: true, acceptedAt: 'second-cycle' } }
  const alice = { id: 'alice', researchConsent: { accepted: true, acceptedAt: 'first-cycle' } }
  let auth = { user: alice, accessToken: 'alice-token' }
  let onAuthChange
  let resolvePending
  let pendingToken
  const submitted = []
  const create = (initialize) => {
    let state
    const getState = () => state
    state = initialize((patch) => { state = { ...state, ...patch } }, getState)
    return { getState }
  }
  const code = fs.readFileSync(new URL('../src/stores/surveyStore.js', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '').replace(/^export default .*$/gm, '').replace(/^export /gm, '')
    + '\nglobalThis.survey = useSurveyStore;'
  const context = vm.createContext({
    create,
    useAuthStore: { getState: () => auth, subscribe: (callback) => { onAuthChange = callback } },
    readPersistedToken: () => auth.accessToken,
    fetchSurveyPending: (_context, token) => {
      pendingToken = token
      return new Promise((resolve) => { resolvePending = resolve })
    },
    submitSurveyAnswers: (...args) => submitted.push(args),
    showToast: () => {},
  })
  vm.runInContext(code, context)
  const scope = { user_id: 'alice', consent_accepted_at: 'first-cycle' }
  const offered = { items: [{ id: 'A1', type: 'single' }], answer_context: scope, offer_event_id: '1700000000000-1' }
  const survey = context.survey

  const late = survey.getState().checkPending('home')
  assert.equal(pendingToken, 'alice-token')
  auth = { user: bob, accessToken: 'bob-token' }
  onAuthChange()
  resolvePending(offered)
  await late
  assert.equal(survey.getState().isOpen, false)

  auth = { user: alice, accessToken: 'alice-token' }
  onAuthChange()
  const current = survey.getState().checkPending('home')
  resolvePending(offered)
  await current
  assert.equal(survey.getState().isOpen, true)
  auth = { user: { ...alice, researchConsent: bob.researchConsent }, accessToken: 'alice-token' }
  onAuthChange()
  assert.equal(survey.getState().isOpen, false)
  await survey.getState().submitAnswers({ A1: '旧答案' })
  assert.equal(submitted.length, 0)
})
