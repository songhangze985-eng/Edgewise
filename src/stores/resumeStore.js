import { create } from 'zustand'
import { uploadResume } from '../api/resume'
import { createJob, getJobMatch, listJobs, deleteJob as deleteJobApi } from '../api/jobs'
import { getErrorMessage } from '../api/client'

const INITIAL_STATE = {
  file: null,
  fileName: '',
  fileSize: '',
  resumeId: null,
  status: 'idle',
  parsedData: null,
  suggestions: [],
  optimizedText: '',
  jdText: '',
  selectedJobId: null,
  jdKeywords: [],
  jdMatch: null,
  savedJobs: [],
  error: null,
  history: [],
}

const useResumeStore = create((set, get) => ({
  ...INITIAL_STATE,

  setFile(file) {
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(1)
    set({
      file,
      fileName: file.name,
      fileSize: `${sizeInMB}MB`,
      status: 'uploading',
      error: null,
    })
  },

  async uploadAndParse(file) {
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(1)
    set({
      file,
      fileName: file.name,
      fileSize: `${sizeInMB}MB`,
      status: 'uploading',
      error: null,
      optimizedText: '',
      parsedData: null,
      suggestions: [],
    })

    try {
      set({ status: 'parsing' })
      const data = await uploadResume(file)
      const historyItem = {
        file: data.file_name,
        status: data.status || 'parsed',
        date: (data.uploaded_at || '').slice(0, 10),
      }
      set((state) => ({
        resumeId: data.id,
        status: 'parsed',
        parsedData: data.parsed_data,
        suggestions: data.suggestions || [],
        optimizedText: data.optimized_text || '',
        history: [historyItem, ...state.history].slice(0, 20),
      }))
      return data
    } catch (error) {
      set({
        status: 'idle',
        error: getErrorMessage(error, '简历上传失败'),
      })
      throw error
    }
  },

  startOptimizing() {
    set({ status: 'optimizing' })
  },

  appendOptimizedChar(char) {
    set((state) => ({
      optimizedText: state.optimizedText + char,
    }))
  },

  setOptimizedText(text) {
    set({ optimizedText: text, status: 'optimized' })
  },

  finishOptimizeFromServerText() {
    const text = get().optimizedText
    set({ status: text ? 'optimized' : 'parsed' })
  },

  applySuggestion(id) {
    set((state) => ({
      suggestions: state.suggestions.map((s) =>
        s.id === id ? { ...s, applied: !s.applied } : s
      ),
    }))
  },

  setJdText(text) {
    set({ jdText: text, selectedJobId: null, jdMatch: null })
  },

  setJdKeywords(keywords) {
    set({ jdKeywords: keywords })
  },

  setSelectedJobId(jobId) {
    set({ selectedJobId: jobId })
  },

  async fetchSavedJobs() {
    try {
      const jobs = await listJobs()
      set({ savedJobs: jobs })
      return jobs
    } catch {
      return []
    }
  },

  async saveJdFromPaste({ title, rawText, keywords }) {
    const job = await createJob({
      raw_text: rawText,
      title: title || undefined,
      keywords: keywords?.length ? keywords : undefined,
    })
    set((state) => ({
      savedJobs: [job, ...state.savedJobs.filter((j) => j.id !== job.id)],
      selectedJobId: job.id,
      jdKeywords: job.keywords || [],
    }))
    return job
  },

  async deleteSavedJob(jobId) {
    await deleteJobApi(jobId)
    set((state) => ({
      savedJobs: state.savedJobs.filter((j) => j.id !== jobId),
      selectedJobId: state.selectedJobId === jobId ? null : state.selectedJobId,
    }))
  },

  async analyzeJdMatch() {
    const { jdText, selectedJobId, resumeId, jdKeywords } = get()
    if (!resumeId) {
      set({ error: '请先上传并解析简历' })
      return null
    }

    let jobId = selectedJobId
    if (!jobId && jdText.trim()) {
      const job = await createJob({
        raw_text: jdText.trim(),
        keywords: jdKeywords.length ? jdKeywords : undefined,
      })
      jobId = job.id
      set((state) => ({
        selectedJobId: job.id,
        jdKeywords: job.keywords?.length ? job.keywords : state.jdKeywords,
        savedJobs: [job, ...state.savedJobs],
      }))
    }

    if (!jobId) {
      set({ jdMatch: null })
      return null
    }

    const match = await getJobMatch(jobId, resumeId)
    set({ jdMatch: match, selectedJobId: jobId, error: null })
    return match
  },

  loadJobIntoEditor(job) {
    if (!job) return
    set({
      selectedJobId: job.id,
      jdText: job.raw_text || '',
      jdKeywords: job.keywords || [],
      jdMatch: null,
    })
  },

  getMockOptimizedText() {
    return get().optimizedText || ''
  },

  setActiveResumeFromHistory(item) {
    if (!item?.file) return
    set((state) => ({
      fileName: item.file,
      history: [item, ...state.history.filter((h) => h.file !== item.file)],
    }))
  },

  reset() {
    set({ ...INITIAL_STATE, history: get().history })
  },
}))

export default useResumeStore
