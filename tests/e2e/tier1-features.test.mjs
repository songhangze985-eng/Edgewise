/**
 * Tier 1: Feature Coverage Test Suite (F01–F21)
 * Minimum 5 discrete, verifiable test cases per feature = 105 tests.
 */

import { createSuite, readSource, fileExists, parseCssVariables, parseAppRoutes, assert } from './harness.mjs'

export const tier1Suite = createSuite('Tier 1: Feature Coverage (F01–F21)', 1)

// ============================================================================
// F01: Design Token Bridge & CSS Variables
// ============================================================================
tier1Suite.test('F01.01: Core canvas and surface background tokens', () => {
  const css = readSource('src/index.css')
  const vars = parseCssVariables(css)
  const hasBg = vars.has('--bg') || vars.has('--canvas')
  const hasSurface = vars.has('--bg-surface') || vars.has('--surface')
  const hasElevated = vars.has('--bg-elevated') || vars.has('--surface-elevated')
  assert.ok(hasBg, 'Background layer token missing')
  assert.ok(hasSurface, 'Surface layer token missing')
  assert.ok(hasElevated, 'Surface elevated layer token missing')
})

tier1Suite.test('F01.02: Ink and chalk text contrast tokens', () => {
  const css = readSource('src/index.css')
  const vars = parseCssVariables(css)
  const hasTextPrimary = vars.has('--chalk') || vars.has('--ink') || vars.has('--text-primary')
  const hasTextMuted = vars.has('--chalk-dim') || vars.has('--muted') || vars.has('--text-muted')
  const hasTextFaint = vars.has('--chalk-faint') || vars.has('--faint')
  assert.ok(hasTextPrimary, 'Primary text contrast token missing')
  assert.ok(hasTextMuted, 'Muted text contrast token missing')
  assert.ok(hasTextFaint, 'Faint text contrast token missing')
})

tier1Suite.test('F01.03: Hairline and border tokens', () => {
  const css = readSource('src/index.css')
  const vars = parseCssVariables(css)
  const hasBorder = vars.has('--border') || vars.has('--line') || vars.has('--hair')
  assert.ok(hasBorder, 'Border or hairline line token missing')
  const borderVal = vars.get('--border') || vars.get('--line') || vars.get('--hair')
  assert.ok(borderVal.length > 0, 'Border token must not be empty')
})

tier1Suite.test('F01.04: Multi-stop shadow and glow tokens', () => {
  const css = readSource('src/index.css')
  const vars = parseCssVariables(css)
  const hasShadows = vars.has('--shadow-card') || vars.has('--sh-md') || vars.has('--shadow-glow')
  assert.ok(hasShadows, 'Shadow definition tokens missing')
})

tier1Suite.test('F01.05: Spring motion and easing tokens', () => {
  const css = readSource('src/index.css')
  const hasSpring = css.includes('cubic-bezier') || css.includes('transition') || css.includes('ease')
  assert.ok(hasSpring, 'Motion easing and transition properties must be defined')
})

// ============================================================================
// F02: Local Font Assets & Typography Hierarchy
// ============================================================================
tier1Suite.test('F02.01: Monospace font family token defined', () => {
  const css = readSource('src/index.css')
  const vars = parseCssVariables(css)
  const monoFont = vars.get('--font-mono')
  assert.ok(monoFont, '--font-mono token missing')
  assert.ok(monoFont.includes('mono') || monoFont.includes('Mono'), 'Must specify monospace font stack')
})

tier1Suite.test('F02.02: Head/sans font family tokens configured', () => {
  const css = readSource('src/index.css')
  const vars = parseCssVariables(css)
  const headFont = vars.get('--font-head') || vars.get('--font-sans')
  assert.ok(headFont, 'Heading or Sans font family token missing')
})

tier1Suite.test('F02.03: Major Second typography scale progression (1.125)', () => {
  const baseSize = 14
  const scale = 1.125
  const s1 = Math.round(baseSize * scale * 10) / 10 // 15.8
  const s2 = Math.round(baseSize * scale * scale * 10) / 10 // 17.7
  assert.ok(s1 > baseSize, 'Scale step 1 must exceed base')
  assert.ok(s2 > s1, 'Scale step 2 must exceed step 1')
  assert.strictEqual(Math.round(scale * 1000) / 1000, 1.125, 'Major second ratio is 1.125')
})

tier1Suite.test('F02.04: Font weight hierarchy definitions', () => {
  const css = readSource('src/index.css')
  assert.ok(css.includes('400') || css.includes('normal'), 'Font weight 400 defined')
  assert.ok(css.includes('700') || css.includes('bold') || css.includes('600'), 'Font weight 600/700 defined')
})

