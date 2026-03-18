import { useNavigate, useParams } from 'react-router-dom'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts'
import styles from './SessionReport.module.css'

// Mock data for a detailed session report
const reportData = {
  id: 1,
  type: 'lgd',
  topic: '如何提升远程团队的协作效率',
  date: '2026-03-16 14:30',
  duration: '45min',
  overallScore: 85,
  rank: 'A',
  dimensions: [
    { axis: '表达力', value: 88, comment: '语言流畅，观点阐述清晰' },
    { axis: '逻辑力', value: 82, comment: '论证有条理，但部分推理跳跃' },
    { axis: '领导力', value: 78, comment: '有主动推进讨论，但时机把握可优化' },
    { axis: '协作力', value: 90, comment: '积极回应他人观点，建设性互动' },
    { axis: '应变力', value: 80, comment: '面对反驳能灵活调整' },
  ],
  transcript: [
    { time: '00:32', speaker: 'user', text: '我认为远程协作的核心问题在于信息不对称和沟通成本高。', tag: null },
    { time: '01:15', speaker: 'ai-破冰者', text: '说得对，我补充一点——时区差异也是个大问题。', tag: null },
    { time: '02:03', speaker: 'user', text: '嗯...那个...我觉得这个...可以通过异步沟通工具来解决。', tag: 'filler', tagText: '口癖: "嗯...那个..."' },
    { time: '02:45', speaker: 'ai-杠精', text: '但异步沟通会降低紧急决策效率，你怎么看？', tag: null },
    { time: '03:20', speaker: 'user', text: '这确实是个好问题。我觉得可以区分紧急和非紧急事项，紧急的用同步会议，非紧急的用异步文档。', tag: 'good', tagText: '逻辑清晰，有分类思维' },
    { time: '04:10', speaker: 'ai-逻辑王', text: '那如何界定"紧急"的标准？不同成员的紧急程度认知不同。', tag: null },
    { time: '04:55', speaker: 'user', text: '可以制定一个分级响应机制，比如 P0 级别半小时内必须回应，P1 级别四小时内回应。', tag: 'good', tagText: 'STAR法则 · 具体方案' },
    { time: '05:30', speaker: 'ai-和事佬', text: '这个方案很有操作性，团队也容易执行。', tag: null },
  ],
  goldenAnswer: {
    original: '我认为远程协作的核心问题在于信息不对称和沟通成本高。可以通过异步沟通工具来解决，同时区分紧急和非紧急事项。',
    improved: '远程协作的核心挑战可以从三个维度拆解：第一，信息不对称——建议引入"单一信息源"机制（如 Notion 知识库）；第二，沟通成本——对紧急度分级：P0 同步响应（30分钟内），P1 异步响应（4小时内），P2 周报归纳；第三，信任缺失——通过定期 1v1 和虚拟咖啡时间建立非正式沟通通道。这套框架在我上一段远程实习中帮助团队将跨时区项目交付效率提升了约 30%。',
  },
  softSkillReport: {
    score: 86,
    highlights: ['主动破冰意识强', '善于总结他人观点', '抗压能力良好'],
    improvements: ['减少口癖使用频率', '更果断地表达反对意见', '在总结阶段可更结构化'],
  },
  hardSkillReport: {
    score: 84,
    highlights: ['方案具有可操作性', '分级思维体现专业度', '数据意识较好'],
    improvements: ['引用更多实际案例支撑论点', '量化分析维度可加强', '行业知识储备可拓展'],
  },
}

function getScoreLevel(score) {
  if (score >= 90) return 'excellent'
  if (score >= 80) return 'good'
  if (score >= 70) return 'average'
  return 'low'
}

