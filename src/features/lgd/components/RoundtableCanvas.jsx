import { useMemo } from 'react'
import styles from './RoundtableCanvas.module.css'

const STAGE_W = 680
const STAGE_H = 500
const CX = 340
const CY = 236
const RX = 236
const RY = 172

const R_OUTER = 119
const R_INNER = 109
const C_OUTER = 2 * Math.PI * R_OUTER
const C_INNER = 2 * Math.PI * R_INNER

const BEZEL_TICKS = Array.from({ length: 60 }, (_, idx) => {
  const rad = (idx * 6 * Math.PI) / 180 - Math.PI / 2
  const major = idx % 5 === 0
  const r1 = major ? 124 : 125.5
  const r2 = major ? 130 : 128.5
  return {
    idx,
    major,
    x1: CX + r1 * Math.cos(rad),
    y1: CY + r1 * Math.sin(rad),
    x2: CX + r2 * Math.cos(rad),
    y2: CY + r2 * Math.sin(rad),
  }
})

// 2:6:2 Golden Ratio phase ticks on outer bezel (20% elapsed -> ratio 0.80, 80% elapsed -> ratio 0.20)
const GOLDEN_RATIO_TICKS = [
  { key: 'g20', ratio: 0.8, label: '20%立标线' },
  { key: 'g80', ratio: 0.2, label: '80%收敛线' },
].map((item) => {
  const rad = item.ratio * 2 * Math.PI - Math.PI / 2
  return {
    ...item,
    x1: CX + 114 * Math.cos(rad),
    y1: CY + 114 * Math.sin(rad),
    x2: CX + 131.5 * Math.cos(rad),
    y2: CY + 131.5 * Math.sin(rad),
  }
})

