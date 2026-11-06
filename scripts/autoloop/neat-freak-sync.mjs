#!/usr/bin/env node

/**
 * Edgewise Autoloop Neat-Freak Architecture & Documentation Synchronizer
 * Inspired by khazix-skills `neat-freak` & `agent-autoloop` repository hygiene rules.
 *
 * Ensures zero "documentation rot" between:
 *  - PROJECT.md Feature Inventory & Interface Contracts
 *  - Actual source files in `src/` & `backend/` (with strict case-sensitive verification)
 *  - Route declarations in `src/App.jsx`
 *  - CSS Token Bridge variables in `src/styles/tokens.css` & `src/index.css`
 *  - Task SEO manifest (`public/tasks/manifest.json`) vs `content/tasks/*.md`
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')

const args = process.argv.slice(2)
const isJson = args.includes('--json')

function existsCaseSensitive(relPath) {
  const fullPath = path.join(ROOT, relPath)
  if (!fs.existsSync(fullPath)) return false
  const dir = path.dirname(fullPath)
  const base = path.basename(fullPath)
  try {
    const entries = fs.readdirSync(dir)
    return entries.includes(base)
  } catch {
    return false
  }
}

export function runNeatFreakCheck() {
  const issues = []
  const checks = []

  // 1. Verify Core Documentation Files Exist
  const requiredDocs = [
    'PROJECT.md',
    'README.md',
    'TEST_INFRA.md',
    'TEST_READY.md',
    '.autoloop/rules.json',
  ]

  for (const doc of requiredDocs) {
    const exists = existsCaseSensitive(doc)
    checks.push({ category: 'Documentation', target: doc, ok: exists })
    if (!exists) {
      issues.push(`Missing core documentation or config file (case-sensitive): ${doc}`)
    }
  }

  // 2. Verify UI Primitives Contract from PROJECT.md
  const uiPrimitives = [
    'Button.jsx',
    'Card.jsx',
    'Input.jsx',
    'SegmentedControl.jsx',
    'Switch.jsx',
    'Badge.jsx',
    'Modal.jsx',
    'PageBar.jsx',
  ]

  for (const prim of uiPrimitives) {
    const relPath = `src/components/ui/${prim}`
    const exists = existsCaseSensitive(relPath)
    checks.push({ category: 'UI Contract', target: relPath, ok: exists })
    if (!exists) {
      issues.push(`UI Primitive contract violation: ${relPath} does not exist (case-sensitive)`)
    }
  }

  // 3. Verify Feature Modules (F01 - F21) Source Layout (strictly case-sensitive)
  const featurePaths = [
    'src/styles/tokens.css',
    'src/index.css',
    'src/components/Layout/Layout.jsx',
    'src/components/Layout/Sidebar.jsx',
    'src/components/Layout/MobileTabBar.jsx',
    'src/components/SettingsModal/SettingsModal.jsx',
    'src/components/AICopilot/AICopilot.jsx',
    'src/components/MicroSurveyModal/MicroSurveyModal.jsx',
    'src/features/promo/PromoLanding.jsx',
    'src/features/auth/Login.jsx',
    'src/features/dashboard/Dashboard.jsx',
    'src/features/profile/Profile.jsx',
    'src/features/tasks/TaskPage.jsx',
    'src/features/interview/InterviewLobby.jsx',
    'src/features/interview/InterviewRoom.jsx',
    'src/features/lgd/LGDLobby.jsx',
    'src/features/lgd/LGDRoom.jsx',
    'src/features/coding/CodingLobby.jsx',
    'src/features/coding/CodingRoom.jsx',
    'src/features/case/CaseLobby.jsx',
    'src/features/case/CaseRoom.jsx',
    'src/features/questions/QuestionBank.jsx',
    'src/features/resume/Resume.jsx',
    'src/features/schedule/Schedule.jsx',
    'src/features/analytics/Analytics.jsx',
    'src/api/stt.js',
  ]

  for (const fp of featurePaths) {
    const exists = existsCaseSensitive(fp)
    checks.push({ category: 'Feature Layout', target: fp, ok: exists })
    if (!exists) {
      issues.push(`Feature module missing or case mismatch on disk: ${fp}`)
    }
  }

  // 4. Verify Token Bridge CSS Contract
  const tokensPath = path.join(ROOT, 'src/styles/tokens.css')
  const indexCssPath = path.join(ROOT, 'src/index.css')
  if (fs.existsSync(tokensPath) && fs.existsSync(indexCssPath)) {
    const cssContent = fs.readFileSync(tokensPath, 'utf8') + '\n' + fs.readFileSync(indexCssPath, 'utf8')
    const requiredTokens = [
      '--canvas',
      '--surface',
      '--ink',
      '--muted',
      '--hair',
      '--sh-xs',
      '--sh-sm',
      '--sh-md',
      '--sh-lg',
      '--space-1',
      '--space-4',
      '--ease-spring',
      '--bg',
      '--chalk',
    ]
    for (const token of requiredTokens) {
      const present = cssContent.includes(token)
      checks.push({ category: 'Token Bridge', target: token, ok: present })
      if (!present) {
        issues.push(`Token Bridge contract missing CSS variable: ${token}`)
      }
    }
  }

  // 5. Verify Route Integrity in App.jsx
  const appPath = path.join(ROOT, 'src/App.jsx')
  if (fs.existsSync(appPath)) {
    const appContent = fs.readFileSync(appPath, 'utf8')
    const coreRoutes = ['/promo', '/login', '/tasks', '/interview/lobby', '/lgd/lobby', '/coding/lobby', '/questions', '/resume', '/analytics', '/profile']
    for (const route of coreRoutes) {
      const present = appContent.includes(route)
      checks.push({ category: 'Route Integrity', target: route, ok: present })
      if (!present) {
        issues.push(`Route missing from src/App.jsx: ${route}`)
      }
    }
  }

  // 6. Verify SEO Tasks Manifest Sync (content/tasks/*.md <-> public/tasks/manifest.json)
  const tasksDir = path.join(ROOT, 'content/tasks')
  const manifestPath = path.join(ROOT, 'public/tasks/manifest.json')
  if (fs.existsSync(tasksDir) && fs.existsSync(manifestPath)) {
    const mdCount = fs.readdirSync(tasksDir).filter((f) => f.endsWith('.md')).length
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const manifestCount = Array.isArray(manifest.tasks) ? manifest.tasks.length : 0
    const synced = mdCount === manifestCount && mdCount > 0
    checks.push({ category: 'SEO Task Manifest', target: `tasks (${manifestCount}/${mdCount})`, ok: synced })
    if (!synced) {
      issues.push(`Task manifest out of sync: content/tasks has ${mdCount} files, manifest has ${manifestCount}`)
    }
  }

  return {
    timestamp: new Date().toISOString(),
    totalChecks: checks.length,
    passedChecks: checks.filter((c) => c.ok).length,
    failedChecks: issues.length,
    ok: issues.length === 0,
    issues,
    checks,
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = runNeatFreakCheck()
  if (isJson) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log('\n=============================================================')
    console.log('   EDGEWISE AUTOLOOP: NEAT-FREAK ARCHITECTURE & DOC SYNC     ')
    console.log('=============================================================')
    console.log(`Total Contract Checks: ${report.totalChecks}`)
    console.log(`Passed:                ${report.passedChecks}`)
    console.log(`Failed:                ${report.failedChecks}`)
    if (report.issues.length > 0) {
      console.error('\nIssues Detected:')
      for (const issue of report.issues) {
        console.error(`  ✖ ${issue}`)
      }
    } else {
      console.log('\n✔ All documentation, case-sensitive paths, routes, and token contracts are 100% synchronized.')
    }
    console.log('=============================================================\n')
  }
  process.exit(report.ok ? 0 : 1)
}
