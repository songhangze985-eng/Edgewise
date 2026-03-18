import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import styles from './PermadeathChallenge.module.css'

const STAGES = [
  { id: 1, name: 'LGD 群面', desc: '8人圆桌讨论，展现领导力与协作', time: '45 min', icon: '\u2B21' },
  { id: 2, name: '业务主管单面', desc: '深度专业面试，考察业务理解力', time: '30 min', icon: '\u25B3' },
  { id: 3, name: '交叉压测', desc: '跨部门高压追问，极限压力测试', time: '25 min', icon: '\u25C8' },
  { id: 4, name: 'HR 终面', desc: '文化契合度评估，薪资谈判模拟', time: '20 min', icon: '\u25C7' },
]

function getHpColorClass(hp) {
  if (hp > 60) return 'safe'
  if (hp > 40) return 'warn'
  return 'danger'
}

function getStageStatus(index, currentStage, gameState, stageScores) {
  if (gameState === 'gameover' && index === currentStage) return 'failed'
  if (stageScores[index] !== undefined) return 'passed'
  if (index === currentStage && gameState === 'playing') return 'current'
  return 'locked'
}

function getStatusLabel(status) {
  switch (status) {
    case 'locked': return 'LOCKED'
    case 'current': return 'IN PROGRESS'
    case 'passed': return 'PASSED'
    case 'failed': return 'FAILED'
    default: return ''
  }
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function PermadeathChallenge() {
  const [currentStage, setCurrentStage] = useState(0)
  const [hp, setHp] = useState(100)
  const [gameState, setGameState] = useState('ready')
  const [stageScores, setStageScores] = useState([])
  const [timer, setTimer] = useState(0)
  const timerRef = useRef(null)

  const startTimer = useCallback(() => {
    setTimer(0)
    timerRef.current = setInterval(() => {
      setTimer((prev) => prev + 1)
    }, 1000)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => stopTimer()
  }, [stopTimer])

  const handleStart = useCallback(() => {
    setGameState('playing')
    setCurrentStage(0)
    setHp(100)
    setStageScores([])
    startTimer()
  }, [startTimer])

  const handleCompleteStage = useCallback(() => {
    stopTimer()

    const score = Math.floor(Math.random() * 36) + 60
    const hpLoss = Math.round((100 - score) / 2)
    const newHp = Math.max(0, hp - hpLoss)
    const newScores = [...stageScores, score]

    setStageScores(newScores)
    setHp(newHp)

    if (newHp <= 0) {
      setGameState('gameover')
      return
    }

    if (currentStage >= STAGES.length - 1) {
      setGameState('victory')
      return
    }

    setCurrentStage((prev) => prev + 1)
    startTimer()
  }, [hp, stageScores, currentStage, stopTimer, startTimer])

  const handleRetry = useCallback(() => {
    stopTimer()
    setGameState('ready')
    setCurrentStage(0)
    setHp(100)
    setStageScores([])
    setTimer(0)
  }, [stopTimer])

  const hpColor = getHpColorClass(hp)

  return (
    <div className={styles.page}>
      {/* Hero Header */}
      <div className={styles.hero}>
        <div className={styles['hero-text']}>
          <h1>
            <span className={styles['hero-title-accent']}>一血通关</span>
          </h1>
          <div className={styles['header-sub']}>
            极限挑战 &middot; Permadeath Challenge
          </div>
        </div>
        <div className={styles['hero-hp-display']}>
          <span className={`${styles['hp-value']} ${styles[`hp-value-${hpColor}`]}`}>
            {hp}
          </span>
          <span className={styles['hp-label']}>HP</span>
        </div>
      </div>

      {/* HP Bar */}
      <div className={styles['hp-bar-container']}>
        <div className={styles['hp-bar-header']}>
          <span className={styles['hp-bar-label']}>BLOOD BAR</span>
          <span className={`${styles['hp-bar-number']} ${styles[`hp-value-${hpColor}`]}`}>
            {hp} / 100
          </span>
        </div>
        <div className={styles['hp-bar-track']}>
          <div
            className={`${styles['hp-bar-fill']} ${styles[`hp-fill-${hpColor}`]}`}
            style={{ width: `${hp}%` }}
          />
        </div>
      </div>

      {/* Stage Pipeline */}
      <div className={styles.pipeline}>
        {STAGES.map((stage, index) => {
          const status = getStageStatus(index, currentStage, gameState, stageScores)
          const showConnector = index > 0

          return (
            <div key={stage.id} className={styles['stage-wrapper']}>
              {showConnector && (
                <div className={`${styles['stage-connector']} ${index <= currentStage && gameState !== 'ready' ? styles['connector-active'] : ''}`}>
                  <div className={styles['stage-connector-line']} />
                </div>
              )}
              <div className={`${styles['stage-card']} ${styles[`stage-${status}`]}`}>
                <div className={styles['stage-number']}>{String(index + 1).padStart(2, '0')}</div>
                <div className={styles['stage-icon']} aria-hidden="true">{stage.icon}</div>
                <div className={styles['stage-name']}>{stage.name}</div>
                <div className={styles['stage-desc']}>{stage.desc}</div>
                <div className={styles['stage-time']}>{stage.time}</div>
                <span className={`${styles['stage-status']} ${styles[`status-${status}`]}`}>
                  {getStatusLabel(status)}
                </span>
                {stageScores[index] !== undefined && (
                  <div className={styles['stage-score']}>{stageScores[index]}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Action Area */}
      <div className={styles['action-area']}>
        {gameState === 'ready' && (
          <>
            <div className={styles['ready-info']}>
              <div className={styles['ready-title']}>Permadeath Mode</div>
              <div className={styles['ready-desc']}>
                HP 归零即 Game Over，不可存档，不可回退。你准备好了吗？
              </div>
            </div>
            <button className={styles['btn-start']} onClick={handleStart}>
              开始挑战
            </button>
          </>
        )}

        {gameState === 'playing' && (
          <div className={styles['current-detail']}>
            <div className={styles['detail-header']}>
              <span className={styles['detail-title']}>
                {STAGES[currentStage].icon} {STAGES[currentStage].name}
              </span>
              <span className={styles['detail-timer']}>{formatTime(timer)}</span>
            </div>
            <div className={styles['detail-desc']}>
              {STAGES[currentStage].desc}
              {' '}-- 限时 {STAGES[currentStage].time}，全力以赴。
            </div>
            <div className={styles['detail-actions']}>
              <button className={styles['btn-complete']} onClick={handleCompleteStage}>
                完成本轮
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Game Over Overlay */}
      {gameState === 'gameover' && (
        <div className={`${styles.overlay} ${styles['overlay-gameover']}`}>
          <div className={styles['overlay-icon']}>&#128128;</div>
          <div className={styles['overlay-title']}>挑战失败</div>
          <div className={styles['overlay-sub']}>
            GAME OVER &middot; HP 已耗尽，挑战终止
          </div>
          {stageScores.length > 0 && (
            <div className={styles['overlay-scores']}>
              {stageScores.map((score, i) => (
                <div key={STAGES[i].id} className={styles['overlay-score-item']}>
                  <span className={styles['overlay-score-stage']}>R{i + 1}</span>
                  <span className={styles['overlay-score-val']}>{score}</span>
                </div>
              ))}
            </div>
          )}
          <div className={styles['overlay-actions']}>
            <button className={styles['btn-retry']} onClick={handleRetry}>
              再来一次
            </button>
            <Link to="/" className={styles['overlay-back']}>
              返回首页
            </Link>
          </div>
        </div>
      )}

      {/* Victory Overlay */}
      {gameState === 'victory' && (
        <div className={`${styles.overlay} ${styles['overlay-victory']}`}>
          <div className={styles['overlay-icon']}>&#127942;</div>
          <div className={styles['overlay-title']}>一命通关！</div>
          <div className={styles['overlay-sub']}>
            PERMADEATH CLEARED &middot; 全阶段通过
          </div>
          <div className={styles['overlay-scores']}>
            {stageScores.map((score, i) => (
              <div key={STAGES[i].id} className={styles['overlay-score-item']}>
                <span className={styles['overlay-score-stage']}>R{i + 1}</span>
                <span className={styles['overlay-score-val']}>{score}</span>
              </div>
            ))}
          </div>
          <div className={styles['overlay-actions']}>
            <button className={styles['btn-victory']} onClick={handleRetry}>
              生成战报
            </button>
            <Link to="/" className={styles['overlay-back']}>
              返回首页
            </Link>
          </div>
        </div>
      )}

      {/* Bottom Nav */}
      <div className={styles['bottom-nav']}>
        <Link to="/" className={styles['back-link']}>
          &larr; BACK TO DASHBOARD
        </Link>
      </div>
    </div>
  )
}
