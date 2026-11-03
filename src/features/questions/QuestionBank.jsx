import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { listQuestions, uploadQuestionsFile } from '../../api/questions'
import useResumeStore from '../../stores/resumeStore'
import { getErrorMessage } from '../../api/client'
import { showToast } from '../../stores/toastStore'
import PageBar from '../../components/ui/PageBar'
import styles from './QuestionBank.module.css'
import searchIcon from '../../assets/icons/search.svg'

const CATEGORIES = ['全部', '通用题', '结构化', '编程题', '行为题', '逻辑题', '案例分析', '专业知识', '压力题', '创意题', '自定义']
const GENERAL_TABS = ['通用题库', '我的专属题']
const DIFFICULTIES = ['全部', '简单', '中等', '困难']
const COLLECT_KEY = 'edgewise-question-collections'

const diffColorMap = { '简单': 'easy', '中等': 'medium', '困难': 'hard' }

const ACCEPTED_EXT = ['.pdf', '.docx', '.txt', '.md']
const MAX_FILE_SIZE = 10 * 1024 * 1024

function validateUploadFile(file) {
  if (!file) return '未选择文件'
  const ext = '.' + file.name.split('.').pop().toLowerCase()
  if (!ACCEPTED_EXT.includes(ext)) return '仅支持 PDF / DOCX / TXT / MD'
  if (file.size > MAX_FILE_SIZE) return '文件不能超过 10MB'
  return null
}

