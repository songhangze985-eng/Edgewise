import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './LGDLobby.module.css'

const rooms = [
  {
    id: 1,
    topic: '远程团队协作效率提升方案',
    status: 'waiting',
    participants: '1/8',
    duration: '45 min',
    agents: ['破冰者', '点子王', '杠精', '逻辑王', '和事佬', '计时员', '观察者'],
  },
  {
    id: 2,
    topic: '新消费品牌的市场切入策略',
    status: 'active',
    participants: '5/8',
    duration: '40 min',
    agents: ['破冰者', '点子王', '杠精', '逻辑王', '计时员'],
  },
  {
    id: 3,
    topic: '校园社交产品的差异化竞争',
    status: 'waiting',
    participants: '0/8',
    duration: '50 min',
    agents: ['破冰者', '点子王', '杠精', '和事佬', '观察者', '计时员'],
  },
]

export default function LGDLobby() {
  const navigate = useNavigate()
  const [showModal, setShowModal] = useState(false)
  const [customTopic, setCustomTopic] = useState('')

  const handleEnterRoom = (roomId) => {
    navigate(`/lgd/room/${roomId}`)
  }

  const handleCreateRoom = () => {
    setShowModal(true)
  }

  const handleStartRoom = () => {
    setShowModal(false)
    setCustomTopic('')
    navigate('/lgd/room/new')
  }

  const handleCloseModal = (e) => {
    if (e.target === e.currentTarget) {
      setShowModal(false)
    }
  }

  return (
    <div className={styles['lgd-lobby']}>
      <div className={styles['page-header']}>
        <h1>LGD 群面大厅</h1>
        <div className={styles['header-sub']}>Leaderless Group Discussion · Room Lobby</div>
      </div>

      <div className={styles['create-section']}>
        <button className={styles['create-btn']} onClick={handleCreateRoom}>
          + 创建新房间
        </button>
      </div>

      <div className={styles['rooms-grid']}>
        {rooms.map((room) => (
          <div
            key={room.id}
            className={styles['room-card']}
            onClick={() => handleEnterRoom(room.id)}
          >
            <div className={styles['room-header']}>
              <span className={styles['room-topic']}>{room.topic}</span>
              <span className={`${styles['room-status']} ${styles[room.status]}`}>
                {room.status === 'waiting' ? '等待中' : '进行中'}
              </span>
            </div>
            <div className={styles['room-meta']}>
              <span>👥 {room.participants}</span>
              <span>⏱ {room.duration}</span>
            </div>
            <div className={styles['room-agents']}>
              {room.agents.map((agent) => (
                <span key={agent} className={styles['agent-badge']}>{agent}</span>
              ))}
            </div>
            <div className={styles['room-enter']}>进入房间 →</div>
          </div>
        ))}
      </div>

      {/* Create Room Modal */}
      {showModal && (
        <div className={styles['modal-overlay']} onClick={handleCloseModal}>
          <div className={styles['modal-card']}>
            <div className={styles['modal-title']}>创建新房间</div>
            <div className={styles['modal-subtitle']}>
              输入讨论话题，或使用默认话题快速开始
            </div>

            <div className={styles['modal-field']}>
              <label className={styles['modal-label']}>讨论话题</label>
              <input
                type="text"
                className={styles['modal-input']}
                placeholder="远程团队协作效率提升方案"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                autoFocus
              />
            </div>

            <div className={styles['modal-info']}>
              <div className={styles['modal-info-row']}>
                <span className={styles['modal-info-label']}>AI 成员</span>
                <span className={styles['modal-info-value']}>7 位 (破冰者、点子王、杠精、逻辑王、和事佬、计时员、观察者)</span>
              </div>
              <div className={styles['modal-info-row']}>
                <span className={styles['modal-info-label']}>讨论时长</span>
                <span className={styles['modal-info-value']}>约 8 分钟 (阅读 + 发言 + 讨论 + 投票)</span>
              </div>
            </div>

            <div className={styles['modal-actions']}>
              <button className={styles['modal-cancel']} onClick={() => setShowModal(false)}>
                取消
              </button>
              <button className={styles['modal-start']} onClick={handleStartRoom}>
                开始讨论
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
