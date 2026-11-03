import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getQuestion } from '../../api/questions'
import { createSession } from '../../api/interview'
import { createCodingSession } from '../../api/coding'
import { getErrorMessage } from '../../api/client'
import { showToast } from '../../stores/toastStore'
import PageBar from '../../components/ui/PageBar'
import styles from './QuestionDetail.module.css'

const diffColorMap = { '简单': 'easy', '中等': 'medium', '困难': 'hard' }

export default function QuestionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [question, setQuestion] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [userAnswer, setUserAnswer] = useState('')
  const [showStar, setShowStar] = useState(false)
  const [showIdeal, setShowIdeal] = useState(false)
  const [hint, setHint] = useState('')
  const [practiceLoading, setPracticeLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getQuestion(id)
      .then((data) => {
        if (!cancelled) {
          setQuestion(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err, '题目加载失败'))
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return <div className={styles.page}><p className={styles['no-data']}>加载中...</p></div>
  }

  if (error || !question) {
    return (
      <div className={styles.page}>
        <button className={styles['back-btn']} onClick={() => navigate('/questions')}>← 返回题库</button>
        <p className={styles['no-data']}>{error || '题目不存在'}</p>
      </div>
    )
  }

  const handlePracticeQuestion = async () => {
    setPracticeLoading(true)
    try {
      if (question.type === 'coding') {
        const session = await createCodingSession({
          mode: 'interview',
          question_id: question.id,
          source: 'question_bank',
        })
        navigate(`/coding/${session.id}`)
        return
      }
      const session = await createSession({
        type: 'interview',
        topic: `题库单题 · ${question.title.slice(0, 24)}`,
        position: '题库练习',
        difficulty: { 简单: 'easy', 中等: 'medium', 困难: 'hard' }[question.difficulty] || 'medium',
        metadata: {
          interview_type: 'structured',
          question_ids: [question.id],
          source: 'question_bank',
        },
      })
      navigate(`/interview/room/${session.id}`)
    } catch (err) {
      showToast(getErrorMessage(err, '创建练习会话失败'), 'error')
    } finally {
      setPracticeLoading(false)
    }
  }

  const star = question.star || {}
  const history = question.history || []
  const related = question.related || []
  const isOpenQuestion = question.type === 'general' || question.type === 'resume_specific'

  return (
    <div className={styles.page}>
      <button
        className={styles['back-btn']}
        onClick={() => navigate('/questions')}
        aria-label="返回题库列表"
      >
        ← 返回题库
      </button>
      <PageBar
        title={question.title}
        context={`${question.category} · ${question.difficulty}`}
      />

      <div className={styles['content-grid']}>
        <div className={styles['main-col']}>
          <section className={`hw-panel ${styles.section}`}>
            <div className={styles['section-head']}>
              <h3>我的回答</h3>
              <span className={styles['section-id']}>[PRACTICE]</span>
            </div>
            <textarea
              className={styles.textarea}
              placeholder="在这里输入你的回答，尝试使用 STAR 法则组织你的答案..."
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              rows={8}
              aria-label="你的回答"
            />
            <div className={styles['action-bar']}>
              <button
                type="button"
                className={styles['submit-btn']}
                disabled={practiceLoading}
                onClick={handlePracticeQuestion}
              >
                {practiceLoading ? '创建中…' : '用这题练习'}
              </button>
              <button
                type="button"
                className={styles['secondary-btn']}
                disabled={!userAnswer.trim()}
                onClick={() => setHint('评分为规则估算，仅供参考 · 请对照 STAR 与黄金答案自评')}
              >
                本地自评
              </button>
              <span className={styles['word-count']}>{userAnswer.length} 字</span>
            </div>
            {hint && <p className={styles['no-data']}>{hint}</p>}
          </section>

          {isOpenQuestion && (
            <section className={`hw-panel ${styles.section}`}>
              <div className={styles['section-head']}>
                <h3>考察点</h3>
              </div>
              <p className={styles['no-data']}>{question.assessment_points || '考察表达与经历深度。'}</p>
              <div className={styles['section-head']}>
                <h3>回答建议结构</h3>
              </div>
              <p className={styles['no-data']}>{question.answer_structure || '背景 → 行动 → 结果。'}</p>
              {(question.follow_ups || []).length > 0 && (
                <>
                  <div className={styles['section-head']}>
                    <h3>追问模板</h3>
                  </div>
                  <ul className={styles['no-data']}>
                    {question.follow_ups.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          {!isOpenQuestion && (
          <section className={`hw-panel ${styles.section}`}>
            <button
              className={styles['collapse-head']}
              onClick={() => setShowStar(!showStar)}
              aria-expanded={showStar}
              aria-controls="star-content"
            >
              <h3>参考思路 (STAR 法则)</h3>
              <span className={styles['toggle-icon']} aria-hidden="true">{showStar ? '−' : '+'}</span>
            </button>
            {showStar && (
              <div id="star-content" className={styles['star-grid']}>
                {[
                  { key: 'S', label: 'Situation (情境)', text: star.s },
                  { key: 'T', label: 'Task (任务)', text: star.t },
                  { key: 'A', label: 'Action (行动)', text: star.a },
                  { key: 'R', label: 'Result (结果)', text: star.r },
                ].map((item) => (
                  <div key={item.key} className={styles['star-item']}>
                    <div className={styles['star-letter']}>{item.key}</div>
                    <div className={styles['star-body']}>
                      <div className={styles['star-label']}>{item.label}</div>
                      <p className={styles['star-text']}>{item.text || '暂无参考'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          )}

          {!isOpenQuestion && (
          <section className={`hw-panel ${styles.section}`}>
            <button
              className={styles['collapse-head']}
              onClick={() => setShowIdeal(!showIdeal)}
              aria-expanded={showIdeal}
              aria-controls="ideal-content"
            >
              <h3>黄金答案</h3>
              <span className={styles['toggle-icon']} aria-hidden="true">{showIdeal ? '−' : '+'}</span>
            </button>
            {showIdeal && (
              <div id="ideal-content" className={styles['ideal-content']}>
                <p>{question.ideal || '暂无黄金答案'}</p>
              </div>
            )}
          </section>
          )}
        </div>

        <aside className={styles.sidebar}>
          <div className={`hw-panel ${styles['side-panel']}`}>
            <div className={styles['section-head']}>
              <h3>练习记录</h3>
              <span className={styles['section-id']}>[LOG]</span>
            </div>
            <div className={styles['history-list']}>
              {history.map((h, i) => (
                <div key={i} className={styles['history-item']}>
                  <div className={styles['history-top']}>
                    <span className={styles['history-date']}>{h.date}</span>
                    <span className={styles['history-score']}>{h.score}</span>
                  </div>
                  <p className={styles['history-comment']}>{h.comment}</p>
                </div>
              ))}
              {history.length === 0 && (
                <p className={styles['no-data']}>暂无练习记录</p>
              )}
            </div>
          </div>

          <div className={`hw-panel ${styles['side-panel']}`}>
            <div className={styles['section-head']}>
              <h3>相关题目</h3>
              <span className={styles['section-id']}>[REL]</span>
            </div>
            <div className={styles['related-list']}>
              {related.map((r) => (
                <div
                  key={r.id}
                  className={styles['related-item']}
                  onClick={() => navigate(`/questions/${r.id}`)}
                  role="button"
                  tabIndex={0}
                  aria-label={`相关题目: ${r.title}`}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/questions/${r.id}`)}
                >
                  <span className={styles['related-id']}>[{r.id}]</span>
                  <span className={styles['related-title']}>{r.title}</span>
                  <span className={styles['related-arrow']} aria-hidden="true">→</span>
                </div>
              ))}
              {related.length === 0 && <p className={styles['no-data']}>暂无相关题目</p>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
