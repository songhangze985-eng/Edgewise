import { useEffect, useState } from 'react'
import ShareDialog from '../share/ShareDialog'
import { useNavigate, useParams } from 'react-router-dom'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts'
import { getSession } from '../../api/interview'
import { getErrorMessage } from '../../api/client'
import { estimateAnswerScore } from '../../utils/ruleScoring'
import { LOGIC_DIMENSION_LABELS } from '../../utils/interviewRounds'
import { dimKeyFromAxisLabel, findWeakestDimension } from '../../utils/userStats'
import useSessionStore from '../../stores/sessionStore'
import PageBar from '../../components/ui/PageBar'
import { RULE_SCORE_NOTE, SHOW_LLM_PLACEHOLDER } from '../../config/report'
import { trackResearchEvent } from '../../research/track'
import DeliveryMetrics from './DeliveryMetrics'
import PresenceMetrics from './PresenceMetrics'
import {
  scoreLevel as getScoreLevel,
  scoreGradeLabel,
  formatScoreGrade,
} from '../../utils/scoreGrades'
import SaveStoryDialog from '../stories/SaveStoryDialog'
import styles from './SessionReport.module.css'

const typeLabels = { lgd: 'LGD 群面', resume: '简历优化', interview: '模拟面试' }

const DIM_LABELS = {
  expression: '表达力',
  logic: '逻辑力',
  logicality: '逻辑性',
  leadership: '领导力',
  teamwork: '协作力',
  adaptability: '应变力',
}

const LOGIC_DIM_SUGGEST_GENERAL = {
  structure: 'G002',
  contribution: 'G002',
  evidence: 'G002',
  causality: 'G004',
  relevance: 'G003',
}

function normalizeTranscript(session) {
  const raw = session.metadata?.transcript || session.metadata?.messages || []
  if (!Array.isArray(raw) || !raw.length) return []

  return raw.map((entry, index) => {
    if (entry.text != null) {
      const role = entry.role || 'unknown'
      const speaker =
        entry.speaker ||
        (role === 'interviewer' ? '面试官' : role === 'user' ? '你' : role === 'system' ? '系统' : role)
      return {
        key: `${index}-${speaker}`,
        speaker,
        text: entry.text,
        role,
      }
    }
    if (entry.content != null) {
      return {
        key: `${index}-${entry.senderId || 'msg'}`,
        speaker: entry.senderName || (entry.isUser ? '你' : entry.isSystem ? '系统' : '成员'),
        text: entry.content,
        role: entry.isSystem ? 'system' : entry.isUser ? 'user' : 'agent',
      }
    }
    return {
      key: `row-${index}`,
      speaker: '未知',
      text: String(entry),
      role: 'unknown',
    }
  })
}

function firstUserAnswer(transcript) {
  const userLine = transcript.find((row) => row.role === 'user')
  return userLine?.text || null
}

