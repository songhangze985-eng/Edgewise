import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchPosttestStatus, submitPosttestAnswer } from '../../api/research'
import { getErrorMessage } from '../../api/client'
import { showToast } from '../../stores/toastStore'
import styles from './ResearchPosttest.module.css'

export default function ResearchPosttest() {
  const navigate = useNavigate()
  const [status, setStatus] = useState(null)
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const data = await fetchPosttestStatus()
        if (!cancelled) setStatus(data)
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, '无法加载追访状态'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!answer.trim()) return
    setSubmitting(true)
    setError('')
    try {
      await submitPosttestAnswer(answer.trim())
      showToast('追访回答已保存，感谢参与', 'success')
      navigate('/')
    } catch (err) {
      setError(getErrorMessage(err, '提交失败'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.muted}>加载追访任务…</p>
      </div>
    )
  }

  if (status?.completed) {
    return (
      <div className={styles.page}>
        <div className={`hw-panel ${styles.panel}`}>
          <h1>七日追访已完成</h1>
          <p className={styles.lead}>您已完成本次独立追问，感谢配合研究。</p>
          <Link to="/" className={styles.linkBtn}>返回 Dashboard</Link>
        </div>
      </div>
    )
  }

  if (!status?.due) {
    const dueAt = status?.due_at ? new Date(status.due_at) : null
    const etaText = dueAt
      ? dueAt.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
      : '完成研究分组后约第 7 日'
    return (
      <div className={styles.page}>
        <div className={`hw-panel ${styles.panel}`}>
          <h1>七日追访尚未开放</h1>
          <p className={styles.lead}>
            追访用于研究独立追问，与日常练习分开计分。开放需同时满足：已同意参与研究、已完成分组安排，且到达追访窗口期。
          </p>
          <ul className={styles.conditions}>
            <li>当前状态：{status?.consent_ok === false ? '需先确认研究同意' : '等待追访窗口'}</li>
            <li>预计开放：{etaText}</li>
            {status?.reason && <li>说明：{status.reason}</li>}
          </ul>
          <Link to="/" className={styles.linkBtn}>返回概览</Link>
        </div>
      </div>
    )
  }

  const probe = status.probe

  return (
    <div className={styles.page}>
      <div className={`hw-panel ${styles.panel}`}>
        <div className={styles.kicker}>Research · Day 7 独立追问</div>
        <h1>匹配难度追访</h1>
        <p className={styles.lead}>
          请根据您的真实经历独立作答。本题为研究追访，不计入常规练习激活指标。
        </p>
        {probe && (
          <div className={styles.questionBox}>
            <span className={styles.tag}>{probe.difficulty || '中等'}</span>
            <p>{probe.title}</p>
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <textarea
            className={styles.answer}
            rows={8}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="在此输入您的回答…"
            disabled={submitting}
          />
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.submit} disabled={submitting || !answer.trim()}>
            提交追访回答
          </button>
        </form>
      </div>
    </div>
  )
}
