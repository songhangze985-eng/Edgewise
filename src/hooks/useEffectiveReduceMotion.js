import { useEffect, useState } from 'react'
import useSettingsStore from '../stores/settingsStore'

export function useEffectiveReduceMotion() {
  const reduceMotionSetting = useSettingsStore((s) => s.reduceMotionEnabled)
  const [systemReduced, setSystemReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setSystemReduced(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return systemReduced || reduceMotionSetting
}
