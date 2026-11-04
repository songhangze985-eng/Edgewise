# Project: Edgewise Global UI Overhaul & Apple Design System Integration

## Architecture
- **Tech Stack**: React 19 SPA, Vite 8, React Router v7, Zustand 5, Recharts, Three.js, Excalidraw, Monaco Editor.
- **Styling Architecture**: Dual-Compatible Global CSS Token Bridge in `src/index.css` + `src/styles/tokens.css` with 58 scoped CSS Modules (`*.module.css`) and shared UI primitives in `src/components/ui/`.
- **Design Language**: Apple Human Interface Guidelines aesthetic blended with `margin-ui-kit` design tokens:
  - Strict 4px/8px modular grid system (`--space-1` = 4px through `--space-12` = 48px).
  - Major Second (1.125) typography scale anchored at 14px body text, utilizing local Geist Sans, Geist Mono, and Instrument Serif fonts.
  - Multi-stop smooth ambient shadows (`movements.dev` 4-stop curves) + 0.5px Retina hairline rings.
  - Layered liquid glass materials (`backdrop-filter: blur(20px) saturate(180%)`) with specular inset highlights.
  - Physical spring transitions (`cubic-bezier(0.34, 1.36, 0.5, 1)`) and tactile active-scale micro-interactions (`scale(0.98)`).
- **Dual Track Architecture**:
  1. **Implementation Track**: Progresses sequentially from design tokens (M1) → global layout & components (M2) → public & workspace pages (M3) → interactive simulation & practice flows (M4) → full E2E test pass & adversarial hardening (M5).
  2. **E2E Testing Track**: Dispatched in parallel, builds an opaque-box, requirement-driven test harness and test cases (Tiers 1–4) covering all features, publishing `TEST_READY.md`.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F01 | Design Token Bridge & CSS Variables | Standardized tokens (colors, shadows, hairlines, radius, glass, spring physics) in `src/index.css` & `src/styles/tokens.css`, backward-compatible with legacy `--bg`, `--chalk`, `--primary`, `--border`. | M1 | R1, Survey 2 |
