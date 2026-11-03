import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createSession } from '../../api/interview'
import { getErrorMessage } from '../../api/client'
import { trackResearchEvent } from '../../research/track'
import PageBar from '../../components/ui/PageBar'
import styles from './StructuredLobby.module.css'

const KINDS = [
  {
    id: 'civil',
    name: '公考结构化',
    desc: '五类题型各一题 · 总时长倒计时 · 可一次浏览全部题目',
    icon: '⬡',
  },
  {
    id: 'soe',
    name: '国企银行半结构化',
    desc: '2–6 题限时作答 · 可选 1 层追问 · 更接近半结构化节奏',
    icon: '◈',
  },
]

const PANEL_OPTIONS = [3, 5, 7]

export default function StructuredLobby() {
  const navigate = useNavigate()
  const [kind, setKind] = useState('civil')
  const [totalMinutes, setTotalMinutes] = useState(20)
  const [questionCount, setQuestionCount] = useState(4)
  const [perQuestionMin, setPerQuestionMin] = useState(4)
  const [panelSize, setPanelSize] = useState(5)
  const [showAllQuestions, setShowAllQuestions] = useState(true)
  const [enableFollowups, setEnableFollowups] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleStart = async () => {
    setLoading(true)
    setError('')
    const structured =
      kind === 'civil'
        ? {
            kind: 'civil',
            total_minutes: Math.max(15, Math.min(25, Number(totalMinutes) || 20)),
            panel_size: panelSize,
            show_all_questions: showAllQuestions,
          }
        : {
            kind: 'soe',
            total_minutes: Math.max(15, Math.min(40, Number(questionCount) * Number(perQuestionMin) || 16)),
            panel_size: panelSize,
            question_count: Math.max(2, Math.min(6, Number(questionCount) || 4)),
            per_question_minutes: Math.max(2, Math.min(8, Number(perQuestionMin) || 4)),
            enable_followups: enableFollowups,
          }

    try {
      const session = await createSession({
        type: 'interview',
        difficulty: 'medium',
        position: kind === 'civil' ? '公考结构化练习' : '国企银行半结构化练习',
        topic: kind === 'civil' ? '公考结构化模拟' : '国企银行半结构化模拟',
        rounds: [
          {
            name: kind === 'civil' ? '公考 · 结构化' : '国企银行 · 半结构化',
            question_count: kind === 'civil' ? 5 : structured.question_count,
            mix: { general: 0, resume_specific: 0, professional: 0 },
            type: 'structured',
            reverse_qa: false,
          },
        ],
        metadata: {
          mode: 'structured',
          interview_type: 'structured',
          followup_intensity: kind === 'soe' && enableFollowups ? '1' : 'off',
          structured,
          source: 'structured_zone',
        },
      })
      trackResearchEvent('structured.started', {
        session_id: session.id,
        kind,
        panel_size: panelSize,
        total_minutes: structured.total_minutes,
      })
      navigate(`/interview/structured/${session.id}`)
    } catch (err) {
      setError(getErrorMessage(err, '创建结构化面试失败'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.lobby}>
      <PageBar title="结构化面试专区" />

      <p className={styles.note}>
        题目均为<strong>谈锋自编练习题</strong>，不提供真实公考真题或标准答案；界面评分为
        <strong>模拟考官打分</strong>（去掉最高最低后取平均），仅供练习参考。
      </p>

      <div className={styles.section}>
        <div className={styles['section-label']}>选择类型</div>
        <div className={styles['kind-grid']}>
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              className={`${styles['kind-card']} ${kind === k.id ? styles.selected : ''}`}
              onClick={() => setKind(k.id)}
            >
              <span className={styles['kind-icon']} aria-hidden="true">
                {k.icon}
              </span>
              <span className={styles['kind-name']}>{k.name}</span>
              <span className={styles['kind-desc']}>{k.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles['section-label']}>模拟考官人数</div>
        <div className={styles['chip-row']}>
          {PANEL_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              className={`${styles.chip} ${panelSize === n ? styles['chip-active'] : ''}`}
              onClick={() => setPanelSize(n)}
            >
              {n} 人
            </button>
          ))}
        </div>
      </div>

      {kind === 'civil' && (
        <div className={styles.section}>
          <div className={styles['section-label']}>整场时长（15–25 分钟）</div>
          <input
            type="number"
            min={15}
            max={25}
            className={styles.input}
            value={totalMinutes}
            onChange={(e) =>
              setTotalMinutes(Math.max(15, Math.min(25, Number(e.target.value) || 20)))
            }
          />
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={showAllQuestions}
              onChange={(e) => setShowAllQuestions(e.target.checked)}
            />
            开考前展示全部题目清单（公考常见「一题本」练习方式）
          </label>
        </div>
      )}

      {kind === 'soe' && (
        <div className={styles.section}>
          <div className={styles['section-label']}>题量与单题时长</div>
          <p className={styles.hint}>
            题数
            <input
              type="number"
              min={2}
              max={6}
              className={styles.num}
              value={questionCount}
              onChange={(e) =>
                setQuestionCount(Math.max(2, Math.min(6, Number(e.target.value) || 4)))
              }
            />
            · 每题
            <input
              type="number"
              min={2}
              max={8}
              className={styles.num}
              value={perQuestionMin}
              onChange={(e) =>
                setPerQuestionMin(Math.max(2, Math.min(8, Number(e.target.value) || 4)))
              }
            />
            分钟
          </p>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={enableFollowups}
              onChange={(e) => setEnableFollowups(e.target.checked)}
            />
            开启 1 层半结构化追问（不占题量）
          </label>
        </div>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.back} onClick={() => navigate('/interview/lobby')}>
          返回 1v1 大厅
        </button>
        <button type="button" className={styles.start} disabled={loading} onClick={handleStart}>
          {loading ? '创建中…' : '开始结构化练习'}
        </button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}
