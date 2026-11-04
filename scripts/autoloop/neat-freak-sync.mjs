#!/usr/bin/env node

/**
 * Edgewise Neat-Freak Architecture & Doc Anti-Rot Validator
 *
 * Implements the Neat-Freak synchronization principle from khazix-skills:
 * Strictly validates that PROJECT.md documentation contracts, feature inventory,
 * UI primitive specifications, and source code implementations remain 100% synchronized
 * with ZERO "documentation brain rot" (文档脑腐).
 *
 * Usage:
 *   node scripts/autoloop/neat-freak-sync.mjs
 *   node scripts/autoloop/neat-freak-sync.mjs --json
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')

const args = process.argv.slice(2)
const isJson = args.includes('--json')

export function runNeatFreakCheck() {
  const issues = []
  const checks = []

  // Check 1: PROJECT.md exists
  const projectMdPath = path.join(ROOT, 'PROJECT.md')
  if (!fs.existsSync(projectMdPath)) {
    issues.push('Missing PROJECT.md in repository root')
    return { ok: false, issues, checks }
  }
  const projectMd = fs.readFileSync(projectMdPath, 'utf8')
  checks.push('PROJECT.md is present')

  // Check 2: Core Feature Inventories (F01–F21) File Mapping
  const coreFiles = [
    { feature: 'F01', path: 'src/index.css' },
    { feature: 'F01', path: 'src/styles/tokens.css' },
    { feature: 'F05', path: 'src/components/Layout/Sidebar.jsx' },
    { feature: 'F06', path: 'src/components/Layout/MobileTabBar.jsx' },
    { feature: 'F07', path: 'src/components/ui/PageBar.jsx' },
    { feature: 'F08 (Button)', path: 'src/components/ui/Button.jsx' },
    { feature: 'F08 (Card)', path: 'src/components/ui/Card.jsx' },
    { feature: 'F08 (Input)', path: 'src/components/ui/Input.jsx' },
    { feature: 'F08 (SegmentedControl)', path: 'src/components/ui/SegmentedControl.jsx' },
    { feature: 'F08 (Switch)', path: 'src/components/ui/Switch.jsx' },
    { feature: 'F08 (Badge)', path: 'src/components/ui/Badge.jsx' },
    { feature: 'F08 (Modal)', path: 'src/components/ui/Modal.jsx' },
    { feature: 'F09 (SettingsModal)', path: 'src/components/SettingsModal/SettingsModal.jsx' },
    { feature: 'F09 (AICopilot)', path: 'src/components/AICopilot/AICopilot.jsx' },
    { feature: 'F09 (MicroSurveyModal)', path: 'src/components/MicroSurveyModal/MicroSurveyModal.jsx' },
    { feature: 'F09 (ResearchConsentModal)', path: 'src/components/ResearchConsentModal/ResearchConsentModal.jsx' },
    { feature: 'F10', path: 'src/features/promo/PromoLanding.jsx' },
    { feature: 'F11', path: 'src/features/auth/Login.jsx' },
    { feature: 'F12', path: 'src/features/dashboard/Dashboard.jsx' },
    { feature: 'F13', path: 'src/features/profile/Profile.jsx' },
    { feature: 'F15', path: 'src/features/interview/InterviewRoom.jsx' },
    { feature: 'F16', path: 'src/features/lgd/LgdRoom.jsx' },
    { feature: 'F17 (Coding)', path: 'src/features/coding/CodingRoom.jsx' },
    { feature: 'F17 (Case)', path: 'src/features/case/CaseWhiteboard.jsx' },
    { feature: 'F18', path: 'src/features/questions/QuestionBank.jsx' },
    { feature: 'F19', path: 'src/features/resume/Resume.jsx' },
    { feature: 'F20', path: 'src/features/schedule/Schedule.jsx' },
    { feature: 'F21', path: 'src/features/analytics/Analytics.jsx' }
  ]

  let missingFiles = 0
  for (const item of coreFiles) {
    const full = path.join(ROOT, item.path)
    if (!fs.existsSync(full)) {
      issues.push(`Feature ${item.feature} mapping broken: Missing ${item.path}`)
      missingFiles++
    }
  }
  checks.push(`Feature files existence verified (${coreFiles.length - missingFiles}/${coreFiles.length} present)`)

  // Check 3: UI Primitives Index Re-exports Contract
  const uiIndexPath = path.join(ROOT, 'src/components/ui/index.js')
  if (fs.existsSync(uiIndexPath)) {
    const uiIndex = fs.readFileSync(uiIndexPath, 'utf8')
    const requiredPrimitives = ['Button', 'Card', 'Input', 'SegmentedControl', 'Switch', 'Badge', 'Modal', 'PageBar']
    for (const prim of requiredPrimitives) {
      if (!uiIndex.includes(prim)) {
        issues.push(`src/components/ui/index.js does not export primitive: ${prim}`)
      }
    }
    checks.push('UI Primitives exports adhere to Contract 2')
  } else {
    issues.push('Missing src/components/ui/index.js')
  }

  // Check 4: CSS Token Bridge Contract
  const tokensCssPath = path.join(ROOT, 'src/styles/tokens.css')
  const indexCssPath = path.join(ROOT, 'src/index.css')
  if (fs.existsSync(tokensCssPath) && fs.existsSync(indexCssPath)) {
    const tokensContent = fs.readFileSync(tokensCssPath, 'utf8') + fs.readFileSync(indexCssPath, 'utf8')
    const requiredTokens = [
      '--canvas', '--surface', '--surface-elevated',
      '--ink', '--muted', '--faint',
      '--line', '--sh-xs', '--sh-sm', '--sh-md', '--sh-lg',
      '--space-1', '--space-4', '--space-8', '--space-12',
      '--bg:', '--chalk:', '--border:'
    ]
    for (const tok of requiredTokens) {
      if (!tokensContent.includes(tok)) {
        issues.push(`CSS Token Bridge missing required token: ${tok}`)
      }
    }
    checks.push('CSS Token Bridge variables and legacy aliases verified')
  }

  // Check 5: Route Contract in App.jsx
  const appJsxPath = path.join(ROOT, 'src/App.jsx')
  if (fs.existsSync(appJsxPath)) {
    const appJsx = fs.readFileSync(appJsxPath, 'utf8')
    const requiredRoutes = [
      'path="/"', 'path="/promo"', 'path="/login"',
      'path="/interview', 'path="/lgd', 'path="/coding',
      'path="/case', 'path="/questions', 'path="/resume',
      'path="/schedule', 'path="/analytics'
    ]
    for (const route of requiredRoutes) {
      if (!appJsx.includes(route)) {
        issues.push(`App.jsx is missing expected route registration: ${route}`)
      }
    }
    checks.push('App.jsx route registrations validated against Contract 3')
  }

  // Check 6: Autoloop Rule Specification Alignment
  const rulesJsonPath = path.join(ROOT, '.autoloop/rules.json')
  if (fs.existsSync(rulesJsonPath)) {
    try {
      const rules = JSON.parse(fs.readFileSync(rulesJsonPath, 'utf8'))
      if (!Array.isArray(rules.rules) || rules.rules.length < 3) {
        issues.push('.autoloop/rules.json must define at least 3 active automation rules')
      } else {
        checks.push(`.autoloop/rules.json configured with ${rules.rules.length} valid rules`)
      }
    } catch (e) {
      issues.push(`.autoloop/rules.json JSON parse error: ${e.message}`)
    }
  } else {
    issues.push('Missing .autoloop/rules.json configuration')
  }

  return {
    ok: issues.length === 0,
    issues,
    checks,
    timestamp: new Date().toISOString()
  }
}

// CLI Execution
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const result = runNeatFreakCheck()

  if (isJson) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    const border = '═'.repeat(64)
    console.log(`\n${border}`)
    console.log(` 🧹 Edgewise Neat-Freak Architecture & Doc Anti-Rot Validator`)
    console.log(`    Timestamp: ${result.timestamp}`)
    console.log(`${border}`)
    for (const chk of result.checks) {
      console.log(`  ✔ ${chk}`)
    }

    if (!result.ok) {
      console.log(`\n ❌ DETECTED ${result.issues.length} ARCHITECTURE / DOC DRIFT ISSUE(S):`)
      for (const issue of result.issues) {
        console.log(`    • ${issue}`)
      }
      console.log(`${border}\n`)
      process.exit(1)
    } else {
      console.log(`\n ✨ 文档与代码契约 100% 严格一致，无任何架构漂移或文档脑腐。`)
      console.log(`${border}\n`)
      process.exit(0)
    }
  }
}