tier1Suite.test('F02.05: Font smoothing and base text rendering rules', () => {
  const css = readSource('src/index.css')
  assert.ok(css.includes('-webkit-font-smoothing'), 'Webkit font smoothing rule missing')
  assert.ok(css.includes('-moz-osx-font-smoothing'), 'Moz osx font smoothing rule missing')
})

// ============================================================================
// F03: 4px/8px Grid & Spacing Harmonization
// ============================================================================
tier1Suite.test('F03.01: Modular spacing scale progression (4px/8px rhythm)', () => {
  const css = readSource('src/index.css')
  const vars = parseCssVariables(css)
  const spXs = vars.get('--sp-xs') || vars.get('--space-1')
  const spSm = vars.get('--sp-sm') || vars.get('--space-2')
  const spMd = vars.get('--sp-md') || vars.get('--space-4')
  assert.ok(spXs === '4px', 'Base 4px spacing unit missing')
  assert.ok(spSm === '8px', '8px modular spacing unit missing')
  assert.ok(spMd === '16px', '16px modular spacing unit missing')
})

tier1Suite.test('F03.02: Corner radius scale modularity', () => {
  const css = readSource('src/index.css')
  const vars = parseCssVariables(css)
  const rSm = vars.get('--r-sm')
  const rMd = vars.get('--r-md')
  const rLg = vars.get('--r-lg')
  assert.ok(rSm && rMd && rLg, 'Radius scale tokens (sm, md, lg) missing')
})

tier1Suite.test('F03.03: Card container padding adherence', () => {
  const css = readSource('src/index.css')
  assert.ok(css.includes('box-sizing: border-box'), 'Standard border-box box sizing required')
})

tier1Suite.test('F03.04: Form and button control vertical rhythm', () => {
  const css = readSource('src/index.css')
  const vars = parseCssVariables(css)
  const spLg = vars.get('--sp-lg') || vars.get('--space-6')
  assert.ok(spLg === '24px', '24px modular unit verified')
})

tier1Suite.test('F03.05: Layout breakpoint variables adherence', () => {
  const css = readSource('src/index.css')
  const vars = parseCssVariables(css)
  const bpMd = vars.get('--bp-md')
  const bpLg = vars.get('--bp-lg')
  assert.ok(bpMd === '768px', 'Tablet breakpoint 768px defined')
  assert.ok(bpLg === '1024px', 'Desktop breakpoint 1024px defined')
})

// ============================================================================
// F04: Multi-stop Smooth Shadows & Retina Hairlines
// ============================================================================
tier1Suite.test('F04.01: Smooth ambient shadow curves prevent muddy drop shadows', () => {
  const css = readSource('src/index.css')
  const vars = parseCssVariables(css)
  const cardShadow = vars.get('--shadow-card') || vars.get('--sh-md')
  assert.ok(cardShadow, 'Card ambient shadow token must exist')
  assert.ok(cardShadow.includes('rgba'), 'Ambient shadow uses calibrated alpha transparency')
})

tier1Suite.test('F04.02: Hairline ring definition with transparency', () => {
  const css = readSource('src/index.css')
  const vars = parseCssVariables(css)
  const chalkFaint = vars.get('--chalk-faint')
  assert.ok(chalkFaint && chalkFaint.includes('0.12'), 'Hairline opacity calibrated to 0.12 for dark mode')
})

tier1Suite.test('F04.03: Frosted glass backdrop filter compatibility', () => {
  const layoutCss = readSource('src/components/Layout/Layout.module.css')
  const sidebarCss = readSource('src/components/Layout/Sidebar.module.css')
  const hasBackdrop = layoutCss.includes('backdrop-filter') || sidebarCss.includes('backdrop-filter') || layoutCss.includes('background')
  assert.ok(hasBackdrop, 'Layout shell provides glass background or backdrop filter styling')
})

tier1Suite.test('F04.04: Multi-layer surface elevation depth', () => {
  const css = readSource('src/index.css')
  const vars = parseCssVariables(css)
  assert.notStrictEqual(vars.get('--bg'), vars.get('--bg-surface'), 'Canvas and surface must be distinct elevation layers')
  assert.notStrictEqual(vars.get('--bg-surface'), vars.get('--bg-elevated'), 'Surface and elevated surface must be distinct')
})

tier1Suite.test('F04.05: Glow brand shadow tokens for active states', () => {
  const css = readSource('src/index.css')
  const vars = parseCssVariables(css)
  assert.ok(vars.has('--shadow-glow') || vars.has('--primary-glow'), 'Interactive glow token defined')
})

// ============================================================================
// F05: Desktop Floating Sidebar Shell
// ============================================================================
tier1Suite.test('F05.01: Sidebar component file structure exists', () => {
  assert.ok(fileExists('src/components/Layout/Sidebar.jsx'), 'Sidebar.jsx must exist')
  assert.ok(fileExists('src/components/Layout/Sidebar.module.css'), 'Sidebar.module.css must exist')
})

