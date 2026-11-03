import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import useSessionStore from '../../stores/sessionStore'
import {
  BLIND_REVIEW_RUBRIC,
  downloadResearchExport,
  downloadResearchPanelExport,
  fetchBlindReviewPending,
  fetchReferralStats,
  accelerateResearchDatesAdmin,
  submitBlindReviewScore,
  triggerDailyDerive,
} from '../../api/research'
import {
  fetchExperienceReviewQueue,
  reviewExperience,
} from '../../api/experiences'
import { listCreatorSeries, upsertCreatorSeries } from '../../api/series'
import {
  adminAddMentor,
  adminAddWorkshop,
  adminCreateOrg,
  adminListOrgs,
} from '../../api/org'
import { getErrorMessage } from '../../api/client'
import { showToast } from '../../stores/toastStore'
import { Link } from 'react-router-dom'
import PageBar from '../../components/ui/PageBar'
import styles from './Management.module.css'

const MOCK_USERS = [
  { id: 'U001', name: '张明远', email: 'zhangmy@email.com', tier: 'Pro', credits: 1280, sessions: 47, avgScore: 82, joinDate: '2026-01-15', status: 'active' },
  { id: 'U002', name: '李思琪', email: 'lisq@email.com', tier: 'Plus', credits: 560, sessions: 23, avgScore: 76, joinDate: '2026-02-03', status: 'active' },
  { id: 'U003', name: '王浩然', email: 'wanghr@email.com', tier: 'Free', credits: 50, sessions: 8, avgScore: 71, joinDate: '2026-02-20', status: 'active' },
  { id: 'U004', name: '赵雨萱', email: 'zhaoyx@email.com', tier: 'Pro', credits: 2100, sessions: 62, avgScore: 89, joinDate: '2025-12-10', status: 'active' },
  { id: 'U005', name: '陈晨', email: 'chenchen@email.com', tier: 'Unlimited', credits: 98500, sessions: 156, avgScore: 91, joinDate: '2025-11-01', status: 'active' },
  { id: 'U006', name: '刘佳怡', email: 'liujy@email.com', tier: 'Free', credits: 0, sessions: 2, avgScore: 65, joinDate: '2026-03-10', status: 'inactive' },
  { id: 'U007', name: '孙博文', email: 'sunbw@email.com', tier: 'Plus', credits: 780, sessions: 31, avgScore: 78, joinDate: '2026-01-22', status: 'active' },
  { id: 'U008', name: '周芷若', email: 'zhouzr@email.com', tier: 'Pro', credits: 1650, sessions: 55, avgScore: 85, joinDate: '2025-12-28', status: 'active' },
]

const MOCK_QUESTIONS_MGMT = [
  { id: 'Q001', title: '请介绍一个你最成功的项目经验', category: '行为题', difficulty: '简单', usageCount: 124, avgScore: 79, status: 'active' },
  { id: 'Q002', title: '如果你发现同事的工作失误，你会怎么做？', category: '行为题', difficulty: '中等', usageCount: 89, avgScore: 74, status: 'active' },
  { id: 'Q003', title: '估算一下北京市一天消耗多少个鸡蛋', category: '案例分析', difficulty: '困难', usageCount: 56, avgScore: 68, status: 'active' },
  { id: 'Q004', title: '介绍一下 React 19 的新特性', category: '专业知识', difficulty: '中等', usageCount: 210, avgScore: 72, status: 'active' },
  { id: 'Q005', title: '如果你的领导坚持一个错误的决定', category: '压力题', difficulty: '困难', usageCount: 45, avgScore: 66, status: 'active' },
  { id: 'Q006', title: '为什么井盖是圆的？', category: '逻辑题', difficulty: '简单', usageCount: 340, avgScore: 83, status: 'active' },
]

const MOCK_SYSTEM_LOGS = [
  { time: '14:32:05', level: 'info', module: 'Auth', message: '用户 zhangmy@email.com 登录成功' },
  { time: '14:30:12', level: 'info', module: 'LGD', message: '群面房间 R-0312 创建，话题：远程团队协作效率' },
  { time: '14:28:45', level: 'warn', module: 'LLM', message: 'qwen-plus 响应延迟 3.2s，已触发 fallback' },
  { time: '14:25:33', level: 'info', module: 'Resume', message: '简历解析完成 (张明远_产品经理.pdf)' },
  { time: '14:22:10', level: 'error', module: 'WebSocket', message: 'WS 连接超时，已自动重连 (room R-0311)' },
  { time: '14:18:56', level: 'info', module: 'Interview', message: '1v1 面试会话完成，评分 85' },
  { time: '14:15:20', level: 'info', module: 'Auth', message: '新用户注册 liujy@email.com (Free)' },
  { time: '14:10:44', level: 'warn', module: 'Credits', message: '用户 wanghr 积分不足，已限流' },
]

const overviewStats = [
  { label: '注册用户', value: '—', delta: '暂无数据', icon: '⬡', color: '' },
  { label: '活跃用户', value: '—', delta: '暂无数据', icon: '◈', color: 'purple' },
  { label: '今日练习', value: '—', delta: '暂无数据', icon: '◇', color: 'blue' },
  { label: '平台收入', value: '—', delta: '暂无数据', icon: '△', color: 'red' },
]

const tierDistribution = [
  { tier: 'Free', count: 687, percent: 55 },
  { tier: 'Plus', count: 298, percent: 24 },
  { tier: 'Pro', count: 213, percent: 17 },
  { tier: 'Unlimited', count: 49, percent: 4 },
]

const sessionTypeStats = [
  { type: 'LGD 群面', count: 2340, avgScore: 78, color: 'purple' },
  { type: '1v1 单面', count: 1856, avgScore: 81, color: 'blue' },
  { type: '简历优化', count: 1120, avgScore: 85, color: '' },
  { type: '题库练习', count: 890, avgScore: 74, color: 'red' },
]

const TABS = ['总览', '用户管理', '练习数据', '题库管理', '面经审核', '创作者内容', '机构管理', '系统设置']

const tierColorMap = { Free: '', Plus: 'blue', Pro: 'purple', Unlimited: 'red' }
const diffColorMap = { '简单': 'easy', '中等': 'medium', '困难': 'hard' }
const logLevelMap = { info: 'log-info', warn: 'log-warn', error: 'log-error' }

