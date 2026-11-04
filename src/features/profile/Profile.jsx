import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts'
import useAuthStore from '../../stores/authStore'
import useSessionStore from '../../stores/sessionStore'
import ResearchConsentModal from '../../components/ResearchConsentModal/ResearchConsentModal'
import { fetchResearchInvite, submitResearchConsent } from '../../api/research'
import {
  completeOrgWorkshop,
  fetchOrgMembership,
  shareSessionWithMentor,
  updateOrgConsent,
} from '../../api/org'
import { getErrorMessage } from '../../api/client'
import { showToast } from '../../stores/toastStore'
import { formatAvgScore, rankFromAvgScore, rankProgressFromScore } from '../../utils/userStats'
import PageBar from '../../components/ui/PageBar'
import MobileMoreLinks from '../../components/Layout/MobileMoreLinks'
import styles from './Profile.module.css'

const DEFAULT_USER_DATA = {
  name: '元启用户',
  initials: 'YQ',
  email: 'yuanqi@edgewise.ai',
  phone: '138****6789',
  joinDate: '2026-01-15',
  tier: 'Pro',
  tierLabel: '黄金专业版',
  tierExpiry: '2026-06-15',
}

const memberStats = {
  totalSessions: 47,
  totalHours: 18.5,
  avgScore: 82.4,
  credits: 1280,
  streak: 7,
  bestScore: 96,
}

const radarData = [
  { axis: '表达力', value: 82 },
  { axis: '逻辑力', value: 75 },
  { axis: '领导力', value: 68 },
  { axis: '协作力', value: 88 },
  { axis: '应变力', value: 71 },
]

const achievements = [
  { id: 1, icon: '⚡', name: '初次登场', desc: '完成第一次面试练习', unlocked: true },
  { id: 2, icon: '🔥', name: '连续七天', desc: '连续 7 天登录练习', unlocked: true },
  { id: 3, icon: '⬡', name: '群面达人', desc: '完成 10 次 LGD 群面', unlocked: true },
  { id: 4, icon: '◈', name: '高分选手', desc: '单次练习得分超过 90', unlocked: true },
  { id: 5, icon: '△', name: '全能王者', desc: '五维能力均超过 80', unlocked: false },
  { id: 6, icon: '◇', name: '钻石之路', desc: '晋升钻石段位', unlocked: false },
]

const activityLog = [
  { date: '今天', action: 'LGD 群面练习', detail: '远程团队协作效率', score: 85 },
  { date: '昨天', action: '简历 AI 优化', detail: '产品经理岗位', score: 92 },
  { date: '2 天前', action: 'LGD 群面练习', detail: '新消费品牌增长策略', score: 78 },
  { date: '3 天前', action: '1v1 模拟面试', detail: '战略咨询', score: 81 },
  { date: '4 天前', action: 'LGD 群面练习', detail: '大学生创业时机', score: 88 },
]