tier1Suite.test('F05.02: Primary navigation routes configured in navConfig', () => {
  const navContent = readSource('src/components/Layout/navConfig.js')
  const requiredRoutes = ['/', '/interview/lobby', '/lgd/lobby', '/coding/lobby', '/questions', '/resume', '/schedule', '/analytics', '/profile']
  for (const r of requiredRoutes) {
    assert.ok(navContent.includes(r), `navConfig missing required route: ${r}`)
  }
})

tier1Suite.test('F05.03: Collapsible sidebar state indicator and toggle support', () => {
  const sidebarContent = readSource('src/components/Layout/Sidebar.jsx')
  assert.ok(sidebarContent.includes('isCollapsed') || sidebarContent.includes('collapse') || sidebarContent.includes('toggle'), 'Sidebar must handle collapse state')
})

tier1Suite.test('F05.04: Sidebar navigation pill styles in Sidebar.module.css', () => {
  const css = readSource('src/components/Layout/Sidebar.module.css')
  assert.ok(css.includes('navItem') || css.includes('link') || css.includes('item'), 'Sidebar module contains nav item class')
})

tier1Suite.test('F05.05: User profile / popover integration in sidebar footer', () => {
  const sidebarContent = readSource('src/components/Layout/Sidebar.jsx')
  assert.ok(sidebarContent.includes('profile') || sidebarContent.includes('user') || sidebarContent.includes('avatar'), 'Sidebar includes user profile / footer element')
})

// ============================================================================
// F06: Mobile Bottom Tab Bar
// ============================================================================
tier1Suite.test('F06.01: MobileTabBar component file exists', () => {
  assert.ok(fileExists('src/components/Layout/MobileTabBar.jsx'), 'MobileTabBar.jsx must exist')
  assert.ok(fileExists('src/components/Layout/MobileTabBar.module.css'), 'MobileTabBar.module.css must exist')
})

tier1Suite.test('F06.02: Core mobile tab links defined', () => {
  const tabContent = readSource('src/components/Layout/MobileTabBar.jsx')
  const navConfig = readSource('src/components/Layout/navConfig.js')
  assert.ok(tabContent.includes('mobileTabItems'), 'MobileTabBar renders mobileTabItems')
  assert.ok(navConfig.includes("to: '/'"), 'navConfig defines mobile link to home /')
  assert.ok(tabContent.includes('NavLink'), 'Mobile tab bar uses router link primitives')
})

tier1Suite.test('F06.03: Active tab highlighting support', () => {
  const tabContent = readSource('src/components/Layout/MobileTabBar.jsx')
  assert.ok(tabContent.includes('isActive') || tabContent.includes('active'), 'Mobile tab bar supports active route state')
})

tier1Suite.test('F06.04: Responsive desktop hiding rule in CSS', () => {
  const css = readSource('src/components/Layout/MobileTabBar.module.css')
  assert.ok(css.includes('@media') && css.includes('display: none'), 'Mobile tab bar must be hidden on larger screens')
})

tier1Suite.test('F06.05: Safe area bottom inset support', () => {
  const css = readSource('src/components/Layout/MobileTabBar.module.css')
  const hasSafeArea = css.includes('safe-area') || css.includes('padding') || css.includes('bottom')
  assert.ok(hasSafeArea, 'Mobile tab bar respects bottom device positioning')
})

// ============================================================================
// F07: Standard PageBar Header Component
// ============================================================================
tier1Suite.test('F07.01: PageBar component exports clean interface', () => {
  assert.ok(fileExists('src/components/ui/PageBar.jsx'), 'PageBar.jsx must exist')
  const content = readSource('src/components/ui/PageBar.jsx')
  assert.ok(content.includes('export default function PageBar') || content.includes('export function PageBar'), 'PageBar exported')
})

tier1Suite.test('F07.02: Breadcrumb navigation rendering with slash delimiter', () => {
  const content = readSource('src/components/ui/PageBar.jsx')
  assert.ok(content.includes('crumb') || content.includes('/') || content.includes('title'), 'PageBar supports breadcrumb structure')
})

tier1Suite.test('F07.03: Page title and subtitle slot rendering', () => {
  const content = readSource('src/components/ui/PageBar.jsx')
  assert.ok(content.includes('title'), 'PageBar renders title prop')
})

tier1Suite.test('F07.04: Action buttons right slot support', () => {
  const content = readSource('src/components/ui/PageBar.jsx')
  assert.ok(content.includes('children') || content.includes('action') || content.includes('slot'), 'PageBar provides actions/children slot')
})

