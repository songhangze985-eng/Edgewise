import assert from 'node:assert/strict'
import test from 'node:test'
import {
  aggregatePresenceSamples,
  aggregatePresenceSummary,
  buildPresenceTips,
  sampleFromHeuristic,
} from './presenceMetrics.js'

test('aggregate presence samples and tips', () => {
  const samples = [
    sampleFromHeuristic({ faceInFrame: true, centered: true, brightness: 0.5 }),
    sampleFromHeuristic({ faceInFrame: true, centered: false, brightness: 0.15 }),
  ]
  const agg = aggregatePresenceSamples(samples, { engine: 'heuristic_simplified' })
  assert.equal(agg.sample_count, 2)
  assert.equal(agg.face_in_frame_ratio, 1)
  assert.equal(agg.centered_ratio, 0.5)
  assert.ok(Array.isArray(agg.tips))
})

test('presence summary from rounds', () => {
  const rounds = [
    {
      name: 'R1',
      questions: [
        {
          id: 'q1',
          presence: aggregatePresenceSamples(
            [sampleFromHeuristic({ faceInFrame: true, centered: true, brightness: 0.4 })],
            { engine: 'mediapipe' },
          ),
        },
      ],
    },
  ]
  const summary = aggregatePresenceSummary(rounds)
  assert.equal(summary.question_count, 1)
  assert.ok(summary.avg_face_in_frame_ratio != null)
})

test('tips when centered is weak', () => {
  const tips = buildPresenceTips({ centered_ratio: 0.4, sample_count: 5 })
  assert.ok(tips.some((t) => t.includes('中央')))
})
