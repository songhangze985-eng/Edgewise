#!/usr/bin/env node

/**
 * Edgewise Autoloop QA Watchdog & Self-Healing Orchestrator
 * Powered by Agent-Autoloop patterns (KKKKhazix/agent-autoloop)
 *
 * Responsibilities:
 * 1. Runs Frontend Unit Tests (5 suites), Backend Python Unit Tests (8 suites), & E2E Test Suite (172 tests across Tiers 1-4).
 * 2. Synthesizes structured diagnostics on failure.
 * 3. Emits a Feishu / Desktop HITL (Human-In-The-Loop) approval card payload
 *    with one-click action triggers (`Approve Fix`, `Retry`, `Ignore`).
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')

const args = process.argv.slice(2)
const isJson = args.includes('--json')
const isDryRun = args.includes('--dry-run')

function runCommand(cmd, cmdArgs, cwd = ROOT, envOverrides = {}) {
  return new Promise((resolve) => {
    const start = performance.now()
    const proc = spawn(cmd, cmdArgs, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', ...envOverrides },
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
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
        durationMs: Math.round(performance.now() - start),
      })
    })
  })
}

/**
 * Build a Feishu Interactive Card / Autoloop HITL Card payload.
 */
export function buildHitlCard({ status, unitResult, backendResult, e2eResult, durationMs, failureContext }) {
  const isPass = status === 'PASS'
  const card = {
    card_type: 'autoloop_hitl_card',
    version: '2.0',
    header: {
      title: isPass
        ? '✅ [Edgewise QA Watchdog] 全栈单元与 E2E 回归测试通过'
        : '🚨 [Edgewise QA Watchdog] 检测到测试回归异常 — 待人工拍板',
      theme: isPass ? 'green' : 'orange',
      timestamp: new Date().toISOString(),
    },
    meta: {
      project: 'Edgewise (谈锋)',
      pipeline: 'edgewise-qa-watchdog',
      duration_ms: durationMs,
      overall_status: status,
    },
    summary: {
      unit_tests: {
        status: unitResult.code === 0 ? 'PASS' : 'FAIL',
        duration_ms: unitResult.durationMs,
      },
      backend_tests: backendResult
        ? {
            status: backendResult.code === 0 ? 'PASS' : 'FAIL',
            duration_ms: backendResult.durationMs,
          }
        : undefined,
      e2e_tests: {
        status: e2eResult.code === 0 ? 'PASS' : 'FAIL',
        duration_ms: e2eResult.durationMs,
        summary: e2eResult.summary || 'Tiers 1-4 (172 tests)',
      },
    },
    diagnostic_context: isPass
      ? null
      : {
          failed_stage:
            unitResult.code !== 0
              ? 'unit_tests'
              : backendResult && backendResult.code !== 0
                ? 'backend_tests'
                : 'e2e_tests',
          error_excerpt: failureContext,
          suggested_agent: 'claude-code',
          patch_status: 'PENDING_HUMAN_SIGN_OFF',
          actions: [
            {
              id: 'approve_auto_heal',
              label: '批准 Agent 自动修复 (Approve Fix)',
              style: 'primary',
              command: 'agent-autoloop trigger edgewise-qa-watchdog --heal',
            },
            {
              id: 'rerun_qa',
              label: '重新运行测试 (Retry)',
              style: 'default',
              command: 'npm run autoloop:qa',
            },
            {
              id: 'ignore_alert',
              label: '忽略本次告警 (Ignore)',
              style: 'danger',
              command: 'agent-autoloop dismiss edgewise-qa-watchdog',
            },
          ],
        },
  }

  return card
}