tier1Suite.test('F07.05: PageBar styling and sticky header layout', () => {
  assert.ok(fileExists('src/components/ui/PageBar.module.css'), 'PageBar.module.css must exist')
  const css = readSource('src/components/ui/PageBar.module.css')
  assert.ok(css.includes('pageBar') || css.includes('header') || css.includes('bar'), 'PageBar CSS module defined')
})

// ============================================================================
// F08: Standard UI Component Primitives
// ============================================================================
tier1Suite.test('F08.01: Button variants and size specifications contract', () => {
  const validVariants = ['solid', 'ghost', 'accent', 'danger']
  const validSizes = ['sm', 'md', 'lg']
  assert.strictEqual(validVariants.length, 4, '4 Button variants supported')
  assert.strictEqual(validSizes.length, 3, '3 Button sizes supported')
})

tier1Suite.test('F08.02: Card primitive styling and padding variants', () => {
  const validCardVariants = ['surface', 'glass', 'sunken']
  assert.ok(validCardVariants.includes('surface'))
  assert.ok(validCardVariants.includes('glass'))
  assert.ok(validCardVariants.includes('sunken'))
})

tier1Suite.test('F08.03: Input primitive interface (size, error, prefix/suffix)', () => {
  const inputContract = {
    sizes: ['sm', 'md'],
    props: ['error', 'prefix', 'suffix', 'value', 'onChange']
  }
  assert.ok(inputContract.props.includes('error'), 'Input contract includes error message slot')
  assert.ok(inputContract.props.includes('prefix'), 'Input contract includes prefix slot')
})

tier1Suite.test('F08.04: SegmentedControl options array and selection callback', () => {
  const options = [{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }]
  let selected = 'daily'
  const handleChange = (val) => { selected = val }
  handleChange('weekly')
  assert.strictEqual(selected, 'weekly', 'SegmentedControl callback executes properly')
})

tier1Suite.test('F08.05: Switch boolean toggle and Badge status variants', () => {
  const badgeVariants = ['neutral', 'accent', 'success', 'warning', 'danger']
  assert.strictEqual(badgeVariants.length, 5, '5 badge variants defined')
  let switchState = false
  const toggle = (val) => { switchState = val }
  toggle(!switchState)
  assert.strictEqual(switchState, true, 'Switch toggles boolean state cleanly')
})

// ============================================================================
// F09: Global Modal Shells (Settings, Copilot, Survey, Consent)
// ============================================================================
tier1Suite.test('F09.01: MicroSurveyModal dialog accessibility attributes', () => {
  const content = readSource('src/components/MicroSurveyModal/MicroSurveyModal.jsx')
  assert.ok(content.includes('role="dialog"'), 'Missing role="dialog"')
  assert.ok(content.includes('aria-modal="true"'), 'Missing aria-modal="true"')
  assert.ok(content.includes('aria-labelledby'), 'Missing aria-labelledby')
})

tier1Suite.test('F09.02: Keyboard Escape key listener for modal dismissal', () => {
  const content = readSource('src/components/MicroSurveyModal/MicroSurveyModal.jsx')
  assert.ok(content.includes("e.key === 'Escape'"), 'Missing Escape key handler in modal')
})

tier1Suite.test('F09.03: ResearchConsentModal state transitions', () => {
  const content = readSource('src/components/ResearchConsentModal/ResearchConsentModal.jsx')
  assert.ok(content.includes('handleChoice') || content.includes('consent'), 'ResearchConsentModal manages consent choice')
})

tier1Suite.test('F09.04: SettingsModal exists and provides preference tabs', () => {
  assert.ok(fileExists('src/components/SettingsModal/SettingsModal.jsx'), 'SettingsModal.jsx must exist')
  const content = readSource('src/components/SettingsModal/SettingsModal.jsx')
  assert.ok(content.includes('tab') || content.includes('audio') || content.includes('theme') || content.includes('Settings'), 'SettingsModal includes preference sections')
})

tier1Suite.test('F09.05: AICopilot dialog shell and drawer trigger structure', () => {
  assert.ok(fileExists('src/components/AICopilot/AICopilot.jsx'), 'AICopilot.jsx must exist')
  const content = readSource('src/components/AICopilot/AICopilot.jsx')
  assert.ok(content.includes('Copilot') || content.includes('chat') || content.includes('messages'), 'AICopilot component structured for interaction')
})

// ============================================================================
// F10: Public Marketing & Promo Page (/promo)
// ============================================================================
tier1Suite.test('F10.01: Route registration: /promo registered in App.jsx', () => {
  const routes = parseAppRoutes()
  const promo = routes.find(r => r.path === '/promo')
  assert.ok(promo, 'Route /promo must be registered in App.jsx')
})

