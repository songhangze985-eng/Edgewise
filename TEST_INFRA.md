# TEST_INFRA.md: Edgewise E2E Testing Infrastructure Specification

## 1. Executive Summary & Testing Philosophy

Edgewise requires an exhaustive, deterministic, and opaque-box test infrastructure to validate the Global UI Overhaul and Apple Design System Integration across all 21 system features (F01–F21). 

The testing architecture adheres to three core tenets:
1. **Opaque-Box Verification**: Tests validate public interface contracts, observable DOM and CSS properties, state store transitions, and user-facing workflows without coupling to internal private implementation details.
2. **Deterministic Independence**: Every test case initializes its own fixture state, executes in total isolation, and leaves no residual side effects in memory, storage, or runtime global objects.
3. **Progressive Testability & Adversarial Rigor**: Tests systematically exercise nominal happy paths (Tier 1), boundary/corner conditions (Tier 2), cross-module integrations (Tier 3), and end-to-end real-world user journeys (Tier 4).

---

## 2. Test Tiers Architecture

```
+-------------------------------------------------------------------------+
|                  TIER 4: Real-World User Scenarios                      |
|         7 Multi-Step End-to-End User Journeys (15 Scenarios)            |
+-------------------------------------------------------------------------+
|                TIER 3: Cross-Feature Combinations                       |
|   Theme x Routing, Modal Lifecycles, MicroSurvey Gates, Store Sync (20) |
+-------------------------------------------------------------------------+
|                 TIER 2: Boundary & Corner Cases                         |
|   Viewports, 10k Chars, Emojis, Zero-Data, Rapid Clicks, Numerics (30)   |
+-------------------------------------------------------------------------+
|                   TIER 1: Feature Coverage                              |
|           F01 - F21 Baseline Contracts (>=5 tests each = 105 tests)     |
+-------------------------------------------------------------------------+
|                     HARNESS & TEST RUNNER ENGINE                        |
|       scripts/run-e2e-tests.mjs  |  tests/e2e/harness.mjs               |
+-------------------------------------------------------------------------+
```

### Tier 1: Feature Coverage (F01–F21)
- **Threshold**: Minimum 5 discrete, verifiable test cases per feature across all 21 features defined in `PROJECT.md § Feature Inventory` (105 total tests).
- **Scope**:
  - `F01`: Design Token Bridge & CSS Variables (canvas, surface, ink, hairline, smooth shadow curves, spring easing, legacy aliases backward compatibility).
  - `F02`: Local Font Assets & Typography Hierarchy (Geist Sans, Geist Mono, Instrument Serif, Major Second 1.125 scale, fallback stacks, font weights, line heights).
  - `F03`: 4px/8px Grid & Spacing Harmonization (multiples of 4px/8px, container widths, padding/margin rhythm, card gaps, form spacing).
  - `F04`: Multi-stop Smooth Shadows & Retina Hairlines (4-stop shadow curves `--sh-xs`..`--sh-lg`, retina 0.5px hairline ring, backdrop blur, specular highlights).
  - `F05`: Desktop Floating Sidebar Shell (`Sidebar.jsx`, navigation pill structures, active indicators, collapse/expand state, popover menu).
  - `F06`: Mobile Bottom Tab Bar (`MobileTabBar.jsx`, liquid glass styling, safe area inset, mobile route pills, media query breakpoint visibility).
  - `F07`: Standard PageBar Header Component (`PageBar.jsx`, breadcrumb structure, slash separator, title/subtitle slots, right actions slot, sticky/frosted backdrop).
  - `F08`: Standard UI Component Primitives (Button variants & sizes, Card variants & padding, Input prefix/suffix & error, SegmentedControl options & selection, Switch toggle & states, Badge variants, Modal sheet primitives).
  - `F09`: Global Modal Shells (`SettingsModal`, `AICopilot`, `MicroSurveyModal`, `ResearchConsentModal`, `role="dialog"`, `aria-modal`, ESC key dismissal, backdrop filters).
  - `F10`: Public Marketing & Promo Page (`/promo`, hero section, feature cards, LGD showcase, public route access without login guard, call-to-action links).
  - `F11`: Authentication Experience (`/login`, split layout, frosted glass card, credentials inputs, auth validation, redirect param preservation, guest login).
  - `F12`: Main Workbench Dashboard (`/`, greeting header, metric summary cards, capability radar, quick action buttons, recent session activity).
  - `F13`: User Profile & Account Settings (`/profile`, user header, tier badge, 4-tab switcher, achievement grid, activity timeline, research consent settings).
  - `F14`: Task Pages & Sharing Flows (`/tasks`, `/s/:id`, `/pair/:id`, `/org/join/:code`, task directory index, share card preview, pair practice lobby, join cohort validation).
  - `F15`: 1v1 Mock Interview Lobby & Simulation Rooms (`/interview/lobby`, `/interview/room/:id`, wizard step configuration, HUD timer, question prompt display, session recording controls).
  - `F16`: LGD Group Discussion Lobby & Room (`/lgd/lobby`, `/lgd/room/:id`, multi-candidate persona selection, circular table seating, turn timer, speech transcript stream).
  - `F17`: Coding Arena & Case Analysis (`/coding/lobby`, `/coding/:sessionId`, `/case/lobby`, `/case/room/:sessionId`, problem specification panel, editor wrapper, whiteboard canvas container, execution output console).
  - `F18`: Question Bank & Practice (`/questions`, `/questions/:id`, filter pills, category selection, question search, bookmarking, practice answer drafting modal).
  - `F19`: Resume Workbench & Star Stories (`/resume`, `/stories`, file upload dropzone, parsed section cards, ATS scoring feedback, STAR story builder cards, side drawer).
  - `F20`: Schedule, Experiences & Creator Series (`/schedule`, `/experiences`, `/experiences/submit`, `/series/:id`, calendar view, interview post submission form, community reviews, creator series article reader).
  - `F21`: Analytics & Session Reports (`/analytics`, `/analytics/report/:id`, performance metric scorecards, STAR breakdown radar, pacing & pause charts, feedback recommendations, export/share action).

