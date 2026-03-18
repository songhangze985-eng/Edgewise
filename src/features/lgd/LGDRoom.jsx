import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import useLgdStore from '../../stores/lgdStore'
import useSessionStore from '../../stores/sessionStore'
import styles from './LGDRoom.module.css'

/* ============================================
   Agent Profiles
   ============================================ */
const AGENTS = [
  { id: 'ice_breaker', name: '小林', role: '破冰者', color: '#5a8ac4', emoji: '🧊' },
  { id: 'idea_king', name: '陈思', role: '点子王', color: '#FFB020', emoji: '💡' },
  { id: 'debater', name: '赵锐', role: '杠精', color: '#d45c5c', emoji: '⚔️' },
  { id: 'logician', name: '李理', role: '逻辑王', color: '#9b6fc7', emoji: '🧠' },
  { id: 'mediator', name: '王和', role: '和事佬', color: '#00C48C', emoji: '🕊️' },
  { id: 'timekeeper', name: '刘时', role: '计时员', color: '#FF8C00', emoji: '⏱️' },
  { id: 'observer', name: '周观', role: '观察者', color: '#87CEEB', emoji: '👁️' },
]

const USER_PROFILE = { id: 'user', name: '你', role: '参与者', color: '#9b6fc7', emoji: '👤' }

/* ============================================
   Pre-built Response Pools
   ============================================ */