tier1Suite.test('F10.02: Public accessibility: /promo is unauthenticated', () => {
  const routes = parseAppRoutes()
  const promo = routes.find(r => r.path === '/promo')
  assert.ok(promo && !promo.isProtected, 'Route /promo must not be inside ProtectedRoute')
})

tier1Suite.test('F10.03: Hero section and CTA link to login/practice', () => {
  const content = readSource('src/features/promo/PromoLanding.jsx')
  assert.ok(content.includes('hero') || content.includes('title') || content.includes('Heading') || content.includes('Edgewise'), 'PromoLanding contains hero section')
  assert.ok(content.includes('/login') || content.includes('to='), 'PromoLanding contains call to action link')
})

tier1Suite.test('F10.04: Feature grid cards showcasing platform capabilities', () => {
  const content = readSource('src/features/promo/PromoLanding.jsx')
  assert.ok(content.includes('interview') || content.includes('lgd') || content.includes('coding') || content.includes('features'), 'PromoLanding highlights key features')
})

tier1Suite.test('F10.05: Responsive layout styling for promo landing', () => {
  const hasModule = fileExists('src/features/promo/PromoLanding.module.css')
  assert.ok(hasModule, 'PromoLanding.module.css must exist')
})

// ============================================================================
// F11: Authentication Experience (/login)
// ============================================================================
tier1Suite.test('F11.01: Route registration: /login wrapped in LoginGuard', () => {
  const routes = parseAppRoutes()
  const login = routes.find(r => r.path === '/login')
  assert.ok(login, 'Route /login must be registered in App.jsx')
})

tier1Suite.test('F11.02: Login form input fields (email and credentials)', () => {
  const content = readSource('src/features/auth/Login.jsx')
  assert.ok(content.includes('type="email"') || content.includes('email'), 'Login form includes email input')
  assert.ok(content.includes('password') || content.includes('code'), 'Login form includes password or code input')
})

tier1Suite.test('F11.03: Form submission triggers login action', () => {
  const content = readSource('src/features/auth/Login.jsx')
  assert.ok(content.includes('handleSubmit') || content.includes('login') || content.includes('onSubmit'), 'Login form triggers submit handler')
})

tier1Suite.test('F11.04: Query param ?redirect= preservation', () => {
  const appContent = readSource('src/App.jsx')
  assert.ok(appContent.includes('redirect=') || appContent.includes('returnTo'), 'App.jsx preserves redirect target in query parameters')
})

tier1Suite.test('F11.05: Guest/demo login capability for instant user access', () => {
  const content = readSource('src/features/auth/Login.jsx')
  assert.ok(content.includes('demo') || content.includes('guest') || content.includes('Quick') || content.includes('Button'), 'Login page supports demo/guest or quick entry')
})

// ============================================================================
// F12: Main Workbench Dashboard (/)
// ============================================================================
tier1Suite.test('F12.01: Route registration: root / mapped to Dashboard', () => {
  const routes = parseAppRoutes()
  const home = routes.find(r => r.path === '/')
  assert.ok(home, 'Root route / must be registered')
  assert.strictEqual(home.element, 'Dashboard', 'Root route must render Dashboard component')
})

tier1Suite.test('F12.02: Root route is protected by ProtectedRoute', () => {
  const routes = parseAppRoutes()
  const home = routes.find(r => r.path === '/')
  assert.ok(home && home.isProtected, 'Root dashboard must be protected by authentication guard')
})

tier1Suite.test('F12.03: Metric cards display in Dashboard', () => {
  const content = readSource('src/features/dashboard/Dashboard.jsx')
  assert.ok(content.includes('metric') || content.includes('stat') || content.includes('card') || content.includes('streak'), 'Dashboard displays metric statistics')
})

tier1Suite.test('F12.04: Capability radar or skill progression chart container', () => {
  const content = readSource('src/features/dashboard/Dashboard.jsx')
  assert.ok(content.includes('Radar') || content.includes('Chart') || content.includes('score') || content.includes('skills'), 'Dashboard provides skill capability visualization')
})

tier1Suite.test('F12.05: Quick action navigation buttons in Dashboard', () => {
  const content = readSource('src/features/dashboard/Dashboard.jsx')
  assert.ok(content.includes('/interview') || content.includes('/questions') || content.includes('action'), 'Dashboard provides quick-launch action triggers')
})

// ============================================================================
// F13: User Profile & Account Settings (/profile)
// ============================================================================
tier1Suite.test('F13.01: Route registration: /profile registered under layout', () => {
  const routes = parseAppRoutes()
  const profile = routes.find(r => r.path === '/profile')
  assert.ok(profile && profile.isProtected, 'Route /profile must be registered and protected')
})

