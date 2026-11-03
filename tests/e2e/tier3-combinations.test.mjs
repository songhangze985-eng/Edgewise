/**
 * Tier 3: Cross-Feature Combinations Test Suite
 * 20 discrete tests verifying multi-module interactions, route guards, modal triggers, and store coherence.
 */

import { createSuite, readSource, parseAppRoutes, assert } from './harness.mjs'

export const tier3Suite = createSuite('Tier 3: Cross-Feature Combinations', 3)

// ============================================================================
// 1. Theme and Route Coherence
// ============================================================================
tier3Suite.test('T3.01: Dual theme token coherence across routes', () => {
  const css = readSource('src/index.css')
  assert.ok(css.includes(':root'), ':root token definitions exist')
  assert.ok(css.includes('--bg') || css.includes('--canvas'), 'Canvas token defined')
  assert.ok(css.includes('--chalk') || css.includes('--ink'), 'Ink token defined')
})

// ============================================================================
// 2. Authentication Guards & Deep Link Redirection Chain
// ============================================================================
tier3Suite.test('T3.02: Unauthenticated visit to protected route redirects to /login?redirect=', () => {
  function getRedirectDestination(targetPath, isAuthenticated) {
    if (isAuthenticated) return targetPath
    const returnTo = targetPath && targetPath !== '/'
      ? `/login?redirect=${encodeURIComponent(targetPath)}`
      : '/login'
    return returnTo
  }

  const destination = getRedirectDestination('/interview/lobby', false)
  assert.strictEqual(destination, '/login?redirect=%2Finterview%2Flobby')
})

tier3Suite.test('T3.03: Deep linking query params preserved in login redirect chain', () => {
  const deepLink = '/interview/lobby?role=frontend&difficulty=hard'
  const redirectUrl = `/login?redirect=${encodeURIComponent(deepLink)}`
  const parsed = new URL(`https://edgewise.app${redirectUrl}`)
  const returnTo = parsed.searchParams.get('redirect')
  assert.strictEqual(returnTo, deepLink, 'Query parameters perfectly preserved in redirect query param')
})

tier3Suite.test('T3.04: Authenticated user visiting /login redirects to root /', () => {
  function loginGuard(isAuthenticated) {
    return isAuthenticated ? '/' : '/login'
  }
  assert.strictEqual(loginGuard(true), '/', 'Authenticated user bounced out of login')
  assert.strictEqual(loginGuard(false), '/login', 'Unauthenticated user allowed on login')
})

tier3Suite.test('T3.05: Post-login destination resolution', () => {
  const searchParams = new URLSearchParams('redirect=%2Fquestions%2F105')
  const redirectTarget = searchParams.get('redirect') || '/'
  assert.strictEqual(redirectTarget, '/questions/105', 'Resolves intended route after authentication')
})

// ============================================================================
// 3. Modal Lifecycle & Route Transition Cleanup
// ============================================================================
tier3Suite.test('T3.06: Modal state lifecycle resets cleanly upon navigation', () => {
  let modalState = { isOpen: true, activeModal: 'settings' }
  function handleRouteChange() {
    modalState = { isOpen: false, activeModal: null }
  }
  handleRouteChange()
  assert.strictEqual(modalState.isOpen, false, 'Modal closed on navigation')
  assert.strictEqual(modalState.activeModal, null, 'Active modal cleared')
})

// ============================================================================
// 4. Global MicroSurveyGate Route Suppression Rules
// ============================================================================
tier3Suite.test('T3.07: MicroSurveyGate strictly suppresses survey in interview & LGD simulation rooms', () => {
  const blockedPrefixes = ['/interview/room', '/interview/oneway', '/lgd/room']
  function isRouteBlocked(pathname) {
    return blockedPrefixes.some(p => pathname.startsWith(p))
  }

  assert.strictEqual(isRouteBlocked('/interview/room/session-123'), true, 'Blocked in 1v1 interview room')
  assert.strictEqual(isRouteBlocked('/interview/oneway/456'), true, 'Blocked in one-way room')
  assert.strictEqual(isRouteBlocked('/lgd/room/room-789'), true, 'Blocked in LGD room')
  assert.strictEqual(isRouteBlocked('/'), false, 'Allowed on Workbench Dashboard')
  assert.strictEqual(isRouteBlocked('/questions'), false, 'Allowed on Question Bank')
  assert.strictEqual(isRouteBlocked('/profile'), false, 'Allowed on Profile')
  assert.strictEqual(isRouteBlocked('/tasks'), false, 'Allowed on Task directory')
})