const RESPONSES = {
  sequential: {
    ice_breaker: [
      '大家好，我先来抛砖引玉。远程协作最核心的挑战，我认为是沟通效率的损耗。面对面时一个眼神、一个手势就能传达的信息，在线上往往需要大段文字解释。我觉得我们可以从三个维度来拆解这个问题：工具、流程、文化。',
      '非常好的话题。远程团队协作这个议题影响面非常广，我建议我们先统一问题定义——我们讨论的是全远程团队还是混合办公？不同场景下痛点差异很大。我先提一个框架：信息同步、任务协同、团队凝聚力。',
      '我来打个头阵吧。作为在远程环境工作过两年的人，我最大的感触是：工具不是问题，人的习惯才是。我们是不是可以从"行为改变"的角度来切入这个讨论？',
    ],
    idea_king: [
      '我有一个大胆的想法——数字分身办公室。想象每个人在虚拟空间里有一个AI分身，能帮你处理异步消息、整理会议纪要、甚至在你不在线时代替你回答简单问题。这不是科幻，现在的大模型技术完全可以初步实现。',
      '补充一个观点。我觉得关键是"可见性"——远程最大的敌人是信息黑箱。我提议搞一个"工作状态直播"系统，不是监控，而是每个人自愿分享当前工作状态和进度，就像游戏里的队友血条一样。',
      '我来接一下。除了刚才提到的，我想提个完全不同的方向——异步优先文化。与其优化同步开会的效率，不如减少开会。用录屏替代会议，用文档替代讨论。',
    ],
    debater: [
      '等一下，我想挑战一下刚才的观点。说"工具是最重要的"未免太表面了。很多公司花大钱买了最贵的协作工具，团队效率反而下降了。根本问题不在工具，而在于管理者有没有建立清晰的异步沟通规范。',
      '我不太同意刚才的框架。为什么总是从管理者角度出发？远程协作的核心应该是赋能个体——让每个人自主管理自己的时间和产出。过度流程化反而会扼杀远程办公最大的优势：灵活性。',
      '抱歉我要唱个反调。所谓的"虚拟办公室"概念已经被证伪了，Meta的Horizon Workrooms就是例子。远程协作的本质不是模拟线下，而是发明新的协作范式。',
    ],
    logician: [
      '让我梳理一下逻辑链。远程协作效率低→根因分析→信息不对称、反馈延迟、社交缺失→对应方案。我建议我们按这个因果链逐一讨论，避免方案跳跃。目前大家主要在讨论"信息不对称"这一支，其他两个还没覆盖。',
      '从数据角度看这个问题。根据Buffer 2023年的远程工作报告，排名前三的挑战是：协作困难占20%、孤独感占18%、无法断联占17%。所以我们的方案应该优先解决协作困难，但也不能忽视心理层面的问题。',
      '我想做一个结构化的归纳。目前为止大家提出的方案可以分为三类：技术工具层面、管理流程层面、文化建设层面。我建议我们对每一类进行优先级排序。',
    ],
    mediator: [
      '我觉得前面几位同学的观点都有道理。小林提到的沟通维度和赵锐强调的规范其实不矛盾——好的工具需要配合好的规范才能发挥作用。我们不妨把两个观点整合一下，形成一个更完整的方案。',
      '我来做个简单总结和桥接。目前讨论有两个方向：一是技术手段提升效率，二是文化制度保障执行。这两者是互补的，不是对立的。我建议我们把两个方向融合。',
      '我注意到大家在激烈讨论中可能忽略了一个共识点——我们都同意"透明度"很重要。无论是哪个方案，核心都是提升信息透明度。',
    ],
    timekeeper: [
      '提醒一下大家，我们的讨论时间已经过去三分之一了。目前我们已经完成了问题定义和初步方案发散，我建议接下来的时间我们聚焦在方案收敛和优先级排序上，争取在结束前形成一个可执行的框架。',
      '我来帮大家做个时间规划。建议分为三段：发散方案，收敛和投票，最后形成统一的总结发言框架。大家觉得这个节奏怎么样？',
      '先说观点再说时间。我认为远程协作最需要的就是节奏感——固定的晨会、周报、月度复盘。没有节奏感的远程团队就像没有指挥的乐队。',
    ],
    observer: [
      '我一直在认真听大家的讨论，有几个观察。第一，大家普遍从"公司"视角出发，但忽略了个人能力差异——并不是所有人都适合远程工作。第二，我们缺少"度量标准"——怎么定义效率提升了？',
      '在观察了前面几位的发言后，我有一个有趣的发现：大家不自觉地把远程协作等同于"在线办公"，但其实还有一种更激进的模式——结果导向管理，完全不管过程，只看产出。',
      '我来补充一个大家可能忽略的视角——新员工的融入问题。远程环境下新人的学习曲线会显著拉长，因为他们缺少随时请教同事的机会。',
    ],
  },
  free_discussion: {
    ice_breaker: [
      '接着刚才的话题，我想具体化一下。如果要选一个最容易落地的方案，我投"每日异步站会"——每人用两分钟录音汇报进展，这比打字快、比开会轻。',
      '对刚才赵锐的反驳，我部分同意。确实不能只靠工具，但完全否定工具的作用也不合理。我见过太多团队用微信群办公的惨状了。',
      '我突然想到一个很简单但有效的做法——设立"无会日"。每周固定一天不安排任何会议，让大家有完整的专注时间。',
      '关于李理提的数据，我觉得很有说服力。协作困难排第一，说明我们的讨论方向是对的。',
    ],
    idea_king: [
      '等等，我又有一个想法！如果把游戏化机制引入远程协作呢？完成任务获得经验值，团队达标解锁成就，用积分兑换弹性假期。这能解决远程工作缺乏正反馈的问题。',
      '我不同意"减少开会"的绝对化说法。关键不是少开会，而是把会议分级——决策会必须同步，信息通报会完全可以异步化。',
      '顺着王和的整合方向，我提一个具体方案叫"三三制"：每天三条异步更新、每周三十分钟团队同步会、每月三小时线下/在线团建。',
      '补充一点，关于新人融入问题周观说得很好。我提议"影子计划"——新人入职前两周全程跟随一位老员工的工作流程。',
    ],
    debater: [
      '游戏化？这不就是变相的监控和KPI化吗？把工作变成打怪升级，长期下来只会鼓励"刷数据"而非真正产出价值。我们需要的是信任文化，不是更多的考核工具。',
      '"三三制"听起来美好，但在实际执行中会面临时区差异的问题。如果团队成员跨了三个以上时区，所谓的"每天三条更新"对有些人就变成了半夜发消息。',
      '我要反驳一下"无会日"的提议。问题不在于会多，而在于会议质量差。一个高效的三十分钟会议比三天的异步扯皮有价值得多。',
      '再说一个没人提的问题——远程协作中"拖延效应"被严重低估了。在办公室里，环境压力自然会驱动你工作；在家里，冰箱和沙发才是你的同事。',
    ],
    logician: [
      '我来做一个中间总结。截至目前我们有以下方案集合：异步站会、数字分身、三三制、无会日、游戏化、影子计划。按落地难度从低到高排序。',
      '对赵锐的时区问题，这是一个真实约束。但我们可以把它转化为优势——时区差异意味着团队可以实现"接力式工作"，一个时区下班交给下一个时区继续。',
      '我注意到我们讨论中有一个逻辑漏洞：我们假设"效率提升"是唯一目标，但远程工作的另一个核心价值是"生活质量"。如果方案提升了效率但降低了幸福感，是否值得？',
      '归纳一下目前的共识区域：一是信息透明度需要提升，二是异步沟通应该增加，三是需要保留适当的同步互动。分歧在于执行方式和优先级。',
    ],
    mediator: [
      '赵锐和陈思都有道理。游戏化不是监控，但确实有被滥用的风险。折中一下——可以把游戏化限定在团队层面而非个人层面。',
      '我提议我们开始收敛了。结合大家的观点，我尝试整合成一个三步走方案：短期、中期、长期分别落地不同策略。',
      '关于幸福感的问题李理说得很好。我认为这恰恰说明我们的方案不能太"重"——要低成本、低侵入、高自主性。',
      '综合各方面意见，我觉得我们基本形成了一个比较完整的框架。从最小成本改变开始推进。',
    ],
    timekeeper: [
      '提醒大家，自由讨论已过半。我们需要在接下来的时间内达成基本共识，确定最终方案的框架。',
      '时间角度看，刚才讨论了大概六个方案，但真正可行的不超过三个。我建议我们用排除法，快速筛掉实施成本过高的方案。',
      '快到投票环节了。我建议大家思考一下：如果你是这个远程团队的leader，你会优先推行哪一个方案？',
      '从效率角度说，远程团队最大的时间杀手是"等待回复"。任何能缩短响应延迟的方案都应该优先考虑。',
    ],
    observer: [
      '我观察到一个有趣的现象——讨论越深入，大家的观点反而越趋同了。初始分歧很大，但现在基本都认同需要"异步为主、同步为辅"的策略。',
      '提醒大家注意一个盲区——我们八个人都在模拟面对面讨论，但真正的远程团队可能根本凑不齐这么多人同时在线。',
      '从整体讨论质量来看，我认为每位同学都有独特的贡献。但如果要选一个最能推动讨论进展的人，我觉得是李理的结构化总结帮助我们理清了思路。',
      '最后补充一点：不管最终方案是什么，"定期复盘和调整"是必须的。远程协作没有银弹，只有持续迭代。',
    ],
  },
}