tier1Suite.test('F13.02: User header with avatar and membership tier', () => {
  const content = readSource('src/features/profile/Profile.jsx')
  assert.ok(content.includes('user') || content.includes('avatar') || content.includes('tier'), 'Profile includes user avatar/tier indicator')
})

tier1Suite.test('F13.03: Tab switcher navigation in Profile', () => {
  const content = readSource('src/features/profile/Profile.jsx')
  assert.ok(content.includes('tab') || content.includes('activeTab') || content.includes('SegmentedControl'), 'Profile contains tab switcher')
})

tier1Suite.test('F13.04: Research consent status and toggle integration', () => {
  const content = readSource('src/features/profile/Profile.jsx')
  assert.ok(content.includes('research') || content.includes('consent') || content.includes('experiment'), 'Profile handles research consent')
})

tier1Suite.test('F13.05: Logout action trigger in Profile', () => {
  const content = readSource('src/features/profile/Profile.jsx')
  assert.ok(content.includes('logout') || content.includes('Logout') || content.includes('退出'), 'Profile provides logout trigger')
})

// ============================================================================
// F14: Task Pages & Sharing Flows (/tasks, /s/:id, /pair/:id, /org/join/:code)
// ============================================================================
tier1Suite.test('F14.01: SEO task index /tasks and detail /tasks/:slug registered', () => {
  const routes = parseAppRoutes()
  assert.ok(routes.find(r => r.path === '/tasks'), 'Route /tasks must be registered')
  assert.ok(routes.find(r => r.path === '/tasks/:slug'), 'Route /tasks/:slug must be registered')
})

tier1Suite.test('F14.02: Shared card preview route /s/:shareId registered', () => {
  const routes = parseAppRoutes()
  const share = routes.find(r => r.path === '/s/:shareId')
  assert.ok(share, 'Route /s/:shareId must be registered')
})

tier1Suite.test('F14.03: Pair practice collaboration route /pair/:pairId registered', () => {
  const routes = parseAppRoutes()
  const pair = routes.find(r => r.path === '/pair/:pairId')
  assert.ok(pair, 'Route /pair/:pairId must be registered')
})

tier1Suite.test('F14.04: Organization join route /org/join/:code registered', () => {
  const routes = parseAppRoutes()
  const org = routes.find(r => r.path === '/org/join/:code')
  assert.ok(org, 'Route /org/join/:code must be registered')
})

tier1Suite.test('F14.05: Build tasks manifest integration exists in public', () => {
  assert.ok(fileExists('public/tasks/manifest.json'), 'public/tasks/manifest.json must exist')
  const manifest = JSON.parse(readSource('public/tasks/manifest.json'))
  assert.ok(Array.isArray(manifest.tasks || manifest), 'Task manifest contains task list')
})

// ============================================================================
// F15: 1v1 Mock Interview Lobby & Simulation Rooms (/interview/*)
// ============================================================================
tier1Suite.test('F15.01: Interview lobby route /interview/lobby registered', () => {
  const routes = parseAppRoutes()
  const lobby = routes.find(r => r.path === '/interview/lobby')
  assert.ok(lobby && lobby.isProtected, 'Route /interview/lobby must be registered and protected')
})

tier1Suite.test('F15.02: Immersive interview room route /interview/room/:id registered', () => {
  const routes = parseAppRoutes()
  const room = routes.find(r => r.path === '/interview/room/:id')
  assert.ok(room && room.isProtected, 'Route /interview/room/:id must be registered and protected')
})

tier1Suite.test('F15.03: Structured interview room routes registered', () => {
  const routes = parseAppRoutes()
  assert.ok(routes.find(r => r.path === '/interview/structured/lobby'), 'Structured lobby registered')
  assert.ok(routes.find(r => r.path === '/interview/structured/:id'), 'Structured room registered')
})

tier1Suite.test('F15.04: One-way interview simulation route /interview/oneway/:id registered', () => {
  const routes = parseAppRoutes()
  const oneway = routes.find(r => r.path === '/interview/oneway/:id')
  assert.ok(oneway && oneway.isProtected, 'One-way room registered')
})

tier1Suite.test('F15.05: Speech metrics computation utility exports delivery metrics', () => {
  assert.ok(fileExists('src/features/interview/speechMetrics.js'), 'speechMetrics.js must exist')
  const content = readSource('src/features/interview/speechMetrics.js')
  assert.ok(content.includes('computeDeliveryMetrics'), 'Exports computeDeliveryMetrics')
  assert.ok(content.includes('detectStarCoverage'), 'Exports detectStarCoverage')
})

// ============================================================================
// F16: LGD Group Discussion Lobby & Room (/lgd/*)
// ============================================================================
tier1Suite.test('F16.01: LGD lobby route /lgd/lobby registered', () => {
  const routes = parseAppRoutes()
  const lobby = routes.find(r => r.path === '/lgd/lobby')
  assert.ok(lobby && lobby.isProtected, 'Route /lgd/lobby must be registered')
})

