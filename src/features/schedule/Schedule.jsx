import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageBar from '../../components/ui/PageBar'
import {
  createSchedule,
  deleteSchedule,
  listSchedules,
  updateSchedule,
} from '../../api/schedule'
import { listJobs } from '../../api/jobs'
import { getErrorMessage } from '../../api/client'
import { trackResearchEvent } from '../../research/track'
import { exportScheduleToIcs } from '../../utils/ics'
import {
  SCHEDULE_RESULTS,
  SCHEDULE_STAGES,
  formatScheduleWhen,
  getCountdown,
  isWithinThreeDays,
  recommendPracticeForStage,
  splitUpcomingPast,
} from '../../utils/schedulePractice'
import styles from './Schedule.module.css'

function toDatetimeLocalValue(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromDatetimeLocalValue(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString()
}

const emptyForm = () => ({
  company: '',
  stage: '一面',
  atLocal: '',
  job_id: '',
  note: '',
})

function ScheduleRow({
  entry,
  onDelete,
  onResultChange,
  onExport,
}) {
  const countdown = getCountdown(entry.at)
  const showRec = !countdown.past && isWithinThreeDays(entry.at)
  const rec = showRec ? recommendPracticeForStage(entry.stage, entry.job_id) : null

  const handleRecClick = () => {
    if (!rec) return
    trackResearchEvent('schedule.recommendation_clicked', {
      schedule_id: entry.id,
      stage: entry.stage,
      kind: rec.kind,
    })
  }

  return (
    <div className={styles.row}>
      <div className={styles.row-main}>
        <div className={styles.company}>{entry.company}</div>
        <div className={styles.meta}>
          <span className={styles['stage-tag']}>{entry.stage}</span>
          {formatScheduleWhen(entry.at)}
        </div>
        {!countdown.past && (
          <div className={styles.countdown} aria-live="polite">
            {countdown.label}
          </div>
        )}
        {entry.note ? (
          <div className={styles.meta} style={{ marginTop: 6 }}>
            {entry.note}
          </div>
        ) : null}
        {rec && (
          <div className={styles['rec-card']}>
            <div className={styles['rec-title']}>面前建议 · {rec.title}</div>
            <div className={styles['rec-desc']}>{rec.desc}</div>
            <Link to={rec.to} className={styles['rec-link']} onClick={handleRecClick}>
              去练习 →
            </Link>
          </div>
        )}
      </div>
      <div className={styles['row-actions']}>
        <select
          className={styles['result-select']}
          value={entry.result || '待定'}
          onChange={(e) => onResultChange(entry.id, e.target.value)}
          aria-label="面试结果"
        >
          {SCHEDULE_RESULTS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button type="button" className={styles['btn-ghost']} onClick={() => onExport(entry)}>
          导出日历
        </button>
        <button type="button" className={styles['btn-ghost']} onClick={() => onDelete(entry.id)}>
          删除
        </button>
      </div>
    </div>
  )
}

function Schedule() {
  const [items, setItems] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [pastOpen, setPastOpen] = useState(false)

  const load = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const [rows, jobRows] = await Promise.all([listSchedules(), listJobs().catch(() => [])])
      setItems(rows)
      setJobs(jobRows)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load().catch(() => {})
  }, [load])

  const { upcoming, past } = useMemo(() => splitUpcomingPast(items), [items])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const at = fromDatetimeLocalValue(form.atLocal)
      if (!at) {
        setError('请选择有效的日期与时间')
        return
      }
      const created = await createSchedule({
        company: form.company.trim(),
        stage: form.stage,
        at,
        job_id: form.job_id || null,
        note: form.note.trim() || null,
      })
      trackResearchEvent('schedule.added', { schedule_id: created.id, stage: created.stage })
      setForm(emptyForm())
      setFormOpen(false)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('确定删除这条日程？')) return
    setError('')
    try {
      await deleteSchedule(id)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const handleResultChange = async (id, result) => {
    setError('')
    try {
      await updateSchedule(id, { result })
      trackResearchEvent('schedule.result_set', { schedule_id: id, result })
      setItems((prev) => prev.map((row) => (row.id === id ? { ...row, result } : row)))
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const handleExport = (entry) => {
    try {
      exportScheduleToIcs(entry)
    } catch {
      setError('导出日历失败，请检查面试时间格式')
    }
  }

  if (loading && items.length === 0) {
    return (
      <div className={styles.schedule}>
        <PageBar title="面试日程" />
        <p style={{ padding: '2rem', color: 'var(--chalk-dim)', fontFamily: 'var(--font-mono)' }}>
          正在加载日程…
        </p>
      </div>
    )
  }

  return (
    <div className={styles.schedule}>
      <PageBar title="面试日程" />

      {error && (
        <div className={styles['error-banner']}>
          <span>{error}</span>
          <button type="button" className={styles['btn-ghost']} onClick={() => load()}>
            重试
          </button>
        </div>
      )}

      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles['btn-primary']}
          onClick={() => setFormOpen((v) => !v)}
        >
          {formOpen ? '收起表单' : '添加日程'}
        </button>
      </div>

      {formOpen && (
        <form className={`hw-panel ${styles['form-panel']}`} onSubmit={handleSubmit}>
          <div className={styles['form-grid']}>
            <div className={styles.field}>
              <label htmlFor="sch-company">公司</label>
              <input
                id="sch-company"
                required
                maxLength={120}
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="sch-stage">环节</label>
              <select
                id="sch-stage"
                value={form.stage}
                onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))}
              >
                {SCHEDULE_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="sch-at">日期与时间</label>
              <input
                id="sch-at"
                type="datetime-local"
                required
                value={form.atLocal}
                onChange={(e) => setForm((f) => ({ ...f, atLocal: e.target.value }))}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="sch-job">关联 JD（可选）</label>
              <select
                id="sch-job"
                value={form.job_id}
                onChange={(e) => setForm((f) => ({ ...f, job_id: e.target.value }))}
              >
                <option value="">不关联</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title || j.raw_text.slice(0, 40)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className={styles.field} style={{ marginBottom: 'var(--sp-md)' }}>
            <label htmlFor="sch-note">备注（可选）</label>
            <textarea
              id="sch-note"
              maxLength={2000}
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>
          <div className={styles['form-actions']}>
            <button type="submit" className={styles['btn-primary']} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </button>
            <button type="button" className={styles['btn-ghost']} onClick={() => setFormOpen(false)}>
              取消
            </button>
          </div>
        </form>
      )}

      <div className={`hw-panel ${styles.panel}`}>
        <div className={styles['panel-header']}>
          <span className={styles['panel-title']}>即将到来</span>
          <span className={styles['panel-id']}>[SCH-01]</span>
        </div>
        {upcoming.length === 0 ? (
          <div className={styles.empty}>
            记下你的第一场面试，我们会在面试前 3 天内推荐对应练习。
            <br />
            <button
              type="button"
              className={styles['btn-primary']}
              style={{ marginTop: 16 }}
              onClick={() => setFormOpen(true)}
            >
              添加日程
            </button>
          </div>
        ) : (
          <div className={styles.list}>
            {upcoming.map((entry) => (
              <ScheduleRow
                key={entry.id}
                entry={entry}
                onDelete={handleDelete}
                onResultChange={handleResultChange}
                onExport={handleExport}
              />
            ))}
          </div>
        )}
      </div>

      {past.length > 0 && (
        <div className={styles['past-section']}>
          <button
            type="button"
            className={styles['past-toggle']}
            onClick={() => setPastOpen((v) => !v)}
            aria-expanded={pastOpen}
          >
            {pastOpen ? '▼' : '▶'} 已结束的日程（{past.length}）
          </button>
          {pastOpen && (
            <div className={`hw-panel ${styles.panel}`}>
              <div className={styles.list}>
                {past.map((entry) => (
                  <ScheduleRow
                    key={entry.id}
                    entry={entry}
                    onDelete={handleDelete}
                    onResultChange={handleResultChange}
                    onExport={handleExport}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default memo(Schedule)