export default function Profile() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const sessionStats = useSessionStore((s) => s.stats)
  const sessions = useSessionStore((s) => s.sessions)
  const storeRadar = useSessionStore((s) => s.radarData)
  const refresh = useSessionStore((s) => s.refresh)
  const loading = useSessionStore((s) => s.loading)
  const sessionError = useSessionStore((s) => s.error)
  const [activeTab, setActiveTab] = useState('overview')
  const [inviteInfo, setInviteInfo] = useState(null)
  const [consentModal, setConsentModal] = useState(null)
  const [orgMembership, setOrgMembership] = useState(null)
  const [orgShareBusy, setOrgShareBusy] = useState(null)

  useEffect(() => {
    fetchResearchInvite()
      .then(setInviteInfo)
      .catch(() => {})
  }, [user?.id])

  useEffect(() => {
    fetchOrgMembership()
      .then(setOrgMembership)
      .catch(() => setOrgMembership(null))
  }, [user?.id])

  useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  const loadError = sessionError ? getErrorMessage(sessionError, '加载练习数据失败') : ''

  const userData = {
    ...DEFAULT_USER_DATA,
    name: user?.name || DEFAULT_USER_DATA.name,
    initials: user?.initials || DEFAULT_USER_DATA.initials,
    email: user?.email || DEFAULT_USER_DATA.email,
    joinDate: user?.joinDate || DEFAULT_USER_DATA.joinDate,
    tier: user?.tier || DEFAULT_USER_DATA.tier,
    tierLabel: user?.tierLabel || DEFAULT_USER_DATA.tierLabel,
  }

  const scores = sessions.filter((s) => typeof s.score === 'number').map((s) => s.score)
  const rankInfo = rankFromAvgScore(sessionStats.avgScore || 0)
  const rankProgress = rankProgressFromScore(sessionStats.avgScore || 0)

  const dynamicMemberStats = {
    ...memberStats,
    totalSessions: sessionStats.totalSessions || 0,
    totalHours: Number(((sessionStats.totalDuration || 0) / 60).toFixed(1)),
    avgScore: formatAvgScore(sessionStats.avgScore || 0),
    credits: sessionStats.credits || user?.credits || 0,
    streak: sessionStats.streak || 0,
    bestScore: scores.length ? Math.max(...scores) : 0,
  }

  const liveRadar = storeRadar?.some((d) => d.value > 0) ? storeRadar : radarData
  const liveActivity = sessions.slice(0, 5).map((s) => ({
    date: s.date,
    action: s.type === 'lgd' ? 'LGD 群面练习' : s.type === 'interview' ? '1v1 模拟面试' : s.type,
    detail: s.topic,
    score: s.score,
  }))

  if (loading && sessions.length === 0) {
    return (
      <div className={styles.profile}>
        <p style={{ padding: '2rem', color: 'var(--chalk-dim)', fontFamily: 'var(--font-mono)' }}>
          正在加载个人数据…
        </p>
      </div>
    )
  }

  return (
    <div className={styles.profile}>
      {loadError && (
        <p style={{ color: 'var(--danger)', padding: '0 0 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
          {loadError}
        </p>
      )}
      <PageBar
        title={userData.name}
        context={`${userData.tier} · ${userData.email}`}
        actions={
          <div className={styles['rank-display']}>
            <div className={styles['rank-icon']}>◇</div>
            <div className={styles['rank-info']}>
              <div className={styles['rank-name']}>{rankInfo.name}</div>
              <div className={styles['rank-exp']}>{rankProgress.exp} / {rankProgress.nextExp} EXP</div>
              <div className={styles['rank-bar']}>
                <div className={styles['rank-fill']} style={{ width: `${rankProgress.progress}%` }} />
              </div>
              <div className={styles['rank-next']}>
                {rankProgress.nextRank
                  ? `距 ${rankProgress.nextRank} 还需 ${Math.max(0, rankProgress.nextExp - rankProgress.exp)} EXP`
                  : '已达当前最高段位'}
              </div>
            </div>
          </div>
        }
      />

      <MobileMoreLinks />

      <p style={{ margin: '0 0 1rem', fontSize: '0.85rem' }}>
        <Link to="/stories" style={{ color: 'var(--accent, #c9a227)', fontFamily: 'var(--font-mono)' }}>
          STAR 故事库 →
        </Link>
        <span style={{ color: 'var(--chalk-dim)', marginLeft: '0.5rem' }}>
          沉淀修订后的经历，行为面多题复用
        </span>
      </p>

      {/* Tab Navigation */}
      <div className={styles['tab-bar']}>
        {[
          { id: 'overview', label: '总览' },
          { id: 'achievements', label: '成就' },
          { id: 'settings', label: '设置' },
        ].map((tab) => (
          <button
            key={tab.id}
            className={`${styles['tab-btn']} ${activeTab === tab.id ? styles.active : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className={styles['tab-content']}>
          {/* Stats Grid */}
          <div className={styles['mini-stats']}>
            {[
              { label: '练习次数', value: dynamicMemberStats.totalSessions, unit: '次' },
              { label: '练习时长', value: dynamicMemberStats.totalHours, unit: 'h' },
              { label: '平均得分', value: dynamicMemberStats.avgScore, unit: '' },
              { label: '最高得分', value: dynamicMemberStats.bestScore, unit: '' },
              { label: '积分余额', value: dynamicMemberStats.credits.toLocaleString(), unit: '' },
              { label: '连续天数', value: dynamicMemberStats.streak, unit: '天' },
            ].map((s) => (
              <div key={s.label} className={styles['mini-stat']}>
                <div className={styles['mini-stat-value']}>
                  {s.value}<span className={styles['mini-stat-unit']}>{s.unit}</span>
                </div>
                <div className={styles['mini-stat-label']}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Radar + Activity */}
          <div className={styles['overview-grid']}>
            {/* Ability Radar */}
            <div className={styles.panel}>
              <div className={styles['panel-title']}>能力画像</div>
              <div className={styles['radar-wrap']}>
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={liveRadar} outerRadius="72%">
                    <PolarGrid stroke="rgba(226,224,229,0.08)" />
                    <PolarAngleAxis
                      dataKey="axis"
                      tick={{ fill: 'rgba(226,224,229,0.6)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                    />
                    <Radar
                      dataKey="value"
                      stroke="#9b6fc7"
                      fill="#9b6fc7"
                      fillOpacity={0.15}
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#9b6fc7', strokeWidth: 0 }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Recent Activity */}
            <div className={styles.panel}>
              <div className={styles['panel-title']}>最近动态</div>
              <div className={styles['activity-list']}>
                {(liveActivity.length ? liveActivity : activityLog).map((a, i) => (
                  <div key={i} className={styles['activity-row']}>
                    <div className={styles['activity-date']}>{a.date}</div>
                    <div className={styles['activity-body']}>
                      <div className={styles['activity-action']}>{a.action}</div>
                      <div className={styles['activity-detail']}>{a.detail}</div>
                    </div>
                    <div className={styles['activity-score']}>{a.score}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'achievements' && (
        <div className={styles['tab-content']}>
          <div className={styles['achieve-grid']}>
            {achievements.map((a) => (
              <div key={a.id} className={`${styles['achieve-card']} ${!a.unlocked ? styles.locked : ''}`}>
                <div className={styles['achieve-icon']}>{a.icon}</div>
                <div className={styles['achieve-info']}>
                  <div className={styles['achieve-name']}>{a.name}</div>
                  <div className={styles['achieve-desc']}>{a.desc}</div>
                </div>
                {a.unlocked
                  ? <div className={styles['achieve-check']}>✓</div>
                  : <div className={styles['achieve-lock']}>🔒</div>
                }
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className={styles['tab-content']}>
          <div className={styles['settings-grid']}>
            {/* Account Info */}
            <div className={styles.panel}>
              <div className={styles['panel-title']}>账户信息</div>
              <div className={styles['settings-list']}>
                <div className={styles['setting-row']}>
                  <span className={styles['setting-label']}>用户名</span>
                  <span className={styles['setting-value']}>{userData.name}</span>
                </div>
                <div className={styles['setting-row']}>
                  <span className={styles['setting-label']}>邮箱</span>
                  <span className={styles['setting-value']}>{userData.email}</span>
                </div>
                <div className={styles['setting-row']}>
                  <span className={styles['setting-label']}>手机</span>
                  <span className={styles['setting-value']}>{userData.phone}</span>
                </div>
                <div className={styles['setting-row']}>
                  <span className={styles['setting-label']}>注册日期</span>
                  <span className={styles['setting-value']}>{userData.joinDate}</span>
                </div>
              </div>
            </div>

            {/* Subscription */}
            <div className={styles.panel}>
              <div className={styles['panel-title']}>订阅管理</div>
              <div className={styles['sub-card']}>
                <div className={styles['sub-tier']}>
                  <span className={styles['sub-badge']}>PRO</span>
                  <span className={styles['sub-name']}>{userData.tierLabel}</span>
                </div>
                <div className={styles['sub-detail']}>
                  有效期至 {userData.tierExpiry} · 月发 100,000 积分
                </div>
                <div className={styles['sub-features']}>
                  <span>✓ LGD 群面</span>
                  <span>✓ 深度话术重构</span>
                  <span>✓ 双轨评估</span>
                  <span>✓ 模拟面试</span>
                </div>
                <button className={styles['sub-btn']}>管理订阅</button>
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles['panel-title']}>研究与邀请</div>
              <div className={styles['settings-list']}>
                <div className={styles['setting-row']}>
                  <span className={styles['setting-label']}>研究同意</span>
                  <span className={styles['setting-value']}>
                    {user?.researchConsent?.accepted ? '已同意' : user?.researchConsent === null ? '未选择' : '未参与 / 已撤回'}
                  </span>
                </div>
                {user?.experimentAssignment?.arm && (
                  <div className={styles['setting-row']}>
                    <span className={styles['setting-label']}>实验分组</span>
                    <span className={styles['setting-value']}>Arm {user.experimentAssignment.arm}</span>
                  </div>
                )}
                {inviteInfo && (
                  <div className={styles['setting-row']}>
                    <span className={styles['setting-label']}>邀请链接</span>
                    <span className={styles['setting-value']} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                      {typeof window !== 'undefined' ? `${window.location.origin}${inviteInfo.invite_path}` : inviteInfo.invite_path}
                    </span>
                  </div>
                )}
                <div className={styles['actions-list']} style={{ marginTop: '0.75rem' }}>
                  {user?.researchConsent?.accepted ? (
                    <button type="button" className={styles['action-btn']} onClick={() => setConsentModal('withdraw')}>
                      撤回研究同意
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles['action-btn']}
                      onClick={async () => {
                        try {
                          await submitResearchConsent(true)
                          await useAuthStore.getState().fetchMe()
                          showToast('已重新确认研究同意', 'success')
                        } catch (err) {
                          showToast(getErrorMessage(err, '操作失败'), 'error')
                        }
                      }}
                    >
                      重新同意参与研究
                    </button>
                  )}
                </div>
              </div>
            </div>

            {orgMembership?.org_id && (
              <div className={styles.panel}>
                <div className={styles['panel-title']}>机构工作坊 · {orgMembership.org_name}</div>
                <div className={styles['settings-list']}>
                  <div className={styles['setting-row']}>
                    <span className={styles['setting-label']}>与指导者分享</span>
                    <span className={styles['setting-value']}>
                      {orgMembership.consent?.share_with_mentor ? '已开启' : '未开启'}
                    </span>
                  </div>
                  <div className={styles['actions-list']} style={{ marginTop: '0.75rem' }}>
                    <button
                      type="button"
                      className={styles['action-btn']}
                      onClick={async () => {
                        try {
                          await updateOrgConsent({
                            share_with_mentor: !orgMembership.consent?.share_with_mentor,
                          })
                          const next = await fetchOrgMembership()
                          setOrgMembership(next)
                          showToast('机构分享设置已更新', 'success')
                        } catch (err) {
                          showToast(getErrorMessage(err, '更新失败'), 'error')
                        }
                      }}
                    >
                      {orgMembership.consent?.share_with_mentor ? '关闭指导者分享' : '开启指导者分享'}
                    </button>
                    {orgMembership.role === 'admin' && (
                      <button
                        type="button"
                        className={styles['action-btn']}
                        onClick={() => navigate(`/org/dashboard/${orgMembership.org_id}`)}
                      >
                        机构看板
                      </button>
                    )}
                    {orgMembership.role === 'mentor' && (
                      <button type="button" className={styles['action-btn']} onClick={() => navigate('/org/mentor')}>
                        指导者视图
                      </button>
                    )}
                  </div>
                  {orgMembership.workshops?.length > 0 && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <div className={styles['setting-label']} style={{ marginBottom: 6 }}>工作坊任务</div>
                      {orgMembership.workshops.map((ws) => (
                        <div key={ws.id} className={styles['setting-row']} style={{ flexWrap: 'wrap', gap: 8 }}>
                          <span className={styles['setting-value']}>
                            {ws.title}
                            {' · '}
                            {ws.mode === 'pair' ? '双人追问' : '修订闭环'}
                            {ws.completed ? ' · 已完成' : ''}
                          </span>
                          {!ws.completed && (
                            <button
                              type="button"
                              className={styles['action-btn']}
                              onClick={async () => {
                                try {
                                  await completeOrgWorkshop(ws.id)
                                  const next = await fetchOrgMembership()
                                  setOrgMembership(next)
                                  showToast('工作坊已标记完成', 'success')
                                } catch (err) {
                                  showToast(getErrorMessage(err, '操作失败'), 'error')
                                }
                              }}
                            >
                              标记完成
                            </button>
                          )}
                          {ws.task_slug && (
                            <button
                              type="button"
                              className={styles['action-btn']}
                              onClick={() => navigate(`/tasks/${ws.task_slug}`)}
                            >
                              去做任务
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {orgMembership.consent?.share_with_mentor && sessions?.length > 0 && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <div className={styles['setting-label']} style={{ marginBottom: 6 }}>分享指定练习给指导者</div>
                      {sessions.slice(0, 8).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className={styles['action-btn']}
                          style={{ display: 'block', marginBottom: 6, width: '100%' }}
                          disabled={orgShareBusy === s.id}
                          onClick={async () => {
                            setOrgShareBusy(s.id)
                            try {
                              await shareSessionWithMentor(s.id)
                              showToast('已分享给指导者', 'success')
                            } catch (err) {
                              showToast(getErrorMessage(err, '分享失败'), 'error')
                            } finally {
                              setOrgShareBusy(null)
                            }
                          }}
                        >
                          {orgShareBusy === s.id ? '分享中…' : `分享场次 ${s.id.slice(0, 8)}…`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Preferences */}
            <div className={styles.panel}>
              <div className={styles['panel-title']}>偏好设置</div>
              <div className={styles['settings-list']}>
                <div className={styles['setting-row']}>
                  <span className={styles['setting-label']}>练习提醒</span>
                  <div className={`${styles.toggle} ${styles.on}`}><div className={styles['toggle-dot']} /></div>
                </div>
                <div className={styles['setting-row']}>
                  <span className={styles['setting-label']}>邮件通知</span>
                  <div className={`${styles.toggle} ${styles.on}`}><div className={styles['toggle-dot']} /></div>
                </div>
                <div className={styles['setting-row']}>
                  <span className={styles['setting-label']}>AI Copilot</span>
                  <div className={`${styles.toggle} ${styles.on}`}><div className={styles['toggle-dot']} /></div>
                </div>
                <div className={styles['setting-row']}>
                  <span className={styles['setting-label']}>音效反馈</span>
                  <div className={styles.toggle}><div className={styles['toggle-dot']} /></div>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className={styles.panel}>
              <div className={styles['panel-title']}>账户操作</div>
              <div className={styles['actions-list']}>
                <button className={styles['action-btn']}>修改密码</button>
                <button className={styles['action-btn']} onClick={() => { useAuthStore.getState().logout().finally(() => navigate('/login')) }}>退出登录</button>
                <button className={`${styles['action-btn']} ${styles.danger}`}>注销账户</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {consentModal === 'withdraw' && (
        <ResearchConsentModal
          mode="withdraw"
          onResolved={() => {
            setConsentModal(null)
            useAuthStore.getState().fetchMe().catch(() => {})
          }}
        />
      )}
    </div>
  )
}
