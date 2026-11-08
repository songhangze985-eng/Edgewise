/**
 * MediaPipe Face Landmarker (WASM) — lazy loader with upgrade stub for heuristic fallback.
 */

import { sampleFromLandmarks, sampleFromHeuristic } from './presenceMetrics.js'
import { analyzeVideoFrameHeuristic } from './presenceHeuristic.js'

const MP_VERSION = '1.2.0'
const WASM_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task'

let landmarkerPromise = null

async function loadMediaPipeLandmarker() {
  const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
  const wasmFileset = await FilesetResolver.forVisionTasks(WASM_CDN)
  return FaceLandmarker.createFromOptions(wasmFileset, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
    },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  })
}

export function createPresenceAnalyzer({ onEngineReady } = {}) {
  let landmarker = null
  let engine = 'pending'
  let loadError = null
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
  const ctx = canvas?.getContext('2d', { willReadFrequently: true }) ?? null

  const ensureLoaded = async () => {
    if (landmarker) return landmarker
    if (loadError) throw loadError
    if (!landmarkerPromise) {
      landmarkerPromise = loadMediaPipeLandmarker()
    }
    try {
      landmarker = await landmarkerPromise
      engine = 'mediapipe'
      onEngineReady?.(engine)
      return landmarker
    } catch (err) {
      loadError = err
      engine = 'heuristic_simplified'
      onEngineReady?.(engine)
      return null
    }
  }

  const brightnessFromVideo = (video) => {
    if (!canvas || !ctx || !video) return null
    const raw = analyzeVideoFrameHeuristic(video, canvas, ctx)
    return raw?.brightness ?? null
  }

  return {
    getEngine: () => engine,
    async analyze(video, timestampMs) {
      const lm = await ensureLoaded()
      if (lm && video?.readyState >= 2) {
        const result = lm.detectForVideo(video, timestampMs)
        const landmarks = result?.faceLandmarks?.[0]
        if (!landmarks?.length) {
          const brightness = brightnessFromVideo(video)
          return sampleFromHeuristic({
            faceInFrame: false,
            centered: false,
            brightness,
          })
        }
        const brightness = brightnessFromVideo(video)
        return sampleFromLandmarks(landmarks, brightness)
      }
      if (!canvas || !ctx || !video) return null
      engine = 'heuristic_simplified'
      const raw = analyzeVideoFrameHeuristic(video, canvas, ctx)
      if (!raw) return null
      return sampleFromHeuristic({
        faceInFrame: raw.faceInFrame,
        centered: raw.centered,
        brightness: raw.brightness,
      })
    },
  }
}
