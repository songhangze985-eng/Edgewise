/** Simplified canvas sampling when MediaPipe is unavailable (简化版). */

const SKIN_R_MIN = 60
const SKIN_G_MAX = 180
const SKIN_B_MAX = 180

export function measureBrightness(imageData) {
  const { data, width, height } = imageData
  if (!width || !height) return null
  let sum = 0
  let n = 0
  const step = 4 * Math.max(1, Math.floor((width * height) / 4000))
  for (let i = 0; i < data.length; i += step) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    sum += luma
    n += 1
  }
  return n ? Math.round((sum / n) * 1000) / 1000 : null
}

export function detectFaceRegionHeuristic(imageData) {
  const { data, width, height } = imageData
  let sumX = 0
  let sumY = 0
  let count = 0
  const step = 4 * 2
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      if (r > SKIN_R_MIN && g < SKIN_G_MAX && b < SKIN_B_MAX && r > g && r > b) {
        sumX += x / width
        sumY += y / height
        count += 1
      }
    }
  }
  if (count < 12) {
    return { faceInFrame: false, centered: false, pixelRatio: count / (width * height) }
  }
  const cx = sumX / count
  const cy = sumY / count
  const centered = Math.abs(cx - 0.5) <= 0.2 && Math.abs(cy - 0.5) <= 0.22
  return { faceInFrame: true, centered, centerX: cx, centerY: cy, pixelRatio: count / (width * height) }
}

export function analyzeVideoFrameHeuristic(video, canvas, ctx) {
  if (!video || video.readyState < 2) return null
  const w = 160
  const h = Math.max(90, Math.round((video.videoHeight / video.videoWidth) * w) || 90)
  canvas.width = w
  canvas.height = h
  ctx.drawImage(video, 0, 0, w, h)
  const imageData = ctx.getImageData(0, 0, w, h)
  const brightness = measureBrightness(imageData)
  const region = detectFaceRegionHeuristic(imageData)
  return { brightness, ...region }
}