function loadCollections() {
  try {
    const raw = localStorage.getItem(COLLECT_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

const FOCUS_CATEGORY = {
  expression: '行为题',
  logic: '逻辑题',
  leadership: '压力题',
  teamwork: '行为题',
  adaptability: '案例分析',
}

export default function QuestionBank() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeCategory, setActiveCategory] = useState('全部')
  const [activeDiff, setActiveDiff] = useState('全部')
  const [search, setSearch] = useState('')
  const [collections, setCollections] = useState(loadCollections)
  const [uploading, setUploading] = useState(false)
  const [importSummary, setImportSummary] = useState('')
  const [generalTab, setGeneralTab] = useState('通用题库')
  const [exclusiveQuestions, setExclusiveQuestions] = useState([])
  const resumeId = useResumeStore((s) => s.resumeId)
  const fileInputRef = useRef(null)

  const refreshQuestions = useCallback(() => {
    setLoading(true)
    setError('')
    return listQuestions()
      .then((data) => {
        setQuestions(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(getErrorMessage(err, '加载题库失败'))
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    refreshQuestions()
  }, [refreshQuestions])

  useEffect(() => {
    if (!resumeId) {
      setExclusiveQuestions([])
      return
    }
    listQuestions({ type: 'resume_specific', scope: 'mine' })
      .then(setExclusiveQuestions)
      .catch(() => setExclusiveQuestions([]))
  }, [resumeId, questions.length])

  useEffect(() => {
    const focus = searchParams.get('focus')
    const cat = FOCUS_CATEGORY[focus]
    if (cat) setActiveCategory(cat)
  }, [searchParams])

  const handleUploadClick = () => {
    if (!uploading) fileInputRef.current?.click()
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    const validationError = validateUploadFile(file)
    if (validationError) {
      showToast(validationError, 'error')
      return
    }
    setUploading(true)
    setImportSummary('')
    try {
      const result = await uploadQuestionsFile(file)
      setImportSummary(`已导入 ${result.imported} 道题目`)
      showToast(`成功导入 ${result.imported} 道题目`, 'success')
      await refreshQuestions()
    } catch (err) {
      showToast(getErrorMessage(err, '上传解析失败'), 'error')
    } finally {
      setUploading(false)
    }
  }

  const filtered = useMemo(() => {
    const pool =
      activeCategory === '通用题' && generalTab === '我的专属题'
        ? exclusiveQuestions
        : questions.filter((q) => {
            const t = q.type || 'professional'
            if (activeCategory === '通用题') return t === 'general'
            if (t === 'general' || t === 'resume_specific') return false
            return true
          })

    return pool.filter((q) => {
      const matchCat =
        activeCategory === '全部'
        || q.category === activeCategory
        || (activeCategory === '通用题' && (q.type === 'general' || q.type === 'resume_specific'))
        || (activeCategory === '结构化' && q.type === 'structured')
        || (activeCategory === '编程题' && q.type === 'coding')
      const matchDiff = activeDiff === '全部' || q.difficulty === activeDiff
      const matchSearch =
        !search ||
        q.title.includes(search) ||
        q.id.toLowerCase().includes(search.toLowerCase())
      return matchCat && matchDiff && matchSearch
    })
  }, [questions, exclusiveQuestions, activeCategory, activeDiff, search, generalTab])

  const toggleCollect = (e, id) => {
    e.stopPropagation()
    setCollections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem(COLLECT_KEY, JSON.stringify([...next]))
      return next
    })
  }

  return (
    <div className={styles.page}>
      <PageBar
        title="面试题库"
        actions={
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className={styles['upload-input']}
              onChange={handleFileChange}
              aria-hidden="true"
              tabIndex={-1}
            />
            <button
              type="button"
              className={styles['upload-btn']}
              onClick={handleUploadClick}
              disabled={uploading}
            >
              {uploading ? '解析中…' : '上传题库文件'}
            </button>
            <div className={`hw-inset ${styles['header-stat']}`}>
              <span className={styles['stat-label']}>题库总量</span>
              <span className={styles['stat-value']}>{questions.length}</span>
            </div>
          </>
        }
      />
      {importSummary && (
        <div className={styles['import-banner']} role="status">
          {importSummary}
        </div>
      )}

      <div className={styles['filter-section']}>
        <div className={styles['filter-group']}>
          <div className={styles['filter-label']}>题型分类 <span className={styles['filter-id']}>[CAT]</span></div>
          <div className={styles['tab-list']} role="tablist" aria-label="题型分类">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                className={`${styles.tab} ${activeCategory === cat ? styles.active : ''}`}
                onClick={() => setActiveCategory(cat)}
                role="tab"
                aria-selected={activeCategory === cat}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {activeCategory === '通用题' && resumeId && exclusiveQuestions.length > 0 && (
          <div className={styles['filter-group']}>
            <div className={styles['filter-label']}>通用题分区</div>
            <div className={styles['tab-list']}>
              {GENERAL_TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`${styles.tab} ${generalTab === tab ? styles.active : ''}`}
                  onClick={() => setGeneralTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={styles['filter-row']}>
          <div className={styles['filter-group']}>
            <div className={styles['filter-label']}>难度等级 <span className={styles['filter-id']}>[DIFF]</span></div>
            <div className={styles['pill-track']}>
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  className={`${styles.pill} ${activeDiff === d ? styles.active : ''}`}
                  onClick={() => setActiveDiff(d)}
                  aria-pressed={activeDiff === d}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className={styles['search-wrap']}>
            <div className={styles['filter-label']}>关键词 <span className={styles['filter-id']}>[SEARCH]</span></div>
            <div className={styles['search-box']}>
              <img src={searchIcon} className={styles['search-icon-svg']} alt="" aria-hidden="true" />
              <input
                type="text"
                placeholder="搜索题目或 ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="搜索题目"
              />
            </div>
          </div>
        </div>
      </div>

      <div className={styles['result-info']}>
        <span>{loading ? '加载中...' : `${filtered.length} 道题目`}</span>
        {error && <span style={{ color: 'var(--danger, #d45c5c)', marginLeft: '1rem' }}>{error}</span>}
      </div>
      <div className={styles['questions-grid']}>
        {filtered.map((q) => (
          <div
            key={q.id}
            className={styles['question-card']}
            onClick={() => navigate(`/questions/${q.id}`)}
            role="button"
            tabIndex={0}
            aria-label={`${q.title}，难度 ${q.difficulty}，分类 ${q.category}`}
            onKeyDown={(e) => e.key === 'Enter' && navigate(`/questions/${q.id}`)}
          >
            <div className={styles['card-top']}>
              <span className={styles['card-id']}>[{q.id}]</span>
              <span className={`${styles.badge} ${styles[`diff-${diffColorMap[q.difficulty]}`]}`}>
                {q.difficulty}
              </span>
            </div>
            <h3 className={styles['card-title']}>{q.title}</h3>
            <div className={styles['card-bottom']}>
              <div className={styles['card-meta']}>
                <span className={styles['tag-cat']}>
                  {q.type === 'resume_specific' ? '专属' : q.type === 'coding' ? '编程题' : q.category}
                </span>
                <span className={styles['tag-count']} aria-hidden="true">·</span>
                <span className={styles['tag-count']}>练习 {q.count || 0} 次</span>
              </div>
              <button
                className={`${styles['star-btn']} ${collections.has(q.id) ? styles.starred : ''}`}
                aria-label={collections.has(q.id) ? '取消收藏' : '收藏此题'}
                onClick={(e) => toggleCollect(e, q.id)}
              >
                {collections.has(q.id) ? '★' : '☆'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {!loading && filtered.length === 0 && (
        <div className={styles['empty-state']}>
          <div className={styles['empty-icon']} aria-hidden="true">∅</div>
          <p>未找到符合条件的题目</p>
        </div>
      )}
    </div>
  )
}
