import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getSession } from '../../api/interview'
import {
  completeCodingSession,
  patchCodingExplain,
  recordCodingAttempt,
} from '../../api/coding'
import { getErrorMessage } from '../../api/client'
import { showToast } from '../../stores/toastStore'
import useSpeechToText from '../../hooks/useSpeechToText'
import { trackResearchEvent } from '../../research/track'
import { runCode } from './codeRunner'
import CodeEditor from './CodeEditor'
import {
  analyzeCodingExplain,
  formatCodingExplainHints,
} from './codingSpeechMetrics'
import styles from './CodingRoom.module.css'

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function flattenQuestions(session) {
  const rounds = session?.rounds || []
  return rounds.flatMap((r) => r.questions || [])
}

export default function CodingRoom() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [qIndex, setQIndex] = useState(0)
  const [source, setSource] = useState('')
  const [running, setRunning] = useState(false)
  const [lastRun, setLastRun] = useState(null)
  const [lastSubmit, setLastSubmit] = useState(null)
  const [explainText, setExplainText] = useState('')
  const [followupIdx, setFollowupIdx] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [pyTipDismissed, setPyTipDismissed] = useState(false)
  const explainMetricsRef = useRef(null)

  const codingMeta = session?.metadata?.coding || {}
  const questions = useMemo(() => flattenQuestions(session), [session])
  const current = questions[qIndex]
  const isPython = (current?.coding_language || '').toLowerCase().startsWith('py')
  const durationLimit = (codingMeta.duration_minutes || 40) * 60
  const followupsEnabled = Boolean(codingMeta.followups_enabled)

  const refreshSession = useCallback(async () => {
    const data = await getSession(sessionId, { skipErrorToast: true })
    setSession(data)
    if (data.explain_transcript) setExplainText(data.explain_transcript)
    const idx = data.metadata?.coding?.current_question_index
    if (typeof idx === 'number') setQIndex(idx)
  }, [sessionId])

  useEffect(() => {
    let cancelled = false
    refreshSession()
      .catch((err) => {
        if (!cancelled) showToast(getErrorMessage(err, '加载会话失败'), 'error')
      })
    return () => {
      cancelled = true
    }
  }, [refreshSession])

  useEffect(() => {
    if (!current) return
    setSource(current.starter_code || current.signature || '')
    setLastRun(null)
    setLastSubmit(null)
    setFollowupIdx(0)
  }, [current?.id])

  useEffect(() => {
    if (!session) return undefined
    const t = window.setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => window.clearInterval(t)
  }, [session])

  const onTranscript = useCallback((text) => {
    setExplainText(text)
  }, [])

  const onFinalChunk = useCallback((chunk) => {
    if (!chunk?.trim()) return
    setExplainText((prev) => {
      const next = `${prev}${chunk}`
      const metrics = analyzeCodingExplain(next)
      explainMetricsRef.current = metrics
      trackResearchEvent('coding.explain_words', {
        session_id: sessionId,
        char_count: metrics.char_count,
        approach_hits: metrics.approach_hits,
      })
      return next
    })
  }, [sessionId])

  const { supported: sttSupported, listening, start: startStt, stop: stopStt } = useSpeechToText({
    lang: 'zh-CN',
    onTranscript,
    onFinalChunk,
  })

  const persistExplain = useCallback(async (text) => {
    const metrics = analyzeCodingExplain(text)
    await patchCodingExplain(sessionId, { transcript: text, speech_metrics: metrics })
  }, [sessionId])

  const handleToggleMic = () => {
    if (listening) {
      stopStt()
      persistExplain(explainText).catch(() => {})
    } else {
      startStt()
    }
  }

  const executeTests = async (kind) => {
    if (!current || running) return
    const tests =
      kind === 'run'
        ? (current.samples || [])
        : [...(current.samples || []), ...(current.hidden_tests || [])]
    if (!tests.length) {
      showToast('本题暂无测试用例', 'warning')
      return
    }
    setRunning(true)
    try {
      if (isPython && !pyTipDismissed) {
        showToast('首次运行 Python 将下载 Pyodide（约 10MB），请稍候…', 'info')
        setPyTipDismissed(true)
      }
      const result = await runCode({
        language: current.coding_language,
        source,
        tests,
        entryPoint: current.entry_point,
      })
      const summary = {
        ...result,
        kind,
      }
      if (kind === 'run') setLastRun(summary)
      else setLastSubmit(summary)

      await recordCodingAttempt(sessionId, {
        question_id: current.id,
        language: current.coding_language || 'javascript',
        source,
        kind,
        tests_passed: result.passed ?? 0,
        tests_total: result.total ?? tests.length,
        case_results: result.cases || [],
      })

      trackResearchEvent(kind === 'run' ? 'coding.run' : 'coding.submit', {
        session_id: sessionId,
        question_id: current.id,
        tests_passed: result.passed,
        tests_total: result.total,
      })

      if (kind === 'submit') {
        showToast(`提交完成：${result.passed}/${result.total} 通过`, result.passed === result.total ? 'success' : 'warning')
      }
    } catch (err) {
      showToast(getErrorMessage(err, '运行失败'), 'error')
    } finally {
      setRunning(false)
    }
  }

  const handleNextQuestion = () => {
    if (qIndex < questions.length - 1) {
      setQIndex(qIndex + 1)
    }
  }

  const handleFinish = async () => {
    try {
      stopStt()
      if (explainText.trim()) {
        await persistExplain(explainText)
      }
      const completed = await completeCodingSession(sessionId)
      navigate(`/analytics/report/${completed.id}`)
    } catch (err) {
      showToast(getErrorMessage(err, '结束会话失败'), 'error')
    }
  }

  const explainMetrics = analyzeCodingExplain(explainText)
  const explainHints = formatCodingExplainHints(explainMetrics)
  const followups = current?.follow_ups || codingMeta.followup_templates || []
  const activeFollowup = followupsEnabled ? followups[followupIdx] : null
  const timeLeft = Math.max(0, durationLimit - elapsed)

  if (!session) {
    return <div className={styles.page}><p className={styles.muted}>加载编程间…</p></div>
  }

  if (!current) {
    return (
      <div className={styles.page}>
        <p className={styles.muted}>未找到编程题，请从大厅重新开始。</p>
        <button type="button" onClick={() => navigate('/coding/lobby')}>返回大厅</button>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.badge}>{codingMeta.mode === 'exam' ? '笔试' : '面试'}</span>
          <h1>{current.title}</h1>
          <p className={styles.meta}>
            [{current.id}] · {current.difficulty} · {current.coding_language}
            {' · '}
            题 {qIndex + 1}/{questions.length}
          </p>
        </div>
        <div className={styles.timer} aria-live="polite">
          <span>已用 {formatTime(elapsed)}</span>
          <span>剩余 {formatTime(timeLeft)}</span>
        </div>
      </header>

      <div className={styles.layout}>
        <section className={styles.panel}>
          <h2>题目</h2>
          <div className={styles.statement}>{current.problem_statement}</div>
          <pre className={styles.signature}>{current.signature}</pre>
          {current.samples?.length > 0 && (
            <div className={styles.samples}>
              <h3>样例</h3>
              {current.samples.map((s, i) => (
                <div key={i} className={styles.sample}>
                  <code>输入: {JSON.stringify(s.args)}</code>
                  <code>输出: {JSON.stringify(s.expected)}</code>
                </div>
              ))}
            </div>
          )}
          {activeFollowup && (
            <div className={styles.followup}>
              <h3>思路追问</h3>
              <p>{activeFollowup}</p>
              {followupIdx < followups.length - 1 && (
                <button type="button" onClick={() => setFollowupIdx(followupIdx + 1)}>
                  下一问
                </button>
              )}
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <h2>代码</h2>
          <CodeEditor
            language={current.coding_language}
            value={source}
            onChange={setSource}
          />
          <div className={styles.actions}>
            <button type="button" disabled={running} onClick={() => executeTests('run')}>
              {running ? '运行中…' : '运行（公开样例）'}
            </button>
            <button type="button" disabled={running} onClick={() => executeTests('submit')}>
              提交（全部测试）
            </button>
          </div>
          {(lastRun || lastSubmit) && (
            <div className={styles.results}>
              {lastRun && (
                <p>
                  运行：
                  {lastRun.error ? lastRun.error : `${lastRun.passed}/${lastRun.total} 通过`}
                </p>
              )}
              {lastSubmit && (
                <p className={styles.submitScore}>
                  提交：
                  {lastSubmit.error ? lastSubmit.error : `${lastSubmit.passed}/${lastSubmit.total} 通过`}
                </p>
              )}
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <h2>口述思路</h2>
          <p className={styles.muted}>
            用麦克风说明做法、复杂度与边界（规则信号：
            思路 {explainMetrics.approach_hits} ·
            复杂度 {explainMetrics.complexity_mentioned ? '✓' : '—'} ·
            边界 {explainMetrics.edge_cases_mentioned ? '✓' : '—'}）
          </p>
          {!sttSupported && (
            <p className={styles.warn}>当前浏览器不支持语音识别，可直接在下方输入。</p>
          )}
          <div className={styles.explainRow}>
            <button type="button" className={listening ? styles.listening : ''} onClick={handleToggleMic}>
              {listening ? '停止录音' : '开始口述'}
            </button>
          </div>
          <textarea
            className={styles.explainArea}
            value={explainText}
            onChange={(e) => setExplainText(e.target.value)}
            onBlur={() => {
              if (explainText.trim()) persistExplain(explainText).catch(() => {})
            }}
            placeholder="思路、复杂度、边界情况…"
            rows={6}
          />
          {explainHints.length > 0 && (
            <ul className={styles.hints}>
              {explainHints.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className={styles.footer}>
        {qIndex < questions.length - 1 ? (
          <button type="button" onClick={handleNextQuestion}>下一题</button>
        ) : null}
        <button type="button" className={styles.primary} onClick={handleFinish}>
          结束并查看复盘
        </button>
        <button type="button" className={styles.ghost} onClick={() => navigate('/coding/lobby')}>
          返回大厅
        </button>
      </footer>
    </div>
  )
}
