const INTERVIEW_TYPE_CATEGORIES = {
  structured: ['行为题', '专业知识', '逻辑题'],
  semi: ['行为题', '压力题', '案例分析'],
  behavioral: ['行为题'],
  pressure: ['压力题'],
}

const DIFFICULTY_MAP = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
}

function normalizePosition(position) {
  return (position || '').trim().toLowerCase()
}

function questionMatchesJob(question, position) {
  const pos = normalizePosition(position)
  if (!pos || pos.includes('通用')) return true
  const haystack = [
    question.title,
    question.category,
    ...(question.tags || []),
  ]
    .join(' ')
    .toLowerCase()
  const tokens = pos.split(/[\s/·、，,]+/).filter((t) => t.length >= 2)
  if (!tokens.length) return true
  return tokens.some((t) => haystack.includes(t))
}

function filterByCategory(questions, categories) {
  if (!categories?.length) return questions
  const set = new Set(categories)
  return questions.filter((q) => set.has(q.category))
}

function filterByDifficulty(questions, difficultyLabel) {
  if (!difficultyLabel) return questions
  return questions.filter((q) => q.difficulty === difficultyLabel)
}

const ROLE_SPECIFIC_TERMS = ['react', 'vue', 'angular', 'python', 'java', 'golang', 'redis', 'kubernetes', 'sql', 'fastapi', 'spring']

function isGeneralPosition(position) {
  const pos = normalizePosition(position)
  return !pos || pos.includes('通用')
}

function excludeRoleSpecificForGeneral(question, interviewType, position) {
  if (interviewType !== 'structured' || !isGeneralPosition(position)) return false
  const hay = [question.title, ...(question.tags || [])].join(' ').toLowerCase()
  return ROLE_SPECIFIC_TERMS.some((term) => hay.includes(term))
}

function filterByJob(questions, position) {
  return questions.filter((q) => questionMatchesJob(q, position))
}

function questionLang(q) {
  const raw = (q?.lang || 'zh-CN').toLowerCase()
  return raw.startsWith('en') ? 'en-US' : 'zh-CN'
}

function filterBySessionLang(questions, sessionMeta) {
  const sessionLang = sessionMeta?.metadata?.lang || sessionMeta?.lang
  const want = String(sessionLang || 'zh-CN').toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN'
  return questions.filter((q) => questionLang(q) === want)
}

export function pickInterviewQuestions(allQuestions, sessionMeta, count = 5) {
  const difficultyRaw = sessionMeta?.difficulty ?? sessionMeta?.metadata?.difficulty
  const difficultyLabel = DIFFICULTY_MAP[difficultyRaw] || difficultyRaw
  const interviewType =
    sessionMeta?.metadata?.interview_type || sessionMeta?.metadata?.interviewType || 'structured'
  const position = sessionMeta?.position || sessionMeta?.metadata?.position || ''
  const sessionLang = sessionMeta?.metadata?.lang || sessionMeta?.lang
  const english = String(sessionLang || '').toLowerCase().startsWith('en')
  const categories = english
    ? ['General']
    : INTERVIEW_TYPE_CATEGORIES[interviewType] || INTERVIEW_TYPE_CATEGORIES.structured

  let pool = filterBySessionLang(allQuestions, sessionMeta)
  pool = filterByCategory(pool, categories)
  let notice = null

  pool = filterByDifficulty(pool, difficultyLabel)
  pool = filterByJob(pool, position)
  pool = pool.filter((q) => !excludeRoleSpecificForGeneral(q, interviewType, position))

  if (pool.length < count) {
    const relaxedJob = filterByDifficulty(filterByCategory(allQuestions, categories), difficultyLabel)
    if (relaxedJob.length > pool.length) {
      pool = relaxedJob
      notice = '当前岗位匹配题目较少，已放宽岗位条件选题。'
    }
  }

  if (pool.length < count) {
    const relaxedType = filterByDifficulty(allQuestions, difficultyLabel)
    if (relaxedType.length > pool.length) {
      pool = relaxedType
      notice = notice
        ? `${notice} 已进一步放宽题型条件。`
        : '当前难度下匹配题目较少，已放宽题型条件选题。'
    }
  }

  if (pool.length < count && difficultyLabel) {
    const anyDiff = filterByCategory(allQuestions, categories)
    if (anyDiff.length > pool.length) {
      pool = anyDiff
      notice = notice || '已放宽难度条件以凑齐题量。'
    }
  }

  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  return {
    picked: shuffled.slice(0, count),
    notice,
  }
}

export { DIFFICULTY_MAP, INTERVIEW_TYPE_CATEGORIES }
