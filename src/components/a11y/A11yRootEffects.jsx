import { useEffect } from 'react'
import useSettingsStore from '../../stores/settingsStore'
import { useEffectiveReduceMotion } from '../../hooks/useEffectiveReduceMotion'

export default function A11yRootEffects() {
  const largeFontEnabled = useSettingsStore((s) => s.largeFontEnabled)
  const reduceMotion = useEffectiveReduceMotion()

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('a11y-large-font', largeFontEnabled)
    root.classList.toggle('a11y-reduce-motion', reduceMotion)
    return () => {
      root.classList.remove('a11y-large-font', 'a11y-reduce-motion')
    }
  }, [largeFontEnabled, reduceMotion])

  return null
}
