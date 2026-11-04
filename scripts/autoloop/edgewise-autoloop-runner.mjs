#!/usr/bin/env node

/**
 * Edgewise Autoloop Unified Orchestrator CLI
 *
 * Dispatches automated jobs defined in .autoloop/rules.json:
 *   - qa: E2E Regression & Self-Healing Watchdog
 *   - sync: Neat-Freak Architecture & Doc Anti-Rot Validator
 *   - empirical: Academic 2x2 Factorial Data Quality Monitor
 *   - ugc: UGC Content Moderation & STAR Structural Review
 *
 * Usage:
 *   node scripts/autoloop/edgewise-autoloop-runner.mjs --all
 *   node scripts/autoloop/edgewise-autoloop-runner.mjs --check
 *   node scripts/autoloop/edgewise-autoloop-runner.mjs --job=qa
 *   node scripts/autoloop/edgewise-autoloop-runner.mjs --job=sync
 *   node scripts/autoloop/edgewise-autoloop-runner.mjs --job=empirical
 *   node scripts/autoloop/edgewise-autoloop-runner.mjs --job=ugc
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')

const args = process.argv.slice(2)
const isJson = args.includes('--json')
const isCheck = args.includes('--check')
const isAll = args.includes('--all') || (!args.some(a => a.startsWith('--job=')) && !isCheck)

let targetJob = null
for (const a of args) {
  if (a.startsWith('--job=')) {
    targetJob = a.split('=')[1]
  }
}

function runSubprocess(cmd, cmdArgs, env = {}) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, cmdArgs, {
      cwd: ROOT,
      env: { ...process.env, ...env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', d => { stdout += d.toString() })
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('close', code => resolve({ code: code ?? 0, stdout, stderr }))
    proc.on('error', err => resolve({ code: 1, stdout, stderr: err.message }))
  })
}

function getPythonCmd() {
  const venvPython = path.join(ROOT, 'backend/.venv/bin/python')
  if (fs.existsSync(venvPython)) return venvPython
  return 'python3'
}

export async function checkAutoloopEnvironment() {
  const rulesPath = path.join(ROOT, '.autoloop/rules.json')
  const checks = []
  let ok = true

  if (fs.existsSync(rulesPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(rulesPath, 'utf8'))
      checks.push({ name: 'Rules Configuration', status: 'PASS', details: `${data.rules.length} rules loaded` })
    } catch (e) {
      checks.push({ name: 'Rules Configuration', status: 'FAIL', details: e.message })
      ok = false
    }
  } else {
    checks.push({ name: 'Rules Configuration', status: 'FAIL', details: 'Missing .autoloop/rules.json' })
    ok = false
  }

  const scripts = [
    'scripts/autoloop/qa-watchdog.mjs',
    'scripts/autoloop/neat-freak-sync.mjs',
    'scripts/autoloop/empirical-monitor.py',
    'scripts/autoloop/ugc-reviewer.py'
  ]
  for (const s of scripts) {
    const exists = fs.existsSync(path.join(ROOT, s))
    checks.push({ name: `Script: ${s}`, status: exists ? 'PASS' : 'FAIL' })
    if (!exists) ok = false
  }

  return { ok, checks }
}

async function runJob(jobId) {
  const pythonCmd = getPythonCmd()
  switch (jobId) {
    case 'qa':
      return await runSubprocess('node', ['scripts/autoloop/qa-watchdog.mjs'])
    case 'sync':
      return await runSubprocess('node', ['scripts/autoloop/neat-freak-sync.mjs'])
    case 'empirical':
      return await runSubprocess(pythonCmd, ['scripts/autoloop/empirical-monitor.py'], { PYTHONPATH: 'backend' })
    case 'ugc':
      return await runSubprocess(pythonCmd, ['scripts/autoloop/ugc-reviewer.py'], { PYTHONPATH: 'backend' })
    default:
      return { code: 1, stdout: '', stderr: `Unknown job: ${jobId}` }
  }
}

async function main() {
  if (isCheck) {
    const envCheck = await checkAutoloopEnvironment()
    if (isJson) {
      console.log(JSON.stringify(envCheck, null, 2))
    } else {
      console.log('\n=============================================================')
      console.log('       EDGEWISE AGENT-AUTOLOOP ENVIRONMENT CHECK             ')
      console.log('=============================================================')
      for (const c of envCheck.checks) {
        const icon = c.status === 'PASS' ? '✔' : '✖'
        console.log(`  ${icon} ${c.name} [${c.status}] ${c.details ? `(${c.details})` : ''}`)
      }
      console.log(`\nStatus: ${envCheck.ok ? 'ALL CHECKS PASSED ✔' : 'FAILED CHECKS ✖'}`)
      console.log('=============================================================\n')
    }
    process.exit(envCheck.ok ? 0 : 1)
  }

  const jobsToRun = targetJob ? [targetJob] : ['sync', 'qa', 'empirical', 'ugc']
  const results = []
  let allPass = true

  console.log('\n=============================================================')
  console.log('       EDGEWISE AGENT-AUTOLOOP ORCHESTRATION PIPELINE        ')
  console.log('=============================================================')
  console.log(`Target Jobs: ${jobsToRun.join(', ')}`)
  console.log(`Timestamp:   ${new Date().toISOString()}`)
  console.log('-------------------------------------------------------------\n')

  for (const job of jobsToRun) {
    console.log(`▶ Executing Autoloop Job: [${job}]...`)
    const res = await runJob(job)
    const passed = res.code === 0
    if (!passed) allPass = false

    results.push({ job, code: res.code, passed })
    const icon = passed ? '✔' : '✖'
    console.log(`  ${icon} [${job}] completed with exit code ${res.code}`)
    if (!passed && res.stderr) {
      console.error(`    Error: ${res.stderr.trim().split('\n')[0]}`)
    }
  }

  console.log('\n=============================================================')
  console.log('                 AUTOLOOP EXECUTION SUMMARY                  ')
  console.log('=============================================================')
  console.log('| Job Name       | Result | Details                          |')
  console.log('|----------------|--------|----------------------------------|')
  for (const r of results) {
    const statusText = r.passed ? 'PASS ✔ ' : 'FAIL ✖ '
    console.log(`| ${r.job.padEnd(14)} | ${statusText} | Exit code: ${r.code.toString().padEnd(20)} |`)
  }
  console.log('-------------------------------------------------------------')
  console.log(`Overall Result:  ${allPass ? 'ALL AUTOLOOP JOBS PASSED ✔' : 'FAILURES DETECTED ✖'}`)
  console.log('Zero-token standby mode activated.\n=============================================================\n')

  process.exit(allPass ? 0 : 1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  await main()
}
