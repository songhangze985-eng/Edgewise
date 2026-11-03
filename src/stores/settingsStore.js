import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { emitA11ySettingChanged } from '../utils/a11yTelemetry'

const useSettingsStore = create(
  persist(
    (set) => ({
      ttsEnabled: true,
      ttsRate: 1.05,
      ttsVoiceURI: null,
      deliveryLiveHintEnabled: false,
      presenceAnalysisEnabled: false,

      captionsEnabled: true,
      reduceMotionEnabled: false,
      largeFontEnabled: false,
      keyboardShortcutsEnabled: true,
      storySidePeekEnabled: false,

      setTtsEnabled(ttsEnabled) {
        set({ ttsEnabled: Boolean(ttsEnabled) })
      },

      setTtsRate(ttsRate) {
        const n = Number(ttsRate)
        if (Number.isNaN(n)) return
        set({ ttsRate: Math.min(1.4, Math.max(0.8, n)) })
      },

      setTtsVoiceURI(ttsVoiceURI) {
        set({ ttsVoiceURI: ttsVoiceURI || null })
      },

      setDeliveryLiveHintEnabled(deliveryLiveHintEnabled) {
        set({ deliveryLiveHintEnabled: Boolean(deliveryLiveHintEnabled) })
      },

      setPresenceAnalysisEnabled(presenceAnalysisEnabled) {
        set({ presenceAnalysisEnabled: Boolean(presenceAnalysisEnabled) })
      },

      setCaptionsEnabled(captionsEnabled) {
        const value = Boolean(captionsEnabled)
        set({ captionsEnabled: value })
        emitA11ySettingChanged('captions', value)
      },

      setReduceMotionEnabled(reduceMotionEnabled) {
        const value = Boolean(reduceMotionEnabled)
        set({ reduceMotionEnabled: value })
        emitA11ySettingChanged('reduce_motion', value)
      },

      setLargeFontEnabled(largeFontEnabled) {
        const value = Boolean(largeFontEnabled)
        set({ largeFontEnabled: value })
        emitA11ySettingChanged('large_font', value)
      },

      setKeyboardShortcutsEnabled(keyboardShortcutsEnabled) {
        const value = Boolean(keyboardShortcutsEnabled)
        set({ keyboardShortcutsEnabled: value })
        emitA11ySettingChanged('keyboard_shortcuts', value)
      },

      setStorySidePeekEnabled(storySidePeekEnabled) {
        set({ storySidePeekEnabled: Boolean(storySidePeekEnabled) })
      },
    }),
    {
      name: 'edgewise-settings',
      partialize: (state) => ({
        ttsEnabled: state.ttsEnabled,
        ttsRate: state.ttsRate,
        ttsVoiceURI: state.ttsVoiceURI,
        deliveryLiveHintEnabled: state.deliveryLiveHintEnabled,
        presenceAnalysisEnabled: state.presenceAnalysisEnabled,
        captionsEnabled: state.captionsEnabled,
        reduceMotionEnabled: state.reduceMotionEnabled,
        largeFontEnabled: state.largeFontEnabled,
        keyboardShortcutsEnabled: state.keyboardShortcutsEnabled,
        storySidePeekEnabled: state.storySidePeekEnabled,
      }),
    },
  ),
)

export default useSettingsStore
