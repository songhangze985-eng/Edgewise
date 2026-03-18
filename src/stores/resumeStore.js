import { create } from 'zustand'

const INITIAL_STATE = {
  file: null,
  fileName: '',
  fileSize: '',
  status: 'idle',
  parsedData: null,
  suggestions: [],
  optimizedText: '',
  jdText: '',
  jdMatchScore: null,
  jdKeywords: [],
  history: [
    { file: '产品经理_张三_2026.pdf', status: 'optimized', date: '2026-03-14' },
    { file: '前端工程师_李四_v2.docx', status: 'optimized', date: '2026-03-12' },
    { file: '数据分析师_王五.pdf', status: 'optimized', date: '2026-03-10' },
  ],
}

const MOCK_PARSED_DATA = {
  name: '张明远',
  email: 'zhangmy@email.com',
  phone: '138-xxxx-8888',
  education: '清华大学 · 计算机科学与技术 · 硕士 · 2022-2025',
  experience: [
    {
      company: '字节跳动',
      role: '产品经理',
      period: '2023.06 - 至今',
      desc: '负责抖音电商搜索推荐模块，管理3人小组',
    },
    {
      company: '腾讯',
      role: '产品实习生',
      period: '2022.06 - 2022.12',
      desc: '参与微信支付用户增长项目',
    },
  ],
  skills: ['产品设计', '数据分析', 'SQL', 'Axure', 'Python', '用户研究', 'A/B测试', '项目管理'],
  projects: [
    { name: '搜索推荐优化', desc: '提升搜索转化率15%，DAU增长20万' },
    { name: '用户增长体系搭建', desc: '设计裂变活动框架，新增用户50万+' },
  ],
}

const MOCK_SUGGESTIONS = [
  {
    id: 'sug-1',
    category: '工作经历',
    text: '建议使用 STAR 框架量化项目成果，补充具体数据指标。例如："主导搜索推荐算法迭代，搜索转化率提升15%，月均GMV增长2000万"',
    impact: 12,
    applied: false,
  },
  {
    id: 'sug-2',
    category: '技能描述',
    text: '技术栈描述过于笼统，建议按项目分类展示核心技能，突出与岗位要求的匹配度',
    impact: 8,
    applied: false,
  },
  {
    id: 'sug-3',
    category: '项目经验',
    text: '缺少项目复盘思考，建议添加"收获与成长"段落，展示学习能力和反思深度',
    impact: 6,
    applied: false,
  },
  {
    id: 'sug-4',
    category: '教育背景',
    text: '建议补充核心课程、GPA 排名及相关学术成果，强化教育背景的竞争力',
    impact: 5,
    applied: false,
  },
  {
    id: 'sug-5',
    category: '个人总结',
    text: '缺少个人总结/自我评价模块，建议用3-4句话概括核心优势、职业目标和差异化价值',
    impact: 10,
    applied: false,
  },
  {
    id: 'sug-6',
    category: '工作经历',
    text: '实习经历描述过于简略，建议补充量化成果，如"参与微信支付用户增长项目，设计裂变活动框架，拉新50万+"',
    impact: 9,
    applied: false,
  },
]

const MOCK_OPTIMIZED_TEXT = `张明远
清华大学 · 计算机科学与技术 · 硕士 · 2022-2025
zhangmy@email.com | 138-xxxx-8888

━━━ 个人总结 ━━━

拥有2年+互联网产品经理经验，专注于搜索推荐与用户增长方向。具备从0到1的产品规划能力和数据驱动决策思维，擅长跨团队协作与项目管理。目标成为具有技术深度的产品负责人。

━━━ 工作经历 ━━━

【字节跳动】产品经理 | 2023.06 - 至今
- [背景] 抖音电商搜索推荐模块面临转化率瓶颈，用户搜索意图匹配度不足
- [任务] 负责搜索推荐算法产品化迭代，管理3人产品小组
- [行动] 主导搜索排序策略优化，引入用户行为序列特征；设计A/B实验框架，建立数据监控看板
- [结果] 搜索转化率提升15%，DAU增长20万，月均GMV增长2000万

【腾讯】产品实习生 | 2022.06 - 2022.12
- [背景] 微信支付用户增长进入平台期，需探索社交裂变新模式
- [任务] 参与用户增长项目，负责裂变活动产品设计
- [行动] 调研行业裂变案例50+，设计"邀请返现+社群红包"组合策略；输出完整PRD并跟进开发
- [结果] 活动上线首月拉新50万+用户，人均获客成本降低30%

━━━ 项目经验 ━━━

搜索推荐优化
提升搜索转化率15%，DAU增长20万。主导query理解优化与个性化推荐策略迭代，建立搜索质量评估体系。
[收获] 深入理解推荐系统产品化链路，掌握数据实验方法论。

用户增长体系搭建
设计裂变活动框架，新增用户50万+。构建用户分层运营模型，实现精准触达。
[收获] 系统掌握增长方法论，理解用户生命周期管理。

━━━ 教育背景 ━━━

清华大学 | 计算机科学与技术 | 硕士 | 2022-2025
- 核心课程: 机器学习、自然语言处理、数据挖掘、人机交互
- GPA: 3.8/4.0 (前10%)
- 研究方向: 推荐系统与用户行为建模

━━━ 技能标签 ━━━

产品核心: 产品设计 · 需求分析 · 用户研究 · A/B测试 · 项目管理
数据工具: SQL · Python · Tableau · Google Analytics
设计工具: Axure · Figma · Sketch`

const MOCK_JD_KEYWORDS = ['产品设计', '数据分析', '用户增长', 'A/B测试', '搜索推荐', 'SQL', '项目管理', '用户研究']

const useResumeStore = create((set, get) => ({
  ...INITIAL_STATE,

  setFile(file) {
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(1)
    set({
      file,
      fileName: file.name,
      fileSize: `${sizeInMB}MB`,
      status: 'uploading',
    })
  },

  startParsing() {
    set({ status: 'parsing' })
  },

  setParsedData(data) {
    set({
      parsedData: data ?? MOCK_PARSED_DATA,
      status: 'parsed',
      suggestions: MOCK_SUGGESTIONS,
    })
  },

  startOptimizing() {
    set({ status: 'optimizing', optimizedText: '' })
  },

  appendOptimizedChar(char) {
    set((state) => ({
      optimizedText: state.optimizedText + char,
    }))
  },

  setOptimizedText(text) {
    set({ optimizedText: text, status: 'optimized' })
  },

  applySuggestion(id) {
    set((state) => ({
      suggestions: state.suggestions.map((s) =>
        s.id === id ? { ...s, applied: !s.applied } : s
      ),
    }))
  },

  setJdText(text) {
    set({ jdText: text })
  },

  analyzeJdMatch() {
    const { jdText } = get()
    if (!jdText.trim()) {
      set({ jdMatchScore: null, jdKeywords: [] })
      return
    }
    const matchedKeywords = MOCK_JD_KEYWORDS.filter((kw) =>
      jdText.includes(kw)
    )
    const baseScore = 65
    const bonusPerKeyword = 4
    const score = Math.min(98, baseScore + matchedKeywords.length * bonusPerKeyword)
    set({
      jdMatchScore: score,
      jdKeywords: matchedKeywords.length > 0 ? matchedKeywords : MOCK_JD_KEYWORDS.slice(0, 5),
    })
  },

  getMockOptimizedText() {
    return MOCK_OPTIMIZED_TEXT
  },

  reset() {
    set({ ...INITIAL_STATE })
  },
}))

export default useResumeStore
