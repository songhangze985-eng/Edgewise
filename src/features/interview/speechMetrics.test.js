import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSpeechPayload,
  computeDeliveryMetrics,
  countFillers,
  countLongPauses,
  detectStarCoverage,
  fillerPer100,
} from './speechMetrics.js'

test('filler and STAR on text-only', () => {
  const text = '嗯然后我觉得当时负责这个项目，我做了优化，最终提升20%'
  const d = computeDeliveryMetrics(text, null, { textOnly: true })
  assert.equal(d.cpm, null)
  assert.equal(d.think_ms, null)
  assert.equal(d.long_pauses, null)
  assert.ok(d.filler_per_100 != null)
  assert.equal(d.star.S, true)
  assert.equal(d.star.A, true)
  assert.equal(d.star.R, true)
})

test('cpm and pauses from speech segments', () => {
  const speech = buildSpeechPayload(
    [
      { text: '你好', start_ms: 2000, end_ms: 3500 },
      { text: '世界', start_ms: 8000, end_ms: 9500 },
    ],
    0,
  )
  assert.equal(speech.first_word_ms, 2000)
  assert.equal(countLongPauses(speech.segments), 1)
  const d = computeDeliveryMetrics('你好世界测试内容', speech, { textOnly: false })
  assert.ok(d.cpm != null && d.cpm > 0)
  assert.equal(d.think_ms, 2000)
  assert.equal(d.long_pauses, 1)
})

test('filler per 100 chars', () => {
  const rate = fillerPer100('嗯嗯嗯aaaa')
  assert.ok(rate != null)
})

test('STAR detection', () => {
  const star = detectStarCoverage('当时背景复杂，我的任务是负责接口，我采取了重构，最终转化率提升')
  assert.equal(star.S, true)
  assert.equal(star.T, true)
  assert.equal(star.A, true)
  assert.equal(star.R, true)
})

test('English fillers and WPM', () => {
  const text = 'Um, I led the project because we needed to improve latency, you know.'
  assert.ok(countFillers(text, 'en-US') >= 2)
  const d = computeDeliveryMetrics(text, null, { textOnly: true, lang: 'en-US' })
  assert.equal(d.metrics_lang, 'en-US')
  assert.ok(d.filler_per_100 != null)
  const star = detectStarCoverage(text, 'en-US')
  assert.equal(star.A, true)
  assert.equal(star.R, false)
})

test('English speech rate', () => {
  const speech = buildSpeechPayload(
    [
      { text: 'Hello', start_ms: 500, end_ms: 1000 },
      { text: 'world', start_ms: 1200, end_ms: 1700 },
    ],
    0,
  )
  const d = computeDeliveryMetrics('Hello world test case', speech, { lang: 'en-US' })
  assert.ok(d.wpm != null && d.wpm > 0)
})
