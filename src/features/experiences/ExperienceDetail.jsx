import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getExperience } from '../../api/experiences'
import { createSession } from '../../api/interview'
import { getErrorMessage } from '../../api/client'
import { showToast } from '../../stores/toastStore'
import { trackResearchEvent } from '../../research/track'
import PageBar from '../../components/ui/PageBar'
import styles from './Experiences.module.css'

export default function ExperienceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [row, setRow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [practiceIndex, setPracticeIndex] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getExperience(id)
      .then((data) => {
        if (!cancelled) {
          setRow(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err, '面经不存在或未公开'))
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const practiceQuestion = async (questionText, index) => {
    if (!row) return
    setPracticeIndex(index)
    try {
      const session = await createSession({
        type: 'interview',
        topic: `面经 · ${row.company}`.slice(0, 40),
        position: row.role || '面经练习',
        difficulty: 'medium',
        metadata: {
          interview_type: 'structured',
          source: 'experience',
          experience_id: row.id,
          experience_practice_questions: [questionText],
        },
      })
      trackResearchEvent('experience.practice_clicked', {
        experience_id: row.id,
        question_index: index,
        session_id: session.id,
      })
      navigate(`/interview/room/${session.id}`)
    } catch (err) {
      showToast(getErrorMessage(err, '创建练习失败'), 'error')
    } finally {
      setPracticeIndex(null)
    }
  }

  if (loading) {
    return <div className={styles.page}><p className={styles.empty}>加载中…</p></div>
  }

  if (error || !row) {
    return (
      <div className={styles.page}>
        <Link to="/experiences" className={styles['ghost-btn']}>← 返回面经库</Link>
        <p className={styles.empty}>{error || '无法加载'}</p>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <PageBar
        title={row.company}
        subtitle={`${row.role} · ${row.stage} · ${row.date_month}`}
        actions={
          row.status !== 'approved' ? (
            <span className={`${styles.hint} ${styles['status-pending']}`}>审核中，仅作者可见</span>
          ) : null
        }
      />
      <Link to="/experiences" className={styles['ghost-btn']}>← 返回列表</Link>
      <div className={styles['detail-questions']}>
        {row.questions.map((q, index) => (
          <div key={index} className={styles['question-item']}>
            <p>{q}</p>
            <button
              type="button"
              className={styles['primary-btn']}
              disabled={practiceIndex === index}
              onClick={() => practiceQuestion(q, index)}
            >
              {practiceIndex === index ? '创建会话…' : '用这题练习'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
