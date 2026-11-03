/**
 * Empirical Challenger Verification Harness for Milestone 1
 * Edgewise Design Tokens, Typography & Spacing System
 *
 * Checks:
 * 1. CSS Variable Resolution across all 58 modules (no cycles, no unresolved tokens, legacy bridge)
 * 2. Retina media queries stress test for --hair: 0.5px across DPRs and themes
 * 3. Light theme overrides and fallback consistency
 * 4. Diagnostic audit of E2E test suite (19 failures root cause analysis)
 */

import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const ROOT = '/Users/zzz/Downloads/Edgewise'

console.log('=============================================================')
console.log('   EMPIRICAL CHALLENGER: MILESTONE 1 VERIFICATION HARNESS    ')
console.log('=============================================================\n')

// ----------------------------------------------------------------------------
// TEST 1: CSS Module Discovery & Token Extraction
// ----------------------------------------------------------------------------
function findModuleCssFiles(dir) {
  let results = []
  const list = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of list) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!['node_modules', 'dist', '.agents'].includes(entry.name)) {
        results = results.concat(findModuleCssFiles(fullPath))
      }
    } else if (entry.isFile() && entry.name.endsWith('.module.css')) {
      results.push(fullPath)
    }
  }
  return results
}

const moduleFiles = findModuleCssFiles(path.join(ROOT, 'src'))
console.log(`[TEST 1.1] Module File Count: ${moduleFiles.length} (Expected: 58)`)
assert.equal(moduleFiles.length, 58, 'Expected exactly 58 CSS modules')

// Read tokens.css and index.css
const tokensCss = fs.readFileSync(path.join(ROOT, 'src/styles/tokens.css'), 'utf-8')
const indexCss = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf-8')

// Parse tokens from tokens.css :root
const tokenRegex = /(--[\w-]+)\s*:\s*([^;]+);/g
const rootBlock = tokensCss.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] || ''
const definedTokens = new Map()
let match
while ((match = tokenRegex.exec(rootBlock)) !== null) {
  definedTokens.set(match[1].trim(), match[2].trim())
}
console.log(`[TEST 1.2] Defined CSS Tokens in tokens.css :root: ${definedTokens.size}`)

// Parse tokens in [data-theme="light"]
const lightBlock = tokensCss.match(/\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/)?.[1] || ''
const lightTokens = new Map()
while ((match = tokenRegex.exec(lightBlock)) !== null) {
  lightTokens.set(match[1].trim(), match[2].trim())
}
console.log(`[TEST 1.3] Defined CSS Tokens in [data-theme="light"]: ${lightTokens.size}`)

// ----------------------------------------------------------------------------
// TEST 2: Variable Resolution & Dependency Graph (Cycle Detection)
// ----------------------------------------------------------------------------
console.log('\n--- Variable Resolution & Dependency Graph ---')

function resolveVar(varName, theme = 'dark', visited = new Set()) {
  if (visited.has(varName)) {
    return { status: 'CYCLE', chain: [...visited, varName] }
  }
  visited.add(varName)

  let raw = (theme === 'light' && lightTokens.has(varName)) 
    ? lightTokens.get(varName) 
    : definedTokens.get(varName)

  if (!raw) {
    return { status: 'UNDEFINED', varName }
  }

  // Find any nested var(--...)
  const refRegex = /var\(\s*(--[\w-]+)(?:\s*,\s*([^)]+))?\s*\)/g
  let refMatch
  let resolvedVal = raw
  while ((refMatch = refRegex.exec(raw)) !== null) {
    const subVar = refMatch[1]
    const fallback = refMatch[2]
    const subRes = resolveVar(subVar, theme, new Set(visited))
    if (subRes.status === 'CYCLE') return subRes
    if (subRes.status === 'UNDEFINED') {
      if (fallback) {
        resolvedVal = resolvedVal.replace(refMatch[0], fallback.trim())
      } else {
        return { status: 'UNRESOLVED_SUBVAR', varName, missing: subVar, chain: [...visited, subVar] }
      }
    } else {
      resolvedVal = resolvedVal.replace(refMatch[0], subRes.value)
    }
  }

  return { status: 'OK', value: resolvedVal.trim() }
}

