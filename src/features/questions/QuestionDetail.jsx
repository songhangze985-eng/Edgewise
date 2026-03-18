import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import styles from './QuestionDetail.module.css'

const QUESTIONS_DB = {
  Q001: {
    title: '请介绍一个你最成功的项目经验',
    category: '行为题',
    difficulty: '简单',
    star: {
      s: '某知名互联网公司，负责双十一大促期间的订单履约系统重构。',
      t: '旧系统在高并发下响应慢，且代码维护成本高，需要完成全链路压测与平滑迁移。',
      a: '主导了微服务拆分，引入消息队列削峰填谷，并制定了灰度发布策略。组织了 3 轮全链路压测，持续优化瓶颈接口。',
      r: '系统吞吐量提升 300%，双十一当天零事故，个人获得年度优秀项目奖。',
    },
    ideal: '回答此题关键在于体现 Owner 意识和结果导向。首先简述背景（Situation），强调任务（Task）的艰巨性，详细拆解你的行动（Action）中的思考逻辑与取舍，最后用具体量化的结果（Result）作为支撑。建议突出你在压力下的决策能力和跨团队协调能力。',
    history: [
      { date: '2026-03-10', score: 85, comment: '逻辑清晰，但结果部分可以更量化。' },
      { date: '2026-03-12', score: 92, comment: '非常好，Action 部分补充了具体的选型对比。' },
    ],
    related: [
      { id: 'Q011', title: '面对极不合理的需求，你如何说服产品经理？' },
      { id: 'Q002', title: '如果你发现同事的工作失误，你会怎么做？' },
      { id: 'Q014', title: '描述一个你失败的经历以及从中学到了什么' },
    ],
  },
}

const FALLBACK = QUESTIONS_DB.Q001

const diffColorMap = { '简单': 'easy', '中等': 'medium', '困难': 'hard' }

export default function QuestionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const question = QUESTIONS_DB[id] || FALLBACK
  const displayId = id || 'Q001'

  const [userAnswer, setUserAnswer] = useState('')
  const [showStar, setShowStar] = useState(false)
  const [showIdeal, setShowIdeal] = useState(false)

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <button
          className={styles['back-btn']}
          onClick={() => navigate('/questions')}
          aria-label="返回题库列表"
        >
          ← 返回题库
        </button>
        <div className={styles['header-info']}>
          <span className={styles['question-id']}>[{displayId}]</span>
          <h1>{question.title}</h1>
          <div className={styles['header-badges']}>
            <span className={styles['badge-cat']}>{question.category}</span>
            <span className={`${styles.badge} ${styles[`diff-${diffColorMap[question.difficulty]}`]}`}>
              {question.difficulty}
            </span>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className={styles['content-grid']}>
        {/* Main Column */}
        <div className={styles['main-col']}>
          {/* My Answer */}
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
              <button className={styles['submit-btn']} disabled={!userAnswer.trim()}>
                提交 AI 分析
              </button>
              <span className={styles['word-count']}>{userAnswer.length} 字</span>
            </div>
          </section>

          {/* STAR Guide */}
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
                  { key: 'S', label: 'Situation (情境)', text: question.star.s },
                  { key: 'T', label: 'Task (任务)', text: question.star.t },
                  { key: 'A', label: 'Action (行动)', text: question.star.a },
                  { key: 'R', label: 'Result (结果)', text: question.star.r },
                ].map((item) => (
                  <div key={item.key} className={styles['star-item']}>
                    <div className={styles['star-letter']}>{item.key}</div>
                    <div className={styles['star-body']}>
                      <div className={styles['star-label']}>{item.label}</div>
                      <p className={styles['star-text']}>{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Golden Answer */}
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
                <p>{question.ideal}</p>
              </div>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <aside className={styles.sidebar}>
          {/* Practice History */}
          <div className={`hw-panel ${styles['side-panel']}`}>
            <div className={styles['section-head']}>
              <h3>练习记录</h3>
              <span className={styles['section-id']}>[LOG]</span>
            </div>
            <div className={styles['history-list']}>
              {question.history.map((h, i) => (
                <div key={i} className={styles['history-item']}>
                  <div className={styles['history-top']}>
                    <span className={styles['history-date']}>{h.date}</span>
                    <span className={styles['history-score']}>{h.score}</span>
                  </div>
                  <p className={styles['history-comment']}>{h.comment}</p>
                </div>
              ))}
              {question.history.length === 0 && (
                <p className={styles['no-data']}>暂无练习记录</p>
              )}
            </div>
          </div>

          {/* Related Questions */}
          <div className={`hw-panel ${styles['side-panel']}`}>
            <div className={styles['section-head']}>
              <h3>相关题目</h3>
              <span className={styles['section-id']}>[REL]</span>
            </div>
            <div className={styles['related-list']}>
              {question.related.map((r) => (
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
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