function formatClock(seconds) {
  const safe = Math.max(0, Number(seconds) || 0)
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function buildOrbitArcPath(fromSeat, toSeat) {
  if (!fromSeat || !toSeat || fromSeat.id === toSeat.id) return ''
  const mx = (fromSeat.x + toSeat.x) / 2
  const my = (fromSeat.y + toSeat.y) / 2
  // Pull control point gently away from center so relay curve hugs the orbital perimeter
  const vx = mx - CX
  const vy = my - CY
  const len = Math.hypot(vx, vy) || 1
  const ctrlX = CX + (vx / len) * (RX * 0.96)
  const ctrlY = CY + (vy / len) * (RY * 0.96)
  return `M ${fromSeat.x.toFixed(1)} ${fromSeat.y.toFixed(1)} Q ${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${toSeat.x.toFixed(1)} ${toSeat.y.toFixed(1)}`
}

export default function RoundtableCanvas({
  participants = [],
  seatDrawDone = false,
  isShufflingSeats = false,
  identityMode = 'undetermined',
  userSeat = 4,
  phase = 'reading',
  remainingSeconds = 0,
  totalPhaseSeconds = 180,
  currentSpeaker = null,
  micGranted = false,
  typingLockActive = false,
  handRaised = false,
  buzzWindowActive = false,
  shockwaveTick = 0,
  seatStates = {},
  seatThoughts = {},
  speakerQueue = [],
  completedStatementIds = [],
  liveUtterance = null,
  boardAuthorized = false,
  microBoardAnchor = '',
  goldenStage = null,
  activeSpeechTempo = null,
  onOpenBoard,
  onQuickCaptureUtterance,
  onSelectIdentityMode,
  onRerollSeats,
  onConfirmSeatDraw,
}) {
  // Position each participant strictly by their randomized `1..8` seat clockwise from 12 o'clock
  const positionedSeats = useMemo(() => {
    return participants.map((p) => {
      const slotIdx = Math.max(0, Math.min(7, (Number(p.seat) || 1) - 1))
      const rad = (2 * Math.PI * slotIdx) / 8 - Math.PI / 2
      const x = CX + RX * Math.cos(rad)
      const y = CY + RY * Math.sin(rad)
      const pointerDeg = (Math.atan2(y - CY, x - CX) * 180) / Math.PI + 90
      return {
        ...p,
        rad,
        x,
        y,
        leftPct: (x / STAGE_W) * 100,
        topPct: (y / STAGE_H) * 100,
        pointerDeg,
      }
    })
  }, [participants])

  const seatById = useMemo(() => {
    const map = {}
    positionedSeats.forEach((s) => {
      map[s.id] = s
    })
    return map
  }, [positionedSeats])

  const activeSpeakerId = micGranted ? 'user' : currentSpeaker
  const activeSeat = activeSpeakerId ? seatById[activeSpeakerId] || null : null
  const nextQueuedSeat =
    speakerQueue.length > 0 && speakerQueue[0].id !== activeSpeakerId
      ? seatById[speakerQueue[0].id] || null
      : null

  // Timer progress math
  const safeTotal = Math.max(1, Number(totalPhaseSeconds) || 180)
  const ratio = seatDrawDone ? Math.max(0, Math.min(1, remainingSeconds / safeTotal)) : 1
  const outerDashOffset = C_OUTER * (1 - ratio)
  const ringColor =
    ratio <= 0.2
      ? '#ff453a'
      : phase === 'examiner_followup'
        ? '#f59e0b'
        : ratio <= 0.45
          ? '#ff9f0a'
          : '#38bdf8'
  const isUrgentTime = seatDrawDone && remainingSeconds > 0 && remainingSeconds <= 45

  // Contenders firing centripetal buzz-in sparks
  const contenderSparks = useMemo(() => {
    if (!seatDrawDone || phase !== 'free_discussion') return []
    const sparks = []
    positionedSeats.forEach((s) => {
      if (s.id === activeSpeakerId) return
      const qIdx = speakerQueue.findIndex((q) => q.id === s.id)
      const st = seatStates[s.id]
      if (st === 'bidding' || (buzzWindowActive && qIdx >= 0 && qIdx < 3)) {
        const ux = (s.x - CX) / Math.hypot(s.x - CX, s.y - CY)
        const uy = (s.y - CY) / Math.hypot(s.x - CX, s.y - CY)
        sparks.push({
          id: s.id,
          x1: s.x - ux * 32,
          y1: s.y - uy * 32,
          x2: CX + ux * 132,
          y2: CY + uy * 132,
          width: qIdx === 0 ? 2.4 : 1.6,
          color: s.id === 'user' ? '#9b6fc7' : s.color || '#ff9f0a',
        })
      }
    })
    return sparks
  }, [seatDrawDone, phase, positionedSeats, activeSpeakerId, speakerQueue, seatStates, buzzWindowActive])

  // Completed pips in sequential `personal_statement`
  const completedPips = useMemo(() => {
    if (phase !== 'personal_statement') return []
    return completedStatementIds
      .map((id) => seatById[id])
      .filter(Boolean)
      .map((s) => ({
        id: s.id,
        cx: CX + Math.cos(s.rad) * (RX * 0.8),
        cy: CY + Math.sin(s.rad) * (RY * 0.8),
      }))
  }, [phase, completedStatementIds, seatById])

  const relayArcPath = useMemo(() => {
    if (!seatDrawDone || !activeSeat || !nextQueuedSeat) return ''
    if (phase !== 'personal_statement' && phase !== 'free_discussion') return ''
    return buildOrbitArcPath(activeSeat, nextQueuedSeat)
  }, [seatDrawDone, activeSeat, nextQueuedSeat, phase])

  // Micro status text inside the central chronograph dial (4~6 chars max)
  let dialStatusText = '待命'
  let dialStatusClass = ''
  if (phase === 'reading') {
    dialStatusText = '审题构思'
  } else if (micGranted) {
    dialStatusText = `🎙 ${userSeat}号·你控麦`
    dialStatusClass = styles['dial-status-me']
  } else if (typingLockActive && phase === 'free_discussion') {
    dialStatusText = `🔒 ${userSeat}号输入锁`
    dialStatusClass = styles['dial-status-me']
  } else if (activeSeat) {
    dialStatusText = `${phase === 'personal_statement' ? '按序' : '发言'} · ${activeSeat.seat}号${activeSeat.name}`
  } else if (buzzWindowActive && phase === 'free_discussion') {
    dialStatusText = '⚡ 抢答窗口'
    dialStatusClass = styles['dial-status-buzz']
  } else if (phase === 'free_discussion') {
    dialStatusText = `⚡ ${goldenStage?.shortBadge || '自由抢答'}`
  } else if (phase === 'summary_report') {
    dialStatusText = '总结陈词'
  } else if (phase === 'examiner_followup') {
    dialStatusText = '🎯 考官追问'
    dialStatusClass = styles['dial-status-buzz']
  }

  // Spotlight cone polygon toward active speaker + All-Seat Public Broadcast Rays (`面向所有人`)
  const spotlightPoints = useMemo(() => {
    if (!activeSeat) return null
    const dx = activeSeat.x - CX
    const dy = activeSeat.y - CY
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const baseR = 124
    const bx = CX + (dx / len) * baseR
    const by = CY + (dy / len) * baseR
    const spread = 24
    const p1x = bx + nx * spread
    const p1y = by + ny * spread
    const p2x = bx - nx * spread
    const p2y = by - ny * spread
    return `${p1x.toFixed(1)},${p1y.toFixed(1)} ${p2x.toFixed(1)},${p2y.toFixed(1)} ${activeSeat.x.toFixed(1)},${activeSeat.y.toFixed(1)}`
  }, [activeSeat])

  const broadcastRays = useMemo(() => {
    if (!seatDrawDone || !activeSeat) return []
    return positionedSeats
      .filter((s) => s.id !== activeSeat.id)
      .map((listener) => {
        const dx = listener.x - CX
        const dy = listener.y - CY
        const len = Math.hypot(dx, dy) || 1
        return {
          id: listener.id,
          x1: CX + (dx / len) * 133,
          y1: CY + (dy / len) * 133,
          x2: listener.x - (dx / len) * 33,
          y2: listener.y - (dy / len) * 33,
        }
      })
  }, [seatDrawDone, activeSeat, positionedSeats])

  return (
    <div className={styles['stage-shell']}>
      <div className={styles['canvas-frame']}>
        {seatDrawDone && boardAuthorized && microBoardAnchor && (
          <button
            type="button"
            className={styles['micro-board-projection']}
            onClick={onOpenBoard}
            title="点击展开三栏结构化看板"
          >
            <span className={styles['micro-board-dot']}>📊</span>
            <span className={styles['micro-board-text']}>{microBoardAnchor}</span>
          </button>
        )}

        {/* Pure Geometric SVG Layer: Chronograph + Relay Arcs + Buzz Sparks + Pointer */}
        <svg
          className={styles['stage-svg']}
          viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="lgdChronoAura" cx="50%" cy="47%" r="50%">
              <stop offset="0%" stopColor="rgba(56, 189, 248, 0.12)" />
              <stop offset="60%" stopColor="rgba(99, 102, 241, 0.04)" />
              <stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
            </radialGradient>
            <linearGradient id="lgdSpotlightGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop
                offset="0%"
                stopColor={activeSeat?.color || '#38bdf8'}
                stopOpacity="0.28"
              />
              <stop
                offset="100%"
                stopColor={activeSeat?.color || '#38bdf8'}
                stopOpacity="0.02"
              />
            </linearGradient>
          </defs>

          {/* Ambient Spatial Halo */}
          <ellipse cx={CX} cy={CY} rx={RX + 18} ry={RY + 16} fill="url(#lgdChronoAura)" />

          {/* Elliptical Seat Orbit Track */}
          <ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill="none" className={styles['orbit-guide']} />

          {/* Sequential Turn-Taking Relay Arc (Active -> Next Speaker) */}
          {relayArcPath && (
            <path d={relayArcPath} fill="none" className={styles['orbit-relay-arc']} />
          )}

          {/* Completed Turn Pips in Personal Statement */}
          {completedPips.map((pip) => (
            <circle
              key={`done-${pip.id}`}
              cx={pip.cx}
              cy={pip.cy}
              r="3.5"
              className={styles['orbit-done-pip']}
            />
          ))}

          {/* Centripetal Buzz-In Contender Sparks */}
          {contenderSparks.map((sp) => (
            <line
              key={`spark-${sp.id}`}
              x1={sp.x1}
              y1={sp.y1}
              x2={sp.x2}
              y2={sp.y2}
              stroke={sp.color}
              strokeWidth={sp.width}
              className={styles['buzz-spark-line']}
            />
          ))}

          {/* Active Speaker Acoustic Spotlight Cone & Broadcast-to-All Listeners (`面向所有人`) */}
          {spotlightPoints && (
            <polygon
              points={spotlightPoints}
              fill="url(#lgdSpotlightGrad)"
              className={styles['spotlight-beam']}
            />
          )}
          {broadcastRays.map((ray) => (
            <line
              key={`bcast-${ray.id}`}
              x1={ray.x1}
              y1={ray.y1}
              x2={ray.x2}
              y2={ray.y2}
              stroke={activeSeat?.color || '#38bdf8'}
              className={styles['broadcast-listener-ray']}
            />
          ))}

          {/* Winner Lock Shockwave Ripple */}
          {shockwaveTick > 0 && (
            <circle
              key={`wave-${shockwaveTick}`}
              cx={CX}
              cy={CY}
              r={R_OUTER}
              stroke={activeSeat?.color || '#38bdf8'}
              className={styles['buzz-shockwave']}
            />
          )}

          {/* 60 Precision Chronograph Bezel Ticks */}
          {BEZEL_TICKS.map((t) => (
            <line
              key={t.idx}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              strokeWidth={t.major ? '1.5' : '0.9'}
              opacity={t.major ? '0.55' : '0.24'}
              className={styles['chrono-tick']}
            />
          ))}

          {/* 2:6:2 Golden Ratio Milestones in Free Discussion */}
          {seatDrawDone &&
            phase === 'free_discussion' &&
            GOLDEN_RATIO_TICKS.map((gt) => (
              <line
                key={gt.key}
                x1={gt.x1}
                y1={gt.y1}
                x2={gt.x2}
                y2={gt.y2}
                className={styles['chrono-golden-tick']}
              />
            ))}

          {/* Outer Phase Countdown Ring */}
          <circle cx={CX} cy={CY} r={R_OUTER} className={styles['chrono-track']} />
          <circle
            cx={CX}
            cy={CY}
            r={R_OUTER}
            stroke={ringColor}
            strokeDasharray={C_OUTER}
            strokeDashoffset={outerDashOffset}
            className={`${styles['chrono-progress']} ${isUrgentTime ? styles['chrono-progress-urgent'] : ''}`}
          />

          {/* Inner Buzz-In Window / Active Speaker Rhythm Ring */}
          <circle cx={CX} cy={CY} r={R_INNER} className={styles['chrono-inner-track']} />
          {seatDrawDone && buzzWindowActive && phase === 'free_discussion' && !activeSeat && (
            <circle
              cx={CX}
              cy={CY}
              r={R_INNER}
              strokeDasharray={C_INNER}
              className={styles['chrono-buzz-ring']}
            />
          )}
          {seatDrawDone && activeSeat && (
            <circle
              cx={CX}
              cy={CY}
              r={R_INNER}
              stroke={activeSeat.color || '#38bdf8'}
              className={styles['chrono-speaker-ring']}
            />
          )}

          {/* Rotating Chronograph Pointer Needle */}
          {seatDrawDone && activeSeat && (
            <g
              className={styles['pointer-group']}
              style={{ transform: `rotate(${activeSeat.pointerDeg}deg)` }}
            >
              <polygon
                points={`${CX},${CY - 135} ${CX - 5.5},${CY - 122} ${CX + 5.5},${CY - 122}`}
                fill={activeSeat.color || '#38bdf8'}
              />
            </g>
          )}
        </svg>

        {/* Central Chronograph Dial (Either On-Table Seat Shuffle or Live Timer + Equalizer) */}
        <div
          className={styles['center-dial']}
          style={{ '--speaker-color': activeSeat?.color || '#38bdf8' }}
        >
          {!seatDrawDone ? (
            <div className={styles['draw-dial-stack']}>
              <span className={styles['draw-seat-tag']}>抽中 {userSeat}号位</span>
              <div className={styles['draw-mode-switch']} role="group" aria-label="身份分配模式">
                <button
                  type="button"
                  className={`${styles['draw-mode-btn']} ${identityMode === 'undetermined' ? styles['draw-mode-btn-active'] : ''}`}
                  onClick={() => onSelectIdentityMode?.('undetermined')}
                  title="全员初始待定，发言时选身份 + 抢答排序"
                >
                  待定
                </button>
                <button
                  type="button"
                  className={`${styles['draw-mode-btn']} ${identityMode === 'random' ? styles['draw-mode-btn-active'] : ''}`}
                  onClick={() => onSelectIdentityMode?.('random')}
                  title="开局直接随机分配全员职能身份"
                >
                  随机
                </button>
              </div>
              <div className={styles['draw-action-row']}>
                <button
                  type="button"
                  className={styles['draw-reroll-btn']}
                  onClick={onRerollSeats}
                  aria-label="重新随机位置"
                  title="重新洗牌 1~8 号圆桌席位"
                >
                  🎲
                </button>
                <button
                  type="button"
                  className={styles['draw-start-btn']}
                  onClick={onConfirmSeatDraw}
                >
                  开始
                </button>
              </div>
            </div>
          ) : (
            <>
              <div
                className={`${styles['dial-time']} ${isUrgentTime ? styles['dial-time-urgent'] : ''}`}
              >
                {formatClock(remainingSeconds)}
              </div>
              {activeSeat && (
                <div className={styles.soundwave} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              )}
              <span className={`${styles['dial-status-pill']} ${dialStatusClass}`}>
                {dialStatusText}
              </span>
              {activeSpeechTempo && (activeSeat || activeSpeechTempo.accelerated) && (
                <span
                  className={`${styles['dial-tempo-micro']} ${activeSpeechTempo.accelerated ? styles['dial-tempo-urgent'] : ''}`}
                  title="心理语言学动态语速模型（Gersick间断平衡 + 时间压力唤醒加速函数）"
                >
                  {activeSpeechTempo.tempoLabel}
                </span>
              )}
            </>
          )}
        </div>

        {/* 8 Pure Circular Avatar Nodes (Spring-Animated Around Elliptical Orbit) */}
        {positionedSeats.map((seat) => {
          const isMe = seat.id === 'user'
          const qIdx = speakerQueue.findIndex((q) => q.id === seat.id)
          const qRank = qIdx >= 0 ? qIdx + 1 : 0
          const rawState = isMe
            ? micGranted
              ? 'speaking'
              : typingLockActive
                ? 'thinking'
                : handRaised || qRank > 0
                  ? 'bidding'
                  : seatStates.user || 'listening'
            : seatStates[seat.id] ||
              (activeSpeakerId === seat.id ? 'speaking' : phase === 'reading' ? 'reading' : 'listening')
          const isSpeakingNow = rawState === 'speaking' || activeSpeakerId === seat.id
          const thought = !isMe ? seatThoughts[seat.id] : ''
          const isPendingRole = seat.roleKey === 'undetermined'

          const stateCls =
            rawState === 'bidding'
              ? styles['seat-node-bidding']
              : rawState === 'thinking'
                ? styles['seat-node-thinking']
                : rawState === 'interrupted'
                  ? styles['seat-node-interrupted']
                  : ''

          return (
            <div
              key={seat.id}
              className={`${styles['seat-node']} ${isMe ? styles['seat-node-me'] : ''} ${isSpeakingNow ? styles['seat-node-speaking'] : ''} ${isShufflingSeats ? styles['seat-node-shuffling'] : ''} ${stateCls}`}
              style={{
                left: `${seat.leftPct}%`,
                top: `${seat.topPct}%`,
                '--seat-accent': seat.color || '#38bdf8',
              }}
              title={
                thought
                  ? `${seat.seat}号·${seat.name} 构思：${thought}`
                  : `${seat.seat}号·${seat.name}（${seat.role} · 发言 ${seat.speakCount || 0} 次）`
              }
            >
              {seatDrawDone && thought && (rawState === 'thinking' || rawState === 'reading') && (
                <div className={styles['seat-thought-bubble']}>
                  💭 {thought.length > 8 ? `${thought.slice(0, 8)}…` : thought}
                </div>
              )}

              <div className={styles['avatar-orbit-wrap']}>
                {isSpeakingNow && (
                  <>
                    <span className={styles['avatar-ripple']} />
                    <span className={`${styles['avatar-ripple']} ${styles['avatar-ripple-delay']}`} />
                  </>
                )}

                <div className={styles['avatar-circle']}>
                  <span>{seat.emoji}</span>

                  <span
                    className={`${styles['seat-number-pip']} ${isMe ? styles['seat-number-pip-me'] : ''} ${isSpeakingNow ? styles['seat-number-pip-live'] : ''}`}
                  >
                    {seat.seat}
                    {isMe ? '·我' : ''}
                  </span>

                  {seatDrawDone && qRank > 0 && !isSpeakingNow && (
                    <span className={styles['seat-queue-pip']}>#{qRank}</span>
                  )}

                  {isMe && seatDrawDone && boardAuthorized && (
                    <span
                      className={styles['seat-board-pip']}
                      title="已获团队授权投屏共享看板"
                    >
                      📊
                    </span>
                  )}

                  <span
                    className={`${styles['seat-role-micro']} ${isPendingRole ? styles['seat-role-micro-pending'] : ''}`}
                    title={`身份：${seat.role}`}
                  >
                    {seat.roleIcon || (isPendingRole ? '⏳' : '💡')}
                  </span>
                </div>
              </div>

              <span className={styles['seat-label']}>{seat.name}</span>
            </div>
          )
        })}
      </div>

      {/* Single-Focus Live Stage Utterance Subtitle (Zero Stacking, Auto-Dissolve) */}
      <div className={styles['live-stage-caption']} aria-live="polite">
        {!seatDrawDone ? (
          <span className={styles['utterance-idle-hint']}>
            圆桌已随机排座 · 点击中央「🎲」可重排，点击「开始」进入群面
          </span>
        ) : liveUtterance?.content ? (
          <div
            className={styles['utterance-pill']}
            style={{ '--utterance-color': liveUtterance.color || '#38bdf8' }}
          >
            <span className={styles['utterance-speaker']} title="公开发言 · 面向圆桌全体成员广播">
              📢 {liveUtterance.seat ? `${liveUtterance.seat}号·` : ''}
              {liveUtterance.senderName}
            </span>
            <span className={styles['utterance-text']}>
              {liveUtterance.content}
              {liveUtterance.streaming && <span className={styles['utterance-cursor']} />}
            </span>
            {onQuickCaptureUtterance && (
              <button
                type="button"
                className={styles['utterance-capture-btn']}
                onClick={() => onQuickCaptureUtterance(liveUtterance)}
                title="边听边记：一键将当前发言摘录至速记本"
              >
                ✍️ 记下
              </button>
            )}
          </div>
        ) : (
          <span className={styles['utterance-idle-hint']}>
            {phase === 'reading'
              ? '审题构思中 · 右上角可打开材料与三栏看板打底'
              : phase === 'personal_statement'
                ? '顺时针按序发言中 · 轮到或点「抢答/排麦」即可开讲'
                : phase === 'free_discussion'
                  ? '2:6:2 抢答博弈中 · 先立标准再筛选项，点「📋 看板」可实时收敛共识'
                  : phase === 'summary_report'
                    ? '总结陈词中 · 下方提词条支持汇报速览或一键补位助攻队友'
                    : phase === 'examiner_followup'
                      ? '考官压力追问中 · 紧扣团队评判标准与底线指标作答'
                      : ''}
          </span>
        )}
      </div>
    </div>
  )
}