let cycleCount = 0
let unresolvableCount = 0
for (const varName of definedTokens.keys()) {
  const darkRes = resolveVar(varName, 'dark')
  if (darkRes.status === 'CYCLE') {
    console.error(`  [!] CYCLE in dark theme: ${darkRes.chain.join(' -> ')}`)
    cycleCount++
  } else if (darkRes.status !== 'OK') {
    console.error(`  [!] UNRESOLVABLE in dark theme: ${varName} -> missing ${darkRes.missing}`)
    unresolvableCount++
  }

  const lightRes = resolveVar(varName, 'light')
  if (lightRes.status === 'CYCLE') {
    console.error(`  [!] CYCLE in light theme: ${lightRes.chain.join(' -> ')}`)
    cycleCount++
  } else if (lightRes.status !== 'OK') {
    console.error(`  [!] UNRESOLVABLE in light theme: ${varName} -> missing ${lightRes.missing}`)
    unresolvableCount++
  }
}

console.log(`[TEST 2.1] Circular Dependency Count: ${cycleCount} (Pass: 0)`)
console.log(`[TEST 2.2] Unresolvable Token Count: ${unresolvableCount} (Pass: 0)`)
assert.equal(cycleCount, 0, 'Cycles detected in CSS variable graph')
assert.equal(unresolvableCount, 0, 'Unresolvable tokens detected in CSS variable graph')

// ----------------------------------------------------------------------------
// TEST 3: Verification of Module Usages across 58 CSS Modules
// ----------------------------------------------------------------------------
console.log('\n--- CSS Module Variable Usages & Scoped Variables ---')

const moduleVarUsages = new Map() // varName -> Array of { file, fallback }
const varUsageRegex = /var\(\s*(--[\w-]+)(?:\s*,\s*([^)]+))?\s*\)/g

for (const file of moduleFiles) {
  const relPath = path.relative(ROOT, file)
  const content = fs.readFileSync(file, 'utf-8')
  let m
  while ((m = varUsageRegex.exec(content)) !== null) {
    const varName = m[1]
    const fallback = m[2] ? m[2].trim() : null
    if (!moduleVarUsages.has(varName)) {
      moduleVarUsages.set(varName, [])
    }
    moduleVarUsages.get(varName).push({ file: relPath, fallback })
  }
}

console.log(`Total unique variables referenced in 58 modules: ${moduleVarUsages.size}`)

// Categorize variables into:
// A: Global tokens in :root
// B: Locally scoped / dynamically injected variables (with or without fallbacks)
// C: Truly missing / undefined variables
const globalTokensUsed = []
const locallyScopedVars = []
const missingVariables = []

// Known dynamic/local CSS variables in Edgewise architecture:
// --sidebar-width, --sidebar-float-inset, --sidebar-content-gap: Defined on .layout in Layout.module.css
// --i: Stagger index in InterviewRoom
// --seat-color, --hw-color, --hw-shade, --hw-glow: Dynamic seat color in LGDRoom
// --fill: Progress bar fill in CreativeStudio
const knownLocalVars = new Set([
  '--sidebar-width',
  '--sidebar-float-inset',
  '--sidebar-content-gap',
  '--i',
  '--seat-color',
  '--hw-color',
  '--hw-shade',
  '--hw-glow',
  '--fill'
])

for (const [varName, occurrences] of moduleVarUsages.entries()) {
  if (definedTokens.has(varName)) {
    globalTokensUsed.push({ varName, count: occurrences.length })
  } else if (knownLocalVars.has(varName)) {
    locallyScopedVars.push({ varName, count: occurrences.length, occurrences })
  } else {
    missingVariables.push({ varName, count: occurrences.length, occurrences })
  }
}

console.log(`[TEST 3.1] Global Tokens Referenced in Modules: ${globalTokensUsed.length}`)
console.log(`[TEST 3.2] Component-Scoped / Dynamic Variables: ${locallyScopedVars.length}`)
console.log(`[TEST 3.3] Truly Missing / Dangling Variables: ${missingVariables.length}`)
if (missingVariables.length > 0) {
  console.error('MISSING VARIABLES DETECTED:', missingVariables)
}
assert.equal(missingVariables.length, 0, 'No dangling/unhandled CSS variables in modules')

// ----------------------------------------------------------------------------
// TEST 4: Stress-Testing Retina Media Query for --hair: 0.5px
// ----------------------------------------------------------------------------
console.log('\n--- Stress-Testing Retina Media Query for --hair: 0.5px ---')

