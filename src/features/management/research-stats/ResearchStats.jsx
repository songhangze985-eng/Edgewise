import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import PageBar from '../../../components/ui/PageBar'
import { fetchResearchAdminMeta } from '../../../api/researchAdmin'
import useResearchStatsStore from '../../../stores/researchStatsStore'
import FilterBar from './FilterBar'
import ExportDialog from './components/ExportDialog'
import OverviewTab from './tabs/OverviewTab'
import PassiveTab from './tabs/PassiveTab'
import SurveyTab from './tabs/SurveyTab'
import ExperimentTab from './tabs/ExperimentTab'
import CrosstabTab from './tabs/CrosstabTab'
import ReliabilityTab from './tabs/ReliabilityTab'
import UserTimelineTab from './tabs/UserTimelineTab'
import BlindReviewTab from './tabs/BlindReviewTab'
import styles from './ResearchStats.module.css'

const TABS = [
  { id: 'overview', label: '概览' },
  { id: 'passive', label: '被动数据' },
  { id: 'survey', label: '主动问卷' },
  { id: 'experiment', label: '实验分组对比' },
  { id: 'crosstab', label: '交叉分析' },
  { id: 'reliability', label: '量表信度' },
  { id: 'user', label: '单用户查看' },
  { id: 'blind', label: '盲评进度' },
]

function formatBeijing(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
  } catch {
    return iso
  }
}

export default function ResearchStats() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'overview'
  const { filters, setFilters, resetFilters } = useResearchStatsStore()
  const [meta, setMeta] = useState(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const syncFiltersToUrl = useCallback(
    (patch) => {
      setFilters(patch)
      const next = new URLSearchParams(searchParams)
      Object.entries({ ...filters, ...patch }).forEach(([k, v]) => {
        if (v) next.set(k, v)
        else next.delete(k)
      })
      if (!next.get('tab')) next.set('tab', tab)
      setSearchParams(next, { replace: true })
    },
    [filters, searchParams, setFilters, setSearchParams, tab],
  )

  useEffect(() => {
    const fromUrl = {}
    ;['from', 'to', 'zc', 'zp', 'channel', 'institution', 'rule_version', 'survey_version'].forEach((k) => {
      const v = searchParams.get(k)
      if (v) fromUrl[k] = v
    })
    if (Object.keys(fromUrl).length) setFilters(fromUrl)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchResearchAdminMeta(filters).then(setMeta).catch(() => setMeta(null))
  }, [filters, refreshKey])

  const tabLabel = TABS.find((t) => t.id === tab)?.label || '概览'

  const setTab = (id) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', id)
    setSearchParams(next)
  }

  const tabBody = useMemo(() => {
    const props = { filters, refreshKey }
    switch (tab) {
      case 'passive':
        return <PassiveTab {...props} />
      case 'survey':
        return <SurveyTab {...props} />
      case 'experiment':
        return <ExperimentTab {...props} />
      case 'crosstab':
        return <CrosstabTab {...props} />
      case 'reliability':
        return <ReliabilityTab {...props} />
      case 'user':
        return <UserTimelineTab />
      case 'blind':
        return <BlindReviewTab refreshKey={refreshKey} />
      default:
        return <OverviewTab {...props} />
    }
  }, [tab, filters, refreshKey])

  return (
    <div className={styles.page}>
      <nav className={styles.sideNav} aria-label="管理后台">
        <span className={styles.sideSection}>管理后台</span>
        <Link to="/management" className={styles.sideLink}>
          返回总览
        </Link>
        <span className={styles.sideSection}>研究与架构</span>
        <span className={styles.sideLinkActive}>问卷统计</span>
        <Link to="/management/framework" className={styles.sideLink}>
          项目框架
        </Link>
        <Link to="/management" className={styles.sideLink}>
          后测盲评
        </Link>
        <button type="button" className={styles.sideLink} onClick={() => setExportOpen(true)}>
          数据导出
        </button>
      </nav>
      <div className={styles.main}>
        <PageBar
          title="问卷统计"
          context={tabLabel}
          actions={
            <>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                数据更新于 {formatBeijing(meta?.computed_at)}（北京时间）
              </span>
              <button type="button" className={styles.btnGhost} onClick={() => setRefreshKey((k) => k + 1)}>
                刷新
              </button>
              <button type="button" className={styles.btnPrimary} onClick={() => setExportOpen(true)}>
                导出
              </button>
            </>
          }
        />
        <FilterBar
          meta={meta}
          filters={filters}
          onChange={syncFiltersToUrl}
          filteredN={meta?.filtered_n}
          consentedTotal={meta?.consented_total}
          onClear={() => {
            resetFilters()
            const next = new URLSearchParams()
            next.set('tab', tab)
            setSearchParams(next)
          }}
        />
        <div className={styles.tabBar}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? styles.tabBtnActive : styles.tabBtn}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tabBody}
      </div>
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} filters={filters} />
    </div>
  )
}
