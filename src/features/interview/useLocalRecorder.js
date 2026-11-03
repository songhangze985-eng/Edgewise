import { useCallback, useEffect, useRef, useState } from 'react'

function pickRecorderMime(stream) {
  const hasVideo = stream.getVideoTracks().length > 0
  const candidates = hasVideo
    ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || ''
}

/**
 * Local camera self-view + MediaRecorder only. Blobs stay in memory; cleared on unmount.
 */
export default function useLocalRecorder({ onCameraStatus } = {}) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const blobUrlRef = useRef(null)
  const [cameraMode, setCameraMode] = useState('pending')
  const [recording, setRecording] = useState(false)

  const revokePlayback = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    chunksRef.current = []
  }, [])

  const clearAll = useCallback(() => {
    revokePlayback()
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setRecording(false)
  }, [revokePlayback])

  const ensureMedia = useCallback(async () => {
    if (streamRef.current) return streamRef.current
    let stream = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      setCameraMode('on')
      onCameraStatus?.('on')
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true })
        setCameraMode('off')
        onCameraStatus?.('off')
      } catch {
        setCameraMode('denied')
        onCameraStatus?.('denied')
        return null
      }
    }
    streamRef.current = stream
    if (videoRef.current && stream.getVideoTracks().length) {
      videoRef.current.srcObject = stream
      await videoRef.current.play().catch(() => {})
    }
    return stream
  }, [onCameraStatus])

  const buildPlaybackUrl = useCallback(() => {
    revokePlayback()
    if (!chunksRef.current.length) return null
    const blob = new Blob(chunksRef.current, {
      type: chunksRef.current[0]?.type || 'video/webm',
    })
    blobUrlRef.current = URL.createObjectURL(blob)
    return blobUrlRef.current
  }, [revokePlayback])

  const startRecording = useCallback(async () => {
    const stream = await ensureMedia()
    if (!stream) return false
    revokePlayback()
    chunksRef.current = []
    const mime = pickRecorderMime(stream)
    const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunksRef.current.push(event.data)
    }
    recorder.start(1000)
    recorderRef.current = recorder
    setRecording(true)
    return true
  }, [ensureMedia, revokePlayback])

  const stopRecording = useCallback(() => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current
      if (!recorder || recorder.state === 'inactive') {
        setRecording(false)
        resolve(buildPlaybackUrl())
        return
      }
      recorder.onstop = () => {
        setRecording(false)
        resolve(buildPlaybackUrl())
      }
      try {
        recorder.stop()
      } catch {
        setRecording(false)
        resolve(buildPlaybackUrl())
      }
    })
  }, [buildPlaybackUrl])

  const getPlaybackUrl = useCallback(() => blobUrlRef.current, [])

  useEffect(() => () => clearAll(), [clearAll])

  return {
    videoRef,
    cameraMode,
    recording,
    ensureMedia,
    startRecording,
    stopRecording,
    getPlaybackUrl,
    clearAll,
    hasLocalVideo: cameraMode === 'on',
  }
}