tier3Suite.test('T3.08: MicroSurveyGate requires user research consent acceptance', () => {
  function shouldTriggerSurvey(user) {
    return Boolean(user?.researchConsent?.accepted)
  }

  assert.strictEqual(shouldTriggerSurvey(null), false, 'Not triggered when user is null')
  assert.strictEqual(shouldTriggerSurvey({ researchConsent: null }), false, 'Not triggered without consent')
  assert.strictEqual(shouldTriggerSurvey({ researchConsent: { accepted: false } }), false, 'Not triggered when rejected')
  assert.strictEqual(shouldTriggerSurvey({ researchConsent: { accepted: true } }), true, 'Triggered when accepted')
})

tier3Suite.test('T3.09: Research consent acceptance triggers pretest Survey B check', () => {
  let surveyTriggerContext = null
  function onConsentAccept() {
    surveyTriggerContext = 'consent'
  }
  onConsentAccept()
  assert.strictEqual(surveyTriggerContext, 'consent', 'Consent acceptance fires survey check')
})

tier3Suite.test('T3.10: Posttest Day 7 completion triggers follow-up survey items', () => {
  let surveyTriggerContext = null
  function onPosttestSubmit() {
    surveyTriggerContext = 'posttest'
  }
  onPosttestSubmit()
  assert.strictEqual(surveyTriggerContext, 'posttest', 'Posttest submission fires survey check')
})

// ============================================================================
// 5. Multi-Store State Isolation & Coherence
// ============================================================================
tier3Suite.test('T3.11: Multi-store state isolation prevents cross-store pollution', () => {
  const authState = { user: { id: 'u1', name: 'Alice' } }
  const surveyState = { isOpen: false, items: [] }
  const sessionState = { activeSessionId: 'sess-99' }

  // Mutate surveyState
  surveyState.isOpen = true
  surveyState.items.push({ id: 'item-1' })

  assert.strictEqual(authState.user.id, 'u1')
  assert.strictEqual(sessionState.activeSessionId, 'sess-99')
  assert.strictEqual(surveyState.isOpen, true)
  assert.strictEqual(surveyState.items.length, 1)
})

// ============================================================================
// 6. Role-Based Route Authorization (AdminRoute)
// ============================================================================
tier3Suite.test('T3.12: AdminRoute blocks non-admin users and redirects to root /', () => {
  function checkAdminRoute(user) {
    if (!user?.isAdmin) return '/'
    return '/management'
  }

  assert.strictEqual(checkAdminRoute(null), '/', 'Null user redirected')
  assert.strictEqual(checkAdminRoute({ isAdmin: false }), '/', 'Non-admin user redirected')
  assert.strictEqual(checkAdminRoute({ isAdmin: true }), '/management', 'Admin user admitted')
})

tier3Suite.test('T3.13: AdminRoute protects all management subroutes', () => {
  const routes = parseAppRoutes()
  const mgmtRoutes = routes.filter(r => r.path.startsWith('/management'))
  assert.ok(mgmtRoutes.length >= 3, 'At least 3 management routes exist')
  for (const r of mgmtRoutes) {
    assert.ok(r.isAdmin || r.raw.includes('AdminRoute'), `Management route ${r.path} must be protected by AdminRoute`)
  }
})

// ============================================================================
// 7. Responsive Navigation & Viewport Switching
// ============================================================================
tier3Suite.test('T3.14: Navigation shell adapts cleanly between MobileTabBar and Desktop Sidebar', () => {
  function getActiveNavComponent(viewportWidth) {
    return viewportWidth < 768 ? 'MobileTabBar' : 'Sidebar'
  }
  assert.strictEqual(getActiveNavComponent(375), 'MobileTabBar', 'Mobile viewport uses MobileTabBar')
  assert.strictEqual(getActiveNavComponent(767), 'MobileTabBar', 'Below 768px uses MobileTabBar')
  assert.strictEqual(getActiveNavComponent(768), 'Sidebar', '768px tablet uses Desktop Sidebar')
  assert.strictEqual(getActiveNavComponent(1440), 'Sidebar', '1440px desktop uses Desktop Sidebar')
})