| F02 | Local Font Assets & Typography Hierarchy | Embed Geist Sans, Geist Mono, Instrument Serif from `margin-ui-kit/public/fonts` into `public/fonts/`; replace arbitrary rem/pixel font sizes with Major Second scale. | M1 | R1, Survey 2, Survey 3 |
| F03 | 4px/8px Grid & Spacing Harmonization | Standardize paddings, margins, gaps across layouts and cards to strict 4px/8px rhythm. | M1 | R1, Survey 2 |
| F04 | Multi-stop Smooth Shadows & Retina Hairlines | Replace muddy single-stop drop shadows and 3D hardware bevels with 4-stop smooth shadows (`--sh-xs` through `--sh-lg`) and 0.5px hairline rings. | M1 | R1, Survey 2 |
| F05 | Desktop Floating Sidebar Shell | Redesign `Sidebar.jsx` with Apple frosted glass, refined collapsed/expanded states, sleek navigation pills, and polished user popover menu. | M2 | R2, Survey 1, Survey 2 |
| F06 | Mobile Bottom Tab Bar | Modernize `MobileTabBar.jsx` with liquid glass capsule styling, tactile tab press states, and responsive bottom safe area support. | M2 | R2, Survey 1 |
| F07 | Standard PageBar Header Component | Upgrade `src/components/ui/PageBar.jsx` with refined typography, breadcrumb slash styling, and action slot alignments. | M2 | R2, Survey 1 |
| F08 | Standard UI Component Primitives | Build standardized Apple-style components in `src/components/ui/` (Button, Card, Input, SegmentedControl, Switch, Modal/Sheet, Badge, Dropdown). | M2 | R2, Survey 2 |
| F09 | Global Modal Shells (Settings, Copilot, Survey, Consent) | Redesign `SettingsModal`, `AICopilot`, `MicroSurveyModal`, `ResearchConsentModal` with Apple sheet/dialog aesthetics while maintaining state hooks. | M2 | R2, Survey 1, Survey 3 |
| F10 | Public Marketing & Promo Page (`/promo`) | Modernize full-screen Hero, feature grid, LGD showcase, and platform stats with Apple elegance while keeping scroll animations. | M3 | R3, Survey 3 |
| F11 | Authentication Experience (`/login`) | Overhaul split layout, 3D canvas backdrop harmony, frosted glass login card, form inputs, and validation feedback. | M3 | R3, Survey 3 |
| F12 | Main Workbench Dashboard (`/`) | Modernize greeting header, metric cards, capability radar chart (Recharts styling), quick actions, and recent session logs. | M3 | R3, Survey 3 |
| F13 | User Profile & Account Settings (`/profile`) | Redesign profile header, tier badge, 4-tab switcher, achievement grid, activity timeline, and research/org management. | M3 | R3, Survey 3 |
| F14 | Task Pages & Sharing Flows (`/tasks`, `/s/:id`, `/pair/:id`, `/org/join/:code`) | Modernize SEO task directory, shared revision cards, pair practice cards, and cohort join forms. | M3 | R3, Survey 3 |
| F15 | 1v1 Mock Interview Lobby & Simulation Rooms (`/interview/*`) | Upgrade multi-step wizard, question tags, and immersive interview room (video feed, speech waveform, timer, question prompt) with zero state/media regressions. | M4 | R3, Survey 3 |
| F16 | LGD Group Discussion Lobby & Room (`/lgd/*`) | Polish circular table layout, AI speaker avatars, speech turn timers, topic prompt card, and discussion log. | M4 | R3, Survey 3 |
| F17 | Coding Arena & Case Analysis (`/coding/*`, `/case/*`) | Restyle Monaco editor wrapper, problem description panel, execution console, and Excalidraw whiteboard wrapper. | M4 | R3, Survey 3 |
| F18 | Question Bank & Practice (`/questions/*`) | Overhaul question filter pills, category tabs, question detail modal, and practice answer cards. | M4 | R3, Survey 3 |
| F19 | Resume Workbench & Star Stories (`/resume`, `/stories`) | Polish resume upload dropzone, parsed section cards, diagnostic feedback, and STAR story side-peek drawer. | M4 | R3, Survey 3 |
| F20 | Schedule, Experiences & Creator Series (`/schedule`, `/experiences/*`, `/series/:id`) | Upgrade interview calendar view, experience submission forms, detail cards, and creator column articles. | M4 | R3, Survey 3 |
| F21 | Analytics & Session Reports (`/analytics/*`) | Redesign analytics dashboard, delivery metric cards, STAR breakdown radar, and speech rate / pause charts. | M4 | R3, Survey 3 |
| F22 | E2E Test Suite & Test Runner Infrastructure | Develop standalone opaque-box test runner, CLI execution command, test assertions, and report generator. | E2E | AC, Test Track |
| F23 | Tier 1 Feature Coverage Tests (>=5 per feature) | Implement independent happy-path test cases verifying route rendering, element presence, and baseline interaction for all features. | E2E | Test Track |
| F24 | Tier 2 Boundary & Corner Case Tests (>=5 per feature) | Test extreme viewports, long text overflow, missing optional fields, zero-data states, and rapid switching. | E2E | Test Track |
| F25 | Tier 3 Cross-Feature Combination Tests | Test interactions between themes, navigation state transitions, modal triggers during sessions, and auth state flows. | E2E | Test Track |
| F26 | Tier 4 Real-World End-to-End User Scenarios | Validate realistic user journeys (Landing → Login → Dashboard → Interview setup → Question bank → Profile → Session report). | E2E | Test Track |
| F27 | 100% E2E Test Pass Verification | Execute full opaque-box test suite against the overhauled codebase; fix any regressions until 100% passing. | M5 | AC, Implementation |
| F28 | Tier 5 Adversarial Coverage Hardening | Run white-box adversarial testing, probe edge cases, ensure zero console errors and full responsive integrity. | M5 | AC, Final Milestone |
| F29 | Agent-Autoloop Engineering & Academic Operations Suite | Integrated background autonomous daemon (.autoloop/rules.json), E2E QA watchdog, neat-freak sync, empirical monitor, and UGC reviewer. | M6 | Ops |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Design Tokens, Typography & Spacing System | F01, F02, F03, F04: Global CSS Token Bridge, local Geist/Instrument Serif fonts, 4px/8px grid, smooth shadows & retina hairlines in `src/index.css` & `src/styles/tokens.css`. | None | PLANNED |
| M2 | Global Layout & Common UI Components | F05, F06, F07, F08, F09: Sidebar, MobileTabBar, PageBar, standardized UI primitives (`src/components/ui/`), and global modals (Settings, Copilot, Survey). | M1 | PLANNED |
| M3 | Public & Core Workspace Pages Overhaul | F10, F11, F12, F13, F14: Promo landing page, Login split view, Dashboard workbench, Profile & account page, Task directory and Sharing flows. | M2 | PLANNED |
| M4 | Interactive Simulation & Practice Workflows | F15, F16, F17, F18, F19, F20, F21: 1v1 Interview lobby & rooms, LGD, Coding arena, Case study, Question bank, Resume workbench, Schedule, Analytics. | M2 | PLANNED |
| M5 | E2E Verification & Adversarial Hardening | F27, F28: Execute complete E2E test suite (Tiers 1–4) after `TEST_READY.md` published; pass 100% tests; run Tier 5 adversarial hardening and forensic integrity audit. | M3, M4, TEST_READY.md | PLANNED |
| M6 | Agent-Autoloop Automation & DevOps Suite | F29: Full integration of agent-autoloop background daemon, neat-freak sync, daily empirical checks, and HITL approval cards. | M5 | COMPLETED |

