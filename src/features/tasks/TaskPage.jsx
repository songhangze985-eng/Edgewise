import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import useResearchStore from '../../stores/researchStore'
import { fetchTasksManifest, recordTaskVisit } from '../../api/tasks'
import { trackResearchEvent } from '../../research/track'
import {
  buildLobbyHref,
  injectTaskJsonLd,
  markTaskCtaClicked,
  markTaskViewed,
  taskEntryPrefillEnabled,
} from './taskUtils'
import styles from './Tasks.module.css'

const SECTION_ORDER = [
  '适用情况',
  '可核验示例',
  '常见误区',
  '产品能做什么',
  '产品不能做什么',
]

export default function TaskPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const captureFromUrl = useResearchStore((s) => s.captureFromUrl)
  const experimentAssignment = useAuthStore((s) => s.user?.experimentAssignment)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const prefillLobby = useMemo(
    () => taskEntryPrefillEnabled(experimentAssignment),
    [experimentAssignment],
  )

  useEffect(() => {
    captureFromUrl()
  }, [captureFromUrl])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchTasksManifest()
      .then((data) => {
        if (cancelled) return
        const found = (data.tasks || []).find((t) => t.slug === slug)
        if (!found) {
          setError('未找到该任务')
          setLoading(false)
          return
        }
        setTask(found)
        setLoading(false)
        markTaskViewed(slug)
        document.title = `${found.title} · 谈锋准备任务`
        const meta = document.querySelector('meta[name="description"]')
        if (meta) meta.setAttribute('content', found.description)
        injectTaskJsonLd(found)
        recordTaskVisit(slug)
        trackResearchEvent('task_page.viewed', {
          slug,
          task_id: slug,
          entry_channel: 'search',
        })
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || '加载失败')
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  const lobbyHref = useMemo(() => {
    if (!task) return '/interview/lobby'
    return buildLobbyHref(task, { prefill: prefillLobby })
  }, [task, prefillLobby])

  const onCta = (event) => {
    event.preventDefault()
    if (!task) return
    markTaskCtaClicked(slug)
    trackResearchEvent('task_page.cta_clicked', {
      slug,
      task_id: slug,
      prefill: prefillLobby,
    })
    const dest = lobbyHref
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(dest)}`)
      return
    }
    navigate(dest)
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.status}>加载任务…</p>
      </div>
    )
  }

  if (error || !task) {
    return (
      <div className={styles.page}>
        <div className={styles.inner}>
          <Link to="/tasks" className={styles.topLink}>
            ← 全部任务
          </Link>
          <p className={styles.status}>{error || '无法加载'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <Link to="/tasks" className={styles.topLink}>
          ← 全部任务
        </Link>
        <h1 className={styles.title}>{task.title}</h1>
        <p className={styles.lead}>{task.description}</p>

        {SECTION_ORDER.filter((key) => task.sectionHtml?.[key]).map((key) => (
          <section key={key} className={styles.section}>
            <h2>{key}</h2>
            <div
              className={styles.sectionBody}
              dangerouslySetInnerHTML={{ __html: task.sectionHtml[key] }}
            />
          </section>
        ))}

        {task.faq?.length > 0 && (
          <section className={styles.section}>
            <h2>常见问题</h2>
            {task.faq.map((item) => (
              <div key={item.question} className={styles.faqItem}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </div>
            ))}
          </section>
        )}

        <div className={styles.ctaRow}>
          <a href={lobbyHref} className={styles.cta} onClick={onCta}>
            开始匹配练习
          </a>
          <p className={styles.ctaNote}>
            将开启与任务匹配的模拟配置（题型、追问与修订闭环）。评分为规则估算，仅供参考；谈锋不承诺录用或通过率。
          </p>
          {!prefillLobby && (
            <p className={styles.practiceHint}>
              研究安排：任务说明与连续入口组相同，但请在大厅<strong>自行确认</strong>面试类型、难度与追问设置后再开始。
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
