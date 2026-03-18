import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,

      login(email, name) {
        set({
          user: {
            id: `user-${Date.now()}`,
            email,
            name: name || email.split('@')[0],
            initials: (name || email.split('@')[0]).slice(0, 2).toUpperCase(),
            tier: 'Pro',
            tierLabel: '黄金专业版',
            credits: 1280,
            joinDate: new Date().toISOString().split('T')[0],
          },
          isAuthenticated: true,
        })
      },

      logout() {
        set({ user: null, isAuthenticated: false })
      },

      updateCredits(delta) {
        set((state) => ({
          user: state.user ? { ...state.user, credits: state.user.credits + delta } : null,
        }))
      },
    }),
    { name: 'edgewise-auth' }
  )
)

export default useAuthStore