### Parallel Track: E2E Testing Track
| Track | Scope | Dependencies | Deliverable | Status |
|-------|-------|-------------|-------------|--------|
| E2E Testing Track | F22, F23, F24, F25, F26: Build requirement-driven opaque-box test runner and test cases (Tiers 1–4), publish `TEST_READY.md`. | None | `TEST_READY.md`, test runner script, test report | PLANNED |

---

## Interface Contracts

### 1. Token Bridge Contract (`src/index.css` ↔ Scoped CSS Modules)
- **CSS Variables**:
  - Backgrounds: `--canvas` (#f5f4f1 / #111112), `--surface` (#ffffff / #1a1a1c), `--surface-elevated` (#ffffff / #242428).
  - Text: `--ink` (#17181a / #ededee), `--muted` (#5f6167 / #b0b1b6), `--faint` (#8a8b90).
  - Borders & Rings: `--hair` (1px, retina 0.5px), `--line` (rgb(23 24 26 / 0.09) / rgb(255 255 255 / 0.08)), `--ring` (0 0 0 var(--hair) ...).
  - Shadows: `--sh-xs`, `--sh-sm`, `--sh-md`, `--sh-lg` (4-stop smooth shadow curves).
  - Spacing: `--space-1` (4px) through `--space-12` (48px).
  - Motion: `--ease-spring: cubic-bezier(0.34, 1.36, 0.5, 1)`, `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`.
- **Legacy Aliases**:
  - `--bg: var(--canvas)`
  - `--bg-surface: var(--surface)`
  - `--bg-elevated: var(--surface-elevated)`
  - `--chalk: var(--ink)`
  - `--chalk-dim: var(--muted)`
  - `--chalk-faint: var(--faint)`
  - `--border: var(--line)`
  - `--border-subtle: var(--line)`
  - `--radius-sm: var(--r-sm, 6px)`
  - `--radius-md: var(--r-md, 10px)`
  - `--radius-lg: var(--r-lg, 16px)`

### 2. Standardized UI Components Contract (`src/components/ui/` ↔ Features)
- `Button`: `variant="solid" | "ghost" | "accent" | "danger"`, `size="sm" | "md" | "lg"`, `loading?: boolean`, `icon?: ReactNode`, `disabled?: boolean`.
- `Card`: `variant="surface" | "glass" | "sunken"`, `hoverable?: boolean`, `padding?: "sm" | "md" | "lg"`.
- `Input`: `size="sm" | "md"`, `error?: string`, `prefix?: ReactNode`, `suffix?: ReactNode`.
- `SegmentedControl`: `options: Array<{ value: string, label: string }>`, `value: string`, `onChange: (val) => void`.
- `Switch`: `checked: boolean`, `onChange: (checked: boolean) => void`, `size?: "sm" | "md"`.
- `Badge`: `variant="neutral" | "accent" | "success" | "warning" | "danger"`.

### 3. Functional Non-Regression Contract
- All existing route paths in `App.jsx` must remain identical.
- All Zustand stores (`useAuthStore`, `useSessionStore`, `useResumeStore`, etc.) and their action signatures must remain untouched.
- Hardware APIs (Webcam MediaRecorder in `InterviewRoom`, Web Speech STT/TTS, MediaPipe posture tracker) must not be interrupted.
- Build command `npm run build` must succeed with exit code 0.

---

## Code Layout
- **Design Tokens**: `src/styles/tokens.css`, `src/index.css`, `public/fonts/*`
- **Global Layout**: `src/components/Layout/Layout.jsx`, `Sidebar.jsx`, `MobileTabBar.jsx`, `Layout.module.css`
- **Shared UI Primitives**: `src/components/ui/Button.jsx`, `Card.jsx`, `Input.jsx`, `SegmentedControl.jsx`, `Switch.jsx`, `Modal.jsx`, `Badge.jsx`, `PageBar.jsx`
- **Global Modals**: `src/components/SettingsModal/*`, `src/components/AICopilot/*`, `src/components/MicroSurveyModal/*`
- **Public & Workspace Features**: `src/features/promo/*`, `src/features/auth/*`, `src/features/dashboard/*`, `src/features/profile/*`, `src/features/tasks/*`, `src/features/share/*`
- **Practice & Simulation Features**: `src/features/interview/*`, `src/features/lgd/*`, `src/features/coding/*`, `src/features/case/*`, `src/features/questions/*`, `src/features/resume/*`, `src/features/schedule/*`, `src/features/analytics/*`
- **E2E Testing Infrastructure**: `tests/e2e/*`, `scripts/run-e2e-tests.mjs`, `TEST_INFRA.md`, `TEST_READY.md`
- **Autoloop Automation Infrastructure**: `.autoloop/rules.json`, `scripts/autoloop/*`, `docs/AGENT_AUTOLOOP_INTEGRATION.md`, `.github/workflows/autoloop-ci.yml`