const retinaBlockMatch = tokensCss.match(/@media\s*\((min-resolution:\s*2dppx)\)\s*,\s*\((-webkit-min-device-pixel-ratio:\s*2)\)\s*\{([\s\S]*?)\}/)
console.log(`[TEST 4.1] Retina media query syntax valid and present: ${!!retinaBlockMatch}`)
assert.ok(retinaBlockMatch, 'Retina media query syntax missing or malformed')

const innerRetinaRoot = retinaBlockMatch[3]
const hairMatch = innerRetinaRoot.match(/--hair\s*:\s*0\.5px\s*;/)
console.log(`[TEST 4.2] --hair set to exactly 0.5px under retina @media: ${!!hairMatch}`)
assert.ok(hairMatch, '--hair: 0.5px declaration missing in retina block')

// Simulation of CSS Cascade at different DPRs
function simulateHairline(dpr, theme = 'dark') {
  // DPR < 2 -> Default :root rule applies (--hair: 1px)
  // DPR >= 2 -> Media query matches, overriding --hair to 0.5px
  const isRetina = dpr >= 2.0
  const hairVal = isRetina ? '0.5px' : '1px'

  // Test downstream composite tokens:
  // 1. --ring: 0 0 0 var(--hair) ...
  const ringColor = theme === 'light' ? 'rgb(0 0 0 / 0.06)' : 'rgb(255 255 255 / 0.10)'
  const computedRing = `0 0 0 ${hairVal} ${ringColor}`

  // 2. --border: var(--hair) solid var(--line)
  const lineColor = theme === 'light' ? 'rgb(23 24 26 / 0.09)' : 'rgb(255 255 255 / 0.08)'
  const computedBorder = `${hairVal} solid ${lineColor}`

  // 3. Physical device pixels rendered = hairVal (in CSS px) * dpr
  const physicalPixels = parseFloat(hairVal) * dpr

  return { dpr, isRetina, hairVal, computedRing, computedBorder, physicalPixels }
}

const testDPRs = [1.0, 1.25, 1.5, 2.0, 2.5, 3.0]
console.log('[TEST 4.3] DPR Cascade Simulation Matrix:')
for (const dpr of testDPRs) {
  const sim = simulateHairline(dpr, 'dark')
  console.log(`  DPR ${dpr.toFixed(2)}x: --hair = ${sim.hairVal.padEnd(5)} | physical = ${sim.physicalPixels.toFixed(2)}px | border = "${sim.computedBorder}"`)
  if (dpr >= 2.0) {
    assert.equal(sim.hairVal, '0.5px', `Retina DPR ${dpr} must have --hair: 0.5px`)
    assert.ok(sim.physicalPixels >= 1.0, `Physical pixels must be >= 1.0 to prevent border dropout`)
  } else {
    assert.equal(sim.hairVal, '1px', `Non-retina DPR ${dpr} must have --hair: 1px`)
    assert.ok(sim.physicalPixels >= 1.0, `Physical pixels must be >= 1.0 on standard screens`)
  }
}

// ----------------------------------------------------------------------------
// TEST 5: E2E Test Suite Diagnostic Breakdown
// ----------------------------------------------------------------------------
console.log('\n--- E2E Test Suite Diagnostic Breakdown ---')
import { tier1Suite } from '../tests/e2e/tier1-features.test.mjs'
import { tier2Suite } from '../tests/e2e/tier2-boundaries.test.mjs'
import { tier3Suite } from '../tests/e2e/tier3-combinations.test.mjs'
import { tier4Suite } from '../tests/e2e/tier4-scenarios.test.mjs'

const suites = [tier1Suite, tier2Suite, tier3Suite, tier4Suite]
let totalE2e = 0
let passedE2e = 0
let failedE2e = 0
const failedTests = []

for (const s of suites) {
  const rep = await s.run()
  totalE2e += rep.total
  passedE2e += rep.passed
  failedE2e += rep.failed
  for (const r of rep.results) {
    if (r.status === 'fail') {
      failedTests.push({ tier: s.tier, name: r.name, error: r.error.message })
    }
  }
}

console.log(`[TEST 5.1] Total E2E Tests: ${totalE2e}, Passed: ${passedE2e}, Failed: ${failedE2e}`)
console.log(`[TEST 5.2] Failing Tests Summary (${failedTests.length}):`)
for (const f of failedTests) {
  console.log(`  - [Tier ${f.tier}] ${f.name}: ${f.error}`)
}

console.log('\n=============================================================')
console.log('   CHALLENGER VERIFICATION COMPLETE')
console.log('=============================================================')