export default function SessionReport() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [session, setSession] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [shareQuestion, setShareQuestion] = useState(null)
  const [saveStory, setSaveStory] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getSession(id)
      .then((data) => {
        if (!cancelled) {
          setSession(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err, '报告加载失败'))
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (!session) return
    trackResearchEvent('report.view', { session_id: session.id, type: session.type })
    const status = session.score_status || session.metadata?.score_status
    if (status === 'insufficient') {
      trackResearchEvent('report.insufficient', { session_id: session.id })
    }
  }, [session])

  if (loading) {
    return <div className={styles.report}><p>加载中...</p></div>
  }

  if (error || !session) {
    return (
      <div className={styles.report}>
        <button className={styles['back-btn']} onClick={() => navigate('/analytics')}>← 返回复盘中心</button>
        <p>{error || '会话不存在'}</p>
      </div>
    )
  }

  const dims = session.metadata?.dimensions || {}
  const sessionRounds = session.rounds || session.metadata?.rounds || []
  const roundScores = session.metadata?.round_scores || []
  const transcript = normalizeTranscript(session)
  const openQuestions = []
  const revisionItems = []
  const followupItems = []
  const caseItems = []
  for (const rnd of sessionRounds) {
    if (rnd.type === 'case' || rnd.type === 'system_design') {
      for (const q of rnd.questions || []) {
        if (Array.isArray(q.case_steps) && q.case_steps.length > 0) {
          caseItems.push({ roundName: rnd.name, roundType: rnd.type, ...q })
        }
      }
    }
    for (const q of rnd.questions || []) {
      if ((q.type === 'general' || q.type === 'resume_specific') && q.logic_score) {
        openQuestions.push({ roundName: rnd.name, ...q })
      }
      if (q.revision && (q.revision.initial_answer || q.revision.revised_answer)) {
        revisionItems.push({ roundName: rnd.name, ...q })
      }
      if (Array.isArray(q.followups) && q.followups.length > 0) {
        followupItems.push({ roundName: rnd.name, ...q })
      }
    }
  }
  let weakestLogicDim = null
  let weakestLogicScore = 101
  for (const item of openQuestions) {
    const parts = item.logic_score?.dimensions || {}
    for (const [key, val] of Object.entries(parts)) {
      const s = val?.score ?? 0
      if (s < weakestLogicScore) {
        weakestLogicScore = s
        weakestLogicDim = key
      }
    }
  }
  const scoreStatus = session.score_status || session.metadata?.score_status || 'ok'
  const insufficient = scoreStatus === 'insufficient'
  const presenceSummary = session.metadata?.presence_summary || null
  const isOneWay =
    session.metadata?.mode === 'one_way' || session.metadata?.interview_mode === 'one_way'
  const hideSaveStoryPrompt =
    session.metadata?.source === 'experiment_assigned_practice'
    || session.metadata?.research_session_source === 'experiment_assigned_practice'
  const lgdMetrics = session.metadata?.lgd_metrics || session.lgd_metrics || null
  const lgdTimeline = session.metadata?.lgd_timeline || lgdMetrics?.timeline || []
  const lgdPhaseLabels = {
    reading: '阅读',
    personal_statement: '个人陈述',
    free_discussion: '自由讨论',
    summary_report: '总结汇报',
  }
  const userSample = firstUserAnswer(transcript)
  const ruleNote = RULE_SCORE_NOTE
  const sampleEval = userSample ? estimateAnswerScore(userSample) : null
  const dimensions = Object.entries(DIM_LABELS).map(([key, axis]) => {
    const raw = dims[key]
    const value = insufficient ? null : Math.round(raw ?? session.score ?? 0)
    let comment = ruleNote
    if (insufficient) {
      comment = sampleEval?.reason || `${ruleNote} · 有效作答不足，暂无综合评级`
    } else if (sampleEval && sampleEval.score <= 20 && (value ?? 0) <= 20) {
      comment = sampleEval.reason || ruleNote
    } else if ((value ?? 0) >= 80) {
      comment = `${ruleNote} · 该维度表现较好`
    } else if ((value ?? 0) >= 60) {
      comment = `${ruleNote} · 建议补充 STAR 结构与量化结果`
    } else {
      comment = `${ruleNote} · 建议先对照题库参考思路练习`
    }
    return { axis, key, value, chartValue: value ?? 0, comment }
  })
  const overallScore = insufficient ? null : (session.score != null ? Math.round(session.score) : null)
  const radarData = useSessionStore.getState().radarData
  const weakest = findWeakestDimension(radarData)
  const weakestKey = weakest ? dimKeyFromAxisLabel(weakest.axis) : 'logic'
  const retrySearch = new URLSearchParams({
    type: session.metadata?.interview_type || 'structured',
    difficulty: session.difficulty || 'medium',
    position: session.position || '',
  })
  const softScore = insufficient
    ? null
    : Math.round(
        ((dims.expression ?? overallScore ?? 0) + (dims.teamwork ?? overallScore ?? 0) + (dims.adaptability ?? overallScore ?? 0)) / 3
      )
  const hardScore = insufficient
    ? null
    : Math.round(
        ((dims.logic ?? overallScore ?? 0) + (dims.leadership ?? overallScore ?? 0)) / 2
      )
  const goldenImprovedCopy = SHOW_LLM_PLACEHOLDER
    ? ''
    : sampleEval && sampleEval.score <= 20
      ? `规则估算：${sampleEval.reason}。建议对照下方 STAR 参考，用具体情境与行动重写。`
      : `${ruleNote} · 可对照 STAR 参考思路，将经历改写为「情境-任务-行动-结果」四段式话术。`

  return (
    <div className={styles.report}>
      <button className={styles['back-btn']} onClick={() => navigate('/analytics')}>
        ← 返回复盘中心
      </button>

      <PageBar
        title={session.topic || '练习会话'}
        context={`${typeLabels[session.type] || session.type} · ${session.date} ${session.time} · ${session.duration_minutes ? `${session.duration_minutes} 分钟` : '--'}`}
        actions={
          insufficient ? (
            <div className={styles['insufficient-badge']}>有效作答不足 · 暂无综合分</div>
          ) : (
            <>
              <div className={`${styles['big-score']} ${styles[getScoreLevel(overallScore ?? 0)]}`}>
                {overallScore ?? '--'}
                <span className={styles['score-grade-text']}>
                  {overallScore != null ? scoreGradeLabel(overallScore) : ''}
                </span>
              </div>
              <div className={styles['rank-badge']}>
                {overallScore != null ? formatScoreGrade(overallScore) : '—'}
              </div>
            </>
          )
        }
      />

      {insufficient && (
        <div className={styles['insufficient-panel']}>
          <p>{ruleNote}</p>
          <p>{sampleEval?.reason || '本次回答过短或过于简略，无法生成可靠的综合评级。请查看逐字稿与单题规则估算。'}</p>
        </div>
      )}

      {session.type === 'lgd' && lgdMetrics && (
        <div className={styles.panel}>
          <div className={styles['panel-header']}>
            <span className={styles['panel-title']}>群面指标（规则估算）</span>
            <span className={styles['panel-badge']}>{lgdMetrics.rule_version || 'lgd_v1'}</span>
          </div>
          <div className={styles['logic-dim-grid']}>
            <div className={styles['logic-dim-row']}>
              <span>发言占比</span>
              <span>{lgdMetrics.talk_share?.display ?? '未发言'}</span>
              <p>{lgdMetrics.comments?.talk_share}</p>
            </div>
            <div className={styles['logic-dim-row']}>
              <span>承接他人观点</span>
              <span>{lgdMetrics.built_on_others?.display ?? '未发言'}</span>
              <p>{lgdMetrics.comments?.built_on_others}</p>
            </div>
            <div className={styles['logic-dim-row']}>
              <span>推进进度</span>
              <span>{lgdMetrics.progress?.display ?? '未发言'}</span>
              <p>{lgdMetrics.comments?.progress}</p>
            </div>
            <div className={styles['logic-dim-row']}>
              <span>打断应对</span>
              <span>{lgdMetrics.interruptions?.display ?? '未发言'}</span>
              <p>{lgdMetrics.comments?.interruptions}</p>
            </div>
            <div className={styles['logic-dim-row']}>
              <span>汇报质量</span>
              <span>{lgdMetrics.reporter_quality?.display ?? '—'}</span>
              <p>{lgdMetrics.comments?.reporter}</p>
            </div>
          </div>
        </div>
      )}

      {session.type === 'lgd' && lgdTimeline.length > 0 && (
        <div className={styles.panel}>
          <div className={styles['panel-header']}>
            <span className={styles['panel-title']}>发言时间线</span>
            <span className={styles['panel-badge']}>{lgdTimeline.length} 段</span>
          </div>
          <div className={styles['transcript-list']}>
            {lgdTimeline.map((row) => (
              <div
                key={`${row.index}-${row.speaker}`}
                className={styles['transcript-row']}
                style={row.highlight ? { borderLeft: '3px solid #9b6fc7', paddingLeft: '0.5rem' } : undefined}
              >
                <span className={styles['transcript-time']}>
                  {lgdPhaseLabels[row.phase] || row.phase || '—'}
                </span>
                <span className={styles['transcript-speaker']}>{row.speaker}</span>
                <div className={styles['transcript-body']}>
                  <div className={styles['transcript-text']}>{row.preview || row.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles['dual-grid']}>
        <div className={styles.panel}>
          <div className={styles['panel-header']}>
            <span className={styles['panel-title']}>软素质评估</span>
            <span className={`${styles['panel-score']} ${insufficient ? '' : styles[getScoreLevel(softScore ?? 0)]}`}>
              {insufficient ? '--' : softScore}
            </span>
          </div>
          <div className={styles['eval-section']}>
            <div className={styles['eval-label']}>亮点</div>
            <div className={`${styles['eval-item']} ${styles.positive}`}>✓ 完成本次练习并提交评分</div>
            <div className={`${styles['eval-item']} ${styles.positive}`}>✓ 表达与协作维度已记录</div>
          </div>
          <div className={styles['eval-section']}>
            <div className={styles['eval-label']}>待提升</div>
            <div className={`${styles['eval-item']} ${styles.negative}`}>△ {ruleNote}</div>
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles['panel-header']}>
            <span className={styles['panel-title']}>硬技能评估</span>
            <span className={`${styles['panel-score']} ${insufficient ? '' : styles[getScoreLevel(hardScore ?? 0)]}`}>
              {insufficient ? '--' : hardScore}
            </span>
          </div>
          <div className={styles['eval-section']}>
            <div className={styles['eval-label']}>亮点</div>
            <div className={`${styles['eval-item']} ${styles.positive}`}>✓ 逻辑/领导力维度已落库</div>
          </div>
          <div className={styles['eval-section']}>
            <div className={styles['eval-label']}>待提升</div>
            <div className={`${styles['eval-item']} ${styles.negative}`}>△ {ruleNote}</div>
          </div>
        </div>
      </div>

      {caseItems.length > 0 && (
        <div className={styles.panel}>
          <div className={styles['panel-header']}>
            <span className={styles['panel-title']}>Case / 系统设计步骤</span>
            <span className={styles['panel-badge']}>规则清单 · 仅供参考</span>
          </div>
          {caseItems.map((item) => (
            <div key={item.id || item.title} className={styles['eval-section']}>
              <div className={styles['eval-label']}>
                {item.roundName}
                {' · '}
                {item.title}
                {typeof item.score === 'number' ? ` · 约 ${item.score} 分` : ''}
              </div>
              {(item.case_steps || []).map((step) => (
                <div key={step.step} className={styles['eval-item']}>
                  <strong>{step.step}</strong>
                  {typeof step.score === 'number' ? ` · ${step.score} 分` : ' · —'}
                  {(step.checklist || []).map((c) => (
                    <div key={c.id} className={c.passed ? styles.positive : styles.negative}>
                      {c.passed ? '✓' : '○'} {c.label}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {(sessionRounds.length > 0 || session.metadata?.delivery_summary) && (
        <div className={styles.panel}>
          <div className={styles['panel-header']}>
            <span className={styles['panel-title']}>表达指标</span>
            <span className={styles['panel-badge']}>本地 STT 时间戳 · 规则估算</span>
          </div>
          <DeliveryMetrics
            rounds={sessionRounds}
            summary={session.metadata?.delivery_summary}
            interviewLang={session.metadata?.lang}
          />
        </div>
      )}

      {isOneWay && (presenceSummary || sessionRounds.some((r) => (r.questions || []).some((q) => q.presence))) && (
        <div className={styles.panel}>
          <div className={styles['panel-header']}>
            <span className={styles['panel-title']}>镜头表现</span>
            <span className={styles['panel-badge']}>浏览器本地 WASM · 比例与建议</span>
          </div>
          <PresenceMetrics rounds={sessionRounds} summary={presenceSummary} />
        </div>
      )}

      {roundScores.length > 0 && (
        <div className={styles.panel}>
          <div className={styles['panel-header']}>
            <span className={styles['panel-title']}>各轮得分</span>
          </div>
          <div className={styles['round-score-grid']}>
            {roundScores.map((r) => (
              <div key={r.name} className={styles['round-score-card']}>
                <div className={styles['round-score-name']}>{r.name}</div>
                <div className={styles['round-score-value']}>{r.score ?? '--'}</div>
                <div className={styles['round-score-meta']}>完成 {r.completed_count ?? 0} 题</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {followupItems.length > 0 && (
        <div className={styles.panel}>
          <div className={styles['panel-header']}>
            <span className={styles['panel-title']}>动态追问链</span>
            <span className={styles['panel-badge']}>主答 → 追问（不计入题量）</span>
          </div>
          {followupItems.map((q) => (
            <div key={`fu-${q.roundName}-${q.id}`} className={styles['revision-block']}>
              <div className={styles['open-q-title']}>{q.roundName} · {q.title}</div>
              <div className={styles['revision-probe']}>
                <div className={styles['eval-label']}>主回答</div>
                <p className={styles['revision-probe-a']}>{q.answer || '—'}</p>
              </div>
              {(q.followups || []).map((fu, idx) => (
                <div key={`${q.id}-fu-${idx}`} className={styles['revision-probe']}>
                  <div className={styles['eval-label']}>
                    追问 {fu.layer ?? idx + 1}/3
                    {fu.gap_type ? ` · ${LOGIC_DIMENSION_LABELS[fu.gap_type] || fu.gap_type}` : ''}
                  </div>
                  <p className={styles['revision-probe-q']}>{fu.text}</p>
                  <p className={styles['revision-probe-a']}>
                    {fu.answer != null && String(fu.answer).trim() ? fu.answer : '—'}
                  </p>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {revisionItems.length > 0 && (
        <div className={styles.panel}>
          <div className={styles['panel-header']}>
            <span className={styles['panel-title']}>答案修订记录</span>
            <span className={styles['panel-badge']}>先答 → 反馈 → 修订/说明</span>
          </div>
          {revisionItems.map((q) => {
            const rev = q.revision || {}
            const before = rev.initial_answer || q.answer || ''
            const after = rev.revised_answer
            const decision = rev.decision
            return (
              <div key={`rev-${q.roundName}-${q.id}`} className={styles['revision-block']}>
                <div className={styles['open-q-title']}>{q.roundName} · {q.title}</div>
                {rev.feedback?.message && (
                  <p className={styles['revision-feedback']}>{rev.feedback.message}</p>
                )}
                <div className={styles['golden-compare']}>
                  <div className={styles['golden-col']}>
                    <div className={styles['golden-label']}>首次作答</div>
                    <div className={`${styles['golden-text']} ${styles.original}`}>{before || '—'}</div>
                  </div>
                  <div className={styles['golden-sep']}>
                    <span>{after ? '→' : '—'}</span>
                  </div>
                  <div className={styles['golden-col']}>
                    <div className={styles['golden-label']}>
                      {decision === 'revise' ? '修订后' : decision === 'decline' ? '未修订' : '修订状态'}
                    </div>
                    <div className={`${styles['golden-text']} ${styles.improved}`}>
                      {after || (decision === 'decline' ? `不修订：${rev.decline_reason || '—'}` : '—')}
                    </div>
                  </div>
                </div>
                {rev.probe_answer && (
                  <div className={styles['revision-probe']}>
                    <div className={styles['eval-label']}>变式追问</div>
                    <p className={styles['revision-probe-q']}>{rev.feedback?.probe_question}</p>
                    <p className={styles['revision-probe-a']}>{rev.probe_answer}</p>
                  </div>
                )}
                {(rev.initial_answer || rev.revised_answer || after) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <button
                      type="button"
                      className={styles['next-btn']}
                      onClick={() => setShareQuestion(q)}
                    >
                      生成修订卡
                    </button>
                    {!hideSaveStoryPrompt && (after || rev.revised_answer) ? (
                      <button
                        type="button"
                        className={styles['next-btn']}
                        onClick={() =>
                          setSaveStory({
                            text: after || rev.revised_answer,
                            title: q.title || `${q.roundName} · 经历`,
                            sourceSession: session.id,
                          })
                        }
                      >
                        存为故事
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {openQuestions.length > 0 && (
        <div className={styles.panel}>
          <div className={styles['panel-header']}>
            <span className={styles['panel-title']}>开放题 · 逻辑性维度</span>
            <span className={styles['panel-badge']}>{ruleNote}</span>
          </div>
          {openQuestions.map((q) => (
            <div key={`${q.roundName}-${q.id}`} className={styles['open-q-block']}>
              <div className={styles['open-q-title']}>{q.roundName} · {q.title}</div>
              <div className={styles['open-q-total']}>逻辑性估算：{q.logic_score?.total ?? '--'} / 100</div>
              <div className={styles['logic-dim-grid']}>
                {Object.entries(q.logic_score?.dimensions || {}).map(([key, val]) => (
                  <div key={key} className={styles['logic-dim-row']}>
                    <span>{LOGIC_DIMENSION_LABELS[key] || key}</span>
                    <span>{val.score}</span>
                    <p>{val.comment}</p>
                    <p className={styles['logic-suggestion']}>{val.suggestion}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.panel}>
        <div className={styles['panel-header']}>
          <span className={styles['panel-title']}>能力雷达（含逻辑性）</span>
        </div>
        <div className={styles['dimension-grid']}>
          <div className={styles['radar-wrap']}>
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={dimensions} outerRadius="72%">
                <PolarGrid stroke="rgba(226,224,229,0.08)" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fill: 'rgba(226,224,229,0.6)', fontSize: 11, fontFamily: "'Space Mono', monospace" }}
                />
                <Radar
                  dataKey="chartValue"
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
            {dimensions.map((d) => (
              <div key={d.axis} className={styles['dim-row']}>
                <div className={styles['dim-top']}>
                  <span className={styles['dim-name']}>{d.axis}</span>
                  <span className={`${styles['dim-score']} ${d.value == null ? '' : styles[getScoreLevel(d.value)]}`}>
                    {d.value ?? '--'}
                  </span>
                </div>
                <div className={styles['dim-comment']}>{d.comment}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles['panel-header']}>
          <span className={styles['panel-title']}>逐字稿回放</span>
          {transcript.length > 0 ? (
            <span className={styles['panel-badge']}>{transcript.length} 条</span>
          ) : (
            <span className={styles['panel-badge']}>暂无记录</span>
          )}
        </div>
        <div className={styles['transcript-list']}>
          {transcript.length === 0 ? (
            <div className={styles['transcript-row']}>
              <span className={styles['transcript-time']}>--:--</span>
              <span className={styles['transcript-speaker']}>系统</span>
              <div className={styles['transcript-body']}>
                <div className={styles['transcript-text']}>
                  本次会话未保存逐字稿。完成面试或 LGD 讨论后会在此展示完整对话。
                </div>
              </div>
            </div>
          ) : (
            transcript.map((row, i) => (
              <div key={row.key} className={styles['transcript-row']}>
                <span className={styles['transcript-time']}>{String(i + 1).padStart(2, '0')}</span>
                <span className={styles['transcript-speaker']}>{row.speaker}</span>
                <div className={styles['transcript-body']}>
                  <div className={styles['transcript-text']}>{row.text}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles['panel-header']}>
          <span className={styles['panel-title']}>满分话术重构</span>
          <span className={styles['panel-badge']}>Golden Answer</span>
        </div>
        <div className={styles['golden-compare']}>
          <div className={styles['golden-col']}>
            <div className={styles['golden-label']}>你的回答</div>
            <div className={`${styles['golden-text']} ${styles.original}`}>
              {userSample || '本次未捕获你的完整作答，请以逐字稿与五维评分为准。'}
            </div>
          </div>
          <div className={styles['golden-sep']}>
            <span>→</span>
          </div>
          <div className={styles['golden-col']}>
            <div className={styles['golden-label']}>STAR 重构版</div>
            <div className={`${styles['golden-text']} ${styles.improved}`}>
              {goldenImprovedCopy}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles['panel-header']}>
          <span className={styles['panel-title']}>下一步建议</span>
        </div>
        <div className={styles['next-steps']}>
          <button
            type="button"
            className={styles['next-btn']}
            onClick={() => navigate(`/interview/lobby?${retrySearch.toString()}`)}
          >
            同配置再练一次
          </button>
          <button
            type="button"
            className={styles['next-btn']}
            onClick={() => navigate(`/questions?focus=${weakestKey}`)}
          >
            补强薄弱维度题库
          </button>
          {weakestLogicDim && (
            <button
              type="button"
              className={styles['next-btn']}
              onClick={() =>
                navigate(
                  `/questions/${LOGIC_DIM_SUGGEST_GENERAL[weakestLogicDim] || 'G002'}`
                )
              }
            >
              逻辑性 · 再练「{LOGIC_DIMENSION_LABELS[weakestLogicDim]}」
            </button>
          )}
          <button type="button" className={styles['next-btn']} onClick={() => navigate('/')}>
            返回概览
          </button>
        </div>
        <p className={styles['next-note']}>{ruleNote}</p>
      </div>

      {shareQuestion && session ? (
        <ShareDialog
          sessionId={session.id}
          question={shareQuestion}
          onClose={() => setShareQuestion(null)}
        />
      ) : null}

      {saveStory ? (
        <SaveStoryDialog
          open
          initialText={saveStory.text}
          defaultTitle={saveStory.title}
          sourceSession={saveStory.sourceSession}
          source="revision"
          onClose={() => setSaveStory(null)}
        />
      ) : null}
    </div>
  )
}