### Tier 2: Boundary & Corner Cases
- **Threshold**: Minimum 30 discrete tests probing system limits, edge cases, and unexpected inputs.
- **Scope**:
  - **Viewport Boundaries**: Mobile (320px), Compact Mobile (480px), Tablet (768px), Desktop (1024px), Ultra-Wide (2560px).
  - **Text Overflow & Extreme Strings**: 10,000-character open text inputs, multi-byte Unicode strings, HTML/XSS injection tags, emoji clusters, zero-width characters.
  - **Zero-Data & Empty States**: 0 completed interview sessions, empty search query results, empty STAR story bank, empty experience list, zero bookmarks.
  - **Numeric Extremes & Timers**: 0% readiness score, 100% readiness score, negative timestamps, 0-second timers, massive timers, fractional scores, NaN resistance.
  - **Rapid User Interactions & Reentrancy**: Rapid double-clicking submit buttons, rapid modal open/close toggles, simultaneous route navigation events, skip-all rapid clicking.
  - **Missing Optional Fields**: Profile missing avatar or tier label, question missing hints/category, session missing notes, share card without author.

### Tier 3: Cross-Feature Combinations
- **Threshold**: Minimum 20 tests verifying interactions across multiple subsystems.
- **Scope**:
  - Dual-theme token persistence and CSS variable coherence across routes.
  - Authentication protection chain: unauthenticated access to `/` redirects to `/login?redirect=%2F`, preserves return target upon login, and prevents authenticated access to `/login`.
  - Deep linking preservation with nested routes and search params (`/interview/lobby?role=backend&difficulty=hard`).
  - Active modal lifecycle during route navigation: proper cleanup and dismissal without leaking backdrop overlays.
  - Global `MicroSurveyGate` route suppression: modal allowed on workbench (`/`), question bank (`/questions`), profile (`/profile`), but strictly suppressed inside active simulation rooms (`/interview/room/:id`, `/interview/oneway/:id`, `/lgd/room/:id`).
  - Research consent grant trigger: granting consent immediately unlocks Survey B pretest items (A1~B4).
  - Posttest Day 7 completion unlocking follow-up survey questions (J2~K2) and setting posttest completed state.
  - Multi-store state coherence: concurrent updates across `useAuthStore`, `useSurveyStore`, `useSessionStore` without cross-store pollution.
  - Role-based route authorization: `AdminRoute` access controls on `/management`, `/management/research`, `/management/framework`.
  - Responsive navigation layout transitions between `Sidebar` (desktop) and `MobileTabBar` (mobile) across breakpoint thresholds.