const DEFAULT_TOPIC = '远程团队协作效率提升方案'
const DEFAULT_MATERIAL =
  '随着后疫情时代的到来，越来越多的企业采用远程或混合办公模式。然而，远程团队在信息同步、任务协同和团队凝聚力方面面临诸多挑战。据调查显示，68%的远程员工表示在协作效率上存在明显障碍，42%的管理者认为远程团队的产出低于预期。请你们团队讨论如何系统性地提升远程团队的协作效率，并给出可落地的解决方案。'

/* ============================================
   Phase Configuration
   ============================================ */
const PHASES = [
  { key: 'reading', label: '阅读材料' },
  { key: 'sequential', label: '依次发言' },
  { key: 'free_discussion', label: '自由讨论' },
  { key: 'voting', label: '投票环节' },
  { key: 'summary', label: '总结评分' },
]

/* ============================================
   Utility: format seconds to mm:ss
   ============================================ */
function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/* ============================================
   LGDRoom Component
   ============================================ */
export default function LGDRoom() {
  const navigate = useNavigate()
  const addSession = useSessionStore((s) => s.addSession)
  const phase = useLgdStore((s) => s.phase)
  const topic = useLgdStore((s) => s.topic)
  const material = useLgdStore((s) => s.material)
  const messages = useLgdStore((s) => s.messages)
  const currentSpeaker = useLgdStore((s) => s.currentSpeaker)
  const remainingSeconds = useLgdStore((s) => s.remainingSeconds)
  const micGranted = useLgdStore((s) => s.micGranted)
  const score = useLgdStore((s) => s.score)

  const chatRef = useRef(null)
  const inputRef = useRef(null)
  const simulationRef = useRef(null)
  const timerRef = useRef(null)
  const typewriterRef = useRef(null)
  const mountedRef = useRef(true)

  const [inputValue, setInputValue] = useState('')
  const [typingAgent, setTypingAgent] = useState(null)
  const [displayingMessage, setDisplayingMessage] = useState(null)
  const [voteSelection, setVoteSelection] = useState(null)
  const [handRaised, setHandRaised] = useState(false)

  const responseIndexRef = useRef({})
  const startTimeRef = useRef(Date.now())

  /* ---- Auto-scroll chat ---- */
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight
    }
  }, [messages, typingAgent, displayingMessage])

  /* ---- Initialize room on mount ---- */
  useEffect(() => {
    mountedRef.current = true
    useLgdStore.getState().initRoom(DEFAULT_TOPIC, DEFAULT_MATERIAL)

    return () => {
      mountedRef.current = false
      clearInterval(timerRef.current)
      clearTimeout(simulationRef.current)
      clearInterval(typewriterRef.current)
      useLgdStore.getState().reset()
    }
  }, [])

  /* ---- Timer tick ---- */
  useEffect(() => {
    clearInterval(timerRef.current)
    if (phase === 'lobby' || phase === 'completed') return

    timerRef.current = setInterval(() => {
      if (!mountedRef.current) return
      const state = useLgdStore.getState()
      if (state.remainingSeconds <= 1) {
        clearInterval(timerRef.current)
        advancePhase(state.phase)
      } else {
        state.tick()
      }
    }, 1000)

    return () => clearInterval(timerRef.current)
  }, [phase])

  /* ---- Phase transition logic ---- */
  const advancePhase = useCallback((currentPhase) => {
    if (!mountedRef.current) return
    const state = useLgdStore.getState()

    clearTimeout(simulationRef.current)
    clearInterval(typewriterRef.current)
    setTypingAgent(null)
    setDisplayingMessage(null)

    const transitions = {
      reading: 'sequential',
      sequential: 'free_discussion',
      free_discussion: 'voting',
      voting: 'summary',
      summary: 'completed',
    }

    const next = transitions[currentPhase]
    if (next) {
      state.setPhase(next)
      state.addMessage({
        senderId: 'system',
        senderName: '系统',
        senderRole: '',
        content: getPhaseAnnouncement(next),
        isUser: false,
        isSystem: true,
      })
    }
  }, [])

  /* ---- Run simulation based on phase ---- */
  useEffect(() => {
    if (phase === 'sequential') {
      runSequentialSimulation()
    } else if (phase === 'free_discussion') {
      runFreeDiscussionSimulation()
    } else if (phase === 'summary') {
      simulationRef.current = setTimeout(() => {
        if (!mountedRef.current) return
        const generatedScore = generateScore()
        useLgdStore.getState().setScore(generatedScore)
        const lgdState = useLgdStore.getState()
        addSession({
          type: 'lgd',
          topic: lgdState.topic || 'LGD 群面讨论',
          score: generatedScore.overall,
          durationMinutes: Math.max(1, Math.floor((Date.now() - startTimeRef.current) / 60000)),
          dimensions: {
            expression: generatedScore.expression || 82,
            logic: generatedScore.logic || 75,
            leadership: 68 + Math.floor(Math.random() * 15),
            teamwork: generatedScore.teamwork || 88,
            adaptability: 71 + Math.floor(Math.random() * 12),
          },
        })
        advancePhase('summary')
      }, 3000)
    }

    return () => {
      clearTimeout(simulationRef.current)
      clearInterval(typewriterRef.current)
    }
  }, [phase, advancePhase])

  /* ---- Sequential Phase ---- */
  function runSequentialSimulation() {
    let agentIndex = 0

    function speakNext() {
      if (!mountedRef.current) return
      const state = useLgdStore.getState()
      if (state.phase !== 'sequential') return
      if (agentIndex >= AGENTS.length) {
        advancePhase('sequential')
        return
      }

      const agent = AGENTS[agentIndex]
      const pool = RESPONSES.sequential[agent.id] || []
      const idx = getResponseIndex(agent.id, 'sequential')
      const content = pool[idx % pool.length]

      if (!content) {
        agentIndex++
        simulationRef.current = setTimeout(speakNext, 500)
        return
      }

      setTypingAgent(agent)
      useLgdStore.getState().setCurrentSpeaker(agent.id)

      simulationRef.current = setTimeout(() => {
        if (!mountedRef.current) return
        setTypingAgent(null)
        typewriteMessage(agent, content, () => {
          if (!mountedRef.current) return
          agentIndex++
          useLgdStore.getState().setCurrentSpeaker(null)
          simulationRef.current = setTimeout(speakNext, 1200)
        })
      }, 1500)
    }

    simulationRef.current = setTimeout(speakNext, 2000)
  }

  /* ---- Free Discussion Phase ---- */
  function runFreeDiscussionSimulation() {
    function scheduleNext() {
      if (!mountedRef.current) return
      const state = useLgdStore.getState()
      if (state.phase !== 'free_discussion') return
      if (state.micGranted) {
        simulationRef.current = setTimeout(scheduleNext, 2000)
        return
      }

      const delay = 3000 + Math.random() * 3000
      simulationRef.current = setTimeout(() => {
        if (!mountedRef.current) return
        const st = useLgdStore.getState()
        if (st.phase !== 'free_discussion' || st.micGranted) {
          scheduleNext()
          return
        }

        const agent = AGENTS[Math.floor(Math.random() * AGENTS.length)]
        const pool = RESPONSES.free_discussion[agent.id] || []
        const idx = getResponseIndex(agent.id, 'free_discussion')
        const content = pool[idx % pool.length]

        if (!content) {
          scheduleNext()
          return
        }

        setTypingAgent(agent)
        st.setCurrentSpeaker(agent.id)

        simulationRef.current = setTimeout(() => {
          if (!mountedRef.current) return
          setTypingAgent(null)
          typewriteMessage(agent, content, () => {
            if (!mountedRef.current) return
            useLgdStore.getState().setCurrentSpeaker(null)
            scheduleNext()
          })
        }, 1200 + Math.random() * 800)
      }, delay)
    }

    simulationRef.current = setTimeout(scheduleNext, 2000)
  }

  /* ---- Typewriter effect ---- */
  function typewriteMessage(agent, fullContent, onComplete) {
    let charIndex = 0
    const partialMsg = {
      senderId: agent.id,
      senderName: agent.name,
      senderRole: agent.role,
      content: '',
      isUser: false,
    }

    setDisplayingMessage({ ...partialMsg, emoji: agent.emoji, color: agent.color })

    typewriterRef.current = setInterval(() => {
      if (!mountedRef.current) {
        clearInterval(typewriterRef.current)
        return
      }
      charIndex++
      if (charIndex >= fullContent.length) {
        clearInterval(typewriterRef.current)
        setDisplayingMessage(null)

        const state = useLgdStore.getState()
        state.addMessage({ ...partialMsg, content: fullContent })
        state.incrementAgentSpeakCount(agent.id)

        if (onComplete) onComplete()
      } else {
        setDisplayingMessage((prev) =>
          prev ? { ...prev, content: fullContent.slice(0, charIndex) } : null,
        )
      }
    }, 35)
  }

  /* ---- Response index tracker ---- */
  function getResponseIndex(agentId, phaseName) {
    const key = `${agentId}_${phaseName}`
    const current = responseIndexRef.current[key] || 0
    responseIndexRef.current[key] = current + 1
    return current
  }

  /* ---- Phase announcements ---- */
  function getPhaseAnnouncement(p) {
    const map = {
      sequential: '依次发言环节开始，每位成员按顺序发表观点',
      free_discussion: '自由讨论环节开始，可以自由发言和辩论',
      voting: '投票环节开始，请选出你认为表现最好的成员',
      summary: '讨论结束，正在生成评分报告...',
      completed: '讨论结束',
    }
    return map[p] || ''
  }

  /* ---- Generate mock score ---- */
  function generateScore() {
    return {
      overall: 78 + Math.floor(Math.random() * 15),
      expression: 72 + Math.floor(Math.random() * 20),
      logic: 70 + Math.floor(Math.random() * 22),
      teamwork: 75 + Math.floor(Math.random() * 18),
      feedback:
        '你在讨论中表现积极，观点有一定深度。建议在后续讨论中更主动地推动议题收敛，并尝试在他人观点基础上做进一步延伸，展现更强的整合能力。同时注意控制发言节奏，在关键时刻抢占话语权。',
    }
  }

  /* ---- User actions ---- */
  function handleSend() {
    const text = inputValue.trim()
    if (!text) return

    useLgdStore.getState().addMessage({
      senderId: 'user',
      senderName: '你',
      senderRole: '参与者',
      content: text,
      isUser: true,
    })

    setInputValue('')
    if (useLgdStore.getState().micGranted) {
      useLgdStore.getState().releaseMic()
    }
    if (inputRef.current) inputRef.current.focus()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleGrabMic() {
    const state = useLgdStore.getState()
    if (state.micGranted) {
      state.releaseMic()
    } else {
      state.grabMic()
      if (inputRef.current) inputRef.current.focus()
    }
  }

  function handleVote(agentId) {
    setVoteSelection(agentId)
    useLgdStore.getState().vote(agentId)
    simulationRef.current = setTimeout(() => {
      if (mountedRef.current) advancePhase('voting')
    }, 1500)
  }

  /* ---- Seat positions ---- */
  function getSeatPositions() {
    const allSeats = [...AGENTS, USER_PROFILE]
    const total = allSeats.length
    const radius = 155
    const cx = 190
    const cy = 190

    return allSeats.map((seat, i) => {
      const angle = (2 * Math.PI * i) / total - Math.PI / 2
      return {
        ...seat,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        angleDeg: (Math.atan2(radius * Math.sin(angle), radius * Math.cos(angle)) * 180) / Math.PI,
      }
    })
  }

  const seatPositions = getSeatPositions()

  /* ---- Find agent ---- */
  function findAgent(id) {
    if (id === 'user') return USER_PROFILE
    return AGENTS.find((a) => a.id === id) || null
  }

  /* ---- Phase index ---- */
  const phaseIndex = PHASES.findIndex((p) => p.key === phase)
  const canInteract = phase === 'sequential' || phase === 'free_discussion'

  /* ============================================
     RENDER
     ============================================ */
  return (
    <div className={styles['lgd-room']}>
      {/* Phase Bar */}
      <div className={styles['phase-bar']}>
        <div className={styles['phase-indicator']}>
          {PHASES.map((p, i) => (
            <div
              key={p.key}
              className={`${styles['phase-step']} ${i === phaseIndex ? styles.active : ''} ${i < phaseIndex ? styles.completed : ''}`}
              title={p.label}
            />
          ))}
        </div>
        <span className={styles['phase-label']}>
          {PHASES[phaseIndex]?.label || phase}
        </span>
        <span className={`${styles.timer} ${remainingSeconds < 60 && remainingSeconds > 0 ? styles.urgent : ''}`}>
          {formatTime(remainingSeconds)}
        </span>
      </div>

      {/* Page Header */}
      <div className={styles['page-header']}>
        <h1>LGD 群面房间</h1>
        <div className={styles['header-topic']}>{topic}</div>
      </div>

      {/* Main Area */}
      <div className={styles['main-area']}>
        {/* Roundtable */}
        <div className={styles['roundtable-panel']}>
          <div className={styles['roundtable-container']}>
            <div className={styles['table-center']}>
              <div className={styles['table-center-label']}>LGD</div>
              <div className={styles['table-center-topic']}>
                {topic ? `${topic.slice(0, 8)}...` : ''}
              </div>
            </div>

            {seatPositions.map((seat) => {
              const dx = seat.x - 190
              const dy = seat.y - 190
              const lineAngle = (Math.atan2(dy, dx) * 180) / Math.PI
              return (
                <div
                  key={`line-${seat.id}`}
                  className={styles['table-line']}
                  style={{ transform: `rotate(${lineAngle}deg)` }}
                />
              )
            })}

            {seatPositions.map((seat) => {
              const isActive = currentSpeaker === seat.id
              const isUser = seat.id === 'user'
              const isSpeaking = isActive

              return (
                <div
                  key={seat.id}
                  className={`${styles.seat} ${isActive ? styles.active : ''} ${isUser ? styles['user-seat'] : ''} ${isSpeaking ? styles.speaking : ''}`}
                  style={{
                    left: `${seat.x}px`,
                    top: `${seat.y}px`,
                    borderColor: seat.color,
                  }}
                >
                  <div
                    className={styles['seat-inner']}
                    style={{ borderColor: isActive ? seat.color : undefined }}
                  >
                    <span className={styles['seat-emoji']}>{seat.emoji}</span>
                    <span className={styles['seat-name']}>{seat.name}</span>
                  </div>
                  <span
                    className={styles['seat-role']}
                    style={{
                      borderColor: isActive ? seat.color : undefined,
                      color: isActive ? seat.color : undefined,
                    }}
                  >
                    {seat.role}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Chat Panel */}
        <div className={styles['chat-panel']}>
          <div className={styles['chat-header']}>
            <span className={styles['chat-title']}>对话流</span>
            <span className={styles['chat-count']}>{messages.length} 条消息</span>
          </div>

          <div className={styles['chat-stream']} ref={chatRef}>
            {messages.map((msg) => {
              if (msg.isSystem) {
                return (
                  <div key={msg.id} className={styles['system-message']}>
                    {msg.content}
                  </div>
                )
              }

              const agent = findAgent(msg.senderId)
              return (
                <div
                  key={msg.id}
                  className={`${styles.message} ${msg.isUser ? styles['user-message'] : ''}`}
                >
                  <div className={styles['msg-avatar']} style={{ borderColor: agent?.color }}>
                    {agent?.emoji || '?'}
                  </div>
                  <div className={styles['msg-body']}>
                    <div className={styles['msg-header']}>
                      <span className={styles['msg-name']}>{msg.senderName}</span>
                      <span
                        className={styles['msg-role-badge']}
                        style={{ color: agent?.color, borderColor: agent?.color }}
                      >
                        {msg.senderRole}
                      </span>
                    </div>
                    <div className={styles['msg-content']}>{msg.content}</div>
                  </div>
                </div>
              )
            })}

            {displayingMessage && (
              <div className={styles.message}>
                <div className={styles['msg-avatar']} style={{ borderColor: displayingMessage.color }}>
                  {displayingMessage.emoji}
                </div>
                <div className={styles['msg-body']}>
                  <div className={styles['msg-header']}>
                    <span className={styles['msg-name']}>{displayingMessage.senderName}</span>
                    <span
                      className={styles['msg-role-badge']}
                      style={{ color: displayingMessage.color, borderColor: displayingMessage.color }}
                    >
                      {displayingMessage.senderRole}
                    </span>
                  </div>
                  <div className={styles['msg-content']}>
                    {displayingMessage.content}
                    <span style={{ opacity: 0.4 }}>|</span>
                  </div>
                </div>
              </div>
            )}

            {typingAgent && !displayingMessage && (
              <div className={styles['typing-indicator']}>
                <div className={styles['typing-avatar']} style={{ borderColor: typingAgent.color }}>
                  {typingAgent.emoji}
                </div>
                <div className={styles['typing-dots']}>
                  <span />
                  <span />
                  <span />
                </div>
                <span className={styles['typing-name']}>{typingAgent.name} 正在思考...</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className={styles['controls-bar']}>
        <div className={styles['controls-actions']}>
          <button
            className={`${styles['hw-btn']} ${styles['mic-btn']} ${micGranted ? styles.granted : ''}`}
            onClick={handleGrabMic}
            disabled={!canInteract}
          >
            <span className={styles['hw-btn-well']}>
              <span className={styles['hw-btn-cap']}>
                {micGranted ? '🔊' : '🎤'}
                <span className={styles['hw-btn-label']}>
                  {micGranted ? '释放麦克风' : '抢麦发言'}
                </span>
              </span>
            </span>
          </button>

          <button
            className={`${styles['hw-btn']} ${styles['hand-btn']}`}
            onClick={() => setHandRaised(!handRaised)}
            disabled={!canInteract}
          >
            <span className={styles['hw-btn-well']}>
              <span className={styles['hw-btn-cap']}>
                {handRaised ? '🙋' : '✋'}
                <span className={styles['hw-btn-label']}>
                  {handRaised ? '已举手' : '举手'}
                </span>
              </span>
            </span>
          </button>

          <button className={`${styles['hw-btn']} ${styles['note-btn']}`}>
            <span className={styles['hw-btn-well']}>
              <span className={styles['hw-btn-cap']}>
                📝
                <span className={styles['hw-btn-label']}>笔记</span>
              </span>
            </span>
          </button>

          <button
            className={`${styles['hw-btn']} ${styles['exit-btn']}`}
            onClick={() => navigate('/lgd/lobby')}
          >
            <span className={styles['hw-btn-well']}>
              <span className={styles['hw-btn-cap']}>
                🚪
                <span className={styles['hw-btn-label']}>退出</span>
              </span>
            </span>
          </button>
        </div>

        <div className={styles['input-row']}>
          <input
            ref={inputRef}
            type="text"
            className={styles['message-input']}
            placeholder={
              micGranted
                ? '你已获得麦克风，输入你的发言...'
                : canInteract
                  ? '先点击"抢麦发言"获取发言权...'
                  : '当前阶段不可发言'
            }
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!micGranted}
          />
          <button
            className={styles['send-btn']}
            onClick={handleSend}
            disabled={!micGranted || !inputValue.trim()}
          >
            发送
          </button>
        </div>
      </div>

      {/* Reading Phase Overlay */}
      {phase === 'reading' && (
        <div className={styles['reading-overlay']}>
          <div className={styles['reading-card']}>
            <div className={styles['reading-label']}>阅读阶段</div>
            <div className={styles['reading-topic']}>{topic}</div>
            <div className={styles['reading-material']}>{material}</div>
            <div className={styles['reading-timer']}>{formatTime(remainingSeconds)}</div>
            <div className={styles['reading-hint']}>
              请仔细阅读材料，准备你的观点 -- 计时结束后自动进入发言环节
            </div>
          </div>
        </div>
      )}

      {/* Voting Phase Overlay */}
      {phase === 'voting' && (
        <div className={styles['voting-overlay']}>
          <div className={styles['voting-card']}>
            <div className={styles['voting-title']}>投票环节</div>
            <div className={styles['voting-subtitle']}>
              请选出你认为在本次讨论中表现最好的成员
            </div>
            <div className={styles['voting-list']}>
              {AGENTS.map((agent) => (
                <div
                  key={agent.id}
                  className={`${styles['vote-option']} ${voteSelection === agent.id ? styles.selected : ''}`}
                  onClick={() => (!voteSelection ? handleVote(agent.id) : undefined)}
                  style={{ pointerEvents: voteSelection ? 'none' : 'auto' }}
                >
                  <span className={styles['vote-emoji']}>{agent.emoji}</span>
                  <div className={styles['vote-info']}>
                    <div className={styles['vote-name']}>{agent.name}</div>
                    <div className={styles['vote-role-label']}>{agent.role}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Summary / Completed Overlay */}
      {phase === 'completed' && score && (
        <div className={styles['summary-overlay']}>
          <div className={styles['summary-card']}>
            <div className={styles['summary-title']}>讨论评分报告</div>
            <div className={styles['score-grid']}>
              <div className={styles['score-item']}>
                <div className={styles['score-value']}>{score.overall}</div>
                <div className={styles['score-label']}>综合评分</div>
              </div>
              <div className={styles['score-item']}>
                <div className={styles['score-value']}>{score.expression}</div>
                <div className={styles['score-label']}>表达能力</div>
              </div>
              <div className={styles['score-item']}>
                <div className={styles['score-value']}>{score.logic}</div>
                <div className={styles['score-label']}>逻辑思维</div>
              </div>
              <div className={styles['score-item']}>
                <div className={styles['score-value']}>{score.teamwork}</div>
                <div className={styles['score-label']}>团队协作</div>
              </div>
            </div>
            <div className={styles['summary-feedback']}>{score.feedback}</div>
            <div className={styles['summary-actions']}>
              <button
                className={`${styles['hw-btn']} ${styles['note-btn']}`}
                onClick={() => navigate('/lgd/lobby')}
              >
                <span className={styles['hw-btn-well']}>
                  <span className={styles['hw-btn-cap']}>
                    🏠
                    <span className={styles['hw-btn-label']}>返回大厅</span>
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
