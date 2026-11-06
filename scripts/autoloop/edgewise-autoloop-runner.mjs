#!/usr/bin/env node

/**
 * Edgewise Agent-Autoloop Unified Orchestrator CLI
 * Bridges local Edgewise engineering/research pipelines with `agent-autoloop` daemon.
 *
 * Usage:
 *   node scripts/autoloop/edgewise-autoloop-runner.mjs --check   # Verify rules & environment
 *   node scripts/autoloop/edgewise-autoloop-runner.mjs --all     # Run all 9 autoloop pipelines
 *   node scripts/autoloop/edgewise-autoloop-runner.mjs --json    # Output combined JSON report
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runNeatFreakCheck } from './neat-freak-sync.mjs'
import { runQaWatchdog } from './qa-watchdog.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')

const args = process.argv.slice(2)
const isCheckOnly = args.includes('--check')
const isJson = args.includes('--json')
const isDryRun = args.includes('--dry-run')

function runPythonScript(scriptRelPath, extraArgs = []) {
  return new Promise((resolve) => {
    const proc = spawn('python3', [path.join(ROOT, scriptRelPath), ...extraArgs], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => {
      stdout += d.toString()
    })
    proc.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    proc.on('close', (code) => {
      let parsed = null
      try {
        parsed = JSON.parse(stdout)
      } catch {
        parsed = { raw: stdout.trim(), stderr: stderr.trim() }
      }
      resolve({ ok: code === 0, code: code ?? 1, data: parsed })
    })
  })
}

export async function checkAutoloopEnvironment() {
  const rulesPath = path.join(ROOT, '.autoloop/rules.json')
  const checks = []

  // 1. Validate rules.json
  if (fs.existsSync(rulesPath)) {
    try {
      const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'))
      checks.push({
        item: '.autoloop/rules.json',
        status: 'PASS',
        detail: `${rules.rules?.length || 0} automation rules loaded (${rules.name})`,
      })
    } catch (err) {
      checks.push({ item: '.autoloop/rules.json', status: 'FAIL', detail: err.message })
    }
  } else {
    checks.push({ item: '.autoloop/rules.json', status: 'FAIL', detail: 'File not found' })
  }

  // 2. Validate all 9 runner scripts exist
  const scripts = [
    'scripts/autoloop/qa-watchdog.mjs',
    'scripts/autoloop/neat-freak-sync.mjs',
    'scripts/autoloop/empirical-monitor.py',
    'scripts/autoloop/ugc-reviewer.py',
    'scripts/autoloop/daily-derive-scheduler.py',
    'scripts/autoloop/blind-review-dispatcher.py',
    'scripts/autoloop/paper-sync-verifier.py',
    'scripts/autoloop/dataset-etl-watcher.py',
    'scripts/autoloop/scripted-answer-auditor.py',
  ]
  for (const s of scripts) {
    const exists = fs.existsSync(path.join(ROOT, s))
    checks.push({
      item: s,
      status: exists ? 'PASS' : 'FAIL',
      detail: exists ? 'Executable script ready' : 'Missing script',
    })
  }

  const allPass = checks.every((c) => c.status === 'PASS')
  return { ok: allPass, checks }
}

export async function runAllPipelines(options = {}) {
  const dryRun = options.dryRun ?? isDryRun

  const neatFreak = runNeatFreakCheck()
  const qa = await runQaWatchdog({ dryRun })
  const [empirical, ugc, dailyDerive, blindReview, paperSync, datasetEtl, scriptedAudit] = await Promise.all([
    runPythonScript('scripts/autoloop/empirical-monitor.py', ['--json']),
    runPythonScript('scripts/autoloop/ugc-reviewer.py', ['--json']),
    runPythonScript('scripts/autoloop/daily-derive-scheduler.py', ['--json']),
    runPythonScript('scripts/autoloop/blind-review-dispatcher.py', ['--json']),
    runPythonScript('scripts/autoloop/paper-sync-verifier.py', ['--json']),
    runPythonScript('scripts/autoloop/dataset-etl-watcher.py', ['--json']),
    runPythonScript('scripts/autoloop/scripted-answer-auditor.py', ['--json']),
  ])

  const overallOk =
    neatFreak.ok
    && qa.ok
    && empirical.ok
    && ugc.ok
    && dailyDerive.ok
    && blindReview.ok
    && paperSync.ok
    && datasetEtl.ok
    && scriptedAudit.ok

  return {
    timestamp: new Date().toISOString(),
    overallOk,
    pipelines: {
      neat_freak_sync: { ok: neatFreak.ok, passed: neatFreak.passedChecks, total: neatFreak.totalChecks },
      qa_watchdog: { ok: qa.ok, card: qa.card },
      empirical_monitor: { ok: empirical.ok, report: empirical.data },
      ugc_reviewer: { ok: ugc.ok, report: ugc.data },
      daily_derive: { ok: dailyDerive.ok, report: dailyDerive.data },
      blind_review_dispatcher: { ok: blindReview.ok, report: blindReview.data },
      paper_sync_verifier: { ok: paperSync.ok, report: paperSync.data },
      dataset_etl_watcher: { ok: datasetEtl.ok, report: datasetEtl.data },
      scripted_answer_auditor: { ok: scriptedAudit.ok, report: scriptedAudit.data },
    },
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (isCheckOnly) {
    const envReport = await checkAutoloopEnvironment()
    if (isJson) {
      console.log(JSON.stringify(envReport, null, 2))
    } else {
      console.log('\n=== EDGEWISE AGENT-AUTOLOOP ENVIRONMENT CHECK (9 PIPELINES) ===')
      for (const c of envReport.checks) {
        console.log(`  ${c.status === 'PASS' ? '✔' : '✖'} ${c.item.padEnd(46)} ${c.detail}`)
      }
      console.log('')
    }
    process.exit(envReport.ok ? 0 : 1)
  }

  const summary = await runAllPipelines()
  if (isJson) {
    console.log(JSON.stringify(summary, null, 2))
  } else {
    console.log('\n====================================================================')
    console.log('     EDGEWISE × AGENT-AUTOLOOP UNIFIED CONTROL CENTER (9 RULES)     ')
    console.log('====================================================================')
    console.log(`  1. [Neat-Freak Sync]       ${summary.pipelines.neat_freak_sync.ok ? '✔ PASS' : '✖ FAIL'} (${summary.pipelines.neat_freak_sync.passed}/${summary.pipelines.neat_freak_sync.total} contracts)`)
    console.log(`  2. [QA Watchdog]           ${summary.pipelines.qa_watchdog.ok ? '✔ PASS' : '✖ FAIL'} — ${summary.pipelines.qa_watchdog.card.summary.e2e_tests.summary}`)
    console.log(`  3. [Empirical Monitor]     ${summary.pipelines.empirical_monitor.ok ? '✔ PASS' : '✖ ALERT'} — Status: ${summary.pipelines.empirical_monitor.report?.diagnostics?.status}`)
    console.log(`  4. [UGC Audit Pipeline]    ${summary.pipelines.ugc_reviewer.ok ? '✔ PASS' : '✖ FAIL'} — STAR Score: ${summary.pipelines.ugc_reviewer.report?.star_evaluation?.star_score}/100`)
    console.log(`  5. [Daily Derive Cron]     ${summary.pipelines.daily_derive.ok ? '✔ PASS' : '✖ FAIL'} — Users: ${summary.pipelines.daily_derive.report?.processed_users}`)
    console.log(`  6. [P2 Blind Dispatcher]   ${summary.pipelines.blind_review_dispatcher.ok ? '✔ PASS' : '✖ FAIL'} — Pairs Ready: ${summary.pipelines.blind_review_dispatcher.report?.valid_pairs}`)
    console.log(`  7. [Paper Sync Verifier]   ${summary.pipelines.paper_sync_verifier.ok ? '✔ PASS' : '✖ FAIL'} — Tables: ${summary.pipelines.paper_sync_verifier.report?.tables_verified}/9`)
    console.log(`  8. [Dataset ETL Watcher]   ${summary.pipelines.dataset_etl_watcher.ok ? '✔ PASS' : '✖ FAIL'} — Questions: ${summary.pipelines.dataset_etl_watcher.report?.total_external_seed_questions}`)
    console.log(`  9. [Anti-Scripted Auditor] ${summary.pipelines.scripted_answer_auditor.ok ? '✔ PASS' : '✖ FAIL'} — Status: ${summary.pipelines.scripted_answer_auditor.report?.status}`)
    console.log('--------------------------------------------------------------------')
    console.log(`  Overall System State:      ${summary.overallOk ? '🟢 AUTONOMOUS & HEALTHY (0-Token Idle Ready)' : '🟠 ATTENTION REQUIRED (HITL Card Emitted)'}`)
    console.log('====================================================================\n')
  }
  process.exit(summary.overallOk ? 0 : 1)
}
