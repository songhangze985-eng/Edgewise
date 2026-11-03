import { FORCED_BY_ARM } from '../../config/experiment'

const TASK_TIMING_KEY = 'edgewise-task-timing'

export function taskEntryPrefillEnabled(experimentAssignment) {
  const arm = experimentAssignment?.arm ? String(experimentAssignment.arm) : null
  const inExperiment = Boolean(arm && arm.length >= 2)
  if (!inExperiment || !FORCED_BY_ARM.task_entry) return true
  return Number(arm[0]) === 1
}

export function buildLobbyHref(task, { prefill = true } = {}) {
  const p = task.practice || {}
  const params = new URLSearchParams({
    task_id: task.slug,
    entry: 'task',
    entry_channel: 'search',
    utm_source: 'task_page',
    utm_medium: 'seo',
    utm_campaign: task.slug,
  })
  if (prefill) {
    if (p.type) params.set('type', p.type)
    if (p.difficulty) params.set('difficulty', p.difficulty)
    if (p.followup != null) params.set('followup', String(p.followup))
    if (p.position) params.set('position', p.position)
    if (p.focus) params.set('focus', p.focus)
  }
  params.set('revision', '1')
  return `/interview/lobby?${params.toString()}`
}

export function markTaskViewed(slug) {
  try {
    const raw = sessionStorage.getItem(TASK_TIMING_KEY)
    const map = raw ? JSON.parse(raw) : {}
    if (!map[slug]?.viewedAt) {
      map[slug] = { ...(map[slug] || {}), viewedAt: Date.now(), steps: 1 }
      sessionStorage.setItem(TASK_TIMING_KEY, JSON.stringify(map))
    }
  } catch {
    /* ignore */
  }
}

export function markTaskCtaClicked(slug) {
  try {
    const raw = sessionStorage.getItem(TASK_TIMING_KEY)
    const map = raw ? JSON.parse(raw) : {}
    map[slug] = {
      ...(map[slug] || {}),
      ctaAt: Date.now(),
      steps: Math.max(map[slug]?.steps || 1, 2),
    }
    sessionStorage.setItem(TASK_TIMING_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export function consumeTaskStepsMetrics(slug) {
  try {
    const raw = sessionStorage.getItem(TASK_TIMING_KEY)
    const map = raw ? JSON.parse(raw) : {}
    const entry = map[slug]
    if (!entry?.viewedAt) return null
    const steps = entry.ctaAt ? 3 : 2
    const elapsedMs = Date.now() - entry.viewedAt
    delete map[slug]
    sessionStorage.setItem(TASK_TIMING_KEY, JSON.stringify(map))
    return { steps, elapsed_ms: elapsedMs }
  } catch {
    return null
  }
}

export function injectTaskJsonLd(task, rootId = 'task-jsonld') {
  const existing = document.getElementById(rootId)
  if (existing) existing.remove()
  const graph = []
  if (task.howToSteps?.length) {
    graph.push({
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: task.title,
      description: task.description,
      step: task.howToSteps.map((s, i) => ({
        '@type': 'HowToStep',
        position: i + 1,
        name: s.name,
        text: s.text,
      })),
    })
  }
  if (task.faq?.length) {
    graph.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: task.faq.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    })
  }
  if (!graph.length) return
  const el = document.createElement('script')
  el.type = 'application/ld+json'
  el.id = rootId
  el.textContent = JSON.stringify(graph.length === 1 ? graph[0] : graph)
  document.head.appendChild(el)
}
