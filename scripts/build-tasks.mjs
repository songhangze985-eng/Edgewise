/**
 * Parse content/tasks/*.md → public/tasks/manifest.json + static HTML + sitemap.xml
 * Run before `vite build` (see package.json).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const CONTENT_DIR = path.join(ROOT, 'content', 'tasks')
const OUT_DIR = path.join(ROOT, 'public', 'tasks')
const PUBLIC_DIR = path.join(ROOT, 'public')

const SITE_ORIGIN = process.env.EDGEWISE_SITE_ORIGIN || 'https://edgewise.app'

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) return { meta: {}, body: raw.trim() }
  const yaml = match[1]
  const body = match[2].trim()
  const meta = {}
  let objectKey = null
  let listKey = null
  for (const line of yaml.split('\n')) {
    if (listKey && /^\s+-\s+/.test(line)) {
      const item = line.replace(/^\s+-\s+/, '').trim()
      if (item.includes(':')) {
        const [k, ...rest] = item.split(':')
        meta[listKey].push({ [k.trim()]: rest.join(':').trim().replace(/^["']|["']$/g, '') })
      } else {
        meta[listKey].push(item.replace(/^["']|["']$/g, ''))
      }
      continue
    }
    if (listKey && /^\s{4}(\w+):\s*(.*)$/.test(line)) {
      const nested = line.match(/^\s{4}(\w+):\s*(.*)$/)
      const last = meta[listKey][meta[listKey].length - 1]
      if (last && typeof last === 'object' && !Array.isArray(last)) {
        last[nested[1]] = nested[2].trim().replace(/^["']|["']$/g, '')
      }
      continue
    }
    const kv = line.match(/^(\w+):\s*(.*)$/)
    if (kv) {
      objectKey = null
      listKey = null
      const key = kv[1]
      const val = kv[2].trim()
      if (val === '') {
        if (key === 'howToSteps') {
          meta[key] = []
          listKey = key
          objectKey = null
        } else {
          meta[key] = {}
          objectKey = key
          listKey = null
        }
      } else if (val === 'true' || val === 'false') {
        meta[key] = val === 'true'
      } else if (/^\d+$/.test(val)) {
        meta[key] = Number(val)
      } else {
        meta[key] = val.replace(/^["']|["']$/g, '')
      }
      continue
    }
    const nested = line.match(/^\s{2}(\w+):\s*(.*)$/)
    if (nested && objectKey) {
      meta[objectKey][nested[1]] = nested[2].trim().replace(/^["']|["']$/g, '')
      continue
    }
    const listStart = line.match(/^(\w+):\s*$/)
    if (listStart) {
      objectKey = null
      listKey = listStart[1]
      meta[listKey] = []
    }
  }
  return { meta, body }
}

function parseSections(body) {
  const sections = {}
  let current = null
  const lines = body.split('\n')
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/)
    if (h2) {
      current = h2[1].trim()
      sections[current] = []
      continue
    }
    if (current) sections[current].push(line)
  }
  const out = {}
  for (const [key, arr] of Object.entries(sections)) {
    out[key] = arr.join('\n').trim()
  }
  return out
}

function parseFaq(markdown) {
  if (!markdown) return []
  const items = []
  const chunks = markdown.split(/^###\s+/m).slice(1)
  for (const chunk of chunks) {
    const [qLine, ...rest] = chunk.split('\n')
    const question = qLine.trim()
    const answer = rest.join('\n').trim()
    if (question && answer) items.push({ question, answer })
  }
  return items
}

function mdToHtml(text) {
  if (!text) return ''
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/^>\s?(.+)$/gm, '<blockquote>$1</blockquote>')
  html = html.replace(/^\|\s*(.+)$/gm, (_, row) => {
    const cells = row.split('|').map((c) => c.trim()).filter(Boolean)
    if (cells.every((c) => /^[-—]+$/.test(c))) return ''
    return `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`
  })
  if (html.includes('<tr>')) {
    html = html.replace(/(<tr>[\s\S]*?<\/tr>)+/g, (block) => `<table>${block}</table>`)
  }
  const blocks = html.split(/\n\n+/).map((p) => {
    const t = p.trim()
    if (!t) return ''
    if (t.startsWith('<blockquote>') || t.startsWith('<table>')) return t
    return `<p>${t.replace(/\n/g, '<br/>')}</p>`
  })
  return blocks.filter(Boolean).join('\n')
}

function buildJsonLd(task) {
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
  return graph
}

function staticPageShell({ title, description, canonical, bodyHtml, jsonLd }) {
  const ld = jsonLd?.length
    ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`
    : ''
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="${description.replace(/"/g, '&quot;')}" />
  <link rel="canonical" href="${canonical}" />
  <title>${title} · 谈锋准备任务</title>
  ${ld}
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.65; color: #1a1a1a; }
    h1 { font-size: 1.75rem; }
    h2 { margin-top: 2rem; font-size: 1.15rem; }
    blockquote { border-left: 3px solid #3d5afe; padding-left: 1rem; color: #333; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.95rem; }
    td { border: 1px solid #ddd; padding: 0.5rem; }
    a.cta { display: inline-block; margin-top: 2rem; padding: 0.75rem 1.25rem; background: #1a237e; color: #fff; text-decoration: none; border-radius: 8px; }
    .note { font-size: 0.9rem; color: #555; }
  </style>
</head>
<body>
  <p><a href="/tasks">← 全部准备任务</a></p>
  ${bodyHtml}
  <p class="note">此为静态摘要页，完整交互请打开谈锋应用内任务页。</p>
</body>
</html>`
}

function lobbyQuery(task) {
  const p = task.practice || {}
  const params = new URLSearchParams({
    task_id: task.slug,
    entry: 'task',
    entry_channel: 'search',
    utm_source: 'task_page',
    utm_medium: 'seo',
    utm_campaign: task.slug,
  })
  if (p.type) params.set('type', p.type)
  if (p.difficulty) params.set('difficulty', p.difficulty)
  if (p.followup != null) params.set('followup', String(p.followup))
  if (p.position) params.set('position', p.position)
  if (p.focus) params.set('focus', p.focus)
  return `/interview/lobby?${params.toString()}`
}

function loadTasks() {
  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'))
  const tasks = []
  for (const file of files) {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8')
    const { meta, body } = parseFrontmatter(raw)
    const sections = parseSections(body)
    const faq = parseFaq(sections['常见问题'] || '')
    const howToSteps = Array.isArray(meta.howToSteps)
      ? meta.howToSteps.map((s) =>
          typeof s === 'string' ? { name: s, text: '' } : { name: s.name || '', text: s.text || '' },
        )
      : []
    const practice = meta.practice && typeof meta.practice === 'object' ? meta.practice : {}
    const slug = meta.slug || file.replace(/\.md$/, '')
    tasks.push({
      slug,
      title: meta.title || slug,
      description: meta.description || '',
      practice,
      sections,
      faq,
      howToSteps,
      lobbyPath: lobbyQuery({ slug, practice }),
    })
  }
  tasks.sort((a, b) => a.slug.localeCompare(b.slug))
  return tasks
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const tasks = loadTasks()
  const manifest = {
    generatedAt: new Date().toISOString(),
    tasks: tasks.map(({ sections, ...t }) => ({
      ...t,
      sectionHtml: Object.fromEntries(
        Object.entries(sections).map(([k, v]) => [k, mdToHtml(v)]),
      ),
    })),
  }
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))

  const indexLinks = tasks
    .map(
      (t) =>
        `<li><a href="/tasks/${t.slug}/">${t.title}</a><p>${t.description}</p></li>`,
    )
    .join('\n')
  fs.writeFileSync(
    path.join(OUT_DIR, 'index.html'),
    staticPageShell({
      title: '面试准备任务',
      description: '谈锋 Edgewise 可检索的准备任务：困难说明、可核验示例与匹配练习入口。',
      canonical: `${SITE_ORIGIN}/tasks/`,
      bodyHtml: `<h1>面试准备任务</h1><p>每个任务对应一种常见准备困难，并链接到匹配的模拟练习。</p><ul>${indexLinks}</ul>`,
      jsonLd: [],
    }),
  )

  for (const task of tasks) {
    const slugDir = path.join(OUT_DIR, task.slug)
    fs.mkdirSync(slugDir, { recursive: true })
    const sectionHtml = Object.entries(task.sections)
      .map(([h, md]) => `<h2>${h}</h2>${mdToHtml(md)}`)
      .join('\n')
    const bodyHtml = `
      <h1>${task.title}</h1>
      <p>${task.description}</p>
      ${sectionHtml}
      <p><a class="cta" href="${task.lobbyPath}">开始匹配练习</a></p>
    `
    fs.writeFileSync(
      path.join(slugDir, 'index.html'),
      staticPageShell({
        title: task.title,
        description: task.description,
        canonical: `${SITE_ORIGIN}/tasks/${task.slug}/`,
        bodyHtml,
        jsonLd: buildJsonLd(task),
      }),
    )
  }

  const urls = [
    `${SITE_ORIGIN}/tasks/`,
    ...tasks.map((t) => `${SITE_ORIGIN}/tasks/${t.slug}/`),
  ]
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((loc) => `  <url><loc>${loc}</loc></url>`).join('\n')}
</urlset>`
  fs.mkdirSync(PUBLIC_DIR, { recursive: true })
  fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), sitemap)

  console.log(`[build-tasks] ${tasks.length} tasks → public/tasks/ + sitemap.xml`)
}

main()
