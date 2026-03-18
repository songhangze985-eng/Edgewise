import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './InterviewLobby.module.css'

const interviewTypes = [
  {
    id: 'structured',
    icon: '⬡',
    name: '结构化面试',
    desc: '标准化题目 · 逐题作答 · 评分对照',
    color: 'purple',
  },
  {
    id: 'semi',
    icon: '◈',
    name: '半结构化面试',
    desc: '灵活追问 · 深度挖掘 · STAR 法则',
    color: 'blue',
  },
  {
    id: 'behavioral',
    icon: '◇',
    name: '行为面试',
    desc: '情景模拟 · 压力测试 · 应变能力',
    color: 'red',
  },
]

const difficultyLevels = [
  { id: 'easy', label: '温和', desc: '引导式提问，适合新手', color: 'success' },
  { id: 'medium', label: '中立', desc: '标准面试节奏与压力', color: 'warning' },
  { id: 'hard', label: '高压', desc: '追问打断，极限施压', color: 'danger' },
]

const positions = [
  '产品经理', '软件工程师', '数据分析师', '市场营销',
  '战略咨询', '投资银行', '人力资源', '运营管理',
]

export default function InterviewLobby() {
  const navigate = useNavigate()
  const [selectedType, setSelectedType] = useState('structured')
  const [difficulty, setDifficulty] = useState('medium')
  const [position, setPosition] = useState('')
  const [customPosition, setCustomPosition] = useState('')

  const handleStart = () => {
    navigate('/interview/room/new')
  }

  return (
    <div className={styles.lobby}>
      <div className={styles['page-header']}>
        <h1>1V1 模拟面试</h1>
        <div className={styles['header-sub']}>Structured Interview · Session Setup</div>
      </div>

      {/* Interview Type Selection */}
      <div className={styles.section}>
        <div className={styles['section-label']}>面试类型</div>
        <div className={styles['type-grid']}>
          {interviewTypes.map((t) => (
            <button
              key={t.id}
              className={`${styles['type-card']} ${selectedType === t.id ? styles.selected : ''} ${styles[t.color]}`}
              onClick={() => setSelectedType(t.id)}
            >
              <div className={`hw-inset ${styles['type-icon']}`} aria-hidden="true">{t.icon}</div>
              <div className={styles['type-info']}>
                <div className={styles['type-name']}>{t.name}</div>
                <div className={styles['type-desc']}>{t.desc}</div>
              </div>
              {selectedType === t.id && <div className={styles['type-check']}>✓</div>}
            </button>
          ))}
        </div>
      </div>

      {/* Difficulty Selection */}
      <div className={styles.section}>
        <div className={styles['section-label']}>考官难度</div>
        <div className={styles['diff-row']}>
          {difficultyLevels.map((d) => (
            <button
              key={d.id}
              className={`${styles['diff-btn']} ${difficulty === d.id ? styles.selected : ''} ${styles[d.color]}`}
              onClick={() => setDifficulty(d.id)}
            >
              <span className={styles['diff-label']}>{d.label}</span>
              <span className={styles['diff-desc']}>{d.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Position Selection */}
      <div className={styles.section}>
        <div className={styles['section-label']}>目标岗位</div>
        <div className={styles['pos-grid']}>
          {positions.map((p) => (
            <button
              key={p}
              className={`${styles['pos-chip']} ${position === p ? styles.selected : ''}`}
              onClick={() => { setPosition(p); setCustomPosition('') }}
            >
              {p}
            </button>
          ))}
        </div>
        <input
          type="text"
          className={styles['pos-input']}
          placeholder="或输入自定义岗位..."
          value={customPosition}
          onChange={(e) => { setCustomPosition(e.target.value); setPosition('') }}
        />
      </div>

      {/* Session Info Summary */}
      <div className={styles['summary-bar']}>
        <div className={styles['summary-item']}>
          <span className={styles['summary-label']}>类型</span>
          <span className={styles['summary-value']}>
            {interviewTypes.find((t) => t.id === selectedType)?.name}
          </span>
        </div>
        <div className={styles['summary-sep']} />
        <div className={styles['summary-item']}>
          <span className={styles['summary-label']}>难度</span>
          <span className={styles['summary-value']}>
            {difficultyLevels.find((d) => d.id === difficulty)?.label}
          </span>
        </div>
        <div className={styles['summary-sep']} />
        <div className={styles['summary-item']}>
          <span className={styles['summary-label']}>时长</span>
          <span className={styles['summary-value']}>约 20-30 min</span>
        </div>
        <div className={styles['summary-sep']} />
        <div className={styles['summary-item']}>
          <span className={styles['summary-label']}>题目</span>
          <span className={styles['summary-value']}>5-8 题</span>
        </div>
      </div>

      {/* Start Button */}
      <div className={styles['start-section']}>
        <button className={styles['start-btn']} onClick={handleStart} aria-label="开始模拟面试">
          开始面试
        </button>
        <div className={styles['start-hint']}>
          面试将消耗约 500 积分 · 支持中途退出
        </div>
      </div>
    </div>
  )
}
