/** Build and download a single-event iCalendar file (no calendar API permissions). */

function pad(n) {
  return String(n).padStart(2, '0')
}

function toIcsUtc(isoLike) {
  const d = new Date(isoLike)
  if (Number.isNaN(d.getTime())) return null
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

function escapeIcs(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

/**
 * @param {{ uid?: string, title: string, description?: string, start: string, durationMinutes?: number }} opts
 */
export function buildIcsEvent(opts) {
  const startUtc = toIcsUtc(opts.start)
  if (!startUtc) throw new Error('Invalid start time')
  const duration = opts.durationMinutes ?? 60
  const endDate = new Date(opts.start)
  endDate.setMinutes(endDate.getMinutes() + duration)
  const endUtc = toIcsUtc(endDate.toISOString())
  const uid = opts.uid || `${Date.now()}@edgewise.ai`
  const nowUtc = toIcsUtc(new Date().toISOString())

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Edgewise//Interview Schedule//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${nowUtc}`,
    `DTSTART:${startUtc}`,
    `DTEND:${endUtc}`,
    `SUMMARY:${escapeIcs(opts.title)}`,
  ]
  if (opts.description) {
    lines.push(`DESCRIPTION:${escapeIcs(opts.description)}`)
  }
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return `${lines.join('\r\n')}\r\n`
}

export function downloadIcs(filename, icsBody) {
  const blob = new Blob([icsBody], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function exportScheduleToIcs(entry) {
  const title = `${entry.company} · ${entry.stage}`
  const desc = [entry.note, entry.job_id ? `关联 JD: ${entry.job_id}` : '']
    .filter(Boolean)
    .join('\n')
  const body = buildIcsEvent({
    uid: `schedule-${entry.id}@edgewise.ai`,
    title,
    description: desc,
    start: entry.at,
    durationMinutes: 60,
  })
  const safeName = entry.company.replace(/[^\w\u4e00-\u9fff-]+/g, '_').slice(0, 40)
  downloadIcs(`${safeName || 'interview'}.ics`, body)
}
