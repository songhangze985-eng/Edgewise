#!/usr/bin/env node

/**
 * Edgewise E2E Test Runner CLI
 * Executes requirement-driven opaque-box test suites across Tiers 1–4.
 *
 * Usage:
 *   node scripts/run-e2e-tests.mjs               # Run all tiers
 *   node scripts/run-e2e-tests.mjs --tier=1      # Run Tier 1 only
 *   node scripts/run-e2e-tests.mjs --tier=2      # Run Tier 2 only
 *   node scripts/run-e2e-tests.mjs --tier=3      # Run Tier 3 only
 *   node scripts/run-e2e-tests.mjs --tier=4      # Run Tier 4 only
 *   node scripts/run-e2e-tests.mjs --verbose     # Detailed per-test output
 *   node scripts/run-e2e-tests.mjs --json        # Machine-readable JSON output
 */

import { tier1Suite } from '../tests/e2e/tier1-features.test.mjs'
import { tier2Suite } from '../tests/e2e/tier2-boundaries.test.mjs'
import { tier3Suite } from '../tests/e2e/tier3-combinations.test.mjs'
import { tier4Suite } from '../tests/e2e/tier4-scenarios.test.mjs'

// Parse CLI flags
const args = process.argv.slice(2)
let selectedTier = 'all'
let isVerbose = false
let isJson = false

for (const arg of args) {
  if (arg.startsWith('--tier=')) {
    selectedTier = arg.split('=')[1]
  } else if (arg === '--verbose' || arg === '-v') {
    isVerbose = true
  } else if (arg === '--json') {
    isJson = true
  }
}

const allSuites = [
  { tier: '1', suite: tier1Suite },
  { tier: '2', suite: tier2Suite },
  { tier: '3', suite: tier3Suite },
  { tier: '4', suite: tier4Suite }
]

const targetSuites = selectedTier === 'all' 
  ? allSuites 
  : allSuites.filter(s => s.tier === selectedTier)

if (targetSuites.length === 0) {
  console.error(`Invalid tier '${selectedTier}'. Valid tiers: 1, 2, 3, 4, all`)
  process.exit(1)
}

if (!isJson) {
  console.log('\n=============================================================')
  console.log('       EDGEWISE E2E REQUIREMENT-DRIVEN TEST RUNNER           ')
  console.log('=============================================================')
  console.log(`Execution Target: Tier ${selectedTier}`)
  console.log(`Timestamp:        ${new Date().toISOString()}`)
  console.log('-------------------------------------------------------------\n')
}

const startTime = performance.now()
const suiteReports = []
let grandTotal = 0
let grandPassed = 0
let grandFailed = 0

for (const { tier, suite } of targetSuites) {
  if (!isJson) {
    console.log(`\n▶ Running ${suite.name}...`)
  }

  const report = await suite.run({ verbose: isVerbose })
  suiteReports.push(report)

  grandTotal += report.total
  grandPassed += report.passed
  grandFailed += report.failed

  if (!isJson) {
    if (isVerbose) {
      for (const res of report.results) {
        if (res.status === 'pass') {
          console.log(`  ✔ PASS: ${res.name} (${res.duration.toFixed(2)}ms)`)
        } else {
          console.error(`  ✖ FAIL: ${res.name} (${res.duration.toFixed(2)}ms)`)
          console.error(`    ${res.error?.message}`)
          if (res.error?.stack) {
            console.error(`    ${res.error.stack.split('\n').slice(1, 4).join('\n    ')}`)
          }
        }
      }
    }
    const statusIcon = report.failed === 0 ? '✔' : '✖'
    console.log(`  ${statusIcon} Tier ${tier} complete: ${report.passed}/${report.total} passed (${report.failed} failed)`)
  }
}

const totalDuration = performance.now() - startTime

if (isJson) {
  const jsonOutput = {
    timestamp: new Date().toISOString(),
    selectedTier,
    totalDurationMs: totalDuration,
    grandTotal,
    grandPassed,
    grandFailed,
    success: grandFailed === 0,
    suites: suiteReports
  }
  console.log(JSON.stringify(jsonOutput, null, 2))
} else {
  console.log('\n=============================================================')
  console.log('                    E2E TEST SUMMARY REPORT                  ')
  console.log('=============================================================')
  console.log('| Tier | Suite Name                       | Total | Pass | Fail |')
  console.log('|------|----------------------------------|-------|------|------|')
  for (const rep of suiteReports) {
    const tierPadded = `T${rep.tier}`.padEnd(4)
    const namePadded = rep.name.padEnd(32).slice(0, 32)
    const totPadded = String(rep.total).padStart(5)
    const passPadded = String(rep.passed).padStart(4)
    const failPadded = String(rep.failed).padStart(4)
    console.log(`| ${tierPadded} | ${namePadded} | ${totPadded} | ${passPadded} | ${failPadded} |`)
  }
  console.log('|------|----------------------------------|-------|------|------|')
  const totStr = String(grandTotal).padStart(5)
  const passStr = String(grandPassed).padStart(4)
  const failStr = String(grandFailed).padStart(4)
  console.log(`| TOTAL|                                  | ${totStr} | ${passStr} | ${failStr} |`)
  console.log('-------------------------------------------------------------')
  console.log(`Elapsed Time: ${totalDuration.toFixed(2)}ms`)
  console.log(`Status:       ${grandFailed === 0 ? 'ALL TESTS PASSED ✔' : 'FAILURES DETECTED ✖'}`)
  console.log('=============================================================\n')
}

if (grandFailed > 0) {
  process.exit(1)
} else {
  process.exit(0)
}