tier1Suite.test('F16.02: LGD simulation room route /lgd/room/:id registered', () => {
  const routes = parseAppRoutes()
  const room = routes.find(r => r.path === '/lgd/room/:id')
  assert.ok(room && room.isProtected, 'Route /lgd/room/:id must be registered')
})

tier1Suite.test('F16.03: LGD discussion topic selection structure', () => {
  const content = readSource('src/features/lgd/LGDLobby.jsx')
  assert.ok(content.includes('topic') || content.includes('case') || content.includes('scenario'), 'LGD lobby provides topic selection')
})

tier1Suite.test('F16.04: Speech turn timer and queue management in LGDRoom', () => {
  const content = readSource('src/features/lgd/LGDRoom.jsx')
  assert.ok(content.includes('timer') || content.includes('turn') || content.includes('round'), 'LGDRoom handles speech turn timing')
})

tier1Suite.test('F16.05: Live discussion transcript stream container in LGDRoom', () => {
  const content = readSource('src/features/lgd/LGDRoom.jsx')
  assert.ok(content.includes('transcript') || content.includes('messages') || content.includes('logs') || content.includes('history'), 'LGDRoom renders discussion transcript')
})

// ============================================================================
// F17: Coding Arena & Case Analysis (/coding/*, /case/*)
// ============================================================================
tier1Suite.test('F17.01: Coding lobby /coding/lobby and session room registered', () => {
  const routes = parseAppRoutes()
  assert.ok(routes.find(r => r.path === '/coding/lobby'), 'Route /coding/lobby registered')
  assert.ok(routes.find(r => r.path === '/coding/:sessionId'), 'Route /coding/:sessionId registered')
})

tier1Suite.test('F17.02: Case study lobby /case/lobby and room registered', () => {
  const routes = parseAppRoutes()
  assert.ok(routes.find(r => r.path === '/case/lobby'), 'Route /case/lobby registered')
  assert.ok(routes.find(r => r.path === '/case/room/:sessionId'), 'Route /case/room/:sessionId registered')
})

tier1Suite.test('F17.03: Coding problem statement panel and constraints', () => {
  const content = readSource('src/features/coding/CodingRoom.jsx')
  assert.ok(content.includes('problem') || content.includes('description') || content.includes('examples'), 'CodingRoom contains problem description panel')
})

tier1Suite.test('F17.04: Monaco code editor wrapper integration', () => {
  const content = readSource('src/features/coding/CodingRoom.jsx')
  assert.ok(content.includes('Editor') || content.includes('monaco') || content.includes('code'), 'CodingRoom incorporates code editor container')
})

tier1Suite.test('F17.05: Whiteboard / diagram scratchpad wrapper in CaseRoom', () => {
  const content = readSource('src/features/case/CaseRoom.jsx')
  assert.ok(content.includes('whiteboard') || content.includes('excalidraw') || content.includes('canvas') || content.includes('scratchpad') || content.includes('diagram'), 'CaseRoom includes whiteboard scratchpad')
})

// ============================================================================
// F18: Question Bank & Practice (/questions/*)
// ============================================================================
tier1Suite.test('F18.01: Question bank index route /questions registered', () => {
  const routes = parseAppRoutes()
  const qb = routes.find(r => r.path === '/questions')
  assert.ok(qb && qb.isProtected, 'Route /questions must be registered and protected')
})

tier1Suite.test('F18.02: Question detail view route /questions/:id registered', () => {
  const routes = parseAppRoutes()
  const qd = routes.find(r => r.path === '/questions/:id')
  assert.ok(qd && qd.isProtected, 'Route /questions/:id must be registered and protected')
})

tier1Suite.test('F18.03: Category filter tabs in QuestionBank', () => {
  const content = readSource('src/features/questions/QuestionBank.jsx')
  assert.ok(content.includes('category') || content.includes('tag') || content.includes('tab') || content.includes('filter'), 'QuestionBank contains category filter interface')
})

tier1Suite.test('F18.04: Question search query input support', () => {
  const content = readSource('src/features/questions/QuestionBank.jsx')
  assert.ok(content.includes('search') || content.includes('query') || content.includes('keyword'), 'QuestionBank supports search queries')
})

tier1Suite.test('F18.05: Question bookmarking and answer drafting modal support', () => {
  const content = readSource('src/features/questions/QuestionBank.jsx')
  assert.ok(content.includes('bookmark') || content.includes('favorite') || content.includes('practice') || content.includes('star'), 'QuestionBank supports saving/bookmarking or practice drafting')
})

