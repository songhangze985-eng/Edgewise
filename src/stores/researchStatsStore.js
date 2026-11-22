import { create } from 'zustand'

const useResearchStatsStore = create((set) => ({
  filters: {
    from: '',
    to: '',
    zc: '',
    zp: '',
    channel: '',
    institution: '',
    rule_version: '',
    survey_version: '',
  },
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () =>
    set({
      filters: {
        from: '',
        to: '',
        zc: '',
        zp: '',
        channel: '',
        institution: '',
        rule_version: '',
        survey_version: '',
      },
    }),
}))

export default useResearchStatsStore
