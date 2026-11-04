import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PageBar from '../../components/ui/PageBar'
import { listJobs } from '../../api/jobs'
import { listStories } from '../../api/stories'
import { requestLgdAgentTurn, scoreLgd } from '../../api/lgd'
import {
  createSession,
  scoreInterviewAnswer,
  postQuestionFollowup,
  postNegotiationTurn,
  completeSession,
} from '../../api/interview'
import { getErrorMessage } from '../../api/client'
import useSessionStore from '../../stores/sessionStore'
import useSurveyStore from '../../stores/surveyStore'
import useSettingsStore from '../../stores/settingsStore'
import useSpeechToText from '../../hooks/useSpeechToText'
import useTTS from '../../hooks/useTTS'
import { trackResearchEvent } from '../../research/track'
import styles from './PermadeathChallenge.module.css'

const STAGES = [
  {
    id: 1,
    key: 'lgd',
    name: 'LGD 群面突围',
    desc: '8人圆桌交锋 · 5号抢话者高压发难，抢麦完成收敛破局',
    time: '180s',
    limitSec: 180,
    icon: '\u2B21',
    engineBadge: 'LGD 多Agent沙箱引擎',
    fallbackRoute: '/lgd/lobby',
  },
  {
    id: 2,
    key: 'manager',
    name: '业务主管单面',
    desc: '深度业务与项目核验 · 结合 STAR 素材库进行四维逻辑作答',
    time: '180s',
    limitSec: 180,
    icon: '\u25B3',
    engineBadge: '1v1 四维逻辑评分引擎',
    fallbackRoute: '/interview/lobby',
  },
  {
    id: 3,
    key: 'pressure',
    name: '交叉极限压测',
    desc: '首问 + AI 连环追问二连击 · 超时触发血量衰减警报',
    time: '150s',
    limitSec: 150,
    icon: '\u25C8',
    engineBadge: '动态漏洞追问引擎',
    fallbackRoute: '/interview/lobby',
  },
  {
    id: 4,
    key: 'hr',
    name: 'HR 终面谈薪',
    desc: '底线防守与薪资锚点博弈 · 达成理想 Offer 即可一命通关',
    time: '150s',
    limitSec: 150,
    icon: '\u25C7',
    engineBadge: 'HR 薪资博弈状态机',
    fallbackRoute: '/interview/lobby',
  },
]

const DIFFICULTY_TIERS = [
  {
    id: 'standard',
    label: '标准校招通关',
    sub: '初始 100 HP · 1.0x 伤害倍率 · 限时宽裕',
    initialHp: 100,
    damageMult: 1.0,
    timeMult: 1.0,
    floorK: 20,
    badge: 'STANDARD',
  },
  {
    id: 'sp_sprint',
    label: '大厂 SP 高压冲刺',
    sub: '初始 85 HP · 1.25x 伤害倍率 · 限时紧凑',
    initialHp: 85,
    damageMult: 1.25,
    timeMult: 0.8,
    floorK: 26,
    badge: 'SP SPRINT',
  },
  {
    id: 'hell',
    label: '地狱一命零容错',
    sub: '初始 60 HP · 1.5x 伤害倍率 · 极速压迫',
    initialHp: 60,
    damageMult: 1.5,
    timeMult: 0.65,
    floorK: 32,
    badge: 'HELL MODE',
  },
]

const POSITION_PRESETS = [
  'AI 产品经理',
  '后端开发工程师',
  '前端开发工程师',
  '算法工程师',
  '商业化运营',
]

const INITIAL_LGD_CLASH = [
  {
    seat: 1,
    senderId: 'ice_breaker',
    name: '1号 · 小林（破冰者）',
    role: 'ai',
    text: '各位，今天我们的议题是「AI 面试产品如何在保证诊断深度的同时降低新用户首轮流失率」。我建议按“入口承接—核心演练—复盘留存”三阶段拆解，控制在 15 分钟内定框架。',
  },
  {
    seat: 3,
    senderId: 'logician',
    name: '3号 · 李理（逻辑王）',
    role: 'ai',
    text: '三段框架太宽泛了。如果不明确核心北极星指标是“首题完成率（TTFA）”还是“7日留存（D7）”，后面讨论全会发散。我主张优先砍掉所有前置问卷，直接推题。',
  },
  {
    seat: 5,
    senderId: 'interrupter',
    name: '5号 · 韩抢（抢话者）',
    role: 'ai',
    text: '我不同意 3 号一刀切！全砍掉前置引导会导致题目与用户痛点错位。4 号候选人（你）怎么看？别和稀泥，请直接给出你的取舍标准、量化指标和落地动作！',
  },
]

const QUICK_TACTICAL_TEMPLATES = {
  lgd: '我先承接1号的三段式框架与3号对量化指标的关注，回应5号的核心矛盾：首先，我们的北极星指标应定为「合格激活率（首轮有效作答+基于反馈完成二次修改）」，因为单纯推题无法沉淀能力；其次，采用入口任务标签与首道练习题1:1连续承接（降低任务重建耗时50%以上）；最后，由我汇总时间线，前5分钟锁定高流失痛点，后10分钟落地A/B实验验证。',
  manager: '结论先行：在该项目中我个人主导了核心转化漏斗的诊断与重构，使首轮完成率提升了28%。具体按STAR展开：背景（Situation）是新用户进入后因功能选择过多导致流失率达42%；任务（Task）是在两周内将任务启动步数缩短至2步以内；行动（Action）是我亲自拆解了埋点事件流，设计了基于入口痛点标签的直达路由与1分钟微任务热身；结果（Result）是上线后平均启动耗时从95秒降至31秒，7日留存提升16%。',
  pressure_hit1: '面对峰值流量突增3倍且核心模型接口延迟超时的极端情况，我的第一优先级是保障核心链路可用性。首先，在网关层立即触发分级熔断与降级策略，将实时大模型生成切换为预置高信度规则评分引擎；其次，通过异步队列削峰填谷，保证前端在400ms内返回结构化诊断反馈；最终在压测中实现了99.95%的请求成功率与零数据丢失。',
  pressure_hit2: '针对您追问的降级后诊断精度损失问题：我们通过离线回测建立了规则引擎与专家盲评的校准矩阵，确保降级模式下「结论、结构、证据、扣题」四维评分与完整模型的一致性相关系数 r 保持在 0.88 以上；同时在后台记录异常事件流，待流量恢复后自动异步补全深度点评并推送给用户。',
  hr: '非常感谢贵司的认可与诚意。结合我过往在核心业务链路中交付的量化产出（转化率提升28%且具备独立抗压架构能力）以及目前手头对标大厂SP档位的市场行情，我期望的月薪区间在 26k–30k 左右，同时我也非常看重团队的技术挑战与长期期权激励，如果薪资包整体能对齐到 27k 档位，我可以立即确认接受 Offer 并尽快入职。',
}

