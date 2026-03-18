import { create } from 'zustand'

const CONTEXT_RESPONSES = {
  dashboard: {
    keywords: [
      {
        match: ['简历', 'resume', '优化简历'],
        response:
          '我来帮你导航到简历优化页面。你可以在那里上传简历，AI 会自动解析并给出优化建议。点击左侧导航栏的「简历优化」即可前往。',
      },
      {
        match: ['群面', 'lgd', '讨论', '无领导'],
        response:
          'LGD 无领导小组讨论是我们的核心功能！你可以在群面大厅创建房间，与 7 个性格各异的 AI 角色进行圆桌讨论。要不要现在就去试试？',
      },
      {
        match: ['分数', '成绩', '评分', '段位'],
        response:
          '你的综合评分目前是 82 分，在「铂金」段位。表达力和协作力是你的强项，建议多练习逻辑推理和应变能力来冲击钻石段位。',
      },
      {
        match: ['功能', '怎么用', '使用', '帮助'],
        response:
          '谈锋 AI 面试平台有三大核心功能：1) 简历 AI 优化 - 上传简历获取智能建议 2) LGD 群面模拟 - 与 AI 角色进行无领导小组讨论 3) 数据分析 - 追踪你的面试能力成长。左侧导航栏可以快速切换。',
      },
    ],
    defaultResponse:
      '你好！我是谈锋 AI 助手。你可以问我关于简历优化、群面训练、或者平台使用的任何问题。试着输入「帮我优化简历」或「开始群面练习」吧！',
    suggestions: ['帮我优化简历', '开始群面练习', '查看我的评分'],
  },

  resume: {
    keywords: [
      {
        match: ['上传', 'upload', '拖拽', '文件'],
        response:
          '拖拽你的简历文件到上传区域即可，支持 PDF 和 DOCX 格式。上传后我会自动解析简历内容并生成 AI 优化建议。',
      },
      {
        match: ['优化', '建议', '提升', '改进'],
        response:
          'AI 优化建议会从工作经历、技能描述、项目经验等维度给出。每条建议都标注了对竞争力的提升幅度，你可以选择性应用。建议优先处理「竞争力 +10」以上的高影响建议。',
      },
      {
        match: ['JD', '岗位', '匹配', '职位'],
        response:
          '在右侧 JD 匹配区域粘贴目标岗位的职位描述，AI 会分析你的简历与 JD 的匹配度，高亮匹配的关键词，并建议补充缺失的技能点。',
      },
      {
        match: ['STAR', '格式', '结构', '模板'],
        response:
          '推荐使用 STAR 框架（情境-任务-行动-结果）来描述工作经历。量化你的成果，比如「提升转化率 15%」比「优化了转化率」更有说服力。AI 会自动检测并建议 STAR 格式优化。',
      },
    ],
    defaultResponse:
      '这是简历 AI 优化工具。上传你的简历，AI 会自动解析、提供优化建议、并生成优化后的版本。你也可以粘贴 JD 来查看匹配度。',
    suggestions: ['上传简历', 'JD 匹配分析', '查看优化建议'],
  },

  lgd: {
    keywords: [
      {
        match: ['开始', '创建', '加入', '新房间'],
        response:
          '点击「创建新房间」按钮，选择讨论话题后即可开始。AI 会自动分配 7 个不同性格的角色：破冰者、点子王、杠精、逻辑王、和事佬、计时员和观察者。',
      },
      {
        match: ['技巧', '策略', '怎么', '方法', '建议'],
        response:
          '群面策略建议：1) 开场积极发言建立存在感 2) 注意倾听并回应他人观点 3) 适时用数据或案例支撑论点 4) 在讨论偏题时主动拉回主题 5) 总结阶段主动争取做总结者。',
      },
      {
        match: ['角色', '性格', 'AI', '对手'],
        response:
          '每个 AI 角色有独特的讨论风格：破冰者擅长开场引导，点子王善于提出创新观点，杠精会从反面质疑，逻辑王注重推理严谨，和事佬调和分歧，计时员控制节奏，观察者总结归纳。了解他们的风格有助于你制定应对策略。',
      },
      {
        match: ['评分', '打分', '表现', '成绩'],
        response:
          '讨论结束后会从五个维度评分：表达力、逻辑性、协作力、领导力和应变力。每个维度满分 100，综合得分决定你的段位等级。多次练习可以看到明显的能力提升曲线。',
      },
    ],
    defaultResponse:
      '这是 LGD 群面大厅。你可以创建新的讨论房间或加入已有房间。每个房间有 7 个 AI 角色和你组成 8 人讨论组。',
    suggestions: ['创建新房间', '群面技巧', '了解 AI 角色'],
  },

  lgdRoom: {
    keywords: [
      {
        match: ['发言', '说什么', '开口', '抢话'],
        response:
          '抢到发言机会后，建议先回应上一位发言者的观点再阐述自己的看法，这样既显得有倾听能力又能自然过渡。点击「抢麦」按钮即可获得发言权。',
      },
      {
        match: ['时间', '剩余', '快结束', '来不及'],
        response:
          '注意时间管理！自由讨论阶段建议每次发言控制在 30-60 秒内。如果时间紧迫，可以主动提议进入总结阶段，这也是展示领导力的好机会。',
      },
      {
        match: ['总结', '收尾', '结论'],
        response:
          '总结发言是加分利器。结构建议：1) 回顾讨论的核心议题 2) 梳理达成的共识 3) 整合各方观点形成结论 4) 补充自己的独到见解。争取第一个做总结者！',
      },
      {
        match: ['杠精', '反对', '质疑', '攻击'],
        response:
          '面对「杠精」的质疑不要慌张。先肯定对方提出了好问题，再用数据或案例回应。保持冷静和礼貌，把对抗转化为建设性的讨论，面试官会看到你的情商和应变能力。',
      },
    ],
    defaultResponse:
      '讨论正在进行中！记得积极发言但也要倾听他人。点击「抢麦」获得发言权，发言完毕后点击「结束发言」。祝你表现出色！',
    suggestions: ['发言技巧', '时间管理', '如何做总结'],
  },
}

