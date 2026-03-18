import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import useSessionStore from '../../stores/sessionStore'
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
  { label: '注册用户', value: '1,247', delta: '+38 本周', icon: '⬡', color: '' },
  { label: '活跃用户', value: '386', delta: '31% 活跃率', icon: '◈', color: 'purple' },
  { label: '今日练习', value: '142', delta: '+12% 较昨日', icon: '◇', color: 'blue' },
  { label: '总收入', value: '¥18.6w', delta: '+¥2.1w 本月', icon: '△', color: 'red' },
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

const TABS = ['总览', '用户管理', '练习数据', '题库管理', '系统设置']

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

  const filteredUsers = MOCK_USERS.filter((u) =>
    !userSearch || u.name.includes(userSearch) || u.email.includes(userSearch) || u.id.includes(userSearch.toUpperCase())
  )

  const filteredQuestions = MOCK_QUESTIONS_MGMT.filter((q) =>
    !questionSearch || q.title.includes(questionSearch) || q.id.includes(questionSearch.toUpperCase())
  )

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles['page-header']}>
        <div>
          <h1>管理后台</h1>
          <div className={styles['header-sub']}>Management Console · 系统管理 · 数据分析</div>
        </div>
        <div className={styles['header-user']}>
          <span className={styles['header-role']}>ADMIN</span>
          <span className={styles['header-name']}>{user?.name || '管理员'}</span>
        </div>
      </div>

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
                    <td className={styles['cell-id']}>{u.id}</td>
                    <td className={styles['cell-name']}>{u.name}</td>
                    <td className={styles['cell-email']}>{u.email}</td>
                    <td><span className={`${styles['tier-tag']} ${styles[tierColorMap[u.tier]]}`}>{u.tier}</span></td>
                    <td className={styles['cell-num']}>{u.credits.toLocaleString()}</td>
                    <td className={styles['cell-num']}>{u.sessions}</td>
                    <td className={styles['cell-num']}>{u.avgScore}</td>
                    <td className={styles['cell-date']}>{u.joinDate}</td>
                    <td><span className={`${styles['status-dot']} ${styles[u.status]}`} />{u.status === 'active' ? '活跃' : '不活跃'}</td>
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
                      <td className={styles['cell-id']}>{s.id}</td>
                      <td><span className={`${styles['type-tag']} ${styles[s.type]}`}>{s.type}</span></td>
                      <td className={styles['cell-topic']}>{s.topic}</td>
                      <td className={styles['cell-num']}>{s.score}</td>
                      <td className={styles['cell-num']}>{s.durationMinutes || '—'} min</td>
                      <td className={styles['cell-date']}>{s.date}</td>
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
                    <td className={styles['cell-id']}>{q.id}</td>
                    <td className={styles['cell-topic']}>{q.title}</td>
                    <td><span className={styles['cat-tag']}>{q.category}</span></td>
                    <td><span className={`${styles['diff-tag']} ${styles[`diff-${diffColorMap[q.difficulty]}`]}`}>{q.difficulty}</span></td>
                    <td className={styles['cell-num']}>{q.usageCount}</td>
                    <td className={styles['cell-num']}>{q.avgScore}</td>
                    <td><span className={`${styles['status-dot']} ${styles.active}`} />启用</td>
                    <td>
                      <button className={styles['row-btn']} onClick={() => navigate(`/questions/${q.id}`)}>查看</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
