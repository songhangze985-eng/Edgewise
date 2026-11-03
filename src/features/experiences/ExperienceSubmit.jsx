import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { submitExperience } from '../../api/experiences'
import { getErrorMessage } from '../../api/client'
import { showToast } from '../../stores/toastStore'
import PageBar from '../../components/ui/PageBar'
import styles from './Experiences.module.css'

const STAGES = ['技术面', 'HR面', '主管面', '群面', '笔试', '其他']

export default function ExperienceSubmit() {
  const navigate = useNavigate()
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [stage, setStage] = useState(STAGES[0])
  const [dateMonth, setDateMonth] = useState('')
  const [questions, setQuestions] = useState([''])
  const [submitting, setSubmitting] = useState(false)

  const updateQuestion = (index, value) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? value : q)))
  }

  const addQuestion = () => {
    setQuestions((prev) => (prev.length >= 20 ? prev : [...prev, '']))
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    try {
      const payload = {
        company: company.trim(),
        role: role.trim(),
        stage: stage.trim(),
        date_month: dateMonth.trim(),
        questions: questions.map((q) => q.trim()).filter(Boolean),
      }
      const created = await submitExperience(payload)
      showToast('已提交，等待人工审核', 'success')
      navigate(`/experiences/${created.id}`)
    } catch (err) {
      showToast(getErrorMessage(err, '提交失败'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      <PageBar title="投稿面经" subtitle="结构化字段 · 不含真实姓名与录音" />
      <Link to="/experiences" className={styles['ghost-btn']}>← 返回面经库</Link>
      <p className={styles.hint}>
        请勿填写手机号、邮箱或身份证号；审核通过后才会公开。我们不会生成或虚构面经。
      </p>
      <form className={styles.form} onSubmit={onSubmit}>
        <label>
          公司 / 团队类型
          <input required maxLength={120} value={company} onChange={(e) => setCompany(e.target.value)} />
        </label>
        <label>
          岗位
          <input required maxLength={120} value={role} onChange={(e) => setRole(e.target.value)} />
        </label>
        <label>
          环节
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            {STAGES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          月份（如 2026-03）
          <input required pattern="\d{4}-\d{2}" placeholder="2026-03" value={dateMonth} onChange={(e) => setDateMonth(e.target.value)} />
        </label>
        <div className={styles['question-row']}>
          <span>被问到的问题（逐条）</span>
          {questions.map((q, index) => (
            <textarea
              key={index}
              required={index === 0}
              rows={2}
              maxLength={800}
              value={q}
              onChange={(e) => updateQuestion(index, e.target.value)}
              placeholder={`问题 ${index + 1}`}
            />
          ))}
          <button type="button" className={styles['ghost-btn']} onClick={addQuestion}>
            + 添加一题
          </button>
        </div>
        <button type="submit" className={styles['primary-btn']} disabled={submitting}>
          {submitting ? '提交中…' : '提交审核'}
        </button>
      </form>
    </div>
  )
}
