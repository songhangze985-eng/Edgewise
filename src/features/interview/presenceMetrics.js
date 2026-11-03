/** Local camera presence metrics — ratios and tips only (no emotion scoring). */

export const PRESENCE_SAMPLE_HZ = 2
export const PRESENCE_CONSENT_MODEL_MB = '~3'

const CENTER_TOLERANCE = 0.18
const YAW_OK = 0.12
const PITCH_OK = 0.045
const GAZE_OK = 0.35
const BRIGHTNESS_MIN = 0.22
const BRIGHTNESS_MAX = 0.78

export function estimateHeadPoseFromLandmarks(landmarks) {
  if (!landmarks?.length) return null
  const nose = landmarks[1]
  const leftCheek = landmarks[234]
  const rightCheek = landmarks[454]
  if (!nose || !leftCheek || !rightCheek) return null
  const leftDist = Math.max(nose.x - leftCheek.x, 1e-4)
  const rightDist = Math.max(rightCheek.x - nose.x, 1e-4)
  const yaw = (rightDist - leftDist) / (leftDist + rightDist)
  const eyeY = ((landmarks[33]?.y ?? 0) + (landmarks[263]?.y ?? 0)) / 2
  const pitch = nose.y - eyeY
  return { yaw, pitch }
}

export function estimateGazeFromLandmarks(landmarks) {
  if (!landmarks || landmarks.length < 478) return null
  const scoreEye = (outerIdx, innerIdx, irisIdx) => {
    const outer = landmarks[outerIdx]
    const inner = landmarks[innerIdx]
    const iris = landmarks[irisIdx]
    if (!outer || !inner || !iris) return null
    const midX = (outer.x + inner.x) / 2
    const width = Math.abs(outer.x - inner.x) || 1e-4
    return Math.abs(iris.x - midX) / width
  }
  const left = scoreEye(33, 133, 468)
  const right = scoreEye(362, 263, 473)
  if (left == null && right == null) return null
  const vals = [left, right].filter((v) => v != null)
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

export function faceCenterFromLandmarks(landmarks) {
  if (!landmarks?.length) return null
  let sx = 0
  let sy = 0
  let n = 0
  for (const p of landmarks) {
    if (p?.x == null || p?.y == null) continue
    sx += p.x
    sy += p.y
    n += 1
  }
  if (!n) return null
  return { x: sx / n, y: sy / n }
}

export function sampleFromLandmarks(landmarks, brightness) {
  const center = faceCenterFromLandmarks(landmarks)
  const pose = estimateHeadPoseFromLandmarks(landmarks)
  const gazeOffset = estimateGazeFromLandmarks(landmarks)
  const centered =
    center != null
    && Math.abs(center.x - 0.5) <= CENTER_TOLERANCE
    && Math.abs(center.y - 0.5) <= CENTER_TOLERANCE * 1.2
  return {
    face_in_frame: true,
    centered,
    head_yaw: pose?.yaw ?? null,
    head_pitch: pose?.pitch ?? null,
    head_yaw_ok: pose ? Math.abs(pose.yaw) <= YAW_OK : null,
    head_pitch_ok: pose ? Math.abs(pose.pitch) <= PITCH_OK : null,
    gaze_offset: gazeOffset,
    gaze_forward: gazeOffset != null ? gazeOffset <= GAZE_OK : null,
    brightness: brightness ?? null,
    brightness_ok:
      brightness != null ? brightness >= BRIGHTNESS_MIN && brightness <= BRIGHTNESS_MAX : null,
  }
}

export function sampleFromHeuristic({ faceInFrame, centered, brightness }) {
  return {
    face_in_frame: Boolean(faceInFrame),
    centered: Boolean(centered),
    head_yaw: null,
    head_pitch: null,
    head_yaw_ok: null,
    head_pitch_ok: null,
    gaze_offset: null,
    gaze_forward: null,
    brightness: brightness ?? null,
    brightness_ok:
      brightness != null ? brightness >= BRIGHTNESS_MIN && brightness <= BRIGHTNESS_MAX : null,
  }
}

function ratio(count, total) {
  if (!total) return null
  return Math.round((count / total) * 1000) / 1000
}

export function buildPresenceTips(agg) {
  const tips = []
  if (agg.face_in_frame_ratio != null && agg.face_in_frame_ratio < 0.75) {
    tips.push('作答时段尽量保持面部在画面内，避免频繁移出镜头。')
  }
  if (agg.centered_ratio != null && agg.centered_ratio < 0.65) {
    tips.push('将头部保持在画面中央，与摄像头保持一臂左右距离。')
  }
  if (agg.head_yaw_ok_ratio != null && agg.head_yaw_ok_ratio < 0.7) {
    tips.push('减少侧头角度，尽量正对镜头，便于对方观察表情与口型。')
  }
  if (agg.head_pitch_ok_ratio != null && agg.head_pitch_ok_ratio < 0.7) {
    tips.push('调整摄像头高度，使视线与镜头大致平齐，避免俯拍或仰拍。')
  }
  if (agg.gaze_forward_ratio != null && agg.gaze_forward_ratio < 0.65) {
    tips.push('可自然注视镜头或屏幕中央，减少长时间看向画面外。')
  }
  if (agg.brightness_ok_ratio != null && agg.brightness_ok_ratio < 0.6) {
    if (agg.avg_brightness != null && agg.avg_brightness < BRIGHTNESS_MIN) {
      tips.push('环境偏暗，可增加面部补光或靠近光源。')
    } else if (agg.avg_brightness != null && agg.avg_brightness > BRIGHTNESS_MAX) {
      tips.push('画面过亮，可减弱直射光或调低曝光。')
    } else {
      tips.push('注意环境光线是否均匀，避免强逆光或局部阴影。')
    }
  }
  if (!tips.length && agg.sample_count > 0) {
    tips.push('镜头仪态整体稳定，可继续保持当前机位与光线。')
  }
  return tips
}

/**
 * @param {Array<object>} samples
 * @param {{ engine: string, skipped?: boolean }} meta
 */
export function aggregatePresenceSamples(samples, meta = {}) {
  const list = (samples || []).filter(Boolean)
  if (!list.length) {
    return meta.skipped
      ? null
      : {
          engine: meta.engine || 'none',
          sample_count: 0,
          tips: ['样本不足，未生成镜头仪态统计。'],
        }
  }

  const total = list.length
  const faceCount = list.filter((s) => s.face_in_frame).length
  const centeredCount = list.filter((s) => s.centered).length
  const yawOk = list.filter((s) => s.head_yaw_ok === true)
  const pitchOk = list.filter((s) => s.head_pitch_ok === true)
  const gazeOk = list.filter((s) => s.gaze_forward === true)
  const brightOk = list.filter((s) => s.brightness_ok === true)
  const brightnessVals = list.map((s) => s.brightness).filter((v) => v != null)

  const avgBrightness =
    brightnessVals.length
      ? Math.round((brightnessVals.reduce((a, b) => a + b, 0) / brightnessVals.length) * 1000) / 1000
      : null

  const agg = {
    engine: meta.engine || 'unknown',
    sample_count: total,
    face_in_frame_ratio: ratio(faceCount, total),
    centered_ratio: ratio(centeredCount, total),
    head_yaw_ok_ratio: yawOk.length ? ratio(yawOk.length, yawOk.length + list.filter((s) => s.head_yaw_ok === false).length) : null,
    head_pitch_ok_ratio: pitchOk.length
      ? ratio(pitchOk.length, pitchOk.length + list.filter((s) => s.head_pitch_ok === false).length)
      : null,
    gaze_forward_ratio: gazeOk.length
      ? ratio(gazeOk.length, gazeOk.length + list.filter((s) => s.gaze_forward === false).length)
      : null,
    brightness_ok_ratio: brightOk.length
      ? ratio(brightOk.length, brightOk.length + list.filter((s) => s.brightness_ok === false).length)
      : null,
    avg_brightness: avgBrightness,
  }

  agg.tips = buildPresenceTips(agg)
  return agg
}

export function aggregatePresenceSummary(rounds) {
  if (!Array.isArray(rounds)) return null
  const metrics = []
  for (const rnd of rounds) {
    for (const q of rnd.questions || []) {
      if (q.presence?.sample_count) metrics.push(q.presence)
    }
  }
  if (!metrics.length) return null

  const avg = (key) => {
    const vals = metrics.map((m) => m[key]).filter((v) => v != null)
    if (!vals.length) return null
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 1000) / 1000
  }

  const summary = {
    question_count: metrics.length,
    avg_face_in_frame_ratio: avg('face_in_frame_ratio'),
    avg_centered_ratio: avg('centered_ratio'),
    avg_head_yaw_ok_ratio: avg('head_yaw_ok_ratio'),
    avg_gaze_forward_ratio: avg('gaze_forward_ratio'),
    avg_brightness_ok_ratio: avg('brightness_ok_ratio'),
    engines: [...new Set(metrics.map((m) => m.engine).filter(Boolean))],
  }
  summary.tips = buildPresenceTips({
    face_in_frame_ratio: summary.avg_face_in_frame_ratio,
    centered_ratio: summary.avg_centered_ratio,
    head_yaw_ok_ratio: summary.avg_head_yaw_ok_ratio,
    gaze_forward_ratio: summary.avg_gaze_forward_ratio,
    brightness_ok_ratio: summary.avg_brightness_ok_ratio,
    avg_brightness: avg('avg_brightness'),
    sample_count: metrics.length,
  })
  return summary
}

export function formatPresenceRatio(value) {
  if (value == null || Number.isNaN(value)) return '—'
  return `${Math.round(value * 100)}%`
}