const STREAK_KEY = 'edgewise.permadeath.streak'
const BEST_KEY = 'edgewise.permadeath.best'

function readNumber(key) {
  try {
    const v = localStorage.getItem(key)
    return v ? Number(v) : 0
  } catch {
    return 0
  }
}

function getHpColorClass(hp) {
  if (hp > 60) return 'safe'
  if (hp > 35) return 'warn'
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
    case 'locked':
      return 'LOCKED'
    case 'current':
      return 'IN COMBAT'
    case 'passed':
      return 'CLEARED'
    case 'failed':
      return 'K.O.'
    default:
      return ''
  }
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function PermadeathChallenge() {
  const navigate = useNavigate()
  const refreshSessions = useSessionStore((s) => s.refresh)
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled)
  const ttsRate = useSettingsStore((s) => s.ttsRate)
  const ttsVoiceURI = useSettingsStore((s) => s.ttsVoiceURI)
  const { speak, stop: stopSpeech } = useTTS()

  // Loadout & external assets
  const [jobs, setJobs] = useState([])
  const [stories, setStories] = useState([])
  const [selectedPosition, setSelectedPosition] = useState(POSITION_PRESETS[0])
  const [selectedJobId, setSelectedJobId] = useState('')
  const [difficultyId, setDifficultyId] = useState('standard')
  const [showStoryDrawer, setShowStoryDrawer] = useState(false)

  // Core game state
  const [currentStage, setCurrentStage] = useState(0)
  const [streak, setStreak] = useState(() => readNumber(STREAK_KEY))
  const [bestStreak, setBestStreak] = useState(() => readNumber(BEST_KEY))
  const [hp, setHp] = useState(100)
  const [maxHp, setMaxHp] = useState(100)
  const [gameState, setGameState] = useState('ready') // 'ready' | 'playing' | 'gameover' | 'victory'
  const [stageScores, setStageScores] = useState([])
  const [stageDamages, setStageDamages] = useState([])
  const [timer, setTimer] = useState(0)
  const [overtimeTicks, setOvertimeTicks] = useState(0)
  const timerRef = useRef(null)

  // Live backend session & stage combat states
  const [sessionId, setSessionId] = useState(null)
  const [sessionData, setSessionData] = useState(null)
  const [starting, setStarting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorBanner, setErrorBanner] = useState('')
  const [answerInput, setAnswerInput] = useState('')
  const [combatLogs, setCombatLogs] = useState([])
  const [lastStageFeedback, setLastStageFeedback] = useState(null)

  // Stage 1: LGD multi-agent clash state
  const [lgdMessages, setLgdMessages] = useState(INITIAL_LGD_CLASH)
  // Stage 3: Two-hit combo state ('hit1' | 'hit2')
  const [pressurePhase, setPressurePhase] = useState('hit1')
  const [pendingFollowup, setPendingFollowup] = useState(null)
  const [hit1ScoreData, setHit1ScoreData] = useState(null)
  // Stage 4: HR salary negotiation turns
  const [negotiationState, setNegotiationState] = useState(null)
  const [negotiationChat, setNegotiationChat] = useState([])

  const difficultyTier = useMemo(
    () => DIFFICULTY_TIERS.find((d) => d.id === difficultyId) || DIFFICULTY_TIERS[0],
    [difficultyId],
  )

  const currentStageLimitSec = useMemo(() => {
    const base = STAGES[currentStage]?.limitSec || 180
    return Math.round(base * difficultyTier.timeMult)
  }, [currentStage, difficultyTier])

  const {
    supported: sttSupported,
    listening: sttListening,
    toggle: toggleStt,
    stop: stopStt,
  } = useSpeechToText({
    lang: 'zh-CN',
    onTranscript: (text) => setAnswerInput(text),
  })

  useEffect(() => {
    listJobs()
      .then((res) => {
        if (Array.isArray(res) && res.length > 0) {
          setJobs(res)
        }
      })
      .catch(() => {})
    listStories()
      .then((res) => {
        if (Array.isArray(res)) setStories(res)
      })
      .catch(() => {})
  }, [])

  const appendCombatLog = useCallback((entry) => {
    setCombatLogs((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        ts: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        ...entry,
      },
      ...prev,
    ])
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startTimer = useCallback(() => {
    stopTimer()
    setTimer(0)
    setOvertimeTicks(0)
    timerRef.current = setInterval(() => {
      setTimer((prev) => prev + 1)
    }, 1000)
  }, [stopTimer])

  useEffect(() => {
    return () => {
      stopTimer()
      stopStt()
      stopSpeech()
    }
  }, [stopTimer, stopStt, stopSpeech])

  // Finalize session to backend when gameover or victory occurs
  const finalizeBackendSession = useCallback(
    async (finalOutcome, finalScores, finalHp) => {
      if (!sessionId) return
      const validScores = finalScores.filter((s) => typeof s === 'number')
      const avgScore = validScores.length
        ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
        : 60
      const dimensions = {
        logic: finalScores[1] || avgScore,
        expression: finalScores[0] || avgScore,
        collaboration: finalScores[0] || avgScore,
        knowledge: finalScores[1] || avgScore,
        adaptability: finalScores[2] || avgScore,
        leadership: finalScores[3] || finalScores[0] || avgScore,
      }
      try {
        await completeSession(
          sessionId,
          {
            score: avgScore,
            duration_minutes: Math.max(5, Math.round(timer / 60) + finalScores.length * 4),
            dimensions,
            metadata: {
              mode: 'permadeath',
              source: 'permadeath_challenge',
              permadeath_outcome: finalOutcome,
              remaining_hp: finalHp,
              difficulty: difficultyTier.id,
              stage_scores: finalScores,
              score_status: 'ok',
            },
          },
          { skipErrorToast: true },
        )
        refreshSessions().catch(() => {})
        trackResearchEvent('interview.complete', {
          session_id: sessionId,
          mode: 'permadeath',
          outcome: finalOutcome,
          score: avgScore,
          remaining_hp: finalHp,
        })
        useSurveyStore.getState().checkPendingSurvey('challenge')
      } catch {
        /* ignore completion errors */
      }
    },
    [sessionId, timer, difficultyTier.id, refreshSessions],
  )

  // Overtime pressure HP drain trigger in Stage 3 / active stages
  useEffect(() => {
    if (gameState !== 'playing') return
    if (timer <= currentStageLimitSec) return
    const extraTicks = Math.floor((timer - currentStageLimitSec) / 15)
    if (extraTicks > overtimeTicks) {
      setOvertimeTicks(extraTicks)
      const drain = 4
      setHp((prevHp) => {
        const nextHp = Math.max(0, prevHp - drain)
        appendCombatLog({
          stage: STAGES[currentStage].name,
          type: 'overtime',
          title: '超时高压侵蚀',
          detail: `思考时间超出阶段限制 (${currentStageLimitSec}s)，受到面试官时间压迫扣血 -${drain} HP`,
          hpDelta: -drain,
        })
        if (nextHp <= 0) {
          stopTimer()
          setGameState('gameover')
          setStreak(0)
          try {
            localStorage.setItem(STREAK_KEY, '0')
          } catch {
            /* ignore */
          }
          finalizeBackendSession('gameover', stageScores, 0)
        }
        return nextHp
      })
    }
  }, [
    timer,
    currentStageLimitSec,
    overtimeTicks,
    gameState,
    currentStage,
    appendCombatLog,
    stopTimer,
    finalizeBackendSession,
    stageScores,
  ])

  // Start the Permadeath Gauntlet and create a real backend session
  const handleStart = useCallback(async () => {
    setStarting(true)
    setErrorBanner('')
    try {
      const created = await createSession({
        type: 'interview',
        position: selectedPosition,
        difficulty: difficultyId === 'hell' ? 'hard' : difficultyId === 'sp_sprint' ? 'hard' : 'medium',
        topic: `${selectedPosition} · 一血通关终极挑战`,
        job_id: selectedJobId || undefined,
        rounds: [
          {
            name: '业务主管单面 · 深度核验',
            question_count: 1,
            type: 'standard',
            mix: { general: 1, resume_specific: 1, professional: 0 },
          },
          {
            name: '交叉压测 · 极限追问防守',
            question_count: 1,
            type: 'standard',
            mix: { general: 1, resume_specific: 0, professional: 0 },
          },
          {
            name: 'HR 终面 · 薪资博弈',
            question_count: 0,
            type: 'negotiation',
          },
        ],
        metadata: {
          mode: 'permadeath',
          source: 'permadeath_challenge',
          difficulty: difficultyTier.id,
          negotiation_prefs: {
            salary_floor_k: difficultyTier.floorK,
            salary_ceiling_k: difficultyTier.floorK + 6,
          },
          counts_toward_activation: true,
        },
      })

      const negBlock = created?.rounds?.[2]?.negotiation || {
        initial_offer: difficultyTier.floorK * 900,
        floor_k: difficultyTier.floorK,
        state: 'presented',
      }
      const initOfferK = Math.round((negBlock.initial_offer || 18000) / 1000)

      setSessionId(created.id)
      setSessionData(created)
      setNegotiationState(negBlock)
      setNegotiationChat([
        {
          role: 'hr',
          name: 'HR 总监 · 林总',
          text: `恭喜你一路挺进到终面！综合前几轮表现，我们目前能给出的初始月薪 Base 锚点是 ${initOfferK}k/月（目标岗位：${selectedPosition}）。我看你期望的底线在 ${difficultyTier.floorK}k 左右，请说说你认为自己值得更高薪资包的核心依据与期望区间？`,
        },
      ])

      setGameState('playing')
      setCurrentStage(0)
      setHp(difficultyTier.initialHp)
      setMaxHp(difficultyTier.initialHp)
      setStageScores([])
      setStageDamages([])
      setLgdMessages(INITIAL_LGD_CLASH)
      setPressurePhase('hit1')
      setPendingFollowup(null)
      setHit1ScoreData(null)
      setLastStageFeedback(null)
      setAnswerInput('')
      setCombatLogs([
        {
          id: 'init-log',
          ts: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
          stage: '系统初始化',
          type: 'info',
          title: `已建立全链路实战会话 #${created.id.slice(0, 6)}`,
          detail: `目标岗位：${selectedPosition} ｜ 模式：${difficultyTier.label}（初始 ${difficultyTier.initialHp} HP）`,
          hpDelta: 0,
        },
      ])

      trackResearchEvent('challenge.started', {
        session_id: created.id,
        position: selectedPosition,
        difficulty: difficultyTier.id,
      })

      startTimer()
    } catch (err) {
      setErrorBanner(getErrorMessage(err, '创建一血通关会话失败，请稍后重试'))
    } finally {
      setStarting(false)
    }
  }, [selectedPosition, selectedJobId, difficultyId, difficultyTier, startTimer])

  // Apply stage score -> compute HP delta -> advance stage or end run
  const settleStageScore = useCallback(
    (rawScore, summaryTitle, summaryDetail, isInvalid = false) => {
      stopTimer()
      stopStt()

      const score = Math.max(35, Math.min(99, Math.round(Number(rawScore) || 68)))
      let hpDelta = 0
      if (isInvalid) {
        hpDelta = -Math.round(28 * difficultyTier.damageMult)
      } else if (score >= 85) {
        hpDelta = +8 // Critical counter-attack heal!
      } else {
        const baseLoss = Math.max(4, Math.round((85 - score) * 0.9 * difficultyTier.damageMult))
        hpDelta = -baseLoss
      }

      const nextHp = Math.max(0, Math.min(maxHp, hp + hpDelta))
      const nextScores = [...stageScores, score]
      const nextDamages = [
        ...stageDamages,
        {
          stageIndex: currentStage,
          stageName: STAGES[currentStage].name,
          score,
          hpDelta,
          route: STAGES[currentStage].fallbackRoute,
        },
      ]

      setStageScores(nextScores)
      setStageDamages(nextDamages)
      setHp(nextHp)
      setLastStageFeedback({
        stageName: STAGES[currentStage].name,
        score,
        hpDelta,
        title: summaryTitle,
        detail: summaryDetail,
      })

      appendCombatLog({
        stage: STAGES[currentStage].name,
        type: hpDelta >= 0 ? 'heal' : 'damage',
        title: `${summaryTitle}（得分 ${score}）`,
        detail: summaryDetail,
        hpDelta,
      })

      if (nextHp <= 0) {
        setGameState('gameover')
        setStreak(0)
        try {
          localStorage.setItem(STREAK_KEY, '0')
        } catch {
          /* ignore */
        }
        finalizeBackendSession('gameover', nextScores, 0)
        return
      }

      if (currentStage >= STAGES.length - 1) {
        setGameState('victory')
        const nextStreak = streak + 1
        const nextBest = Math.max(bestStreak, nextStreak)
        setStreak(nextStreak)
        setBestStreak(nextBest)
        try {
          localStorage.setItem(STREAK_KEY, String(nextStreak))
          localStorage.setItem(BEST_KEY, String(nextBest))
        } catch {
          /* ignore */
        }
        finalizeBackendSession('victory', nextScores, nextHp)
        return
      }

      setCurrentStage((prev) => prev + 1)
      setAnswerInput('')
      startTimer()
    },
    [
      stopTimer,
      stopStt,
      difficultyTier.damageMult,
      maxHp,
      hp,
      stageScores,
      stageDamages,
      currentStage,
      appendCombatLog,
      finalizeBackendSession,
      streak,
      bestStreak,
      startTimer,
    ],
  )

  // Stage 1 handler: LGD Multi-Agent Sandbox Turn + Real LGD Scoring
  const handleSubmitStage1Lgd = useCallback(async () => {
    const text = answerInput.trim()
    if (!text || submitting) return
    setSubmitting(true)
    setErrorBanner('')
    try {
      const userMsg = {
        seat: 4,
        senderId: 'user',
        name: '4号 · 你（候选人）',
        role: 'user',
        isUser: true,
        text,
      }
      const updatedTranscript = [...lgdMessages, userMsg]
      setLgdMessages(updatedTranscript)

      const [agentTurnRes, scoreRes] = await Promise.all([
        requestLgdAgentTurn({
          agent_id: 'mediator',
          topic: 'AI 面试产品如何在保证诊断深度的同时降低新用户首轮流失率',
          phase: 'free_discussion',
          script_id: 'werewolf_clash',
          transcript: updatedTranscript,
          memory_enabled: true,
        }).catch(() => null),
        scoreLgd({
          topic: 'AI 面试产品如何在保证诊断深度的同时降低新用户首轮流失率',
          user_role: 'leader',
          transcript: updatedTranscript.map((m) => ({
            role: m.role === 'user' ? 'user' : 'ai',
            sender: m.name,
            text: m.text,
          })),
        }),
      ])

      if (agentTurnRes?.reply) {
        const aiReplyMsg = {
          seat: 7,
          senderId: 'mediator',
          name: '7号 · 王和（和事佬）',
          role: 'ai',
          text: agentTurnRes.reply,
        }
        setLgdMessages((prev) => [...prev, aiReplyMsg])
        if (ttsEnabled) {
          speak(agentTurnRes.reply, { rate: ttsRate, voiceURI: ttsVoiceURI })
        }
      }

      const overallScore = scoreRes?.overall_score ?? 78
      const isInvalid = text.length < 20
      const detail = agentTurnRes?.reply
        ? `7号王和回应：「${agentTurnRes.reply.slice(0, 68)}…」｜ 群面五维综合评定 ${overallScore} 分`
        : `群面破局陈词已完成，五维综合评定 ${overallScore} 分`

      settleStageScore(
        overallScore,
        overallScore >= 85 ? '群面控场完美反击' : '群面突围结算',
        detail,
        isInvalid,
      )
    } catch (err) {
      setErrorBanner(getErrorMessage(err, '群面评分请求失败'))
    } finally {
      setSubmitting(false)
    }
  }, [
    answerInput,
    submitting,
    lgdMessages,
    ttsEnabled,
    speak,
    ttsRate,
    ttsVoiceURI,
    settleStageScore,
  ])

  // Stage 2 handler: Business Manager Deep Interview (Round 0)
  const handleSubmitStage2Manager = useCallback(async () => {
    const text = answerInput.trim()
    if (!text || submitting || !sessionId) return
    setSubmitting(true)
    setErrorBanner('')
    try {
      const res = await scoreInterviewAnswer(sessionId, {
        round_index: 0,
        question_index: 0,
        answer_text: text,
      })
      const score = res?.score ?? 72
      const logic = res?.logic_score
      const isInvalid = text.length < 20 || res?.score === null
      const breakdown = logic
        ? `结论 ${logic.conclusion ?? '—'}/25 · 结构 ${logic.structure ?? '—'}/25 · 论据 ${logic.evidence ?? '—'}/25 · 扣题 ${logic.relevance ?? '—'}/25`
        : `专业深度评分 ${score} 分`

      settleStageScore(
        score,
        score >= 85 ? 'STAR 逻辑无懈可击' : '业务主管面核验完成',
        breakdown,
        isInvalid,
      )
    } catch (err) {
      setErrorBanner(getErrorMessage(err, '业务主管面评分失败'))
    } finally {
      setSubmitting(false)
    }
  }, [answerInput, submitting, sessionId, settleStageScore])

  // Stage 3 handler: Cross-Department Pressure Test (Two-Hit Combo: Score + Dynamic Follow-up)
  const handleSubmitStage3Pressure = useCallback(async () => {
    const text = answerInput.trim()
    if (!text || submitting || !sessionId) return
    setSubmitting(true)
    setErrorBanner('')

    const round1Question = sessionData?.rounds?.[1]?.questions?.[0]
    const qid = round1Question?.id || 'Q01'

    try {
      if (pressurePhase === 'hit1') {
        const scoreRes = await scoreInterviewAnswer(sessionId, {
          round_index: 1,
          question_index: 0,
          answer_text: text,
        })
        const followRes = await postQuestionFollowup(sessionId, qid, {
          round_index: 1,
          question_index: 0,
        }).catch(() => null)

        const followupItem = followRes?.followup || {
          text: '如果线上压测指标突然跌破阈值 30%，且你刚才提到的方案在 5 分钟内无法生效，你的兜底止损边界是什么？请给出具体量化阈值！',
          gap_type: 'evidence',
          layer: 1,
        }

        setHit1ScoreData(scoreRes)
        setPendingFollowup(followupItem)
        setPressurePhase('hit2')
        setAnswerInput('')

        if (ttsEnabled && followupItem.text) {
          speak(followupItem.text, { rate: ttsRate, voiceURI: ttsVoiceURI })
        }

        appendCombatLog({
          stage: '交叉极限压测 · 第一击',
          type: 'info',
          title: `首问防守完成（初步得分 ${Math.round(scoreRes?.score || 74)}），触发连环追问！`,
          detail: `交叉面试官追击漏洞：${followupItem.text}`,
          hpDelta: 0,
        })
      } else {
        // Hit 2: answer the pending follow-up
        const followAnsRes = await postQuestionFollowup(sessionId, qid, {
          round_index: 1,
          question_index: 0,
          answer_text: text,
        }).catch(() => null)

        const baseScore = Number(hit1ScoreData?.score ?? 75)
        const bonus = text.length >= 35 ? +8 : text.length >= 20 ? +3 : -10
        const combinedScore = Math.max(40, Math.min(98, Math.round(baseScore + bonus)))
        const isInvalid = text.length < 15 || followAnsRes?.answer_valid === false

        setPressurePhase('hit1')
        setPendingFollowup(null)
        setHit1ScoreData(null)

        settleStageScore(
          combinedScore,
          combinedScore >= 85 ? '二连击高压追问完美防住' : '交叉压测二连击结算',
          `首问得分 ${Math.round(baseScore)} + 追问防守修正 (${bonus >= 0 ? `+${bonus}` : bonus}) ➔ 综合 ${combinedScore} 分`,
          isInvalid,
        )
      }
    } catch (err) {
      setErrorBanner(getErrorMessage(err, '交叉压测提交失败'))
    } finally {
      setSubmitting(false)
    }
  }, [
    answerInput,
    submitting,
    sessionId,
    sessionData,
    pressurePhase,
    ttsEnabled,
    speak,
    ttsRate,
    ttsVoiceURI,
    appendCombatLog,
    hit1ScoreData,
    settleStageScore,
  ])

  // Stage 4 handler: HR Final Boss & Salary Negotiation Engine
  const handleSubmitStage4Hr = useCallback(
    async (forceAccept = false) => {
      const text = forceAccept
        ? '综合考虑团队发展空间与期权激励，我同意接受当前 Offer 方案，期待尽快入职贡献价值！'
        : answerInput.trim()
      if (!text || submitting || !sessionId) return
      setSubmitting(true)
      setErrorBanner('')

      try {
        const res = await postNegotiationTurn(sessionId, {
          round_index: 2,
          message: text,
        })

        const newTurns = [
          ...negotiationChat,
          { role: 'user', name: '你（候选人）', text },
          ...(res?.hr_reply
            ? [{ role: 'hr', name: 'HR 总监 · 林总', text: res.hr_reply }]
            : []),
        ]
        setNegotiationChat(newTurns)
        setNegotiationState(res?.negotiation || negotiationState)
        setAnswerInput('')

        if (ttsEnabled && res?.hr_reply) {
          speak(res.hr_reply, { rate: ttsRate, voiceURI: ttsVoiceURI })
        }

        const turnScore = Math.round(
          res?.evaluation?.turn_score ?? res?.round_score ?? 82,
        )
        const currentOfferYuan =
          res?.offer || res?.negotiation?.final_offer || res?.negotiation?.initial_offer || 20000
        const currentOfferK = (currentOfferYuan / 1000).toFixed(1)

        const userTurnCount = newTurns.filter((m) => m.role === 'user').length
        if (res?.done || userTurnCount >= 2 || forceAccept) {
          settleStageScore(
            turnScore,
            turnScore >= 85 ? '薪资谈判博弈大捷' : 'HR 终面谈薪定稿',
            `最终锁定薪资锚点 ¥${currentOfferK}k/月 ｜ 谈判话术结构与筹码评分 ${turnScore} 分`,
            false,
          )
        } else {
          appendCombatLog({
            stage: 'HR 终面谈薪 · 第一轮交锋',
            type: 'info',
            title: `HR 报价更新至 ¥${currentOfferK}k/月（单轮话术分 ${turnScore}）`,
            detail: res?.hr_reply || '请继续回应 HR 進行最终拍板或锁定 Offer。',
            hpDelta: 0,
          })
        }
      } catch (err) {
        setErrorBanner(getErrorMessage(err, 'HR 薪资谈判请求失败'))
      } finally {
        setSubmitting(false)
      }
    },
    [
      answerInput,
      submitting,
      sessionId,
      negotiationChat,
      negotiationState,
      ttsEnabled,
      speak,
      ttsRate,
      ttsVoiceURI,
      settleStageScore,
      appendCombatLog,
    ],
  )

  const handleRetry = useCallback(() => {
    stopTimer()
    stopStt()
    stopSpeech()
    setGameState('ready')
    setCurrentStage(0)
    setHp(difficultyTier.initialHp)
    setMaxHp(difficultyTier.initialHp)
    setStageScores([])
    setStageDamages([])
    setTimer(0)
    setAnswerInput('')
    setErrorBanner('')
    setLastStageFeedback(null)
  }, [stopTimer, stopStt, stopSpeech, difficultyTier.initialHp])

  // Find the stage that caused the worst HP loss for targeted training routing
  const weakestStageRecord = useMemo(() => {
    if (!stageDamages.length) return null
    return [...stageDamages].sort((a, b) => a.hpDelta - b.hpDelta)[0]
  }, [stageDamages])

  const hpColor = getHpColorClass(hp)
  const hpPercent = Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100)))

  const stage2Question =
    sessionData?.rounds?.[0]?.questions?.[0]?.title
    || `请结合你过往最具代表性的一个 ${selectedPosition} 项目，用 STAR 结构说明你如何定位核心瓶颈并交付可量化结果？`
  const stage3Question =
    sessionData?.rounds?.[1]?.questions?.[0]?.title
    || `【跨部门高压质疑】如果业务方要求你在资源砍半、排期压缩 40% 的前提下上线核心特性，且线上出现异常波动，你如何做技术/产品取舍并守住核心指标？`

  const handleFillTemplate = () => {
    if (currentStage === 0) setAnswerInput(QUICK_TACTICAL_TEMPLATES.lgd)
    else if (currentStage === 1) setAnswerInput(QUICK_TACTICAL_TEMPLATES.manager)
    else if (currentStage === 2) {
      setAnswerInput(
        pressurePhase === 'hit1'
          ? QUICK_TACTICAL_TEMPLATES.pressure_hit1
          : QUICK_TACTICAL_TEMPLATES.pressure_hit2,
      )
    } else if (currentStage === 3) {
      setAnswerInput(QUICK_TACTICAL_TEMPLATES.hr)
    }
  }

  return (
    <div className={styles.page}>
      <PageBar
        title="一血通关 · 全链路终极考场"
        actions={
          <div className={styles['header-badges']}>
            <div className={styles['hero-hp-display']}>
              <span className={`${styles['hp-value']} ${styles[`hp-value-${hpColor}`]}`}>
                {hp}
              </span>
              <span className={styles['hp-label']}>HP / {maxHp}</span>
            </div>
            <div className={styles['hero-streak-display']}>
              <span className={styles['streak-value']}>{streak}</span>
              <span className={styles['streak-label']}>连胜纪录</span>
              <span className={styles['streak-best']}>最高 {bestStreak}</span>
            </div>
          </div>
        }
      />

      {/* HP Blood Bar */}
      <div className={styles['hp-bar-container']}>
        <div className={styles['hp-bar-header']}>
          <span className={styles['hp-bar-label']}>
            PERMADEATH LIFE BAR · 真实引擎评分驱动（单轮 ≥85 分触发 +8 HP 完美反击回血）
          </span>
          <span className={`${styles['hp-bar-number']} ${styles[`hp-value-${hpColor}`]}`}>
            {hp} / {maxHp} HP ({hpPercent}%)
          </span>
        </div>
        <div className={styles['hp-bar-track']}>
          <div
            className={`${styles['hp-bar-fill']} ${styles[`hp-fill-${hpColor}`]}`}
            style={{ width: `${hpPercent}%` }}
          />
        </div>
      </div>

      {/* 4-Stage Pipeline */}
      <div className={styles.pipeline}>
        {STAGES.map((stage, index) => {
          const status = getStageStatus(index, currentStage, gameState, stageScores)
          const showConnector = index > 0
          return (
            <div key={stage.id} className={styles['stage-wrapper']}>
              {showConnector && (
                <div
                  className={`${styles['stage-connector']} ${
                    index <= currentStage && gameState !== 'ready' ? styles['connector-active'] : ''
                  }`}
                >
                  <div className={styles['stage-connector-line']} />
                </div>
              )}
              <div className={`${styles['stage-card']} ${styles[`stage-${status}`]}`}>
                <div className={styles['stage-top-row']}>
                  <div className={styles['stage-number']}>{String(index + 1).padStart(2, '0')}</div>
                  <span className={styles['stage-engine-tag']}>{stage.engineBadge}</span>
                </div>
                <div className={styles['stage-icon']} aria-hidden="true">
                  {stage.icon}
                </div>
                <div className={styles['stage-name']}>{stage.name}</div>
                <div className={styles['stage-desc']}>{stage.desc}</div>
                <div className={styles['stage-footer-row']}>
                  <span className={`${styles['stage-status']} ${styles[`status-${status}`]}`}>
                    {getStatusLabel(status)}
                  </span>
                  {stageScores[index] !== undefined && (
                    <span className={styles['stage-score']}>{stageScores[index]} PTS</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {errorBanner && <div className={styles['error-banner']}>{errorBanner}</div>}

      {/* Latest Stage Transition Banner */}
      {lastStageFeedback && gameState === 'playing' && (
        <div
          className={`${styles['feedback-toast-bar']} ${
            lastStageFeedback.hpDelta >= 0 ? styles['feedback-heal'] : styles['feedback-damage']
          }`}
        >
          <div>
            <strong>
              [{lastStageFeedback.stageName}] {lastStageFeedback.title}
            </strong>
            <span className={styles['feedback-detail-text']}>{lastStageFeedback.detail}</span>
          </div>
          <span className={styles['feedback-hp-pill']}>
            {lastStageFeedback.hpDelta >= 0
              ? `+${lastStageFeedback.hpDelta} HP`
              : `${lastStageFeedback.hpDelta} HP`}
          </span>
        </div>
      )}

      {/* ==================== READY STATE: PRE-RUN LOADOUT ==================== */}
      {gameState === 'ready' && (
        <div className={styles['loadout-panel']}>
          <div className={styles['loadout-header']}>
            <div>
              <span className={styles['loadout-kicker']}>FULL-PIPELINE GAUNTLET · 战前资产挂载</span>
              <h2 className={styles['loadout-title']}>串联四大核心引擎的一命通关终极考场</h2>
              <p className={styles['loadout-sub']}>
                不同于单项训练场的反复修改，一血通关将依次调起「LGD 多Agent群面沙箱 ➔ 1v1 四维逻辑核验 ➔ 跨部门二连追问压测 ➔ HR 薪资博弈状态机」，全程真实评分并在结束后自动归档至复盘报告中心。
              </p>
            </div>
          </div>

          <div className={styles['loadout-grid']}>
            <div className={styles['loadout-field']}>
              <label className={styles['field-label']} htmlFor="challenge-pos-select">
                目标冲刺岗位
              </label>
              <select
                id="challenge-pos-select"
                className={styles['loadout-select']}
                value={selectedPosition}
                onChange={(e) => setSelectedPosition(e.target.value)}
              >
                {POSITION_PRESETS.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles['loadout-field']}>
              <label className={styles['field-label']} htmlFor="challenge-jd-select">
                关联已保存的 JD 标的（可选）
              </label>
              <select
                id="challenge-jd-select"
                className={styles['loadout-select']}
                value={selectedJobId}
                onChange={(e) => {
                  const jid = e.target.value
                  setSelectedJobId(jid)
                  const found = jobs.find((j) => j.id === jid)
                  if (found?.title) setSelectedPosition(found.title)
                }}
              >
                <option value="">默认通用岗位标准题池</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title || '未命名岗位'}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles['loadout-field']}>
              <label className={styles['field-label']} htmlFor="challenge-diff-select">
                通关难度与初始血量档位
              </label>
              <select
                id="challenge-diff-select"
                className={styles['loadout-select']}
                value={difficultyId}
                onChange={(e) => setDifficultyId(e.target.value)}
              >
                {DIFFICULTY_TIERS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}（{d.initialHp} HP）
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles['difficulty-cards']}>
            {DIFFICULTY_TIERS.map((tier) => (
              <button
                key={tier.id}
                type="button"
                className={`${styles['diff-card']} ${
                  difficultyId === tier.id ? styles['diff-card-active'] : ''
                }`}
                onClick={() => setDifficultyId(tier.id)}
              >
                <div className={styles['diff-card-top']}>
                  <span className={styles['diff-badge']}>{tier.badge}</span>
                  <span className={styles['diff-hp']}>{tier.initialHp} HP</span>
                </div>
                <div className={styles['diff-name']}>{tier.label}</div>
                <div className={styles['diff-desc']}>{tier.sub}</div>
              </button>
            ))}
          </div>

          <div className={styles['loadout-footer']}>
            <div className={styles['asset-status-row']}>
              <span className={styles['asset-pill']}>
                已挂载 STAR 故事素材：{stories.length} 篇
              </span>
              <span className={styles['asset-pill']}>
                已挂载岗位 JD：{jobs.length} 份
              </span>
              <span className={styles['asset-pill']}>
                终面期望底线锚点：{difficultyTier.floorK}k/月
              </span>
            </div>
            <button
              type="button"
              className={styles['btn-start']}
              onClick={handleStart}
              disabled={starting}
            >
              {starting ? '正在构建四关实战考场…' : '开始一血挑战'}
            </button>
          </div>
        </div>
      )}

      {/* ==================== PLAYING STATE: LIVE 4-STAGE COMBAT WORKBENCH ==================== */}
      {gameState === 'playing' && (
        <div className={styles['combat-workbench']}>
          <div className={styles['detail-header']}>
            <div>
              <span className={styles['stage-kicker']}>
                STAGE 0{currentStage + 1} / 04 · {STAGES[currentStage].engineBadge}
              </span>
              <h2 className={styles['detail-title']}>
                {STAGES[currentStage].icon} {STAGES[currentStage].name}
              </h2>
            </div>
            <div className={styles['header-right-tools']}>
              <button
                type="button"
                className={styles['tool-btn']}
                onClick={() => setShowStoryDrawer((v) => !v)}
              >
                {showStoryDrawer ? '收起 STAR 素材库' : `展开 STAR 素材库 (${stories.length})`}
              </button>
              <div
                className={`${styles['detail-timer']} ${
                  timer > currentStageLimitSec ? styles['timer-overtime'] : ''
                }`}
              >
                <span>{formatTime(timer)}</span>
                <span className={styles['timer-limit']}>/ {formatTime(currentStageLimitSec)}</span>
              </div>
            </div>
          </div>

          {/* Optional STAR Story Side Drawer */}
          {showStoryDrawer && (
            <div className={styles['story-drawer']}>
              <div className={styles['story-drawer-title']}>
                STAR 故事库速览（可点击一键引用至作答框）
              </div>
              {stories.length === 0 ? (
                <p className={styles['story-empty']}>
                  当前暂无保存的 STAR 故事，可前往「STAR 故事库」添加，或直接使用下方「填入高分战术范例」。
                </p>
              ) : (
                <div className={styles['story-grid']}>
                  {stories.slice(0, 4).map((st) => (
                    <div key={st.id} className={styles['story-card']}>
                      <div className={styles['story-card-head']}>
                        <strong>{st.title}</strong>
                        <button
                          type="button"
                          className={styles['story-use-btn']}
                          onClick={() =>
                            setAnswerInput(
                              (prev) =>
                                `${prev ? `${prev}\n` : ''}【项目案例：${st.title}】背景(S)：${st.S || ''}；任务(T)：${st.T || ''}；行动(A)：${st.A || ''}；结果(R)：${st.R || ''}。`,
                            )
                          }
                        >
                          引用此案例
                        </button>
                      </div>
                      <p className={styles['story-card-excerpt']}>
                        A: {st.A || '—'} ｜ R: {st.R || '—'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ---- STAGE 1: LGD MULTI-AGENT CLASH ---- */}
          {currentStage === 0 && (
            <div className={styles['stage-arena']}>
              <div className={styles['arena-prompt-box']}>
                <div className={styles['prompt-tag']}>群面圆桌议题 · 狼人杀式高压对抗脚本</div>
                <p className={styles['prompt-main']}>
                  议题：「AI 面试产品如何在保证诊断深度的同时降低新用户首轮流失率？」—— 请回应 5 号韩抢的质询，兼顾 1 号框架与 3 号量化指标，给出收敛方案。
                </p>
              </div>
              <div className={styles['chat-stream']}>
                {lgdMessages.map((m, idx) => (
                  <div
                    key={`${m.senderId}-${idx}`}
                    className={`${styles['chat-bubble']} ${
                      m.role === 'user' ? styles['chat-user'] : styles['chat-ai']
                    }`}
                  >
                    <div className={styles['chat-meta']}>{m.name}</div>
                    <div className={styles['chat-text']}>{m.text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---- STAGE 2: BUSINESS MANAGER 1V1 ---- */}
          {currentStage === 1 && (
            <div className={styles['stage-arena']}>
              <div className={styles['arena-prompt-box']}>
                <div className={styles['prompt-tag']}>
                  业务主管深挖 · 考察维度：结论先行 / STAR 结构 / 量化论据 / 扣题度
                </div>
                <p className={styles['prompt-main']}>{stage2Question}</p>
              </div>
            </div>
          )}

          {/* ---- STAGE 3: CROSS-DEPARTMENT TWO-HIT PRESSURE TEST ---- */}
          {currentStage === 2 && (
            <div className={styles['stage-arena']}>
              <div className={styles['combo-indicator']}>
                <span
                  className={`${styles['combo-step']} ${
                    pressurePhase === 'hit1' ? styles['combo-active'] : styles['combo-done']
                  }`}
                >
                  第一击：高压首问防守
                </span>
                <span className={styles['combo-arrow']}>➔</span>
                <span
                  className={`${styles['combo-step']} ${
                    pressurePhase === 'hit2' ? styles['combo-active'] : ''
                  }`}
                >
                  第二击：AI 漏洞连环追问
                </span>
              </div>

              <div className={styles['arena-prompt-box']}>
                <div className={styles['prompt-tag']}>
                  {pressurePhase === 'hit1'
                    ? '交叉面试官 · 首轮极限施压'
                    : '交叉面试官 · 二连击漏洞追问（回答此追问完成本关结算）'}
                </div>
                <p className={styles['prompt-main']}>
                  {pressurePhase === 'hit1' ? stage3Question : pendingFollowup?.text}
                </p>
              </div>
            </div>
          )}

          {/* ---- STAGE 4: HR FINAL BOSS & SALARY NEGOTIATION ---- */}
          {currentStage === 3 && (
            <div className={styles['stage-arena']}>
              <div className={styles['arena-prompt-box']}>
                <div className={styles['prompt-tag']}>
                  HR 终面谈薪博弈 · 目标底线：{difficultyTier.floorK}k/月 ｜ 报价区间 + 量化依据 + 结构化话术可得高分
                </div>
                <div className={styles['chat-stream']}>
                  {negotiationChat.map((m, idx) => (
                    <div
                      key={`neg-${idx}`}
                      className={`${styles['chat-bubble']} ${
                        m.role === 'user' ? styles['chat-user'] : styles['chat-ai']
                      }`}
                    >
                      <div className={styles['chat-meta']}>{m.name}</div>
                      <div className={styles['chat-text']}>{m.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ---- UNIFIED ANSWER COMPOSER (TEXT + VOICE STT + TACTICAL TEMPLATE) ---- */}
          <div className={styles['composer-box']}>
            <div className={styles['composer-toolbar']}>
              <span className={styles['composer-hint']}>
                当前字数：{answerInput.trim().length} 字（建议 ≥ 30 字，包含具体指标与结构词以触发 +8 HP 回血）
              </span>
              <div className={styles['composer-tools']}>
                <button
                  type="button"
                  className={styles['tool-btn']}
                  onClick={handleFillTemplate}
                >
                  ⚡ 填入高分战术范例
                </button>
                {sttSupported && (
                  <button
                    type="button"
                    className={`${styles['tool-btn']} ${
                      sttListening ? styles['tool-btn-recording'] : ''
                    }`}
                    onClick={toggleStt}
                  >
                    {sttListening ? '● 停止语音识别' : '🎤 语音作答'}
                  </button>
                )}
              </div>
            </div>

            <textarea
              className={styles['composer-textarea']}
              rows={4}
              value={answerInput}
              onChange={(e) => setAnswerInput(e.target.value)}
              placeholder={
                currentStage === 0
                  ? '输入你的 4 号位群面破局发言（回应抢话者质疑 + 明确北极星指标 + 推进阶段收敛）…'
                  : currentStage === 1
                    ? '按「结论先行 + STAR（背景/任务/个人行动/量化结果）」作答业务主管提问…'
                    : currentStage === 2
                      ? pressurePhase === 'hit1'
                        ? '针对高压场景给出你的优先级取舍、降级兜底方案与核心保障指标…'
                        : '针对交叉面试官的追问补充具体量化阈值与边界条件…'
                      : '给出期望薪资区间（如 26k-30k）、过往产出依据，或输入「接受 offer」直接拍板定稿…'
              }
            />

            <div className={styles['detail-actions']}>
              {currentStage === 0 && (
                <button
                  type="button"
                  className={styles['btn-complete']}
                  onClick={handleSubmitStage1Lgd}
                  disabled={submitting || !answerInput.trim()}
                >
                  {submitting ? '群面沙箱评定中…' : '抢麦发言并结算第一关'}
                </button>
              )}
              {currentStage === 1 && (
                <button
                  type="button"
                  className={styles['btn-complete']}
                  onClick={handleSubmitStage2Manager}
                  disabled={submitting || !answerInput.trim()}
                >
                  {submitting ? '四维逻辑引擎核验中…' : '提交主管面回答并结算第二关'}
                </button>
              )}
              {currentStage === 2 && (
                <button
                  type="button"
                  className={styles['btn-complete']}
                  onClick={handleSubmitStage3Pressure}
                  disabled={submitting || !answerInput.trim()}
                >
                  {submitting
                    ? '交叉面试官评估中…'
                    : pressurePhase === 'hit1'
                      ? '提交首问防守（迎接追问）'
                      : '提交二连追问防守并结算第三关'}
                </button>
              )}
              {currentStage === 3 && (
                <>
                  <button
                    type="button"
                    className={styles['btn-complete']}
                    onClick={() => handleSubmitStage4Hr(false)}
                    disabled={submitting || !answerInput.trim()}
                  >
                    {submitting ? 'HR 总监评估中…' : '发送谈判话术'}
                  </button>
                  <button
                    type="button"
                    className={styles['btn-victory']}
                    onClick={() => handleSubmitStage4Hr(true)}
                    disabled={submitting}
                  >
                    接受当前 Offer 并完成终面通关
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== COMBAT STREAM LOG ==================== */}
      {combatLogs.length > 0 && (
        <div className={styles['combat-log-panel']}>
          <div className={styles['combat-log-header']}>
            <span>REAL-TIME COMBAT STREAM · 全链路评分与 HP 奖惩日志</span>
            <span>会话 ID：{sessionId ? `#${sessionId.slice(0, 8)}` : '待启动'}</span>
          </div>
          <div className={styles['combat-log-list']}>
            {combatLogs.map((log) => (
              <div key={log.id} className={styles['combat-log-item']}>
                <div className={styles['combat-log-left']}>
                  <span className={styles['combat-log-ts']}>{log.ts}</span>
                  <span className={styles['combat-log-stage']}>[{log.stage}]</span>
                  <strong className={styles['combat-log-title']}>{log.title}</strong>
                  <span className={styles['combat-log-detail']}>{log.detail}</span>
                </div>
                {log.hpDelta !== 0 && (
                  <span
                    className={`${styles['combat-log-delta']} ${
                      log.hpDelta > 0 ? styles['delta-heal'] : styles['delta-damage']
                    }`}
                  >
                    {log.hpDelta > 0 ? `+${log.hpDelta} HP` : `${log.hpDelta} HP`}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================== GAME OVER OVERLAY ==================== */}
      {gameState === 'gameover' && (
        <div className={`${styles.overlay} ${styles['overlay-gameover']}`}>
          <div className={styles['overlay-icon']}>&#128128;</div>
          <div className={styles['overlay-title']}>挑战失败 · K.O.</div>
          <div className={styles['overlay-sub']}>
            GAME OVER · HP 归零，本次闯关已自动归档至复盘中心
          </div>
          {stageScores.length > 0 && (
            <div className={styles['overlay-scores']}>
              {stageScores.map((score, i) => (
                <div key={STAGES[i].id} className={styles['overlay-score-item']}>
                  <span className={styles['overlay-score-stage']}>
                    R{i + 1} · {STAGES[i].name}
                  </span>
                  <span className={styles['overlay-score-val']}>{score}</span>
                </div>
              ))}
            </div>
          )}
          <div className={styles['overlay-actions']}>
            <button type="button" className={styles['btn-retry']} onClick={handleRetry}>
              重新发起挑战
            </button>
            {sessionId && (
              <button
                type="button"
                className={styles['btn-complete']}
                onClick={() => navigate(`/analytics/report/${sessionId}`)}
              >
                查看本场诊断报告
              </button>
            )}
            {weakestStageRecord && (
              <button
                type="button"
                className={styles['btn-victory']}
                onClick={() => navigate(weakestStageRecord.route)}
              >
                前往「{weakestStageRecord.stageName}」专项补强
              </button>
            )}
            <Link to="/" className={styles['overlay-back']}>
              返回概览
            </Link>
          </div>
        </div>
      )}

      {/* ==================== VICTORY OVERLAY ==================== */}
      {gameState === 'victory' && (
        <div className={`${styles.overlay} ${styles['overlay-victory']}`}>
          <div className={styles['overlay-icon']}>&#127942;</div>
          <div className={styles['overlay-title']}>一命通关！</div>
          <div className={styles['overlay-sub']}>
            PERMADEATH CLEARED · 四大关卡全链路突破（剩余 {hp} HP · 当前连胜 {streak}）
          </div>
          <div className={styles['overlay-scores']}>
            {stageScores.map((score, i) => (
              <div key={STAGES[i].id} className={styles['overlay-score-item']}>
                <span className={styles['overlay-score-stage']}>
                  R{i + 1} · {STAGES[i].name}
                </span>
                <span className={styles['overlay-score-val']}>{score}</span>
              </div>
            ))}
          </div>
          <div className={styles['overlay-actions']}>
            {sessionId && (
              <button
                type="button"
                className={styles['btn-victory']}
                onClick={() => navigate(`/analytics/report/${sessionId}`)}
              >
                查看本场完整复盘报告
              </button>
            )}
            <button type="button" className={styles['btn-complete']} onClick={handleRetry}>
              冲击更高连胜
            </button>
            {weakestStageRecord && (
              <button
                type="button"
                className={styles['btn-retry']}
                onClick={() => navigate(weakestStageRecord.route)}
              >
                专项特训（{weakestStageRecord.stageName}）
              </button>
            )}
            <Link to="/" className={styles['overlay-back']}>
              返回概览
            </Link>
          </div>
        </div>
      )}

      {/* Bottom Nav */}
      <div className={styles['bottom-nav']}>
        <Link to="/" className={styles['back-link']}>
          ← 返回工作台概览
        </Link>
      </div>
    </div>
  )
}
