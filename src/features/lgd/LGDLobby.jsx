import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listRooms, createRoom, listTopics, listLgdScripts, getLgdMemory, saveLgdMemory } from '../../api/lgd'
import { getErrorMessage } from '../../api/client'
import PageBar from '../../components/ui/PageBar'
import useLgdStore from '../../stores/lgdStore'
import { USER_ROLES, FAST_TRAINING_SCRIPTS, ROLE_LABELS, getScriptById } from './lgdScripts'
import styles from './LGDLobby.module.css'

const DEFAULT_AGENTS = ['破冰者', '点子王', '逻辑王', '抢话者', '跑题者', '和事佬', '计时员']

const DURATION_OPTIONS = [
  { value: 15, label: '15 分钟' },
  { value: 20, label: '20 分钟' },
  { value: 30, label: '30 分钟' },
  { value: 45, label: '45 分钟' },
  { value: 60, label: '60 分钟' },
]

export default function LGDLobby() {
  const navigate = useNavigate()
  const memorySnapshot = useLgdStore((s) => s.memorySnapshot)
  const updateMemorySnapshot = useLgdStore((s) => s.updateMemorySnapshot)
  const llmConfig = useLgdStore((s) => s.llmConfig)
  const updateLlmConfig = useLgdStore((s) => s.updateLlmConfig)

  const [rooms, setRooms] = useState([])
  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [showApiConfig, setShowApiConfig] = useState(false)

  const [customTopic, setCustomTopic] = useState('')
  const [selectedTopicId, setSelectedTopicId] = useState(memorySnapshot?.topic_id || '')
  const [durationMinutes, setDurationMinutes] = useState(memorySnapshot?.duration_minutes || 20)
  const [userRole, setUserRole] = useState(memorySnapshot?.user_role || 'undetermined')
  const [roleMode, setRoleMode] = useState(memorySnapshot?.role_mode || 'undetermined')
  const [scriptId, setScriptId] = useState(memorySnapshot?.script_id || 'standard_flow')
  const [memoryEnabled, setMemoryEnabled] = useState(memorySnapshot?.memory_enabled ?? true)
  const [apiMode, setApiMode] = useState(memorySnapshot?.api_mode || 'hybrid_sandbox')
  const [advancementQuota, setAdvancementQuota] = useState(memorySnapshot?.advancement_quota || 3)

  const applyMemoryToForm = (mem, topicList = topics) => {
    if (!mem) return
    if (mem.topic_id && topicList.some((t) => t.id === mem.topic_id)) {
      setSelectedTopicId(mem.topic_id)
    }
    if (mem.duration_minutes) setDurationMinutes(Number(mem.duration_minutes))
    if (mem.user_role) setUserRole(mem.user_role)
    if (mem.role_mode) setRoleMode(mem.role_mode)
    if (mem.script_id) setScriptId(mem.script_id)
    if (typeof mem.memory_enabled === 'boolean') setMemoryEnabled(mem.memory_enabled)
    if (mem.api_mode) setApiMode(mem.api_mode)
    if (mem.advancement_quota) setAdvancementQuota(Number(mem.advancement_quota))
  }

  const loadRooms = async () => {
    setLoading(true)
    setError('')
    try {
      const [roomData, topicData, remoteMem] = await Promise.all([
        listRooms(),
        listTopics(),
        getLgdMemory().catch(() => null),
        listLgdScripts().catch(() => null),
      ])
      setRooms(roomData)
      setTopics(topicData)
      const mergedMem = remoteMem?.last_topic || remoteMem?.topic_id ? remoteMem : memorySnapshot
      if (mergedMem) {
        updateMemorySnapshot(mergedMem)
        if (mergedMem.memory_enabled !== false) {
          applyMemoryToForm(mergedMem, topicData)
        }
      }
      if (topicData.length && !selectedTopicId && !mergedMem?.topic_id) {
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
    if (memoryEnabled && memorySnapshot) {
      applyMemoryToForm(memorySnapshot, topics)
    }
    setShowModal(true)
  }

  const handleStartRoom = async (overrideMem = null) => {
    setCreating(true)
    setError('')
    try {
      const targetTopicId = overrideMem?.topic_id ?? selectedTopicId
      const targetDuration = overrideMem?.duration_minutes ?? durationMinutes
      const targetRoleMode = overrideMem?.role_mode ?? roleMode
      const targetRole =
        targetRoleMode === 'undetermined'
          ? 'undetermined'
          : (overrideMem?.user_role && overrideMem.user_role !== 'undetermined'
              ? overrideMem.user_role
              : userRole !== 'undetermined'
                ? userRole
                : 'member')
      const targetScriptId = overrideMem?.script_id ?? scriptId
      const targetQuota = Number(overrideMem?.advancement_quota ?? advancementQuota) || 3
      const picked = topics.find((t) => t.id === targetTopicId) || topics[0]
      const topic =
        customTopic.trim()
        || overrideMem?.last_topic
        || picked?.title
        || '远程团队协作效率提升方案'
      const material =
        picked?.material
        || `请围绕「${topic}」展开无领导小组讨论，形成可落地的方案。`

      const memRecord = {
        memory_enabled: memoryEnabled,
        topic_id: picked?.id || targetTopicId || null,
        last_topic: topic,
        duration_minutes: targetDuration,
        user_role: targetRole,
        role_mode: targetRoleMode,
        script_id: targetScriptId,
        api_mode: apiMode,
        advancement_quota: targetQuota,
        weak_dimensions: memorySnapshot?.weak_dimensions || [],
        last_score: memorySnapshot?.last_score ?? null,
        notes: memorySnapshot?.notes || '',
      }
      if (memoryEnabled) {
        updateMemorySnapshot(memRecord)
        saveLgdMemory(memRecord).catch(() => {})
      }

      const room = await createRoom({
        topic,
        material,
        topic_id: picked?.id || undefined,
        topic_type: picked?.topic_type || undefined,
        duration_minutes: targetDuration,
        agents: DEFAULT_AGENTS,
        user_role: targetRole,
        role_mode: targetRoleMode,
        script_id: targetScriptId,
        memory_enabled: memoryEnabled,
        api_mode: apiMode,
        advancement_quota: targetQuota,
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
      <PageBar
        title="LGD 群面大厅"
        actions={
          <div className={styles['lobby-header-actions']}>
            <button
              type="button"
              className={styles['api-config-btn']}
              onClick={() => setShowApiConfig((v) => !v)}
            >
              {llmConfig?.apiKey ? 'API 已连接' : '群面多Agent API与沙箱设定'}
            </button>
            <button type="button" className={styles['create-btn']} onClick={handleCreateRoom}>
              + 创建房间
            </button>
          </div>
        }
      />

      {/* Compact Sandbox & Memory Bar */}
      <div className={`hw-panel ${styles['sandbox-deck']}`}>
        <div className={styles['sandbox-header-row']}>
          <span className={styles['sandbox-title']}>训练预设</span>
          <div className={styles['memory-inline-bar']}>
            {memorySnapshot?.last_topic && (
              <button
                type="button"
                className={styles['memory-quick-start']}
                onClick={() => handleStartRoom(memorySnapshot)}
                disabled={creating}
              >
                延续上次：{memorySnapshot.last_topic}
              </button>
            )}
            <label className={styles['memory-toggle-label']}>
              <span>记忆模式</span>
              <button
                type="button"
                role="switch"
                aria-checked={memoryEnabled}
                aria-label="启用群面记忆模式"
                className={`${styles['memory-switch']} ${memoryEnabled ? styles['memory-switch-on'] : ''}`}
                onClick={() => {
                  const next = !memoryEnabled
                  setMemoryEnabled(next)
                  updateMemorySnapshot({ memory_enabled: next })
                }}
              >
                <span className={styles['memory-switch-dot']} />
              </button>
            </label>
          </div>
        </div>

        <div className={styles['sandbox-controls-grid']}>
          <div className={styles['control-col']}>
            <label className={styles['modal-label']}>快训练脚本</label>
            <select
              className={styles['unified-control']}
              value={scriptId}
              onChange={(e) => {
                setScriptId(e.target.value)
                if (memoryEnabled) updateMemorySnapshot({ script_id: e.target.value })
              }}
              aria-label="快训练脚本"
            >
              {FAST_TRAINING_SCRIPTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.badge}
                </option>
              ))}
            </select>
          </div>
          <div className={styles['control-col']}>
            <label className={styles['modal-label']}>席位随机与身份模式</label>
            <select
              className={styles['unified-control']}
              value={roleMode === 'pick' ? `pick:${userRole !== 'undetermined' ? userRole : 'member'}` : roleMode}
              onChange={(e) => {
                const v = e.target.value
                if (v.startsWith('pick:')) {
                  const picked = v.slice(5)
                  setRoleMode('pick')
                  setUserRole(picked)
                  if (memoryEnabled) updateMemorySnapshot({ role_mode: 'pick', user_role: picked })
                } else {
                  setRoleMode(v)
                  const nextRole = v === 'undetermined' ? 'undetermined' : 'member'
                  setUserRole(nextRole)
                  if (memoryEnabled) updateMemorySnapshot({ role_mode: v, user_role: nextRole })
                }
              }}
              aria-label="席位随机与身份模式"
            >
              <option value="undetermined">位置随机 · 身份待定（发言选身份+抢麦排序）</option>
              <option value="random">位置随机 · 身份随机（入场即分配）</option>
              {USER_ROLES.map((r) => (
                <option key={r.id} value={`pick:${r.id}`}>
                  位置随机 · 指定身份：{r.label}
                </option>
              ))}
            </select>
          </div>
          <div className={styles['control-col']}>
            <label className={styles['modal-label']}>多Agent模式</label>
            <select
              className={styles['unified-control']}
              value={apiMode}
              onChange={(e) => {
                setApiMode(e.target.value)
                if (memoryEnabled) updateMemorySnapshot({ api_mode: e.target.value })
              }}
              aria-label="多Agent模式"
            >
              <option value="hybrid_sandbox">API 沙箱协同</option>
              <option value="fast_script_only">预设快训练脚本</option>
            </select>
          </div>
        </div>

        {showApiConfig && (
          <div className={styles['api-config-drawer']}>
            <div className={styles['api-config-row']}>
              <div className={styles['control-col']}>
                <label className={styles['modal-label']}>API Base URL</label>
                <input
                  type="text"
                  className={styles['unified-control']}
                  value={llmConfig?.baseUrl || ''}
                  onChange={(e) => updateLlmConfig({ baseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                />
              </div>
              <div className={styles['control-col']}>
                <label className={styles['modal-label']}>Model</label>
                <input
                  type="text"
                  className={styles['unified-control']}
                  value={llmConfig?.model || ''}
                  onChange={(e) => updateLlmConfig({ model: e.target.value })}
                  placeholder="gpt-4o-mini / deepseek-chat"
                />
              </div>
              <div className={styles['control-col']}>
                <label className={styles['modal-label']}>API Key</label>
                <input
                  type="password"
                  className={styles['unified-control']}
                  value={llmConfig?.apiKey || ''}
                  onChange={(e) => updateLlmConfig({ apiKey: e.target.value })}
                  placeholder="sk-..."
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {error && <div className={styles['error-banner']}>{error}</div>}

      <div className={styles['rooms-grid']}>
        {loading && <div className={styles['empty-hint']}>加载中...</div>}
        {!loading && rooms.length === 0 && <div className={styles['empty-hint']}>暂无房间</div>}
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
              <span>{room.participant_count}/{room.max_participants} 人</span>
              <span>{room.duration_minutes} 分钟</span>
              <span>8进{room.advancement_quota || 3}</span>
              {room.user_role && <span>{ROLE_LABELS[room.user_role] || room.user_role}</span>}
              {room.script_id && <span>{getScriptById(room.script_id).badge}</span>}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className={styles['modal-overlay']} onClick={handleCloseModal}>
          <div className={styles['modal-card']}>
            <div className={styles['modal-title']}>创建房间</div>

            <div className={styles['modal-field']}>
              <label className={styles['modal-label']}>练习题</label>
              <select
                className={styles['modal-input']}
                value={selectedTopicId}
                onChange={(e) => setSelectedTopicId(e.target.value)}
              >
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles['modal-field']}>
              <label className={styles['modal-label']}>自定义议题（可选）</label>
              <input
                type="text"
                className={styles['modal-input']}
                placeholder="留空则使用所选练习题"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
              />
            </div>

            <div className={styles['modal-row-2col']}>
              <div className={styles['modal-field']}>
                <label className={styles['modal-label']}>时长</label>
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
                <label className={styles['modal-label']}>训练脚本</label>
                <select
                  className={styles['modal-input']}
                  value={scriptId}
                  onChange={(e) => setScriptId(e.target.value)}
                >
                  {FAST_TRAINING_SCRIPTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.badge}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles['modal-field']}>
              <label className={styles['modal-label']}>三考官 Calibration 晋级配额</label>
              <select
                className={styles['modal-input']}
                value={advancementQuota}
                onChange={(e) => setAdvancementQuota(Number(e.target.value))}
                aria-label="三考官 Calibration 晋级配额"
              >
                <option value={3}>8 进 3（标准校招晋级率 37.5% · 三考官独立打分+校准）</option>
                <option value={2}>8 进 2（SP 严苛淘汰率 25% · 零红线容错）</option>
              </select>
            </div>

            <div className={styles['modal-field']}>
              <label className={styles['modal-label']}>入场位置随机 & 身份模式</label>
              <div className={styles['modal-role-options']}>
                <label className={styles['radio-label']}>
                  <input
                    type="radio"
                    name="roleMode"
                    checked={roleMode === 'undetermined'}
                    onChange={() => {
                      setRoleMode('undetermined')
                      setUserRole('undetermined')
                    }}
                  />
                  待定（发言选身份+抢麦排序）
                </label>
                <label className={styles['radio-label']}>
                  <input
                    type="radio"
                    name="roleMode"
                    checked={roleMode === 'random'}
                    onChange={() => {
                      setRoleMode('random')
                      if (userRole === 'undetermined') setUserRole('member')
                    }}
                  />
                  随机分配
                </label>
                <label className={styles['radio-label']}>
                  <input
                    type="radio"
                    name="roleMode"
                    checked={roleMode === 'pick'}
                    onChange={() => {
                      setRoleMode('pick')
                      if (userRole === 'undetermined') setUserRole('member')
                    }}
                  />
                  指定
                </label>
                <label className={styles['radio-label']} style={{ marginLeft: 'auto' }}>
                  <input
                    type="checkbox"
                    checked={memoryEnabled}
                    onChange={(e) => setMemoryEnabled(e.target.checked)}
                  />
                  记忆设定
                </label>
              </div>
              {roleMode === 'pick' && (
                <select
                  className={styles['modal-input']}
                  value={userRole === 'undetermined' ? 'member' : userRole}
                  onChange={(e) => setUserRole(e.target.value)}
                >
                  {USER_ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className={styles['focus-checklist-banner']}>
              💡 考场清场铁律：开启系统免打扰、退出通讯弹窗；入场后可申请共享三栏看板自然掌握议程主导权
            </div>

            <div className={styles['modal-actions']}>
              <button type="button" className={styles['modal-cancel']} onClick={() => setShowModal(false)}>
                取消
              </button>
              <button type="button" className={styles['modal-start']} onClick={() => handleStartRoom()} disabled={creating}>
                {creating ? '创建中...' : '开始讨论'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