export async function runQaWatchdog(options = {}) {
  const startTotal = performance.now()
  const dryRun = options.dryRun ?? isDryRun

  if (dryRun) {
    const mockUnit = { code: 0, durationMs: 120, stdout: 'Unit tests mocked OK', stderr: '' }
    const mockBackend = { code: 0, durationMs: 95, stdout: 'Backend tests mocked OK', stderr: '' }
    const mockE2e = { code: 0, durationMs: 85, summary: '172/172 passed (Dry Run)' }
    const card = buildHitlCard({
      status: 'PASS',
      unitResult: mockUnit,
      backendResult: mockBackend,
      e2eResult: mockE2e,
      durationMs: 300,
      failureContext: null,
    })
    return { ok: true, card }
  }

  // 1. Run Frontend Unit Tests (all suites excluding autoloop self-recursion)
  const unitFiles = [
    'tests/boost-requirements.test.mjs',
    'tests/tokens-remediation.test.mjs',
    'tests/ui-primitives.test.mjs',
    'tests/sanitize-html.test.mjs',
  ]
  const unitRes = await runCommand('node', ['--test', ...unitFiles])

  // 2. Run Backend Python Unit Tests
  const venvPy = path.join(ROOT, 'backend/.venv/bin/python')
  const pyBin = fs.existsSync(venvPy) ? venvPy : 'python3'
  const backendRes = await runCommand(
    pyBin,
    ['-m', 'unittest', 'discover', '-s', 'backend/tests'],
    ROOT,
    { PYTHONPATH: path.join(ROOT, 'backend') },
  )

  // 3. Run E2E Tests (JSON mode)
  const e2eRes = await runCommand('node', ['scripts/run-e2e-tests.mjs', '--json'])
  let e2eParsed = null
  try {
    e2eParsed = JSON.parse(e2eRes.stdout)
  } catch {
    e2eParsed = null
  }

  const e2eSummary = e2eParsed
    ? `${e2eParsed.grandPassed}/${e2eParsed.grandTotal} passed (${e2eParsed.grandFailed} failed)`
    : 'E2E Runner Completed'

  const overallOk = unitRes.code === 0 && backendRes.code === 0 && e2eRes.code === 0
  const totalDuration = Math.round(performance.now() - startTotal)

  let failureContext = null
  if (!overallOk) {
    const rawErr =
      unitRes.code !== 0
        ? unitRes.stderr || unitRes.stdout
        : backendRes.code !== 0
          ? backendRes.stderr || backendRes.stdout
          : e2eRes.stderr || e2eRes.stdout
    failureContext = rawErr.split('\n').slice(-20).join('\n')
  }

  const card = buildHitlCard({
    status: overallOk ? 'PASS' : 'FAIL',
    unitResult: unitRes,
    backendResult: backendRes,
    e2eResult: { ...e2eRes, summary: e2eSummary },
    durationMs: totalDuration,
    failureContext,
  })

  return { ok: overallOk, card }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { ok, card } = await runQaWatchdog()
  if (isJson) {
    console.log(JSON.stringify(card, null, 2))
  } else {
    console.log('\n=============================================================')
    console.log('     EDGEWISE AUTOLOOP: QA WATCHDOG & SELF-HEALING GUARD     ')
    console.log('=============================================================')
    console.log(`Status:         ${card.header.title}`)
    console.log(`Frontend Unit:  ${card.summary.unit_tests.status} (${card.summary.unit_tests.duration_ms}ms)`)
    if (card.summary.backend_tests) {
      console.log(`Backend Unit:   ${card.summary.backend_tests.status} (${card.summary.backend_tests.duration_ms}ms)`)
    }
    console.log(`E2E Suites:     ${card.summary.e2e_tests.status} — ${card.summary.e2e_tests.summary} (${card.summary.e2e_tests.duration_ms}ms)`)
    console.log(`Total Duration: ${card.meta.duration_ms}ms`)
    if (!ok && card.diagnostic_context) {
      console.error('\n[HITL Escalation Triggered]')
      console.error(card.diagnostic_context.error_excerpt)
    } else {
      console.log('\n✔ Zero regressions detected. Daemon entering 0-token standby.')
    }
    console.log('=============================================================\n')
  }
  process.exit(ok ? 0 : 1)
}
