import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './QuestionBank.module.css'
import searchIcon from '../../assets/icons/search.svg'

const CATEGORIES = ['全部', '行为题', '逻辑题', '案例分析', '专业知识', '压力题', '创意题']
const DIFFICULTIES = ['全部', '简单', '中等', '困难']

const MOCK_QUESTIONS = [
  { id: 'Q001', title: '请介绍一个你最成功的项目经验', category: '行为题', difficulty: '简单', count: 124, collected: true },
  { id: 'Q002', title: '如果你发现同事的工作失误，你会怎么做？', category: '行为题', difficulty: '中等', count: 89, collected: false },
  { id: 'Q003', title: '估算一下北京市一天消耗多少个鸡蛋', category: '案例分析', difficulty: '困难', count: 56, collected: true },
  { id: 'Q004', title: '介绍一下 React 19 的新特性及其对开发范式的影响', category: '专业知识', difficulty: '中等', count: 210, collected: false },
  { id: 'Q005', title: '如果你的领导坚持一个错误的决定，你如何处理？', category: '压力题', difficulty: '困难', count: 45, collected: false },
  { id: 'Q006', title: '为什么井盖是圆的？', category: '逻辑题', difficulty: '简单', count: 340, collected: true },
  { id: 'Q007', title: '设计一个面向视障人群的打车软件方案', category: '案例分析', difficulty: '困难', count: 78, collected: false },
  { id: 'Q008', title: '如何优化一个高并发系统的响应时间？', category: '专业知识', difficulty: '困难', count: 112, collected: true },
  { id: 'Q009', title: '如果你要在火星上开一家咖啡店，你会考虑哪些因素？', category: '创意题', difficulty: '困难', count: 34, collected: false },
  { id: 'Q010', title: '说说你对分布式事务一致性问题的理解', category: '专业知识', difficulty: '中等', count: 156, collected: false },
  { id: 'Q011', title: '面对极不合理的需求，你如何说服产品经理？', category: '行为题', difficulty: '中等', count: 92, collected: true },
  { id: 'Q012', title: '如果给你一个亿的预算，你会如何创业？', category: '创意题', difficulty: '困难', count: 67, collected: false },
  { id: 'Q013', title: '一列火车以 60km/h 行驶，迎面飞来一只苍蝇...', category: '逻辑题', difficulty: '简单', count: 201, collected: false },
  { id: 'Q014', title: '描述一个你失败的经历以及从中学到了什么', category: '行为题', difficulty: '简单', count: 178, collected: true },
  { id: 'Q015', title: '为什么我不应该录用你？', category: '压力题', difficulty: '困难', count: 63, collected: false },
  { id: 'Q016', title: '如何在一周内将一个新产品的 DAU 从 0 做到 10 万？', category: '案例分析', difficulty: '困难', count: 41, collected: false },
]

const diffColorMap = { '简单': 'easy', '中等': 'medium', '困难': 'hard' }

export default function QuestionBank() {
  const navigate = useNavigate()
  const [activeCategory, setActiveCategory] = useState('全部')
  const [activeDiff, setActiveDiff] = useState('全部')
  const [search, setSearch] = useState('')
  const [collections, setCollections] = useState(
    () => new Set(MOCK_QUESTIONS.filter((q) => q.collected).map((q) => q.id))
  )

  const filtered = useMemo(() => {
    return MOCK_QUESTIONS.filter((q) => {
      const matchCat = activeCategory === '全部' || q.category === activeCategory
      const matchDiff = activeDiff === '全部' || q.difficulty === activeDiff
      const matchSearch = !search || q.title.includes(search) || q.id.includes(search.toUpperCase())
      return matchCat && matchDiff && matchSearch
    })
  }, [activeCategory, activeDiff, search])

  const toggleCollect = (e, id) => {
    e.stopPropagation()
    setCollections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className={styles.page}>
      {/* Page Header */}
      <div className={styles['page-header']}>
        <div>
          <h1>面试题库</h1>
          <div className={styles['header-sub']}>Question Bank · 题型精选 · 结构化突破</div>
        </div>
        <div className={`hw-inset ${styles['header-stat']}`}>
          <span className={styles['stat-label']}>已练习</span>
          <span className={styles['stat-value']}>42 / {MOCK_QUESTIONS.length}</span>
        </div>
      </div>

      {/* Filters */}
      <div className={styles['filter-section']}>
        {/* Category Tabs */}
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

        {/* Difficulty + Search Row */}
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

      {/* Question Grid */}
      <div className={styles['result-info']}>
        <span>{filtered.length} 道题目</span>
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
                <span className={styles['tag-cat']}>{q.category}</span>
                <span className={styles['tag-count']} aria-hidden="true">·</span>
                <span className={styles['tag-count']}>练习 {q.count} 次</span>
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

      {filtered.length === 0 && (
        <div className={styles['empty-state']}>
          <div className={styles['empty-icon']} aria-hidden="true">∅</div>
          <p>未找到符合条件的题目</p>
        </div>
      )}
    </div>
  )
}