### Tier 4: Real-World User Flows
- **Threshold**: Minimum 15 tests structured as 7 realistic multi-step user scenarios.
- **Scope**:
  - **Flow 1: New Participant Onboarding & Research Consent**:
    `Landing (/promo) -> Login (/login) -> Consent Grant -> Pretest Survey Prompt -> Workbench Welcome (/)`
  - **Flow 2: 1v1 Technical Mock Interview Full Lifecycle**:
    `Dashboard (/) -> Interview Lobby Setup -> Immersive Room HUD -> Answer Recording -> Session Finalization -> Analytics Report View (/analytics/report/:id)`
  - **Flow 3: Question Bank Self-Study & STAR Story Linking**:
    `Dashboard (/) -> Question Bank Search -> Question Detail -> Draft STAR Answer -> Save to Story Bank (/stories)`
  - **Flow 4: Resume Optimization & Career Diagnostic**:
    `Dashboard (/) -> Resume Upload -> ATS Parsing & Tag Verification -> Section Editing -> Question Bank Recommendation`
  - **Flow 5: Multi-Turn LGD Group Discussion Simulation**:
    `Dashboard (/) -> LGD Lobby Case Selection -> Enter Circular Room -> Turn-Taking Queue -> Argument Submission -> Evaluation Summary`
  - **Flow 6: Collaborative Challenge & Share Card Flow**:
    `Open Share Link (/s/:shareId) -> View Task Specs -> Enter Pair Practice (/pair/:pairId) -> Code Collaboration -> Submit`
  - **Flow 7: Longitudinal Research Posttest & Study Wrap-up**:
    `Dashboard Notification -> Research Posttest Submission -> Follow-up Survey Items -> Profile Achievement Verification`

---

## 3. Test Runner Specification & Invocation

The test suite is driven by a standalone, pure Node.js ESM test runner located at `scripts/run-e2e-tests.mjs`.

### CLI Command Reference
```bash
# Run the complete test suite (Tiers 1 through 4)
node scripts/run-e2e-tests.mjs

# Run a specific tier
node scripts/run-e2e-tests.mjs --tier=1
node scripts/run-e2e-tests.mjs --tier=2
node scripts/run-e2e-tests.mjs --tier=3
node scripts/run-e2e-tests.mjs --tier=4

# Run with verbose stack traces
node scripts/run-e2e-tests.mjs --verbose

# Output results as machine-readable JSON
node scripts/run-e2e-tests.mjs --json
```

### Exit Codes
- `0`: All executed test suites and assertions passed cleanly.
- `1`: One or more test assertions failed, or an unhandled exception occurred.

---

## 4. Test Suite File Structure

```
tests/e2e/
├── harness.mjs                   # Shared test harness, mock stores, AST/CSS/DOM assertions
├── tier1-features.test.mjs       # Tier 1: F01 - F21 Feature Coverage (105 tests)
├── tier2-boundaries.test.mjs     # Tier 2: Boundary & Corner Cases (30 tests)
├── tier3-combinations.test.mjs   # Tier 3: Cross-Feature Combinations (20 tests)
└── tier4-scenarios.test.mjs      # Tier 4: Real-World User Flows (15 tests)

scripts/
└── run-e2e-tests.mjs             # Unified CLI runner with formatted terminal output
```

---

## 5. Coverage Thresholds & Quality Gates

| Metric | Target Threshold | Enforcement Mechanism |
|---|---|---|
| **Tier 1 Feature Coverage** | >= 5 tests per feature (105 tests across F01–F21) | Automated tier suite count validator |
| **Tier 2 Boundary Tests** | >= 30 tests | Automated tier suite count validator |
| **Tier 3 Combination Tests** | >= 20 tests | Automated tier suite count validator |
| **Tier 4 User Flow Tests** | >= 15 tests across 7 scenarios | Automated tier suite count validator |
| **Pass Rate** | 100% (Zero failures) | Runner exit code `0` gate |
| **Build Non-Regression** | `npm run build` succeeds | Production build exit code `0` |