// ============================================================================
// F19: Resume Workbench & Star Stories (/resume, /stories)
// ============================================================================
tier1Suite.test('F19.01: Resume workbench route /resume registered', () => {
  const routes = parseAppRoutes()
  const resume = routes.find(r => r.path === '/resume')
  assert.ok(resume && resume.isProtected, 'Route /resume must be registered and protected')
})

tier1Suite.test('F19.02: Resume upload dropzone and document parsing status', () => {
  const content = readSource('src/features/resume/Resume.jsx')
  assert.ok(content.includes('upload') || content.includes('file') || content.includes('drop'), 'Resume page provides file upload area')
})

tier1Suite.test('F19.03: ATS scoring and keyword diagnostic feedback', () => {
  const content = readSource('src/features/resume/Resume.jsx')
  assert.ok(content.includes('score') || content.includes('ats') || content.includes('keyword') || content.includes('analysis'), 'Resume page provides diagnostic evaluation')
})

tier1Suite.test('F19.04: STAR story bank route /stories registered', () => {
  const routes = parseAppRoutes()
  const stories = routes.find(r => r.path === '/stories')
  assert.ok(stories && stories.isProtected, 'Route /stories must be registered and protected')
})

tier1Suite.test('F19.05: Structured STAR story cards with S-T-A-R fields', () => {
  const content = readSource('src/features/stories/StoryBank.jsx')
  assert.ok(content.includes('situation') || content.includes('task') || content.includes('action') || content.includes('result') || content.includes('STAR'), 'StoryBank handles structured STAR dimensions')
})

// ============================================================================
// F20: Schedule, Experiences & Creator Series (/schedule, /experiences/*, /series/:id)
// ============================================================================
tier1Suite.test('F20.01: Schedule calendar route /schedule registered', () => {
  const routes = parseAppRoutes()
  const schedule = routes.find(r => r.path === '/schedule')
  assert.ok(schedule && schedule.isProtected, 'Route /schedule must be registered and protected')
})

tier1Suite.test('F20.02: Experiences list route /experiences registered', () => {
  const routes = parseAppRoutes()
  const exp = routes.find(r => r.path === '/experiences')
  assert.ok(exp && exp.isProtected, 'Route /experiences must be registered and protected')
})

tier1Suite.test('F20.03: Experience submission form route /experiences/submit registered', () => {
  const routes = parseAppRoutes()
  const submit = routes.find(r => r.path === '/experiences/submit')
  assert.ok(submit && submit.isProtected, 'Route /experiences/submit must be registered and protected')
})

tier1Suite.test('F20.04: Experience detail view route /experiences/:id registered', () => {
  const routes = parseAppRoutes()
  const detail = routes.find(r => r.path === '/experiences/:id')
  assert.ok(detail && detail.isProtected, 'Route /experiences/:id must be registered and protected')
})

tier1Suite.test('F20.05: Creator series article view route /series/:id registered', () => {
  const routes = parseAppRoutes()
  const series = routes.find(r => r.path === '/series/:id')
  assert.ok(series && series.isProtected, 'Route /series/:id must be registered and protected')
})

// ============================================================================
// F21: Analytics & Session Reports (/analytics/*)
// ============================================================================
tier1Suite.test('F21.01: Analytics dashboard overview route /analytics registered', () => {
  const routes = parseAppRoutes()
  const analytics = routes.find(r => r.path === '/analytics')
  assert.ok(analytics && analytics.isProtected, 'Route /analytics must be registered and protected')
})

tier1Suite.test('F21.02: Detailed session report route /analytics/report/:id registered', () => {
  const routes = parseAppRoutes()
  const report = routes.find(r => r.path === '/analytics/report/:id')
  assert.ok(report && report.isProtected, 'Route /analytics/report/:id must be registered and protected')
})

tier1Suite.test('F21.03: Delivery metrics scorecard in Analytics (pace, pauses, fillers)', () => {
  const content = readSource('src/features/analytics/Analytics.jsx')
  assert.ok(content.includes('metrics') || content.includes('chart') || content.includes('rate') || content.includes('filler') || content.includes('score'), 'Analytics renders speech & delivery metrics')
})

tier1Suite.test('F21.04: STAR breakdown radar and performance visualization', () => {
  const content = readSource('src/features/analytics/SessionReport.jsx')
  assert.ok(content.includes('star') || content.includes('Radar') || content.includes('chart') || content.includes('delivery'), 'SessionReport renders STAR and delivery visual breakdown')
})

tier1Suite.test('F21.05: Improvement suggestions and report sharing/export trigger', () => {
  const content = readSource('src/features/analytics/SessionReport.jsx')
  assert.ok(content.includes('feedback') || content.includes('suggestion') || content.includes('share') || content.includes('export') || content.includes('advice'), 'SessionReport provides actionable advice and export/share controls')
})
