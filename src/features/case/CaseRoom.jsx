import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageBar from '../../components/ui/PageBar'
import { completeSession, getSession } from '../../api/interview'
import { postCaseClarify, postCaseStep } from '../../api/case'
import { getErrorMessage } from '../../api/client'
import { showToast } from '../../stores/toastStore'
import { trackResearchEvent } from '../../research/track'
import { computeWeightedRoundScore } from '../../utils/interviewRounds'
import useSessionStore from '../../stores/sessionStore'
import styles from './CaseRoom.module.css'

const CaseWhiteboard = lazy(() => import('./CaseWhiteboard'))

const CASE_TYPES = new Set(['case', 'system_design'])

function caseRounds(session) {
  return (session?.rounds || []).filter((r) => CASE_TYPES.has(r.type))
}

function activeQuestion(session, roundIndex) {
  const rnd = caseRounds(session)[roundIndex]
  return rnd?.questions?.[0] || null
}

export default function CaseRoom() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const refresh = useSessionStore((s) => s.refresh)

  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [roundIndex, setRoundIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [clarifyText, setClarifyText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [lastEval, setLastEval] = useState(null)
  const [dataTables, setDataTables] = useState([])
  const [whiteboard, setWhiteboard] = useState(null)
  const [finishing, setFinishing] = useState(false)

  const rounds = useMemo(() => caseRounds(session), [session])
  const question = useMemo(() => activeQuestion(session, roundIndex), [session, roundIndex])
  const steps = question?.steps || []
  const stepIndex = question?.current_step_index ?? 0
  const currentStep = steps[stepIndex]
  const completedStepIds = useMemo(
    () => new Set((question?.case_steps || []).map((c) => c.step)),
    [question],
  )
  const allStepsDone = steps.length > 0 && steps.every((s) => completedStepIds.has(s.id))

  const load = useCallback(async () => {
    const data = await getSession(sessionId, { skipErrorToast: true })
    const crs = caseRounds(data)
    if (!crs.length) {
      navigate(`/interview/room/${sessionId}`, { replace: true })
      return
    }
    setSession(data)
    const q = crs[0]?.questions?.[0]
    if (q?.whiteboard_snapshot) setWhiteboard(q.whiteboard_snapshot)
  }, [navigate, sessionId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    load()
      .catch((err) => {
        if (!cancelled) showToast(getErrorMessage(err, '加载会话失败'), 'error')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [load])

  useEffect(() => {
    setAnswer('')
    setLastEval(null)
    setDataTables([])
    const q = activeQuestion(session, roundIndex)
    if (q?.whiteboard_snapshot) setWhiteboard(q.whiteboard_snapshot)
  }, [session, roundIndex, stepIndex])

  const sessionRoundIndex = useCallback(() => {
    const target = rounds[roundIndex]
    return (session?.rounds || []).findIndex((r) => r === target)
  }, [roundIndex, rounds, session])

  const handleClarify = async () => {
    const text = clarifyText.trim()
    if (!text || !question) return
    setSubmitting(true)
    try {
      const resp = await postCaseClarify(sessionId, {
        round_index: sessionRoundIndex(),
        text,
      })
      setClarifyText('')
      await load()
      if (resp?.reply) showToast(resp.matched ? '面试官已回答' : '暂无预设信息', 'info')
    } catch (err) {
      showToast(getErrorMessage(err, '提问失败'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStepSubmit = async () => {
    if (!currentStep || !question) return
    const text = answer.trim()
    if (text.length < 8) {
      showToast('请至少写几句思路再提交本步', 'info')
      return
    }
    setSubmitting(true)
    try {
      const resp = await postCaseStep(sessionId, {
        round_index: sessionRoundIndex(),
        step_id: currentStep.id,
        answer: text,
        whiteboard_snapshot: whiteboard,
      })
      setLastEval(resp.evaluation)
      if (resp.data_tables?.length) setDataTables(resp.data_tables)
      trackResearchEvent('case.step_completed', {
        session_id: sessionId,
        step_id: currentStep.id,
        score: resp.evaluation?.score,
      })
      await load()
      setAnswer('')
      if (resp.done && roundIndex < rounds.length - 1) {
        setRoundIndex((i) => i + 1)
      }
    } catch (err) {
      showToast(getErrorMessage(err, '提交步骤失败'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleFinish = async () => {
    setFinishing(true)
    try {
      const snap = session
      const score = computeWeightedRoundScore(snap?.rounds || [])
      await completeSession(sessionId, {
        score: score ?? undefined,
        duration_minutes: Math.max(1, Math.round((snap?.metadata?.elapsed_sec || 600) / 60)),
        metadata: {
          mode: snap?.metadata?.mode || 'case',
          dimensions: {},
        },
      })
      await refresh()
      navigate(`/analytics/session/${sessionId}`)
    } catch (err) {
      showToast(getErrorMessage(err, '结束练习失败'), 'error')
    } finally {
      setFinishing(false)
    }
  }

  if (loading || !session || !question) {
    return (
      <div className={styles.page}>
        <PageBar title="Case 练习室" />
        <p className={styles.lead}>加载中…</p>
      </div>
    )
  }

  const clarifications = question.clarifications_log || []
  const isClarifyStep = currentStep?.id === 'clarify' || currentStep?.id === 'requirements'

  return (
    <div className={styles.page}>
      <PageBar
        title={rounds.length > 1 ? `Case · 第 ${roundIndex + 1}/${rounds.length} 轮` : 'Case / 系统设计'}
      />
      <p className={styles.lead}>
        评分为规则清单估算，仅供参考。白板内容以 JSON 保存在会话中，不会导出图片。
      </p>

      <div className={styles.layout}>
        <aside className={styles.panel}>
          <h2>{question.title}</h2>
          <div className={styles.prompt}>{question.prompt}</div>
          <ul className={styles.steps}>
            {steps.map((s, idx) => {
              const done = (question.case_steps || []).some((c) => c.step === s.id)
              const active = idx === stepIndex && !allStepsDone
              return (
                <li
                  key={s.id}
                  className={`${styles['step-item']} ${active ? styles.active : ''} ${done ? styles.done : ''}`}
                >
                  <span className={styles['step-dot']} aria-hidden />
                  {s.label}
                </li>
              )
            })}
          </ul>
        </aside>

        <section className={styles.main}>
          {!allStepsDone && currentStep && (
            <>
              <div className={styles['step-title']}>当前步骤 · {currentStep.label}</div>
              <p className={styles.hint}>
                {isClarifyStep
                  ? '向面试官提问以澄清范围；同时在下方记录你的澄清要点，再提交本步。'
                  : '文字说明配合右侧白板（架构/框架图）。提交后查看清单反馈。'}
              </p>

              {isClarifyStep && (
                <>
                  <div className={styles['clarify-input']}>
                    <input
                      type="text"
                      value={clarifyText}
                      placeholder="例如：目标市场是哪座城市？"
                      onChange={(e) => setClarifyText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleClarify()}
                    />
                    <button type="button" className={styles.btn} disabled={submitting} onClick={handleClarify}>
                      提问
                    </button>
                  </div>
                  {clarifications.length > 0 && (
                    <div className={styles['clarify-log']}>
                      {clarifications.map((row, i) => (
                        <div key={i} className={styles['clarify-row']}>
                          <q>{row.question}</q>
                          <p>{row.reply}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              <textarea
                className={styles.textarea}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="写下本步回答…"
              />

              {dataTables.map((table) => (
                <div key={table.id}>
                  <strong>{table.title}</strong>
                  <table className={styles['data-table']}>
                    <tbody>
                      {(table.rows || []).map((row, ri) => (
                        <tr key={ri}>
                          <th>{row[0]}</th>
                          <td>{row[1]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

              <Suspense fallback={<div className={styles['board-loading']}>白板加载中…</div>}>
                <CaseWhiteboard snapshot={whiteboard} onSnapshot={setWhiteboard} />
              </Suspense>

              {lastEval?.checklist?.length > 0 && (
                <ul className={styles.checklist}>
                  {lastEval.checklist.map((c) => (
                    <li key={c.id} className={c.passed ? styles.pass : styles.fail}>
                      {c.passed ? '✓' : '○'} {c.label}
                    </li>
                  ))}
                </ul>
              )}

              <div className={styles.actions}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles['btn-primary']}`}
                  disabled={submitting}
                  onClick={handleStepSubmit}
                >
                  {submitting ? '提交中…' : '完成本步'}
                </button>
              </div>
            </>
          )}

          {allStepsDone && (
            <div className={styles['done-card']}>
              <p>
                本轮步骤已完成
                {question.score != null ? ` · 规则得分约 ${question.score}` : ''}
              </p>
              {roundIndex < rounds.length - 1 ? (
                <button type="button" className={styles.btn} onClick={() => setRoundIndex((i) => i + 1)}>
                  进入下一轮
                </button>
              ) : (
                <button
                  type="button"
                  className={`${styles.btn} ${styles['btn-primary']}`}
                  disabled={finishing}
                  onClick={handleFinish}
                >
                  {finishing ? '生成报告中…' : '结束并查看报告'}
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