function getContextKey(path) {
  if (path === '/' || path === '/dashboard') return 'dashboard'
  if (path === '/resume') return 'resume'
  if (path === '/lgd/lobby') return 'lgd'
  if (path.startsWith('/lgd/room/')) return 'lgdRoom'
  return 'dashboard'
}

function findResponse(contextKey, userText) {
  const context = CONTEXT_RESPONSES[contextKey]
  if (!context) return CONTEXT_RESPONSES.dashboard.defaultResponse

  const lowerText = userText.toLowerCase()

  for (const entry of context.keywords) {
    const matched = entry.match.some((keyword) => lowerText.includes(keyword.toLowerCase()))
    if (matched) return entry.response
  }

  return context.defaultResponse
}

function generateId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const GREETING_MESSAGE = {
  id: 'msg-greeting',
  role: 'assistant',
  content:
    '你好！我是谈锋 AI 助手，你的面试备战搭档。无论是简历优化、群面策略还是平台使用，随时可以问我。有什么我能帮你的？',
  timestamp: Date.now(),
}

const useCopilotStore = create((set, get) => ({
  isOpen: false,
  messages: [GREETING_MESSAGE],
  isTyping: false,
  currentPage: '/',
  suggestions: CONTEXT_RESPONSES.dashboard.suggestions,

  toggle() {
    set((state) => ({ isOpen: !state.isOpen }))
  },

  open() {
    set({ isOpen: true })
  },

  close() {
    set({ isOpen: false })
  },

  sendMessage(text) {
    if (!text.trim()) return

    const userMessage = {
      id: generateId(),
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    }

    set((state) => ({
      messages: [...state.messages, userMessage],
      isTyping: true,
    }))

    const { currentPage } = get()
    const contextKey = getContextKey(currentPage)
    const fullResponse = findResponse(contextKey, text)

    const assistantId = generateId()

    setTimeout(() => {
      set((state) => ({
        messages: [
          ...state.messages,
          {
            id: assistantId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
          },
        ],
      }))

      let charIndex = 0
      const streamInterval = setInterval(() => {
        charIndex += 1
        const partial = fullResponse.slice(0, charIndex)

        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === assistantId ? { ...msg, content: partial } : msg
          ),
        }))

        if (charIndex >= fullResponse.length) {
          clearInterval(streamInterval)
          set({ isTyping: false })
        }
      }, 30)
    }, 800)
  },

  setCurrentPage(path) {
    const contextKey = getContextKey(path)
    const context = CONTEXT_RESPONSES[contextKey]
    set({
      currentPage: path,
      suggestions: context ? context.suggestions : CONTEXT_RESPONSES.dashboard.suggestions,
    })
  },

  clearMessages() {
    set({ messages: [GREETING_MESSAGE] })
  },
}))

export default useCopilotStore
