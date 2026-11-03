export function fetchTasksManifest() {
  return fetch('/tasks/manifest.json', { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error('任务清单加载失败')
    return r.json()
  })
}

/** Public counter for crawlers / logged-out views (no auth). */
export function recordTaskVisit(slug) {
  return fetch(`/api/v1/tasks/${encodeURIComponent(slug)}/visit`, { method: 'POST' }).catch(
    () => {},
  )
}
