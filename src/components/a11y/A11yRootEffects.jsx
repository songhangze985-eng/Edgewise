import { useEffect } from 'react'
import useSettingsStore from '../../stores/settingsStore'
import { useEffectiveReduceMotion } from '../../hooks/useEffectiveReduceMotion'

export default function A11yRootEffects() {
  const largeFontEnabled = useSettingsStore((s) => s.largeFontEnabled)
  const theme = useSettingsStore((s) => s.theme || 'dark')
  const reduceMotion = useEffectiveReduceMotion()

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('a11y-large-font', largeFontEnabled)
    root.classList.toggle('a11y-reduce-motion', reduceMotion)
    return () => {
      root.classList.remove('a11y-large-font', 'a11y-reduce-motion')
    }
  }, [largeFontEnabled, reduceMotion])

  useEffect(() => {
    const root = document.documentElement
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null

    const applyTheme = () => {
      const resolved =
        theme === 'system'
          ? (mq?.matches ? 'light' : 'dark')
          : (theme === 'light' ? 'light' : 'dark')
      root.setAttribute('data-theme', resolved)
      root.classList.toggle('theme-cyber-light', resolved === 'light')
    }

    applyTheme()
    if (theme === 'system' && mq) {
      mq.addEventListener('change', applyTheme)
      return () => mq.removeEventListener('change', applyTheme)
    }
    return undefined
  }, [theme])

  return null
}