export default function SessionReport() {
  const navigate = useNavigate()
  const { id } = useParams()
  const data = reportData // In real app, fetch by id

  return (
    <div className={styles.report}>
      {/* Back Button */}
      <button className={styles['back-btn']} onClick={() => navigate('/analytics')}>
        ← 返回复盘中心
      </button>

      {/* Report Header */}
      <div className={styles.header}>
        <div className={styles['header-left']}>
          <span className={`${styles['type-badge']} ${styles[data.type]}`}>
            {data.type === 'lgd' ? 'LGD 群面' : data.type === 'interview' ? '模拟面试' : '简历优化'}
          </span>
          <h1>{data.topic}</h1>
          <div className={styles['header-meta']}>
            {data.date} · {data.duration}
          </div>
        </div>
        <div className={styles['header-right']}>
          <div className={`${styles['big-score']} ${styles[getScoreLevel(data.overallScore)]}`}>
            {data.overallScore}
          </div>
          <div className={styles['rank-badge']}>{data.rank}</div>
        </div>
      </div>

      {/* Dual-Track Report Grid */}
      <div className={styles['dual-grid']}>
        {/* Soft Skills */}
        <div className={styles.panel}>
          <div className={styles['panel-header']}>
            <span className={styles['panel-title']}>软素质评估</span>
            <span className={`${styles['panel-score']} ${styles[getScoreLevel(data.softSkillReport.score)]}`}>
              {data.softSkillReport.score}
            </span>
          </div>
          <div className={styles['eval-section']}>
            <div className={styles['eval-label']}>亮点</div>
            {data.softSkillReport.highlights.map((h, i) => (
              <div key={i} className={`${styles['eval-item']} ${styles.positive}`}>✓ {h}</div>
            ))}
          </div>
          <div className={styles['eval-section']}>
            <div className={styles['eval-label']}>待提升</div>
            {data.softSkillReport.improvements.map((h, i) => (
              <div key={i} className={`${styles['eval-item']} ${styles.negative}`}>△ {h}</div>
            ))}
          </div>
        </div>

        {/* Hard Skills */}
        <div className={styles.panel}>
          <div className={styles['panel-header']}>
            <span className={styles['panel-title']}>硬技能评估</span>
            <span className={`${styles['panel-score']} ${styles[getScoreLevel(data.hardSkillReport.score)]}`}>
              {data.hardSkillReport.score}
            </span>
          </div>
          <div className={styles['eval-section']}>
            <div className={styles['eval-label']}>亮点</div>
            {data.hardSkillReport.highlights.map((h, i) => (
              <div key={i} className={`${styles['eval-item']} ${styles.positive}`}>✓ {h}</div>
            ))}
          </div>
          <div className={styles['eval-section']}>
            <div className={styles['eval-label']}>待提升</div>
            {data.hardSkillReport.improvements.map((h, i) => (
              <div key={i} className={`${styles['eval-item']} ${styles.negative}`}>△ {h}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Radar + Dimension Scores */}
      <div className={styles.panel}>
        <div className={styles['panel-header']}>
          <span className={styles['panel-title']}>五维评估</span>
        </div>
        <div className={styles['dimension-grid']}>
          <div className={styles['radar-wrap']}>
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={data.dimensions} outerRadius="72%">
                <PolarGrid stroke="rgba(226,224,229,0.08)" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fill: 'rgba(226,224,229,0.6)', fontSize: 11, fontFamily: "'Space Mono', monospace" }}
                />
                <Radar
                  dataKey="value"
                  stroke="#9b6fc7"
                  fill="#9b6fc7"
                  fillOpacity={0.15}
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#9b6fc7', strokeWidth: 0 }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className={styles['dim-comments']}>
            {data.dimensions.map((d) => (
              <div key={d.axis} className={styles['dim-row']}>
                <div className={styles['dim-top']}>
                  <span className={styles['dim-name']}>{d.axis}</span>
                  <span className={`${styles['dim-score']} ${styles[getScoreLevel(d.value)]}`}>{d.value}</span>
                </div>
                <div className={styles['dim-comment']}>{d.comment}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Transcript */}
      <div className={styles.panel}>
        <div className={styles['panel-header']}>
          <span className={styles['panel-title']}>逐字稿回放</span>
          <span className={styles['panel-badge']}>智能批注</span>
        </div>
        <div className={styles['transcript-list']}>
          {data.transcript.map((t, i) => (
            <div key={i} className={`${styles['transcript-row']} ${t.tag ? styles[`tag-${t.tag}`] : ''}`}>
              <span className={styles['transcript-time']}>{t.time}</span>
              <span className={`${styles['transcript-speaker']} ${t.speaker === 'user' ? styles.self : ''}`}>
                {t.speaker === 'user' ? '你' : t.speaker.replace('ai-', '')}
              </span>
              <div className={styles['transcript-body']}>
                <div className={styles['transcript-text']}>{t.text}</div>
                {t.tag && (
                  <div className={`${styles['transcript-tag']} ${styles[t.tag]}`}>
                    {t.tagText}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Golden Answer */}
      <div className={styles.panel}>
        <div className={styles['panel-header']}>
          <span className={styles['panel-title']}>满分话术重构</span>
          <span className={styles['panel-badge']}>Golden Answer</span>
        </div>
        <div className={styles['golden-compare']}>
          <div className={styles['golden-col']}>
            <div className={styles['golden-label']}>你的回答</div>
            <div className={`${styles['golden-text']} ${styles.original}`}>
              {data.goldenAnswer.original}
            </div>
          </div>
          <div className={styles['golden-sep']}>
            <span>→</span>
          </div>
          <div className={styles['golden-col']}>
            <div className={styles['golden-label']}>STAR 重构版</div>
            <div className={`${styles['golden-text']} ${styles.improved}`}>
              {data.goldenAnswer.improved}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
