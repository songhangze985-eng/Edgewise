import { trackResearchEvent } from '../research/track'

export function emitA11ySettingChanged(key, value) {
  trackResearchEvent('a11y.setting_changed', { key, value })
}