export default function Management() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { sessions, stats } = useSessionStore()
  const [activeTab, setActiveTab] = useState('总览')
  const [userSearch, setUserSearch] = useState('')
  const [questionSearch, setQuestionSearch] = useState('')
  const [exportingResearch, setExportingResearch] = useState(false)
  const [exportingPanel, setExportingPanel] = useState(false)
  const [referralStats, setReferralStats] = useState([])
  const [referralLoading, setReferralLoading] = useState(false)
  const [deriveLoading, setDeriveLoading] = useState(false)
  const [deriveResult, setDeriveResult] = useState(null)
  const [deriveError, setDeriveError] = useState(null)
  const [blindPending, setBlindPending] = useState([])
  const [blindLoading, setBlindLoading] = useState(false)
  const [blindError, setBlindError] = useState(null)
  const [blindScores, setBlindScores] = useState({})
  const [blindSubmitting, setBlindSubmitting] = useState(null)
  const [expPending, setExpPending] = useState([])
  const [expLoading, setExpLoading] = useState(false)
  const [expReviewing, setExpReviewing] = useState(null)
  const [creatorSeries, setCreatorSeries] = useState([])
  const [seriesLoading, setSeriesLoading] = useState(false)
  const [seriesSaving, setSeriesSaving] = useState(null)
  const [orgRows, setOrgRows] = useState([])
  const [orgLoading, setOrgLoading] = useState(false)
  const [orgCreating, setOrgCreating] = useState(false)
  const [orgForm, setOrgForm] = useState({
    name: '',
    pilot_period: '',
    service_description: '',
    fee_paid: false,
    invite_method: 'admin_invite',
    human_coaching: false,
    admin_user_id: '',
  })
  const [workshopDraft, setWorkshopDraft] = useState({ orgId: '', title: '', mode: 'revision', task_slug: '' })
  const [mentorDraft, setMentorDraft] = useState({ orgId: '', userId: '' })

  const loadOrgs = () => {
    if (!user?.isAdmin) return Promise.resolve()
    setOrgLoading(true)
    return adminListOrgs()
      .then(setOrgRows)
      .catch(() => setOrgRows([]))
      .finally(() => setOrgLoading(false))
  }

  const loadReferralStats = () => {
    setReferralLoading(true)
    return fetchReferralStats()
      .then(setReferralStats)
      .catch(() => setReferralStats([]))
      .finally(() => setReferralLoading(false))
  }

  const loadBlindReview = () => {
    setBlindLoading(true)
    setBlindError(null)
    return fetchBlindReviewPending(10)
      .then((rows) => {
        setBlindPending(rows)
        setBlindScores((prev) => {
          const next = { ...prev }
          rows.forEach((row) => {
            if (!next[row.review_token]) {
              next[row.review_token] = Object.fromEntries(
                BLIND_REVIEW_RUBRIC.map(({ key }) => [key, '']),
              )
            }
          })
          return next
        })
      })
      .catch((err) => {
        setBlindPending([])
        setBlindError(getErrorMessage(err, '加载盲评队列失败'))
      })
      .finally(() => setBlindLoading(false))
  }

  const loadExperienceReview = () => {
    setExpLoading(true)
    return fetchExperienceReviewQueue()
      .then(setExpPending)
      .catch(() => setExpPending([]))
      .finally(() => setExpLoading(false))
  }

  const loadCreatorSeriesAdmin = () => {
    setSeriesLoading(true)
    return listCreatorSeries()
      .then(setCreatorSeries)
      .catch(() => setCreatorSeries([]))
      .finally(() => setSeriesLoading(false))
  }

  useEffect(() => {
    if (!user?.isAdmin) return
    loadOrgs()
    loadReferralStats()
    loadBlindReview()
    loadExperienceReview()
    loadCreatorSeriesAdmin()
  }, [user?.isAdmin])

  const confirmResearchDownload = (label) => {
    return window.confirm(
      `确认下载「${label}」？\n数据仅限已授权研究用途，请勿外传。`,
    )
  }

  const handleResearchExport = async (format) => {
    if (!user?.isAdmin) return
    if (!confirmResearchDownload(`练习会话导出 (${format.toUpperCase()})`)) return
    setExportingResearch(true)
    try {
      await downloadResearchExport(format, { anonymize: format === 'csv' })
      showToast(`研究数据已导出（${format.toUpperCase()}）`, 'success')
    } catch (err) {
      showToast(getErrorMessage(err, '导出研究数据失败'), 'error')
    } finally {
      setExportingResearch(false)
    }
  }

  const handlePanelExport = async (format) => {
    if (!user?.isAdmin) return
    if (!confirmResearchDownload(`研究面板导出 (${format.toUpperCase()})`)) return
    setExportingPanel(true)
    try {
      await downloadResearchPanelExport(format, { anonymize: format === 'csv' })
      showToast(`研究面板已导出（${format.toUpperCase()}）`, 'success')
    } catch (err) {
      showToast(getErrorMessage(err, '导出研究面板失败'), 'error')
    } finally {
      setExportingPanel(false)
    }
  }

  const handleDailyDerive = async () => {
    if (!user?.isAdmin) return
    if (!window.confirm('确认执行日派生？将为所有用户（或指定用户）重算自动字段。')) return
    setDeriveLoading(true)
    setDeriveResult(null)
    setDeriveError(null)
    try {
      const data = await triggerDailyDerive()
      setDeriveResult(data?.message || '日派生已完成')
      showToast('日派生执行成功', 'success')
    } catch (err) {
      const msg = getErrorMessage(err, '日派生失败')
      setDeriveError(msg)
      showToast(msg, 'error')
    } finally {
      setDeriveLoading(false)
    }
  }

  const setBlindScore = (token, key, value) => {
    setBlindScores((prev) => ({
      ...prev,
      [token]: { ...(prev[token] || {}), [key]: value },
    }))
  }

  const handleExperienceReview = async (experienceId, decision) => {
    setExpReviewing(experienceId)
    try {
      await reviewExperience(experienceId, { decision })
      showToast(decision === 'approved' ? '面经已通过' : '面经已拒绝', 'success')
      await loadExperienceReview()
    } catch (err) {
      showToast(getErrorMessage(err, '审核失败'), 'error')
    } finally {
      setExpReviewing(null)
    }
  }

  const handleSeriesDisclosureSave = async (seriesRow) => {
    setSeriesSaving(seriesRow.id)
    try {
      await upsertCreatorSeries(seriesRow.id, {
        disclosure: seriesRow.disclosure,
        published: seriesRow.published,
      })
      showToast('专栏信息已保存', 'success')
      await loadCreatorSeriesAdmin()
    } catch (err) {
      showToast(getErrorMessage(err, '保存失败'), 'error')
    } finally {
      setSeriesSaving(null)
    }
  }

  const handleCreateOrg = async () => {
    if (!orgForm.name.trim() || !orgForm.pilot_period.trim() || !orgForm.service_description.trim()) {
      showToast('请填写机构名称、试点周期与服务说明', 'error')
      return
    }
    setOrgCreating(true)
    try {
      await adminCreateOrg({
        name: orgForm.name.trim(),
        pilot_period: orgForm.pilot_period.trim(),
        service_description: orgForm.service_description.trim(),
        fee_paid: orgForm.fee_paid,
        invite_method: orgForm.invite_method,
        human_coaching: orgForm.human_coaching,
        admin_user_id: orgForm.admin_user_id.trim() || null,
      })
      showToast('机构已创建', 'success')
      setOrgForm({
        name: '',
        pilot_period: '',
        service_description: '',
        fee_paid: false,
        invite_method: 'admin_invite',
        human_coaching: false,
        admin_user_id: '',
      })
      await loadOrgs()
    } catch (err) {
      showToast(getErrorMessage(err, '创建失败'), 'error')
    } finally {
      setOrgCreating(false)
    }
  }

  const handleAddWorkshop = async () => {
    if (!workshopDraft.orgId || !workshopDraft.title.trim()) {
      showToast('请选择机构并填写工作坊标题', 'error')
      return
    }
    try {
      await adminAddWorkshop(workshopDraft.orgId, {
        title: workshopDraft.title.trim(),
        description: '',
        mode: workshopDraft.mode,
        task_slug: workshopDraft.task_slug.trim(),
      })
      showToast('工作坊已添加', 'success')
      setWorkshopDraft({ orgId: '', title: '', mode: 'revision', task_slug: '' })
    } catch (err) {
      showToast(getErrorMessage(err, '添加失败'), 'error')
    }
  }

  const handleAddMentor = async () => {
    if (!mentorDraft.orgId || !mentorDraft.userId.trim()) {
      showToast('请选择机构并填写指导者用户 ID', 'error')
      return
    }
    try {
      await adminAddMentor(mentorDraft.orgId, mentorDraft.userId.trim())
      showToast('指导者已添加', 'success')
      setMentorDraft({ orgId: '', userId: '' })
    } catch (err) {
      showToast(getErrorMessage(err, '添加失败'), 'error')
    }
  }

  const handleBlindSubmit = async (token) => {
    if (!user?.isAdmin) return
    const scoresRaw = blindScores[token] || {}
    const scores = {}
    for (const { key } of BLIND_REVIEW_RUBRIC) {
      const n = Number(scoresRaw[key])
      if (!Number.isInteger(n) || n < 1 || n > 5) {
        showToast('请为四项指标均选择 1–5 分', 'error')
        return
      }
      scores[key] = n
    }
    setBlindSubmitting(token)
    try {
      await submitBlindReviewScore({ review_token: token, scores })
      showToast('盲评分数已保存', 'success')
      await loadBlindReview()
    } catch (err) {
      showToast(getErrorMessage(err, '提交盲评失败'), 'error')
    } finally {
      setBlindSubmitting(null)
    }
  }

  const filteredUsers = MOCK_USERS.filter((u) =>
    !userSearch || u.name.includes(userSearch) || u.email.includes(userSearch) || u.id.includes(userSearch.toUpperCase())
  )

  const filteredQuestions = MOCK_QUESTIONS_MGMT.filter((q) =>
    !questionSearch || q.title.includes(questionSearch) || q.id.includes(questionSearch.toUpperCase())
  )

  return (
    <div className={styles.page}>
      <PageBar
        title="管理后台"
        actions={
          <div className={styles['header-user']}>
            <span className={styles['header-name']}>{user?.name || '管理员'}</span>
          </div>
        }
      />

      {/* Tab Bar */}
      <div className={styles['tab-bar']}>
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.active : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ===== TAB: 总览 ===== */}
      {activeTab === '总览' && (
        <div className={styles['tab-content']}>
          {/* Stats Row */}
          <div className={styles['stats-grid']}>
            {overviewStats.map((s) => (
              <div key={s.label} className={`${styles['stat-card']} ${s.color ? styles[`stat-${s.color}`] : ''}`}>
                <div className={`hw-inset ${styles['stat-icon-bg']}`}>
                  <span className={styles['stat-icon']} aria-hidden="true">{s.icon}</span>
                </div>
                <div className={styles['stat-body']}>
                  <div className={styles['stat-label']}>{s.label}</div>
                  <div className={styles['stat-value']}>{s.value}</div>
                  <div className={styles['stat-delta']}>{s.delta}</div>
                </div>
              </div>
            ))}
          </div>

          <div className={styles['overview-grid']}>
            {/* Tier Distribution */}
            <div className={`hw-panel ${styles.panel}`}>
              <div className={styles['panel-header']}>
                <h3>会员分布</h3>
                <span className={styles['panel-id']}>[TIER]</span>
              </div>
              <div className={styles['tier-list']}>
                {tierDistribution.map((t) => (
                  <div key={t.tier} className={styles['tier-row']}>
                    <span className={`${styles['tier-badge']} ${styles[tierColorMap[t.tier]]}`}>{t.tier}</span>
                    <div className={styles['tier-bar-track']}>
                      <div className={styles['tier-bar-fill']} style={{ width: `${t.percent}%` }} />
                    </div>
                    <span className={styles['tier-count']}>{t.count}</span>
                    <span className={styles['tier-percent']}>{t.percent}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Session Type Stats */}
            <div className={`hw-panel ${styles.panel}`}>
              <div className={styles['panel-header']}>
                <h3>练习类型统计</h3>
                <span className={styles['panel-id']}>[SESSION]</span>
              </div>
              <div className={styles['type-stats']}>
                {sessionTypeStats.map((s) => (
                  <div key={s.type} className={styles['type-row']}>
                    <div className={styles['type-info']}>
                      <span className={styles['type-name']}>{s.type}</span>
                      <span className={styles['type-count']}>{s.count.toLocaleString()} 次</span>
                    </div>
                    <div className={styles['type-score']}>
                      <span className={styles['type-avg']}>均分 {s.avgScore}</span>
                      <div className={styles['mini-bar']}>
                        <div className={`${styles['mini-fill']} ${s.color ? styles[s.color] : ''}`} style={{ width: `${s.avgScore}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* System Logs */}
            <div className={`hw-panel ${styles.panel} ${styles['panel-wide']}`}>
              <div className={styles['panel-header']}>
                <h3>系统日志</h3>
                <span className={styles['panel-id']}>[LOG]</span>
              </div>
              <div className={styles['log-list']}>
                {MOCK_SYSTEM_LOGS.map((log, i) => (
                  <div key={i} className={styles['log-row']}>
                    <span className={styles['log-time']}>{log.time}</span>
                    <span className={`${styles['log-level']} ${styles[logLevelMap[log.level]]}`}>{log.level.toUpperCase()}</span>
                    <span className={styles['log-module']}>[{log.module}]</span>
                    <span className={styles['log-msg']}>{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== TAB: 用户管理 ===== */}
      {activeTab === '用户管理' && (
        <div className={styles['tab-content']}>
          <div className={styles['toolbar']}>
            <div className={styles['search-box']}>
              <span className={styles['search-icon']} aria-hidden="true">⌕</span>
              <input
                type="text"
                placeholder="搜索用户名、邮箱或 ID..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                aria-label="搜索用户"
              />
            </div>
            <div className={styles['toolbar-info']}>共 {filteredUsers.length} 位用户</div>
          </div>
          <div className={styles['table-wrap']}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>用户名</th>
                  <th>邮箱</th>
                  <th>会员</th>
                  <th>积分</th>
                  <th>练习次数</th>
                  <th>平均分</th>
                  <th>注册时间</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id}>
                    <td className={styles['cell-id']} data-label="ID">{u.id}</td>
                    <td className={styles['cell-name']} data-label="用户名">{u.name}</td>
                    <td className={styles['cell-email']} data-label="邮箱">{u.email}</td>
                    <td data-label="会员"><span className={`${styles['tier-tag']} ${styles[tierColorMap[u.tier]]}`}>{u.tier}</span></td>
                    <td className={styles['cell-num']} data-label="积分">{u.credits.toLocaleString()}</td>
                    <td className={styles['cell-num']} data-label="练习次数">{u.sessions}</td>
                    <td className={styles['cell-num']} data-label="平均分">{u.avgScore}</td>
                    <td className={styles['cell-date']} data-label="注册时间">{u.joinDate}</td>
                    <td data-label="状态"><span className={`${styles['status-dot']} ${styles[u.status]}`} />{u.status === 'active' ? '活跃' : '不活跃'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== TAB: 练习数据 ===== */}
      {activeTab === '练习数据' && (
        <div className={styles['tab-content']}>
          <div className={styles['stats-grid']}>
            <div className={styles['stat-card']}>
              <div className={styles['stat-body']}>
                <div className={styles['stat-label']}>总练习次数</div>
                <div className={styles['stat-value']}>{(stats.totalSessions + 6206).toLocaleString()}</div>
                <div className={styles['stat-delta']}>含历史数据</div>
              </div>
            </div>
            <div className={`${styles['stat-card']} ${styles['stat-purple']}`}>
              <div className={styles['stat-body']}>
                <div className={styles['stat-label']}>平均完成率</div>
                <div className={styles['stat-value']}>87.3%</div>
                <div className={styles['stat-delta']}>+2.1% 较上周</div>
              </div>
            </div>
            <div className={`${styles['stat-card']} ${styles['stat-blue']}`}>
              <div className={styles['stat-body']}>
                <div className={styles['stat-label']}>平均时长</div>
                <div className={styles['stat-value']}>28 min</div>
                <div className={styles['stat-delta']}>每次练习</div>
              </div>
            </div>
            <div className={`${styles['stat-card']} ${styles['stat-red']}`}>
              <div className={styles['stat-body']}>
                <div className={styles['stat-label']}>AI 调用次数</div>
                <div className={styles['stat-value']}>42.8k</div>
                <div className={styles['stat-delta']}>本月 LLM tokens</div>
              </div>
            </div>
          </div>

          <div className={`hw-panel ${styles.panel}`}>
            <div className={styles['panel-header']}>
              <h3>最近练习记录</h3>
              <span className={styles['panel-id']}>[RECENT]</span>
            </div>
            <div className={styles['table-wrap']}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>类型</th>
                    <th>话题</th>
                    <th>得分</th>
                    <th>时长</th>
                    <th>日期</th>
                  </tr>
                </thead>
                <tbody>
                  {(sessions.length > 0 ? sessions : [
                    { id: 's-demo-1', type: 'lgd', topic: '如何提升远程团队的协作效率', score: 85, durationMinutes: 45, date: '2026-03-16' },
                    { id: 's-demo-2', type: 'interview', topic: '1v1 模拟面试 · 结构化', score: 81, durationMinutes: 30, date: '2026-03-15' },
                    { id: 's-demo-3', type: 'lgd', topic: '新消费品牌的增长策略讨论', score: 78, durationMinutes: 40, date: '2026-03-14' },
                  ]).slice(0, 10).map((s) => (
                    <tr key={s.id}>
                      <td className={styles['cell-id']} data-label="ID">{s.id}</td>
                      <td data-label="类型"><span className={`${styles['type-tag']} ${styles[s.type]}`}>{s.type}</span></td>
                      <td className={styles['cell-topic']} data-label="话题">{s.topic}</td>
                      <td className={styles['cell-num']} data-label="得分">{s.score}</td>
                      <td className={styles['cell-num']} data-label="时长">{s.durationMinutes || '—'} min</td>
                      <td className={styles['cell-date']} data-label="日期">{s.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===== TAB: 题库管理 ===== */}
      {activeTab === '题库管理' && (
        <div className={styles['tab-content']}>
          <div className={styles['toolbar']}>
            <div className={styles['search-box']}>
              <span className={styles['search-icon']} aria-hidden="true">⌕</span>
              <input
                type="text"
                placeholder="搜索题目或 ID..."
                value={questionSearch}
                onChange={(e) => setQuestionSearch(e.target.value)}
                aria-label="搜索题目"
              />
            </div>
            <button className={styles['action-btn']}>+ 新增题目</button>
          </div>
          <div className={styles['table-wrap']}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>题目</th>
                  <th>分类</th>
                  <th>难度</th>
                  <th>使用次数</th>
                  <th>平均分</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuestions.map((q) => (
                  <tr key={q.id}>
                    <td className={styles['cell-id']} data-label="ID">{q.id}</td>
                    <td className={styles['cell-topic']} data-label="题目">{q.title}</td>
                    <td data-label="分类"><span className={styles['cat-tag']}>{q.category}</span></td>
                    <td data-label="难度"><span className={`${styles['diff-tag']} ${styles[`diff-${diffColorMap[q.difficulty]}`]}`}>{q.difficulty}</span></td>
                    <td className={styles['cell-num']} data-label="使用次数">{q.usageCount}</td>
                    <td className={styles['cell-num']} data-label="平均分">{q.avgScore}</td>
                    <td data-label="状态"><span className={`${styles['status-dot']} ${styles.active}`} />启用</td>
                    <td data-label="操作">
                      <button className={styles['row-btn']} onClick={() => navigate(`/questions/${q.id}`)}>查看</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === '面经审核' && (
        <div className={styles['tab-content']}>
          <div className={`hw-panel ${styles.panel}`}>
            <div className={styles['panel-header']}>
              <h3>待审核面经</h3>
              <span className={styles['panel-id']}>[EXP]</span>
              <button type="button" className={styles['row-btn']} onClick={loadExperienceReview}>
                刷新
              </button>
            </div>
            {expLoading && <p className={styles['panel-hint']}>加载中…</p>}
            {!expLoading && expPending.length === 0 && (
              <p className={styles['panel-hint']}>暂无待审核投稿</p>
            )}
            <div className={styles['log-list']}>
              {expPending.map((row) => (
                <div key={row.id} className={styles['log-row']} style={{ flexWrap: 'wrap', gap: '8px' }}>
                  <span className={styles['log-module']}>[{row.id}]</span>
                  <span className={styles['log-msg']}>
                    {row.company}
                    {' · '}
                    {row.role}
                    {' · '}
                    {row.stage}
                    {' · '}
                    {row.date_month}
                    {' — '}
                    {row.questions.length}
                    题
                  </span>
                  <button
                    type="button"
                    className={styles['row-btn']}
                    disabled={expReviewing === row.id}
                    onClick={() => handleExperienceReview(row.id, 'approved')}
                  >
                    通过
                  </button>
                  <button
                    type="button"
                    className={styles['row-btn']}
                    disabled={expReviewing === row.id}
                    onClick={() => handleExperienceReview(row.id, 'rejected')}
                  >
                    拒绝
                  </button>
                  <button type="button" className={styles['row-btn']} onClick={() => navigate(`/experiences/${row.id}`)}>
                    预览
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === '创作者内容' && (
        <div className={styles['tab-content']}>
          <div className={`hw-panel ${styles.panel}`}>
            <div className={styles['panel-header']}>
              <h3>创作者专栏</h3>
              <span className={styles['panel-id']}>[SERIES]</span>
              <button type="button" className={styles['row-btn']} onClick={loadCreatorSeriesAdmin}>
                刷新
              </button>
            </div>
            {seriesLoading && <p className={styles['panel-hint']}>加载中…</p>}
            {!seriesLoading && creatorSeries.length === 0 && (
              <p className={styles['panel-hint']}>暂无专栏（重启后端后会种子初始化）</p>
            )}
            {creatorSeries.map((row) => (
              <div key={row.id} className={styles['settings-row']} style={{ alignItems: 'flex-start', flexDirection: 'column', gap: '8px' }}>
                <strong>{row.topic}</strong>
                <span className={styles['panel-hint']}>
                  ID:
                  {row.id}
                  {' · '}
                  变体:
                  {row.variant}
                  {' · '}
                  {row.episodes?.length || 0}
                  集
                </span>
                <textarea
                  rows={3}
                  defaultValue={row.disclosure}
                  onChange={(e) => {
                    row.disclosure = e.target.value
                  }}
                  aria-label={`${row.id} 合作说明`}
                  style={{ width: '100%', fontFamily: 'var(--font-body)' }}
                />
                <label style={{ fontSize: '0.8rem' }}>
                  <input
                    type="checkbox"
                    defaultChecked={row.published !== false}
                    onChange={(e) => {
                      row.published = e.target.checked
                    }}
                  />
                  {' '}
                  已发布
                </label>
                <button
                  type="button"
                  className={styles['action-btn']}
                  disabled={seriesSaving === row.id}
                  onClick={() => handleSeriesDisclosureSave(row)}
                >
                  保存说明
                </button>
                <button type="button" className={styles['row-btn']} onClick={() => navigate(`/series/${row.id}`)}>
                  前台预览
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== TAB: 机构管理 ===== */}
      {activeTab === '机构管理' && user?.isAdmin && (
        <div className={styles['tab-content']}>
          <div className={`hw-panel ${styles.panel} ${styles['panel-span']}`}>
            <div className={styles['panel-header']}>
              <h3>新建机构 / 高校工作坊</h3>
              <span className={styles['panel-id']}>[ORG]</span>
            </div>
            <div className={styles['settings-list']}>
              <div className={styles['setting-row']}>
                <div className={styles['setting-info']}>
                  <div className={styles['setting-name']}>机构名称</div>
                  <input
                    value={orgForm.name}
                    onChange={(e) => setOrgForm((f) => ({ ...f, name: e.target.value }))}
                    style={{ width: '100%', marginTop: 6 }}
                  />
                </div>
              </div>
              <div className={styles['setting-row']}>
                <div className={styles['setting-info']}>
                  <div className={styles['setting-name']}>试点周期</div>
                  <input
                    value={orgForm.pilot_period}
                    onChange={(e) => setOrgForm((f) => ({ ...f, pilot_period: e.target.value }))}
                    placeholder="2026 春"
                    style={{ width: '100%', marginTop: 6 }}
                  />
                </div>
              </div>
              <div className={styles['setting-row']}>
                <div className={styles['setting-info']}>
                  <div className={styles['setting-name']}>服务说明（学生可见）</div>
                  <textarea
                    rows={3}
                    value={orgForm.service_description}
                    onChange={(e) => setOrgForm((f) => ({ ...f, service_description: e.target.value }))}
                    style={{ width: '100%', marginTop: 6 }}
                  />
                </div>
              </div>
              <div className={styles['setting-row']}>
                <label style={{ fontSize: '0.8rem' }}>
                  <input
                    type="checkbox"
                    checked={orgForm.fee_paid}
                    onChange={(e) => setOrgForm((f) => ({ ...f, fee_paid: e.target.checked }))}
                  />
                  {' '}
                  机构付费试点（研究区分）
                </label>
                <label style={{ fontSize: '0.8rem', marginLeft: 16 }}>
                  <input
                    type="checkbox"
                    checked={orgForm.human_coaching}
                    onChange={(e) => setOrgForm((f) => ({ ...f, human_coaching: e.target.checked }))}
                  />
                  {' '}
                  含人工辅导（研究区分）
                </label>
              </div>
              <div className={styles['setting-row']}>
                <div className={styles['setting-info']}>
                  <div className={styles['setting-name']}>邀请方式标记</div>
                  <input
                    value={orgForm.invite_method}
                    onChange={(e) => setOrgForm((f) => ({ ...f, invite_method: e.target.value }))}
                    placeholder="admin_invite / school_email / …"
                    style={{ width: '100%', marginTop: 6 }}
                  />
                </div>
              </div>
              <div className={styles['setting-row']}>
                <div className={styles['setting-info']}>
                  <div className={styles['setting-name']}>机构管理员用户 ID（可选）</div>
                  <input
                    value={orgForm.admin_user_id}
                    onChange={(e) => setOrgForm((f) => ({ ...f, admin_user_id: e.target.value }))}
                    style={{ width: '100%', marginTop: 6 }}
                  />
                </div>
                <button type="button" className={styles['action-btn']} disabled={orgCreating} onClick={handleCreateOrg}>
                  {orgCreating ? '创建中…' : '创建机构'}
                </button>
              </div>
            </div>
          </div>

          <div className={`hw-panel ${styles.panel} ${styles['panel-span']}`}>
            <div className={styles['panel-header']}>
              <h3>机构列表</h3>
              <button type="button" className={styles['row-btn']} onClick={loadOrgs}>刷新</button>
            </div>
            <div className={styles['table-wrap']}>
              {orgLoading ? (
                <p style={{ padding: '1rem', color: 'var(--chalk-dim)' }}>加载中…</p>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>名称</th>
                      <th>邀请码</th>
                      <th>成员</th>
                      <th>付费</th>
                      <th>人工辅导</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orgRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className={styles['cell-date']}>暂无机构，创建后学生可通过 /org/join/邀请码 加入</td>
                      </tr>
                    ) : (
                      orgRows.map((row) => (
                        <tr key={row.id}>
                          <td data-label="名称">{row.name}</td>
                          <td className={styles['cell-id']} data-label="邀请码">{row.invite_code}</td>
                          <td className={styles['cell-num']} data-label="成员">{row.member_count}</td>
                          <td data-label="付费">{row.fee_paid ? '是' : '否'}</td>
                          <td data-label="人工辅导">{row.human_coaching ? '是' : '否'}</td>
                          <td data-label="操作">
                            <button
                              type="button"
                              className={styles['row-btn']}
                              onClick={() => navigate(`/org/dashboard/${row.id}`)}
                            >
                              看板
                            </button>
                            <button
                              type="button"
                              className={styles['row-btn']}
                              onClick={() => {
                                const link = `${window.location.origin}/org/join/${row.invite_code}`
                                navigator.clipboard?.writeText(link)
                                showToast('加入链接已复制', 'success')
                              }}
                            >
                              复制链接
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className={`hw-panel ${styles.panel}`}>
            <div className={styles['panel-header']}>
              <h3>添加工作坊任务</h3>
            </div>
            <div className={styles['settings-list']}>
              <select
                value={workshopDraft.orgId}
                onChange={(e) => setWorkshopDraft((d) => ({ ...d, orgId: e.target.value }))}
                style={{ marginBottom: 8, width: '100%' }}
              >
                <option value="">选择机构</option>
                {orgRows.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
              <input
                placeholder="工作坊标题"
                value={workshopDraft.title}
                onChange={(e) => setWorkshopDraft((d) => ({ ...d, title: e.target.value }))}
                style={{ width: '100%', marginBottom: 8 }}
              />
              <select
                value={workshopDraft.mode}
                onChange={(e) => setWorkshopDraft((d) => ({ ...d, mode: e.target.value }))}
                style={{ width: '100%', marginBottom: 8 }}
              >
                <option value="revision">修订闭环</option>
                <option value="pair">双人追问</option>
              </select>
              <input
                placeholder="关联任务页 slug（可选）"
                value={workshopDraft.task_slug}
                onChange={(e) => setWorkshopDraft((d) => ({ ...d, task_slug: e.target.value }))}
                style={{ width: '100%', marginBottom: 8 }}
              />
              <button type="button" className={styles['action-btn']} onClick={handleAddWorkshop}>添加</button>
            </div>
          </div>

          <div className={`hw-panel ${styles.panel}`}>
            <div className={styles['panel-header']}>
              <h3>添加指导者</h3>
            </div>
            <div className={styles['settings-list']}>
              <select
                value={mentorDraft.orgId}
                onChange={(e) => setMentorDraft((d) => ({ ...d, orgId: e.target.value }))}
                style={{ marginBottom: 8, width: '100%' }}
              >
                <option value="">选择机构</option>
                {orgRows.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
              <input
                placeholder="指导者用户 ID"
                value={mentorDraft.userId}
                onChange={(e) => setMentorDraft((d) => ({ ...d, userId: e.target.value }))}
                style={{ width: '100%', marginBottom: 8 }}
              />
              <button type="button" className={styles['action-btn']} onClick={handleAddMentor}>添加</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== TAB: 系统设置 ===== */}
      {activeTab === '系统设置' && (
        <div className={styles['tab-content']}>
          <div className={styles['settings-grid']}>
            {/* LLM Config */}
            <div className={`hw-panel ${styles.panel}`}>
              <div className={styles['panel-header']}>
                <h3>LLM 模型配置</h3>
                <span className={styles['panel-id']}>[LLM]</span>
              </div>
              <div className={styles['settings-list']}>
                <div className={styles['setting-row']}>
                  <div className={styles['setting-info']}>
                    <div className={styles['setting-name']}>主模型</div>
                    <div className={styles['setting-desc']}>用于面试对话和简历优化的主力模型</div>
                  </div>
                  <div className={styles['setting-value']}>qwen-plus</div>
                </div>
                <div className={styles['setting-row']}>
                  <div className={styles['setting-info']}>
                    <div className={styles['setting-name']}>备选模型</div>
                    <div className={styles['setting-desc']}>主模型超时或失败时自动降级</div>
                  </div>
                  <div className={styles['setting-value']}>deepseek-chat</div>
                </div>
                <div className={styles['setting-row']}>
                  <div className={styles['setting-info']}>
                    <div className={styles['setting-name']}>Temperature</div>
                    <div className={styles['setting-desc']}>模型创造性参数 (0-1)</div>
                  </div>
                  <div className={styles['setting-value']}>0.7</div>
                </div>
                <div className={styles['setting-row']}>
                  <div className={styles['setting-info']}>
                    <div className={styles['setting-name']}>Max Tokens</div>
                    <div className={styles['setting-desc']}>单次输出最大 token 数</div>
                  </div>
                  <div className={styles['setting-value']}>1024</div>
                </div>
              </div>
            </div>

            {/* Credit Config */}
            <div className={`hw-panel ${styles.panel}`}>
              <div className={styles['panel-header']}>
                <h3>积分配置</h3>
                <span className={styles['panel-id']}>[CREDITS]</span>
              </div>
              <div className={styles['settings-list']}>
                <div className={styles['setting-row']}>
                  <div className={styles['setting-info']}>
                    <div className={styles['setting-name']}>LGD 群面消耗</div>
                    <div className={styles['setting-desc']}>每次群面练习消耗的积分</div>
                  </div>
                  <div className={styles['setting-value']}>800</div>
                </div>
                <div className={styles['setting-row']}>
                  <div className={styles['setting-info']}>
                    <div className={styles['setting-name']}>1v1 面试消耗</div>
                    <div className={styles['setting-desc']}>每次单面练习消耗的积分</div>
                  </div>
                  <div className={styles['setting-value']}>500</div>
                </div>
                <div className={styles['setting-row']}>
                  <div className={styles['setting-info']}>
                    <div className={styles['setting-name']}>简历优化消耗</div>
                    <div className={styles['setting-desc']}>每次简历优化消耗的积分</div>
                  </div>
                  <div className={styles['setting-value']}>300</div>
                </div>
                <div className={styles['setting-row']}>
                  <div className={styles['setting-info']}>
                    <div className={styles['setting-name']}>Free 每日积分</div>
                    <div className={styles['setting-desc']}>免费用户每日获得的积分</div>
                  </div>
                  <div className={styles['setting-value']}>50</div>
                </div>
              </div>
            </div>

            {user?.isAdmin && (
              <div className={`hw-panel ${styles.panel}`}>
                <div className={styles['panel-header']}>
                  <h3>邀请归因统计</h3>
                  <span className={styles['panel-id']}>[REFERRAL]</span>
                </div>
                <div className={styles['table-wrap']}>
                  {referralLoading ? (
                    <p style={{ padding: '1rem', color: 'var(--chalk-dim)' }}>加载中…</p>
                  ) : (
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>邀请人</th>
                          <th>邀请码</th>
                          <th>激励</th>
                          <th>被邀请人数</th>
                          <th>合格练习人数</th>
                          <th>净贡献次数</th>
                        </tr>
                      </thead>
                      <tbody>
                        {referralStats.length === 0 ? (
                          <tr>
                            <td colSpan={6} className={styles['cell-date']}>暂无邀请记录</td>
                          </tr>
                        ) : (
                          referralStats.map((row) => (
                            <tr key={row.inviter_id}>
                              <td className={styles['cell-email']} data-label="邀请人">{row.inviter_email || row.inviter_id}</td>
                              <td className={styles['cell-id']} data-label="邀请码">{row.invite_code}</td>
                              <td data-label="激励">{row.referral_incentive}</td>
                              <td className={styles['cell-num']} data-label="被邀请人数">{row.assigned_invitees}</td>
                              <td className={styles['cell-num']} data-label="合格练习人数">{row.eligible_practice_invitees}</td>
                              <td className={styles['cell-num']} data-label="净贡献次数">{row.net_contribution_count}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {user?.isAdmin && (
              <div className={`hw-panel ${styles.panel}`}>
                <div className={styles['panel-header']}>
                  <h3>研究数据 · 问卷统计</h3>
                  <span className={styles['panel-id']}>[STATS]</span>
                </div>
                <p className={styles['panel-hint']}>
                  被动/主动问卷聚合、实验对比与交叉分析（只读，无占位数据）。
                </p>
                <Link to="/management/research" className={styles['action-btn']} style={{ display: 'inline-block', textAlign: 'center' }}>
                  打开问卷统计
                </Link>
              </div>
            )}

            {user?.isAdmin && (
              <div className={`hw-panel ${styles.panel}`}>
                <div className={styles['panel-header']}>
                  <h3>项目框架</h3>
                  <span className={styles['panel-id']}>[MAP]</span>
                </div>
                <p className={styles['panel-hint']}>
                  按真实路由绘制的页面与数据流地图，规划中能力以虚线标注。
                </p>
                <Link to="/management/framework" className={styles['action-btn']} style={{ display: 'inline-block', textAlign: 'center' }}>
                  打开项目框架
                </Link>
              </div>
            )}

            {user?.isAdmin && (
              <div className={`hw-panel ${styles.panel} ${styles['panel-span']}`}>
                <div className={styles['panel-header']}>
                  <h3>问卷 · 研究数据导出</h3>
                  <span className={styles['panel-id']}>[RESEARCH]</span>
                </div>
                <div className={styles['settings-list']}>
                  <div className={styles['setting-row']}>
                    <div className={styles['setting-info']}>
                      <div className={styles['setting-name']}>练习会话导出</div>
                      <div className={styles['setting-desc']}>
                        已知情同意用户的已完成练习会话（JSONL 含完整转写；CSV 摘要且匿名 user_id）
                      </div>
                    </div>
                    <div className={styles['export-actions']}>
                      <button
                        type="button"
                        className={styles['action-btn']}
                        disabled={exportingResearch || exportingPanel}
                        onClick={() => handleResearchExport('jsonl')}
                      >
                        {exportingResearch ? '导出中…' : '会话 JSONL'}
                      </button>
                      <button
                        type="button"
                        className={styles['action-btn']}
                        disabled={exportingResearch || exportingPanel}
                        onClick={() => handleResearchExport('csv')}
                      >
                        {exportingResearch ? '导出中…' : '会话 CSV'}
                      </button>
                    </div>
                  </div>
                  <div className={styles['setting-row']}>
                    <div className={styles['setting-info']}>
                      <div className={styles['setting-name']}>研究面板导出</div>
                      <div className={styles['setting-desc']}>
                        自动字段、问卷作答与实验分组等面板宽表（auto + survey + arms）
                      </div>
                    </div>
                    <div className={styles['export-actions']}>
                      <button
                        type="button"
                        className={styles['action-btn']}
                        disabled={exportingResearch || exportingPanel}
                        onClick={() => handlePanelExport('jsonl')}
                      >
                        {exportingPanel ? '导出中…' : '面板 JSONL'}
                      </button>
                      <button
                        type="button"
                        className={styles['action-btn']}
                        disabled={exportingResearch || exportingPanel}
                        onClick={() => handlePanelExport('csv')}
                      >
                        {exportingPanel ? '导出中…' : '面板 CSV'}
                      </button>
                    </div>
                  </div>
                  <div className={styles['setting-row']}>
                    <div className={styles['setting-info']}>
                      <div className={styles['setting-name']}>追访测试</div>
                      <div className={styles['setting-desc']}>将当前管理员的追访/后测到期时间设为现在</div>
                    </div>
                    <div className={styles['export-actions']}>
                      <button
                        type="button"
                        className={styles['action-btn']}
                        onClick={async () => {
                          try {
                            await accelerateResearchDatesAdmin()
                            showToast('已将当前管理员的追访日期设为现在（测试）', 'success')
                          } catch (err) {
                            showToast(getErrorMessage(err, '加速失败'), 'error')
                          }
                        }}
                      >
                        加速追访日期 (测试)
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {user?.isAdmin && (
              <div className={`hw-panel ${styles.panel}`}>
                <div className={styles['panel-header']}>
                  <h3>日派生</h3>
                  <span className={styles['panel-id']}>[DERIVE]</span>
                </div>
                <div className={styles['settings-list']}>
                  <div className={styles['setting-row']}>
                    <div className={styles['setting-info']}>
                      <div className={styles['setting-name']}>运行日派生任务</div>
                      <div className={styles['setting-desc']}>
                        调用 POST /research/derive/daily，从事件流重算用户级自动聚合字段
                      </div>
                    </div>
                    <div className={styles['export-actions']}>
                      <button
                        type="button"
                        className={styles['action-btn']}
                        disabled={deriveLoading}
                        onClick={handleDailyDerive}
                      >
                        {deriveLoading ? '执行中…' : '执行日派生'}
                      </button>
                    </div>
                  </div>
                  {deriveLoading && (
                    <p className={styles['panel-hint']}>正在派生，请稍候…</p>
                  )}
                  {!deriveLoading && deriveResult && (
                    <p className={`${styles['panel-hint']} ${styles['panel-hint-ok']}`}>{deriveResult}</p>
                  )}
                  {!deriveLoading && deriveError && (
                    <div className={styles['panel-error']}>
                      <span>{deriveError}</span>
                      <button type="button" className={styles['row-btn']} onClick={handleDailyDerive}>
                        重试
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {user?.isAdmin && (
              <div className={`hw-panel ${styles.panel} ${styles['panel-span']}`}>
                <div className={styles['panel-header']}>
                  <h3>盲评 J1</h3>
                  <span className={styles['panel-id']}>[BLIND]</span>
                  <button
                    type="button"
                    className={styles['row-btn']}
                    disabled={blindLoading}
                    onClick={loadBlindReview}
                  >
                    {blindLoading ? '刷新中…' : '刷新队列'}
                  </button>
                </div>
                {blindLoading && blindPending.length === 0 && !blindError && (
                  <p className={styles['panel-hint']}>加载待评条目…</p>
                )}
                {blindError && (
                  <div className={styles['panel-error']}>
                    <span>{blindError}</span>
                    <button type="button" className={styles['row-btn']} onClick={loadBlindReview}>
                      重试
                    </button>
                  </div>
                )}
                {!blindLoading && !blindError && blindPending.length === 0 && (
                  <p className={styles['panel-hint']}>暂无待盲评的后测回答</p>
                )}
                {blindPending.length > 0 && (
                  <div className={styles['blind-list']}>
                    {blindPending.map((item, index) => (
                      <div key={item.review_token} className={styles['blind-card']}>
                        <div className={styles['blind-card-head']}>
                          <span className={styles['cell-id']}>条目 #{index + 1}</span>
                        </div>
                        <div className={styles['blind-answer']}>
                          {item.answer?.trim() ? item.answer : '（无回答文本）'}
                        </div>
                        <div className={styles['blind-scores']}>
                          {BLIND_REVIEW_RUBRIC.map(({ key, label }) => (
                            <label key={key} className={styles['blind-score-field']}>
                              <span>{label}</span>
                              <select
                                className={styles['blind-select']}
                                value={blindScores[item.review_token]?.[key] ?? ''}
                                onChange={(e) => setBlindScore(item.review_token, key, e.target.value)}
                                aria-label={`${label} 评分`}
                              >
                                <option value="">—</option>
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <option key={n} value={n}>
                                    {n}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ))}
                        </div>
                        <button
                          type="button"
                          className={styles['action-btn']}
                          disabled={blindSubmitting === item.review_token}
                          onClick={() => handleBlindSubmit(item.review_token)}
                        >
                          {blindSubmitting === item.review_token ? '提交中…' : '提交评分'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* System Info */}
            <div className={`hw-panel ${styles.panel}`}>
              <div className={styles['panel-header']}>
                <h3>系统信息</h3>
                <span className={styles['panel-id']}>[SYS]</span>
              </div>
              <div className={styles['settings-list']}>
                <div className={styles['setting-row']}>
                  <div className={styles['setting-info']}>
                    <div className={styles['setting-name']}>版本</div>
                  </div>
                  <div className={styles['setting-value']}>v1.0.0-mvp</div>
                </div>
                <div className={styles['setting-row']}>
                  <div className={styles['setting-info']}>
                    <div className={styles['setting-name']}>前端框架</div>
                  </div>
                  <div className={styles['setting-value']}>React 19 + Vite 8</div>
                </div>
                <div className={styles['setting-row']}>
                  <div className={styles['setting-info']}>
                    <div className={styles['setting-name']}>状态管理</div>
                  </div>
                  <div className={styles['setting-value']}>Zustand 5</div>
                </div>
                <div className={styles['setting-row']}>
                  <div className={styles['setting-info']}>
                    <div className={styles['setting-name']}>AI Copilot</div>
                  </div>
                  <div className={styles['setting-value']}>PageAgent 1.5.7</div>
                </div>
                <div className={styles['setting-row']}>
                  <div className={styles['setting-info']}>
                    <div className={styles['setting-name']}>环境</div>
                  </div>
                  <div className={styles['setting-value']}>development</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