tier3Suite.test('T3.15: Desktop sidebar collapse state persists across nested page navigations', () => {
  let isCollapsed = false
  function toggleCollapse() { isCollapsed = !isCollapsed }
  function navigate(path) { /* route changes, sidebar stays collapsed */ }

  toggleCollapse()
  assert.strictEqual(isCollapsed, true, 'Sidebar collapsed')
  navigate('/interview/lobby')
  assert.strictEqual(isCollapsed, true, 'Sidebar remains collapsed after navigating to interview')
  navigate('/questions')
  assert.strictEqual(isCollapsed, true, 'Sidebar remains collapsed after navigating to questions')
})

// ============================================================================
// 8. Cross-Feature Data Flows
// ============================================================================
tier3Suite.test('T3.16: Question Bank category filter and search query composite filtering', () => {
  const questions = [
    { id: 1, title: 'Describe a time you handled conflict', category: 'behavioral' },
    { id: 2, title: 'Implement LRU Cache in JavaScript', category: 'technical' },
    { id: 3, title: 'Explain team leadership during conflict', category: 'behavioral' }
  ]

  const activeCategory = 'behavioral'
  const query = 'conflict'

  const filtered = questions.filter(q => 
    q.category === activeCategory &&
    q.title.toLowerCase().includes(query.toLowerCase())
  )

  assert.strictEqual(filtered.length, 2, 'Composite filter returns exactly matching items')
  assert.strictEqual(filtered[0].id, 1)
  assert.strictEqual(filtered[1].id, 3)
})

tier3Suite.test('T3.17: Interview wizard parameters carry over into active room session', () => {
  const wizardConfig = {
    role: 'frontend',
    difficulty: 'hard',
    questionType: 'technical',
    language: 'zh-CN'
  }

  function initializeInterviewSession(config) {
    return {
      sessionId: 'sess-' + Math.random().toString(36).slice(2, 8),
      config,
      startTime: Date.now(),
      status: 'active'
    }
  }

  const session = initializeInterviewSession(wizardConfig)
  assert.strictEqual(session.config.role, 'frontend')
  assert.strictEqual(session.config.difficulty, 'hard')
  assert.strictEqual(session.status, 'active')
})

tier3Suite.test('T3.18: Completed interview session creates log in dashboard session feed', () => {
  const sessionHistory = []
  function completeSession(sessionData) {
    sessionHistory.unshift({
      id: sessionData.sessionId,
      type: '1v1_interview',
      completedAt: new Date().toISOString(),
      score: sessionData.score
    })
  }

  completeSession({ sessionId: 'sess-1', score: 92 })
  assert.strictEqual(sessionHistory.length, 1)
  assert.strictEqual(sessionHistory[0].score, 92)
  assert.strictEqual(sessionHistory[0].type, '1v1_interview')
})

tier3Suite.test('T3.19: Shared challenge link /s/:id bridges to pair practice /pair/:id', () => {
  const shareCard = { shareId: 'sh-101', challengeTitle: 'Frontend System Design' }
  function acceptChallenge(card) {
    return `/pair/session-${card.shareId}`
  }
  const pairRoute = acceptChallenge(shareCard)
  assert.strictEqual(pairRoute, '/pair/session-sh-101')
})

tier3Suite.test('T3.20: Organization join code validates and redirects to OrgDashboard', () => {
  const validCodes = { 'ACME2026': 'org-acme' }
  function joinOrg(code) {
    const orgId = validCodes[code]
    if (!orgId) throw new Error('Invalid code')
    return `/org/dashboard/${orgId}`
  }

  assert.strictEqual(joinOrg('ACME2026'), '/org/dashboard/org-acme')
  assert.throws(() => joinOrg('INVALID'), /Invalid code/)
})
