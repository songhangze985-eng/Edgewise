import { create } from 'zustand'

let toastCounter = 0

const useToastStore = create((set, get) => ({
  toasts: [],

  push(message, variant = 'error') {
    const id = ++toastCounter
    set((state) => ({
      toasts: [...state.toasts, { id, message, variant }].slice(-5),
    }))
    window.setTimeout(() => {
      get().dismiss(id)
    }, 5000)
    return id
  },

  dismiss(id) {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }))
  },

  clear() {
    set({ toasts: [] })
  },
}))

export function showToast(message, variant = 'error') {
  return useToastStore.getState().push(message, variant)
}

export default useToastStore
