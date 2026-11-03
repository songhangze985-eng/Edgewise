import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listRooms, createRoom, listTopics } from '../../api/lgd'
import { getErrorMessage } from '../../api/client'
import PageBar from '../../components/ui/PageBar'
import { USER_ROLES } from './lgdScripts'
import styles from './LGDLobby.module.css'

const DEFAULT_AGENTS = ['破冰者', '点子王', '逻辑王', '抢话者', '跑题者', '和事佬', '计时员']

const DURATION_OPTIONS = [
  { value: 15, label: '15 分钟（紧凑）' },
  { value: 20, label: '20 分钟（推荐）' },
  { value: 30, label: '30 分钟（标准）' },
  { value: 45, label: '45 分钟（充分）' },
  { value: 60, label: '60 分钟（完整）' },
]

export default function LGDLobby() {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState([])
  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [customTopic, setCustomTopic] = useState('')
  const [selectedTopicId, setSelectedTopicId] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(20)
  const [userRole, setUserRole] = useState('member')
  const [roleMode, setRoleMode] = useState('pick')

  const loadRooms = async () => {
    setLoading(true)
    setError('')
    try {
      const [roomData, topicData] = await Promise.all([listRooms(), listTopics()])
      setRooms(roomData)
      setTopics(topicData)
      if (topicData.length && !selectedTopicId) {
        setSelectedTopicId(topicData[0].id)
      }
    } catch (err) {
      setError(getErrorMessage(err, '加载房间失败'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRooms()
  }, [])

  const handleEnterRoom = (roomId) => {
    navigate(`/lgd/room/${roomId}`)
  }

  const handleCreateRoom = () => {
    setShowModal(true)
  }

  const handleStartRoom = async () => {
    setCreating(true)
    setError('')
    try {
      const picked = topics.find((t) => t.id === selectedTopicId)
      const topic = customTopic.trim() || picked?.title || '远程团队协作效率提升方案'
      const material =
        picked?.material ||
        `请围绕「${topic}」展开无领导小组讨论，形成可落地的方案。`
      const room = await createRoom({
        topic,
        material,
        topic_id: picked?.id || undefined,
        topic_type: picked?.topic_type || undefined,
        duration_minutes: durationMinutes,
        agents: DEFAULT_AGENTS,
        user_role: userRole,
        role_mode: roleMode,
      })
      setShowModal(false)
      setCustomTopic('')
      navigate(`/lgd/room/${room.id}`)
    } catch (err) {
      setError(getErrorMessage(err, '创建房间失败'))
    } finally {
      setCreating(false)
    }
  }

  const handleCloseModal = (e) => {
    if (e.target === e.currentTarget) {
      setShowModal(false)
    }
  }

  return (
    <div className={styles['lgd-lobby']}>
      <PageBar title="LGD 群面大厅" />

      <div className={styles['create-section']}>
        <button className={styles['create-btn']} onClick={handleCreateRoom}>
          + 创建新房间
        </button>
        {error && <div style={{ color: 'var(--danger)', marginTop: '0.75rem', fontSize: '0.8rem' }}>{error}</div>}
      </div>

      <div className={styles['rooms-grid']}>
        {loading && <div style={{ opacity: 0.6 }}>加载房间中...</div>}
        {!loading && rooms.length === 0 && <div style={{ opacity: 0.6 }}>暂无房间，创建一个开始讨论</div>}
        {rooms.map((room) => (
          <div
            key={room.id}
            className={styles['room-card']}
            onClick={() => handleEnterRoom(room.id)}
          >
            <div className={styles['room-header']}>
              <span className={styles['room-topic']}>{room.topic}</span>
              <span className={`${styles['room-status']} ${styles[room.status] || styles.waiting}`}>
                {room.status === 'waiting' ? '等待中' : room.status === 'active' ? '进行中' : room.status}
              </span>
            </div>
            <div className={styles['room-meta']}>
              <span>👥 {room.participant_count}/{room.max_participants}</span>
              <span>⏱ {room.duration_minutes} min</span>
              {room.user_role && <span>🎭 {room.user_role}</span>}
            </div>
            <div className={styles['room-agents']}>
              {(room.agents || []).map((agent) => (
                <span key={agent} className={styles['agent-badge']}>{agent}</span>
              ))}
            </div>
            <div className={styles['room-enter']}>进入房间 →</div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className={styles['modal-overlay']} onClick={handleCloseModal}>
          <div className={styles['modal-card']}>
            <div className={styles['modal-title']}>创建新房间</div>
            <div className={styles['modal-subtitle']}>
              选择自编练习题、讨论时长与你在小组中的角色
            </div>

            <div className={styles['modal-field']}>
              <label className={styles['modal-label']}>练习题</label>
              <select
                className={styles['modal-input']}
                value={selectedTopicId}
                onChange={(e) => setSelectedTopicId(e.target.value)}
              >
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}（{t.topic_type}）
                  </option>
                ))}
              </select>
            </div>

            <div className={styles['modal-field']}>
              <label className={styles['modal-label']}>自定义标题（可选）</label>
              <input
                type="text"
                className={styles['modal-input']}
                placeholder="留空则使用所选练习题标题"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
              />
            </div>

            <div className={styles['modal-field']}>
              <label className={styles['modal-label']}>讨论时长</label>
              <select
                className={styles['modal-input']}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
              >
                {DURATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles['modal-field']}>
              <label className={styles['modal-label']}>你的角色</label>
              <div className={styles['modal-info-row']}>
                <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="radio"
                    name="roleMode"
                    checked={roleMode === 'pick'}
                    onChange={() => setRoleMode('pick')}
                  />
                  指定角色
                </label>
                <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="radio"
                    name="roleMode"
                    checked={roleMode === 'random'}
                    onChange={() => setRoleMode('random')}
                  />
                  随机分配
                </label>
              </div>
              {roleMode === 'pick' && (
                <select
                  className={styles['modal-input']}
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value)}
                >
                  {USER_ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label} — {r.hint}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className={styles['modal-info']}>
              <div className={styles['modal-info-row']}>
                <span className={styles['modal-info-label']}>AI 成员</span>
                <span className={styles['modal-info-value']}>7 位（含抢话者、跑题者脚本）</span>
              </div>
              <div className={styles['modal-info-row']}>
                <span className={styles['modal-info-label']}>流程</span>
                <span className={styles['modal-info-value']}>阅读 → 个人陈述（每人 1 分钟）→ 自由讨论 → 总结汇报（3 分钟）</span>
              </div>
            </div>

            <div className={styles['modal-actions']}>
              <button className={styles['modal-cancel']} onClick={() => setShowModal(false)}>
                取消
              </button>
              <button className={styles['modal-start']} onClick={handleStartRoom} disabled={creating}>
                {creating ? '创建中...' : '开始讨论'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
