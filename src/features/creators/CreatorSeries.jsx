import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import { getCreatorSeries, listCreatorSeries } from '../../api/series'
import { getErrorMessage } from '../../api/client'
import { creatorSeriesVariant } from '../../config/experiment'
import { trackResearchEvent } from '../../research/track'
import { buildLobbyHref } from '../tasks/taskUtils'
import PageBar from '../../components/ui/PageBar'
import styles from '../experiences/Experiences.module.css'

export default function CreatorSeries() {
  const { id } = useParams()
  const navigate = useNavigate()
  const experimentAssignment = useAuthStore((s) => s.user?.experimentAssignment)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const userId = useAuthStore((s) => s.user?.id)
  const consentStart = useAuthStore((s) => {
    const consent = s.user?.researchConsent
    return consent?.accepted && !consent.withdrawnAt ? consent.acceptedAt : null
  })
  const episodeList = useRef(null)
  const viewed = useRef(new Set())
  const [series, setSeries] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const pageViewId = useMemo(
    () => globalThis.crypto?.randomUUID?.(),
    [id, series?.content_version, userId, consentStart],
  )

  const variant = useMemo(
    () => creatorSeriesVariant(experimentAssignment),
    [experimentAssignment],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    const load = async () => {
      try {
        let data = await getCreatorSeries(id)
        if (cancelled) return
        if (data.variant !== variant) {
          const siblings = await listCreatorSeries({ variant })
          const alt = siblings.find((s) => s.variant === variant)
          if (alt && alt.id !== id) {
            navigate(`/series/${alt.id}`, { replace: true })
            return
          }
        }
        setSeries(data)
        setLoading(false)
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, '专栏加载失败'))
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id, variant, navigate])

  useEffect(() => {
    const list = episodeList.current
    if (loading || error || !consentStart || !list || series?.id !== id || !series.content_version ||
        typeof IntersectionObserver !== 'function') return

    const cards = list.querySelectorAll('[data-episode-id]')
    const observer = new IntersectionObserver((entries) => {
      if (document.visibilityState !== 'visible') return
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.5) continue
        const episodeId = entry.target.dataset.episodeId
        const key = JSON.stringify([pageViewId, userId, consentStart, series.content_version, episodeId])
        if (viewed.current.has(key)) continue
        viewed.current.add(key)
        trackResearchEvent('series.episode_viewed', {
          series_id: series.id,
          episode_id: episodeId,
          variant: series.variant,
          planned_variant: variant,
          content_version: series.content_version,
          exposure_basis: 'viewport_half_visible',
          series_page_view_id: pageViewId,
        })
      }
    }, { threshold: 0.5 })
    function observeVisiblePage() {
      observer.disconnect()
      if (document.visibilityState === 'visible') cards.forEach(card => observer.observe(card))
    }
    observeVisiblePage()
    document.addEventListener('visibilitychange', observeVisiblePage)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', observeVisiblePage)
    }
  }, [consentStart, error, id, loading, pageViewId, series, userId, variant])

  const startTask = (episode) => {
    const clickId = consentStart && episode.task_slug ? globalThis.crypto?.randomUUID?.() : undefined
    trackResearchEvent('series.task_started', {
      series_id: series.id,
      episode_id: episode.id,
      task_slug: episode.task_slug,
      variant: series.variant,
      planned_variant: variant,
      content_version: series.content_version,
      action: 'task_link_click',
      series_page_view_id: pageViewId,
      series_task_click_id: clickId,
    })
    const href = episode.task_slug
      ? `/tasks/${episode.task_slug}${clickId ? `?series_task_click_id=${encodeURIComponent(clickId)}` : ''}`
      : buildLobbyHref({ slug: 'ownership-contribution', lobby: { interview_type: 'structured' } }, { prefill: false })
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(href)}`)
      return
    }
    navigate(href)
  }

  if (loading) {
    return <div className={styles.page}><p className={styles.empty}>加载专栏…</p></div>
  }

  if (error || !series) {
    return (
      <div className={styles.page}>
        <Link to="/experiences" className={styles['ghost-btn']}>← 面经库</Link>
        <p className={styles.empty}>{error || '无法加载'}</p>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <PageBar title={series.topic} subtitle={`创作者专栏 · ${series.variant === 'conclusion' ? '结论对照' : '互补视角'}`} />
      <div className={styles.disclosure} role="note">
        <strong>合作说明：</strong>
        {series.disclosure || '本内容与谈锋合作策划，不构成录用承诺。'}
      </div>
      <p className={styles.hint}>
        每集只推进一个判断角度；标注了产品目前无法替代的真实决策环节，仅供练习框架。
      </p>
      <div className={styles['episode-list']} ref={episodeList}>
        {series.episodes.map((ep) => (
          <article key={ep.id} className={styles.episode} data-episode-id={ep.id}>
            <p className={styles.meta}>{ep.creator}</p>
            <h4>{ep.angle}</h4>
            {ep.summary && <p className={styles.hint}>{ep.summary}</p>}
            <div className={styles['episode-actions']}>
              {ep.video_url ? (
                <a href={ep.video_url} className={styles['ghost-btn']} target="_blank" rel="noreferrer">
                  观看视频
                </a>
              ) : null}
              <button type="button" className={styles['primary-btn']} onClick={() => startTask(ep)}>
                进入对应练习
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
