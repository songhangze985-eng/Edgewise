import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildHitlCard, runQaWatchdog } from '../scripts/autoloop/qa-watchdog.mjs'
import { runNeatFreakCheck } from '../scripts/autoloop/neat-freak-sync.mjs'
import { checkAutoloopEnvironment } from '../scripts/autoloop/edgewise-autoloop-runner.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

describe('Agent-Autoloop Integration Test Suite', () => {
  it('Autoloop Rules: .autoloop/rules.json adheres to schema and defines 4 core pipelines', () => {
    const rulesPath = path.join(ROOT, '.autoloop/rules.json')
    assert.ok(fs.existsSync(rulesPath), '.autoloop/rules.json must exist')

    const data = JSON.parse(fs.readFileSync(rulesPath, 'utf8'))
    assert.equal(data.name, 'edgewise-automation-suite')
    assert.ok(Array.isArray(data.rules))
    assert.equal(data.rules.length, 4)

    const expectedIds = [
      'edgewise-qa-watchdog',
      'edgewise-empirical-monitor',
      'edgewise-ugc-audit-pipeline',
      'edgewise-neat-freak-sync'
    ]
    const actualIds = data.rules.map(r => r.id)
    assert.deepEqual(actualIds.sort(), expectedIds.sort())

    for (const rule of data.rules) {
      assert.ok(rule.id, 'rule has id')
      assert.ok(rule.name, 'rule has name')
      assert.ok(rule.when, 'rule has when trigger')
      assert.ok(rule.to, 'rule has to agent')
      assert.ok(rule.exec, 'rule has executable command')
      assert.ok(rule.hitl, 'rule has hitl notification config')
    }
  })

  it('QA Watchdog: generates valid HITL Card payloads for both pass and failure states', () => {
    // 1. Success state
    const passCard = buildHitlCard({
      status: 'PASS',
      unitResult: { code: 0 },
      e2eResult: { code: 0, summary: 'All 172 passed' },
      durationMs: 120
    })
    assert.equal(passCard.header.theme, 'green')
    assert.equal(passCard.meta.overall_status, 'PASS')
    assert.equal(passCard.diagnostic_context, null)

    // 2. Failure state
    const failCard = buildHitlCard({
      status: 'FAIL',
      unitResult: { code: 1 },
      e2eResult: { code: 0 },
      durationMs: 250,
      failureContext: {
        summary: 'AssertionError in F15 mock room',
        error: 'Expected 200 OK'
      }
    })
    assert.equal(failCard.header.theme, 'orange')
    assert.equal(failCard.meta.overall_status, 'FAIL')
    assert.ok(failCard.diagnostic_context)
    assert.equal(failCard.diagnostic_context.patch_status, 'PENDING_HUMAN_SIGN_OFF')
    assert.equal(failCard.diagnostic_context.actions.length, 3)
  })

  it('QA Watchdog: dry-run execution completes successfully', async () => {
    const res = await runQaWatchdog({ dryRun: true })
    assert.equal(res.ok, true)
    assert.equal(res.card.meta.overall_status, 'PASS')
  })

  it('Neat-Freak Validator: verifies 100% doc and code contract alignment', () => {
    const res = runNeatFreakCheck()
    assert.equal(res.ok, true)
    assert.equal(res.issues.length, 0)
    assert.ok(res.checks.length >= 5)
  })

  it('Autoloop Environment: validates all runner scripts and rule dependencies', async () => {
    const res = await checkAutoloopEnvironment()
    assert.equal(res.ok, true)
    assert.ok(res.checks.every(c => c.status === 'PASS'))
  })
})
