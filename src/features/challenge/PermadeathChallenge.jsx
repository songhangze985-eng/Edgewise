import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import PageBar from '../../components/ui/PageBar'
import { listJobs } from '../../api/jobs'
import { listStories } from '../../api/stories'
import { uploadResume } from '../../api/resume'
import {
  createAssessmentSession,
  submitAssessmentAnswer,
  completeAssessmentSession,
} from '../../api/assessment'
import { requestLgdAgentTurn, scoreLgd } from '../../api/lgd'
import {
  createSession,
  scoreInterviewAnswer,
  postQuestionFollowup,
  postNegotiationTurn,
  postResumeScreener,
  postLgdFootprint,
  postHrPressureProbe,
  completeSession,
} from '../../api/interview'
import { getErrorMessage } from '../../api/client'
import useResumeStore from '../../stores/resumeStore'
import useSessionStore from '../../stores/sessionStore'
import useSurveyStore from '../../stores/surveyStore'
import useSettingsStore from '../../stores/settingsStore'
import useSpeechToText from '../../hooks/useSpeechToText'
import useTTS from '../../hooks/useTTS'
import { trackResearchEvent } from '../../research/track'
import {
  RESUME_SCREENER_FIXED_PROMPT,
  WRITTEN_SIMULATION_BANK,
  analyzeLgdFootprintForHr,
  buildHrCrossStageOpening,
  buildRecruitingFunnelStages,
  evaluateHrFourDimensions,
  evaluatePermadeathLgdCalibration,
  evaluateStageGateTransition,
  evaluateWrittenSimulation,
  formatBlindStageBadge,
  generateHrPressureFollowupProbe,
  runLocalResumeScreenerAgent,
} from './permadeathGateEngine'
import styles from './PermadeathChallenge.module.css'

const DIFFICULTY_TIERS = [
  {
    id: 'standard',
    label: '标准校招通关',
    defaultPassLine: 60,
    timeMult: 1.0,
    floorK: 20,
    badge: 'STANDARD',
  },
  {
    id: 'sp_sprint',
    label: '大厂 SP 高压冲刺',
    defaultPassLine: 70,
    timeMult: 0.85,
    floorK: 26,
    badge: 'SP SPRINT',
  },
  {
    id: 'hell',
    label: '地狱零容错终审',
    defaultPassLine: 78,
    timeMult: 0.7,
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

const INTERNSHIP_OPTIONS = [
  { id: '5days_6months', label: '每周出勤5天 · 连续实习6个月以上（含转正意向）' },
  { id: 'fulltime_immediate', label: '应届/社招全职 · 2周内快速到岗' },
  { id: '4days_4months', label: '每周出勤4天 · 连续实习4个月' },
  { id: 'short_parttime', label: '仅能短期1–2个月或每周≤2天' },
]

const INITIAL_LGD_CLASH = [
  {
    seat: 1,
    senderId: 'ice_breaker',
    name: '1号 · 小林（破冰者）',
    role: 'ai',
    text: '各位，今天我们的议题是「AI 面试产品如何在保证诊断深度的同时降低新用户首轮流失率」。建议按 2:6:2 节奏先对齐评判标准，再拆解入口承接、核心演练与复盘留存三阶段。',
  },
  {
    seat: 3,
    senderId: 'logician',
    name: '3号 · 李理（逻辑王）',
    role: 'ai',
    text: '如果不先确立量化评判标准（首题完成率 TTFA vs 7日留存 D7），后面讨论全会发散。我主张砍掉全部前置问卷直接推题。',
  },
  {
    seat: 5,
    senderId: 'interrupter',
    name: '5号 · 韩抢（抢话者）',
    role: 'ai',
    text: '我不同意 3 号一刀切！全砍前置引导会导致题目与岗位痛点错位。4 号候选人（你）怎么看？请直接给出你的评判标准、量化指标和折中落地动作！',
  },
]

const QUICK_TACTICAL_TEMPLATES = {
  resume: {
    education: '重点高校 · 计算机/信息管理相关专业 · GPA 前 15%',
    coreProject:
      '主导核心求职训练漏斗重构项目：针对新用户首轮流失率 42% 痛点，独立拆解埋点链路并落地直达路由与规则校准引擎，使启动耗时降低 67%、首轮完成率提升 28%、7日留存提升 16%。',
    skillsText: 'Python、React、FastAPI、SQL、A/B实验分析、漏斗转化优化',
  },
  lgd: '为了方便大家对齐进度，建议先确立三个评判标准：【首轮有效激活率、改造成本ROI、诊断准确度】。我桥接1号的三阶段框架与3号、5号的分歧：短期不砍核心岗位标签，而是将入口标签与首道体验题1:1直连（耗时压降50%）；中期用A/B实验验证7日留存提升≥15%。还剩5分钟我们先锁定该P0共识！',
  biz_1:
    '结论先行：在我刚释放简历的代表项目中，我亲自负责了漏斗瓶颈定位与规则引擎落地，使首轮完成率提升28%。按STAR展开：背景（S）是新用户面对多入口不知所措导致流失率42%；任务（T）是两周内将启动步数压缩至2步内；行动（A）是我拉通日志埋点，砍除冗余表单并设计岗位标签1:1自动配题与缓存预热；结果（R）是平均启动耗时从95秒降至31秒，次周留存提升16%。',
  biz_2_hit1:
    '面对Leader您提出的「资源砍半、排期压缩40%且流量突增3倍」极端场景，我的第一优先级是保核心闭环可用性。首先在网关层启用超时熔断与多级缓存兜底，将非核心大模型实时生成优雅降级为高信度规则评分引擎；其次通过异步消息队列削峰填谷，确保前端400ms内返回核心反馈，守住99.95%可用率红线。',
  biz_2_hit2:
    '针对您追问的降级后诊断精度损耗边界：我们预先用离线标注集建立了规则引擎与专家盲评的校准矩阵，确保降级态下「结论、结构、论据、扣题」四维评分相关系数 r≥0.88；一旦P99时延超过600ms持续30秒立即自动切换，流量回落后后台异步补全深度复盘推送。',
  hr_final:
    '正面回应您的跨关核验与四维底线：1）【第1关简历复盘】当时项目最遗憾的妥协是为了赶窗口未在首周上线自动回滚看板，后续我们补齐了基线归因与熔断监控；2）【第2关群面为什么妥协】刚才群面中我采取折中方案并非和稀泥，而是在倒计时紧迫下先用1:1直连锁定3号与5号的最小最大公约数（保住首轮激活北极星指标），避免全组超时零共识崩盘；3）【稳定性与实习出勤】我坚定深耕本赛道2–3年，保证每周5天全勤连续实习6个月以上争取转正，高度认同务实复盘文化，结合过往量化交付期望月薪在26k–28k左右。',
  hr_pressure_hit2:
    '面对您的极限施压追击：群面中的折中属于探索期求共识，但若入职后遇到大促前2小时核心指标回退的红线事故，我绝不妥协放行带病版本，宁可承担延期压力也会立即触发网关回滚守住SLA底线！关于薪资与试用期考核，我完全接受按量化闭环指标兑现回报，若锁定在合理SP锚点我可立即确认接受Offer！',
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

function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0)
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function PermadeathChallenge() {
  const navigate = useNavigate()
  const refreshSessions = useSessionStore((s) => s.refresh)
  const storedResumeParsed = useResumeStore((s) => s.parsedData)
  const storedResumeName = useResumeStore((s) => s.fileName)
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled)
  const ttsRate = useSettingsStore((s) => s.ttsRate)
  const ttsVoiceURI = useSettingsStore((s) => s.ttsVoiceURI)
  const { speak, stop: stopSpeech } = useTTS()

  // Pre-run configuration & external assets
  const [jobs, setJobs] = useState([])
  const [stories, setStories] = useState([])
  const [selectedPosition, setSelectedPosition] = useState(POSITION_PRESETS[0])
  const [selectedJobId, setSelectedJobId] = useState('')
  const [difficultyId, setDifficultyId] = useState('standard')
  const [includeWrittenTest, setIncludeWrittenTest] = useState(true)
  const [businessRounds, setBusinessRounds] = useState(2)
  const [passLine, setPassLine] = useState(60)
  const [hrPressureMode, setHrPressureMode] = useState(true)
  const [showStoryDrawer, setShowStoryDrawer] = useState(false)
  const [showScreenerArch, setShowScreenerArch] = useState(false)

  // Core funnel state ('ready' | 'playing' | 'gameover' | 'victory')
  const [gameState, setGameState] = useState('ready')
  const [currentStage, setCurrentStage] = useState(0)
  const [stageRecords, setStageRecords] = useState([])
  const [pausedFutureStages, setPausedFutureStages] = useState([])
  const [scoresRevealed, setScoresRevealed] = useState(false)
  const [streak, setStreak] = useState(() => readNumber(STREAK_KEY))
  const [bestStreak, setBestStreak] = useState(() => readNumber(BEST_KEY))
  const [timer, setTimer] = useState(0)
  const timerRef = useRef(null)
  const resumeInputRef = useRef(null)

  // Live backend session & stage interaction state
  const [sessionId, setSessionId] = useState(null)
  const [sessionData, setSessionData] = useState(null)
  const [assessmentSessionId, setAssessmentSessionId] = useState(null)
  const [starting, setStarting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploadingResume, setUploadingResume] = useState(false)
  const [errorBanner, setErrorBanner] = useState('')
  const [sealedNotice, setSealedNotice] = useState('')
  const [processLogs, setProcessLogs] = useState([])

  // Stage 0: Resume Release state
  const [resumeForm, setResumeForm] = useState({
    candidateName: '候选人',
    education: storedResumeParsed?.education || '',
    coreProject: storedResumeParsed?.projects?.[0]?.desc || '',
    skillsText: Array.isArray(storedResumeParsed?.skills)
      ? storedResumeParsed.skills.join('、')
      : '',
    uploadedFileName: storedResumeName || '',
  })
  const [releasedProfile, setReleasedProfile] = useState({
    extractedProject: '核心业务转化漏斗重构项目',
    extractedSkills: ['Python', 'React', 'SQL'],
  })
  // Cross-Stage AI Resume Screener Dossier & Stage-2 LGD Footprint
  const [candidateDossier, setCandidateDossier] = useState(null)
  const [lgdFootprint, setLgdFootprint] = useState(null)

  // Stage 1: LGD Multi-Agent Clash
  const [lgdMessages, setLgdMessages] = useState(INITIAL_LGD_CLASH)

  // Stage Written: Written Simulation Exam answers
  const [writtenAnswers, setWrittenAnswers] = useState({})
  const [writtenNote, setWrittenNote] = useState('')

  // Stage Biz_2: Leader Scenario + Followup Two-Hit Pressure Test
  const [pressurePhase, setPressurePhase] = useState('hit1')
  const [pendingFollowup, setPendingFollowup] = useState(null)
  const [hit1ScoreData, setHit1ScoreData] = useState(null)

  // Stage HR Final: Cross-Stage Inheritance + Pressure Probe Mode + 4-Dim Offer
  const [hrPhase, setHrPhase] = useState('round1') // 'round1' | 'pressure_probe'
  const [hrConsistencyScore, setHrConsistencyScore] = useState(null)
  const [internshipCommitment, setInternshipCommitment] = useState('5days_6months')
  const [expectedSalaryK, setExpectedSalaryK] = useState(26)
  const [negotiationState, setNegotiationState] = useState(null)
  const [negotiationChat, setNegotiationChat] = useState([])
  const [finalOfferDetails, setFinalOfferDetails] = useState(null)

  // Shared answer composer
  const [answerInput, setAnswerInput] = useState('')

  const difficultyTier = useMemo(
    () => DIFFICULTY_TIERS.find((d) => d.id === difficultyId) || DIFFICULTY_TIERS[0],
    [difficultyId],
  )

  const activeStages = useMemo(
    () =>
      buildRecruitingFunnelStages({
        includeWrittenTest,
        businessRounds,
      }),
    [includeWrittenTest, businessRounds],
  )

  const activeStageObj = activeStages[currentStage] || activeStages[0]

  const currentStageLimitSec = useMemo(() => {
    const base = activeStageObj?.limitSec || 180
    return Math.round(base * difficultyTier.timeMult)
  }, [activeStageObj, difficultyTier])

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
        if (Array.isArray(res) && res.length > 0) setJobs(res)
      })
      .catch(() => {})
    listStories()
      .then((res) => {
        if (Array.isArray(res)) setStories(res)
      })
      .catch(() => {})
  }, [])

  const appendProcessLog = useCallback((entry) => {
    setProcessLogs((prev) => [
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

  // Persist final outcome (`gameover` or `victory`) to backend analytics & research pipeline
  const finalizeBackendSession = useCallback(
    async (finalOutcome, records, offerMeta = null) => {
      if (!sessionId) return
      const numericScores = records.map((r) => r.score).filter((s) => typeof s === 'number')
      const avgScore = numericScores.length
        ? Math.round(numericScores.reduce((a, b) => a + b, 0) / numericScores.length)
        : 60
      const byKey = {}
      records.forEach((r) => {
        byKey[r.stageKey] = r.score
      })
      const dimensions = {
        logic: byKey.biz_1 ?? byKey.written ?? avgScore,
        expression: byKey.lgd ?? avgScore,
        collaboration: byKey.lgd ?? avgScore,
        knowledge: byKey.written ?? byKey.biz_1 ?? avgScore,
        adaptability: byKey.biz_2 ?? byKey.hr_final ?? avgScore,
        leadership: byKey.lgd ?? byKey.hr_final ?? avgScore,
      }
      try {
        await completeSession(
          sessionId,
          {
            score: avgScore,
            duration_minutes: Math.max(5, Math.round(timer / 60) + records.length * 4),
            dimensions,
            metadata: {
              mode: 'permadeath',
              source: 'permadeath_challenge',
              permadeath_outcome: finalOutcome,
              pass_line: passLine,
              include_written_test: includeWrittenTest,
              business_rounds: businessRounds,
              difficulty: difficultyTier.id,
              stage_scores: records.map((r) => r.score),
              stage_records: records,
              offer_details: offerMeta,
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
          pass_line: passLine,
        })
        useSurveyStore.getState().checkPendingSurvey('challenge')
      } catch {
        /* ignore completion errors */
      }
    },
    [
      sessionId,
      timer,
      passLine,
      includeWrittenTest,
      businessRounds,
      difficultyTier.id,
      refreshSessions,
    ],
  )

  // Launch the recruiting funnel
  const handleStart = useCallback(async () => {
    setStarting(true)
    setErrorBanner('')
    try {
      const roundsPayload = [
        {
          name: '业务一面 · 执行力与简历项目深挖',
          question_count: 1,
          type: 'standard',
          mix: { general: 0, resume_specific: 1, professional: 1 },
        },
        {
          name: '业务二面 · Leader场景模拟与压力测试',
          question_count: 1,
          type: 'standard',
          mix: { general: 1, resume_specific: 0, professional: 1 },
        },
        {
          name: 'HR 终面 · 稳定性/实习时长/薪资/文化综合核验',
          question_count: 0,
          type: 'negotiation',
        },
      ]

      const created = await createSession({
        type: 'interview',
        position: selectedPosition,
        difficulty: difficultyId === 'standard' ? 'medium' : 'hard',
        topic: `${selectedPosition} · 一血通关全真校招漏斗`,
        job_id: selectedJobId || undefined,
        rounds: roundsPayload,
        metadata: {
          mode: 'permadeath',
          source: 'permadeath_challenge',
          difficulty: difficultyTier.id,
          pass_line: passLine,
          include_written_test: includeWrittenTest,
          business_rounds: businessRounds,
          negotiation_prefs: {
            salary_floor_k: difficultyTier.floorK,
            salary_ceiling_k: difficultyTier.floorK + 8,
          },
          counts_toward_activation: true,
        },
      })

      if (includeWrittenTest) {
        createAssessmentSession()
          .then((asRow) => {
            if (asRow?.id) setAssessmentSessionId(asRow.id)
          })
          .catch(() => {})
      }

      const negBlock = created?.rounds?.[2]?.negotiation || {
        initial_offer: difficultyTier.floorK * 950,
        floor_k: difficultyTier.floorK,
        state: 'presented',
      }
      const initOfferK = Math.round((negBlock.initial_offer || 19000) / 1000)
      setExpectedSalaryK(difficultyTier.floorK + 5)
      setSessionId(created.id)
      setSessionData(created)
      setNegotiationState(negBlock)
      setNegotiationChat([
        {
          role: 'hr',
          name: 'HR 终面官 · 林总监',
          text: buildHrCrossStageOpening({
            position: selectedPosition,
            initOfferK,
            dossier: null,
            lgdFootprint: null,
            pressureMode: hrPressureMode,
          }),
        },
      ])

      setGameState('playing')
      setCurrentStage(0)
      setStageRecords([])
      setPausedFutureStages([])
      setScoresRevealed(false)
      setSealedNotice('')
      setFinalOfferDetails(null)
      setCandidateDossier(null)
      setLgdFootprint(null)
      setHrPhase('round1')
      setHrConsistencyScore(null)
      setLgdMessages(INITIAL_LGD_CLASH)
      setWrittenAnswers({})
      setWrittenNote('')
      setPressurePhase('hit1')
      setPendingFollowup(null)
      setHit1ScoreData(null)
      setAnswerInput('')
      setProcessLogs([
        {
          id: 'init-funnel',
          ts: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
          stage: '校招漏斗启动',
          statusText: `共 ${activeStages.length} 关 · 及格线 ${passLine} 分（全程暗分封存，未过线立即终止）`,
        },
      ])

      trackResearchEvent('challenge.started', {
        session_id: created.id,
        position: selectedPosition,
        difficulty: difficultyTier.id,
        pass_line: passLine,
        include_written_test: includeWrittenTest,
        business_rounds: businessRounds,
      })

      startTimer()
    } catch (err) {
      setErrorBanner(getErrorMessage(err, '创建一血通关校招会话失败，请稍后重试'))
    } finally {
      setStarting(false)
    }
  }, [
    selectedPosition,
    selectedJobId,
    difficultyId,
    difficultyTier,
    passLine,
    includeWrittenTest,
    businessRounds,
    activeStages.length,
    startTimer,
  ])

  // Unified Blind Gatekeeper: seals score if >= passLine, or immediately halts & unseals if < passLine
  const settleStageGate = useCallback(
    (rawScore, internalSummary, offerExtra = null) => {
      stopTimer()
      stopStt()

      // Small overtime penalty if stage exceeded time limit (-3 pts per 30s overtime)
      const overtimePenalty =
        timer > currentStageLimitSec
          ? Math.min(12, Math.ceil((timer - currentStageLimitSec) / 30) * 3)
          : 0
      const adjustedScore = Math.max(0, Math.round(Number(rawScore) || 0) - overtimePenalty)

      const gate = evaluateStageGateTransition({
        rawScore: adjustedScore,
        passLine,
        stageIndex: currentStage,
        stages: activeStages,
        priorStageRecords: stageRecords,
        stageSummary:
          overtimePenalty > 0
            ? `${internalSummary}（含超时扣分 -${overtimePenalty}）`
            : internalSummary,
      })

      setStageRecords(gate.stageRecords)
      setPausedFutureStages(gate.pausedFutureStages)
      setScoresRevealed(gate.scoresRevealed)
      setSealedNotice(gate.publicNotice)

      if (gate.outcome === 'failed_cutoff') {
        appendProcessLog({
          stage: activeStageObj.name,
          statusText: `⛔ 未达及格线（< ${passLine} 分），下一环节已暂停，直接退出公布成绩单`,
        })
        setGameState('gameover')
        setStreak(0)
        try {
          localStorage.setItem(STREAK_KEY, '0')
        } catch {
          /* ignore */
        }
        finalizeBackendSession('gameover', gate.stageRecords, null)
        return
      }

      if (gate.outcome === 'offer_issued') {
        const offerCard = offerExtra || {
          position: selectedPosition,
          monthlySalaryK: expectedSalaryK,
          internshipLabel:
            INTERNSHIP_OPTIONS.find((o) => o.id === internshipCommitment)?.label || '全勤到岗',
        }
        setFinalOfferDetails(offerCard)
        appendProcessLog({
          stage: activeStageObj.name,
          statusText: '🎉 全环节达标通过！隐藏评分全部解封，正式签发录用 Offer',
        })
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
        finalizeBackendSession('victory', gate.stageRecords, offerCard)
        return
      }

      // Passed stage: keep score strictly SEALED and advance to next stage!
      appendProcessLog({
        stage: activeStageObj.name,
        statusText: '🔒 考官打分已暗中封存 · 达到晋级标准，进入下一环节',
      })
      setCurrentStage(gate.nextStageIndex)
      setAnswerInput('')
      startTimer()
    },
    [
      stopTimer,
      stopStt,
      timer,
      currentStageLimitSec,
      passLine,
      currentStage,
      activeStages,
      stageRecords,
      activeStageObj,
      appendProcessLog,
      finalizeBackendSession,
      selectedPosition,
      expectedSalaryK,
      internshipCommitment,
      streak,
      bestStreak,
      startTimer,
    ],
  )

  // Stage 0 handler: Upload PDF/DOCX or Release Structured Resume
  const handleResumeFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingResume(true)
    setErrorBanner('')
    try {
      const parsedResp = await uploadResume(file)
      const pd = parsedResp?.parsed_data || {}
      setResumeForm((prev) => ({
        ...prev,
        candidateName: pd.name || prev.candidateName,
        education: pd.education || prev.education,
        coreProject: pd.projects?.[0]?.desc || parsedResp?.preview_text?.slice(0, 120) || prev.coreProject,
        skillsText: Array.isArray(pd.skills) && pd.skills.length ? pd.skills.join('、') : prev.skillsText,
        uploadedFileName: parsedResp?.file_name || file.name,
      }))
    } catch (err) {
      setErrorBanner(getErrorMessage(err, '简历文件解析失败，可直接填写下方核心项目经历释放'))
    } finally {
      setUploadingResume(false)
    }
  }

  const handleSubmitResumeRelease = useCallback(async () => {
    if (submitting) return
    setSubmitting(true)
    setErrorBanner('')
    try {
      const localDossier = runLocalResumeScreenerAgent({
        position: selectedPosition,
        education: resumeForm.education,
        coreProject: resumeForm.coreProject,
        skillsText: resumeForm.skillsText,
        parsedResume: storedResumeParsed,
      })
      let finalDossier = localDossier
      if (sessionId) {
        const remoteDossier = await postResumeScreener(sessionId, {
          position: selectedPosition,
          education: resumeForm.education,
          core_project: resumeForm.coreProject,
          skills_text: resumeForm.skillsText,
        }).catch(() => null)
        if (remoteDossier?.deep_dive_checklist?.length) {
          finalDossier = { ...localDossier, ...remoteDossier }
        }
      }

      setCandidateDossier(finalDossier)
      setReleasedProfile({
        extractedProject: finalDossier.project_title || localDossier.project_title,
        extractedSkills: finalDossier.core_project_tags || [],
      })

      appendProcessLog({
        stage: 'AI 简历筛选官（固定三步架构）',
        statusText: `🕵️ 提取核心标签 [${(finalDossier.core_project_tags || []).slice(0, 4).join(' · ')}]，已生成 ${
          finalDossier.deep_dive_checklist?.length || 3
        } 项专属深挖问题派发至一面/二面/终面`,
      })

      const initOfferK = Math.round(
        ((negotiationState?.initial_offer || difficultyTier.floorK * 950) / 1000),
      )
      setNegotiationChat([
        {
          role: 'hr',
          name: 'HR 终面官 · 林总监',
          text: buildHrCrossStageOpening({
            position: selectedPosition,
            initOfferK,
            dossier: finalDossier,
            lgdFootprint: null,
            pressureMode: hrPressureMode,
          }),
        },
      ])

      const scoreToSettle = finalDossier.resume_score ?? localDossier.resume_score
      settleStageGate(
        scoreToSettle,
        `AI简历筛选官提取 ${finalDossier.core_project_tags?.length || 0} 项标签并派发专属深挖清单`,
      )
    } finally {
      setSubmitting(false)
    }
  }, [
    submitting,
    selectedPosition,
    resumeForm,
    storedResumeParsed,
    sessionId,
    appendProcessLog,
    negotiationState,
    difficultyTier.floorK,
    hrPressureMode,
    settleStageGate,
  ])

  // Stage LGD handler: Multi-Agent Roundtable Clash + Real LGD Scoring
  const handleSubmitLgdStage = useCallback(async () => {
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

      const stageQuota = difficultyId === 'hell' ? 2 : 3
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
          advancement_quota: stageQuota,
          transcript: updatedTranscript.map((m) => ({
            role: m.role === 'user' ? 'user' : 'agent',
            speaker: m.name,
            text: m.text,
            isUser: m.role === 'user',
          })),
        }).catch(() => null),
      ])

      const aiContent = agentTurnRes?.content || agentTurnRes?.reply
      if (aiContent) {
        const aiReplyMsg = {
          seat: 7,
          senderId: 'mediator',
          name: '7号 · 王和（和事佬）',
          role: 'ai',
          text: aiContent,
        }
        setLgdMessages((prev) => [...prev, aiReplyMsg])
        if (ttsEnabled) {
          speak(aiContent, { rate: ttsRate, voiceURI: ttsVoiceURI })
        }
      }

      const rawScore =
        text.length < 15
          ? 45
          : (scoreRes?.overall_score ?? scoreRes?.score ?? 78)
      const calOutcome = evaluatePermadeathLgdCalibration(
        rawScore,
        scoreRes?.lgd_metrics,
        passLine,
        stageQuota,
      )

      // Capture Stage-2 LGD behavioral footprint + 3-Examiner Calibration dossier for HR Final cross-exam!
      const initOfferK = Math.round(
        ((negotiationState?.initial_offer || difficultyTier.floorK * 950) / 1000),
      )
      const localFootprint = analyzeLgdFootprintForHr(
        updatedTranscript,
        calOutcome.effectiveScore,
        scoreRes?.lgd_metrics,
      )
      let finalFootprint = localFootprint
      let hrOpeningText = buildHrCrossStageOpening({
        position: selectedPosition,
        initOfferK,
        dossier: candidateDossier,
        lgdFootprint: localFootprint,
        pressureMode: hrPressureMode,
      })
      if (sessionId) {
        const remoteFp = await postLgdFootprint(sessionId, {
          position: selectedPosition,
          init_offer_k: initOfferK,
          pressure_mode: hrPressureMode,
          lgd_score: calOutcome.effectiveScore,
          lgd_transcript: updatedTranscript,
        }).catch(() => null)
        if (remoteFp?.lgd_footprint) {
          finalFootprint = {
            ...remoteFp.lgd_footprint,
            examiner_calib_note: localFootprint.examiner_calib_note,
          }
          if (remoteFp.hr_opening) hrOpeningText = remoteFp.hr_opening
        }
      }
      setLgdFootprint(finalFootprint)
      setNegotiationChat([
        {
          role: 'hr',
          name: 'HR 终面官 · 林总监',
          text: hrOpeningText,
        },
      ])
      appendProcessLog({
        stage: '三考官闭门 Calibration',
        statusText: `📌 ${localFootprint.examiner_calib_note} · 表现画像「${finalFootprint.style_label}」已加密移交 HR 终面`,
      })

      settleStageGate(calOutcome.effectiveScore, calOutcome.summary)
    } catch (err) {
      setErrorBanner(getErrorMessage(err, '群面评定请求失败'))
    } finally {
      setSubmitting(false)
    }
  }, [
    answerInput,
    submitting,
    lgdMessages,
    difficultyId,
    passLine,
    ttsEnabled,
    speak,
    ttsRate,
    ttsVoiceURI,
    negotiationState,
    difficultyTier.floorK,
    selectedPosition,
    candidateDossier,
    hrPressureMode,
    sessionId,
    appendProcessLog,
    settleStageGate,
  ])

  // Stage Written handler: Timed Written Simulation Assessment
  const handleSubmitWrittenStage = useCallback(async () => {
    if (submitting) return
    setSubmitting(true)
    setErrorBanner('')
    try {
      if (assessmentSessionId) {
        const firstAns = Number(writtenAnswers.w_logic_1 ?? 0)
        await submitAssessmentAnswer(assessmentSessionId, {
          section: 'aptitude',
          item_id: 'A01',
          choice_index: firstAns,
          time_spent_sec: Math.max(5, timer),
        }).catch(() => {})
        await completeAssessmentSession(assessmentSessionId).catch(() => {})
      }
      const writtenEval = evaluateWrittenSimulation(writtenAnswers, writtenNote)
      settleStageGate(writtenEval.score, writtenEval.summary)
    } finally {
      setSubmitting(false)
    }
  }, [submitting, assessmentSessionId, writtenAnswers, writtenNote, timer, settleStageGate])

  // Stage Business Round 1 handler: Execution & Released Resume Project Deep-Dive
  const handleSubmitBizRound1 = useCallback(async () => {
    const text = answerInput.trim()
    if (!text || submitting || !sessionId) return
    setSubmitting(true)
    setErrorBanner('')
    try {
      const res = await scoreInterviewAnswer(sessionId, {
        round_index: 0,
        question_index: 0,
        answer_text: text,
      }).catch(() => null)

      const rawScore =
        text.length < 18
          ? 46
          : (res?.score ?? 76)
      const logic = res?.logic_score
      const breakdown = logic
        ? `项目深挖四维（结论 ${logic.conclusion ?? '—'} · 结构 ${logic.structure ?? '—'} · 论据 ${logic.evidence ?? '—'} · 扣题 ${logic.relevance ?? '—'}）`
        : '业务一面执行细节与 STAR 量化核验'

      settleStageGate(rawScore, breakdown)
    } catch (err) {
      setErrorBanner(getErrorMessage(err, '业务一面提交失败'))
    } finally {
      setSubmitting(false)
    }
  }, [answerInput, submitting, sessionId, settleStageGate])

  // Stage Business Round 2 handler: Leader Scenario Simulation + AI Follow-up Pressure Test
  const handleSubmitBizRound2 = useCallback(async () => {
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
        }).catch(() => null)
        const followRes = await postQuestionFollowup(sessionId, qid, {
          round_index: 1,
          question_index: 0,
        }).catch(() => null)

        const followupItem = followRes?.followup || {
          text: '【业务 Leader 追问压测】如果线上核心转化指标在发版后突然跌破阈值 30%，且你的首选降级方案在 5 分钟内未能止血，你的最终熔断边界与复盘问责机制是什么？',
          gap_type: 'evidence',
          layer: 1,
        }

        const firstHitScore = text.length < 18 ? 46 : (scoreRes?.score ?? 75)
        setHit1ScoreData({ score: firstHitScore })
        setPendingFollowup(followupItem)
        setPressurePhase('hit2')
        setAnswerInput('')

        if (ttsEnabled && followupItem.text) {
          speak(followupItem.text, { rate: ttsRate, voiceURI: ttsVoiceURI })
        }

        appendProcessLog({
          stage: '业务二面 · 首问完成',
          statusText: '⚡ 首问评议已暗中记录，触发业务 Leader 二连高压追问！',
        })
      } else {
        await postQuestionFollowup(sessionId, qid, {
          round_index: 1,
          question_index: 0,
          answer_text: text,
        }).catch(() => null)

        const baseScore = Number(hit1ScoreData?.score ?? 75)
        const bonus = text.length >= 35 ? +8 : text.length >= 18 ? +2 : -18
        const combinedScore = Math.max(38, Math.min(98, Math.round(baseScore + bonus)))

        setPressurePhase('hit1')
        setPendingFollowup(null)
        setHit1ScoreData(null)

        settleStageGate(combinedScore, '业务二面 Leader 场景模拟与连环压力追问综合评定')
      }
    } catch (err) {
      setErrorBanner(getErrorMessage(err, '业务二面压测提交失败'))
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
    appendProcessLog,
    hit1ScoreData,
    settleStageGate,
  ])

  // Stage HR Final handler: Inherits Stage-1 Resume + Stage-2 LGD Footprint + Optional Pressure Probe Mode
  const handleToggleHrPressureMode = useCallback(
    (nextMode) => {
      setHrPressureMode(nextMode)
      if (hrPhase === 'round1' && negotiationChat.length <= 1) {
        const initOfferK = Math.round(
          ((negotiationState?.initial_offer || difficultyTier.floorK * 950) / 1000),
        )
        setNegotiationChat([
          {
            role: 'hr',
            name: 'HR 终面官 · 林总监',
            text: buildHrCrossStageOpening({
              position: selectedPosition,
              initOfferK,
              dossier: candidateDossier,
              lgdFootprint,
              pressureMode: nextMode,
            }),
          },
        ])
      }
    },
    [
      hrPhase,
      negotiationChat.length,
      negotiationState,
      difficultyTier.floorK,
      selectedPosition,
      candidateDossier,
      lgdFootprint,
    ],
  )

  const handleSubmitHrFinal = useCallback(
    async (forceAcceptOffer = false) => {
      const fallbackTpl =
        hrPhase === 'pressure_probe'
          ? QUICK_TACTICAL_TEMPLATES.hr_pressure_hit2
          : QUICK_TACTICAL_TEMPLATES.hr_final
      const text = forceAcceptOffer ? answerInput.trim() || fallbackTpl : answerInput.trim()
      if (!text || submitting || !sessionId) return
      setSubmitting(true)
      setErrorBanner('')

      try {
        // When Pressure Follow-up Mode is ON and we are on Round 1 (unless force-accepting after probe), trigger Stress Probe!
        if (hrPressureMode && hrPhase === 'round1' && !forceAcceptOffer) {
          const [negRes, remoteProbe] = await Promise.all([
            postNegotiationTurn(sessionId, {
              round_index: 2,
              message: `${text}（期望月薪 ${expectedSalaryK}k）`,
            }).catch(() => null),
            postHrPressureProbe(sessionId, {
              candidate_answer: text,
              position: selectedPosition,
              expected_salary_k: expectedSalaryK,
              floor_k: difficultyTier.floorK,
              internship_commitment: internshipCommitment,
            }).catch(() => null),
          ])

          const probeData =
            remoteProbe?.probe_text
              ? remoteProbe
              : generateHrPressureFollowupProbe({
                  candidateAnswer: text,
                  dossier: candidateDossier,
                  lgdFootprint,
                  expectedSalaryK,
                  floorK: difficultyTier.floorK,
                })

          setNegotiationState(negRes?.negotiation || negotiationState)
          setHrConsistencyScore(probeData.consistency_score)
          setHrPhase('pressure_probe')
          setNegotiationChat((prev) => [
            ...prev,
            { role: 'user', name: '你（候选人）', text },
            {
              role: 'hr',
              name: 'HR 终面官 · 林总监（🔥 压力追问）',
              text: probeData.probe_text,
            },
          ])
          setAnswerInput('')

          if (ttsEnabled && probeData.probe_text) {
            speak(probeData.probe_text, { rate: ttsRate, voiceURI: ttsVoiceURI })
          }

          appendProcessLog({
            stage: 'HR 终面 · 压力追问触发',
            statusText: `🔥 终面官针对「${probeData.focus}」发起跨关自洽性高压追击！`,
          })
          return
        }

        const res = await postNegotiationTurn(sessionId, {
          round_index: 2,
          message: `${text}（期望月薪 ${expectedSalaryK}k，出勤承诺：${
            INTERNSHIP_OPTIONS.find((o) => o.id === internshipCommitment)?.label || ''
          }）`,
        }).catch(() => null)

        const hrReply =
          res?.hr_reply ||
          `收到你的终面回应！委员会已完成你第1关简历细节、第2关群面决策逻辑与终面四维底线的交叉核验，最终核定月薪总包为 ¥${expectedSalaryK}.0k/月。`

        const newTurns = [
          ...negotiationChat,
          { role: 'user', name: '你（候选人）', text },
          { role: 'hr', name: 'HR 终面官 · 林总监', text: hrReply },
        ]
        setNegotiationChat(newTurns)
        setNegotiationState(res?.negotiation || negotiationState)
        setAnswerInput('')

        if (ttsEnabled && hrReply) {
          speak(hrReply, { rate: ttsRate, voiceURI: ttsVoiceURI })
        }

        const allUserText = newTurns
          .filter((m) => m.role === 'user')
          .map((m) => m.text)
          .join(' ')
        const backendTurnScore = res?.evaluation?.turn_score ?? res?.round_score ?? null
        const hrEval = evaluateHrFourDimensions({
          answerText: allUserText,
          internshipCommitment,
          expectedSalaryK,
          floorK: difficultyTier.floorK,
          backendTurnScore,
          consistencyScore: hrConsistencyScore,
        })

        const currentOfferYuan =
          res?.offer ||
          res?.negotiation?.final_offer ||
          res?.negotiation?.initial_offer ||
          expectedSalaryK * 1000
        const confirmedOfferK = (currentOfferYuan / 1000).toFixed(1)

        const userTurnCount = newTurns.filter((m) => m.role === 'user').length
        if (res?.done || userTurnCount >= 2 || forceAcceptOffer || !hrPressureMode || hrEval.score < passLine) {
          settleStageGate(hrEval.score, hrEval.summary, {
            position: selectedPosition,
            monthlySalaryK: confirmedOfferK,
            internshipLabel:
              INTERNSHIP_OPTIONS.find((o) => o.id === internshipCommitment)?.label || '全勤到岗',
            hrDimensions: hrEval.dimensions,
          })
        } else {
          appendProcessLog({
            stage: 'HR 终面 · 首轮综合核验',
            statusText: `🔒 四维初审已暗中记录，HR 给出薪资反馈锚点 ¥${confirmedOfferK}k/月，请确认锁定或继续博弈`,
          })
        }
      } catch (err) {
        setErrorBanner(getErrorMessage(err, 'HR 终面请求失败'))
      } finally {
        setSubmitting(false)
      }
    },
    [
      hrPhase,
      answerInput,
      submitting,
      sessionId,
      hrPressureMode,
      expectedSalaryK,
      selectedPosition,
      difficultyTier.floorK,
      internshipCommitment,
      candidateDossier,
      lgdFootprint,
      negotiationState,
      ttsEnabled,
      speak,
      ttsRate,
      ttsVoiceURI,
      appendProcessLog,
      negotiationChat,
      hrConsistencyScore,
      passLine,
      settleStageGate,
    ],
  )

  const handleRetry = useCallback(() => {
    stopTimer()
    stopStt()
    stopSpeech()
    setGameState('ready')
    setCurrentStage(0)
    setStageRecords([])
    setPausedFutureStages([])
    setScoresRevealed(false)
    setTimer(0)
    setAnswerInput('')
    setErrorBanner('')
    setSealedNotice('')
    setFinalOfferDetails(null)
  }, [stopTimer, stopStt, stopSpeech])

  const failedStageRecord = useMemo(
    () => stageRecords.find((r) => !r.passed) || stageRecords[stageRecords.length - 1] || null,
    [stageRecords],
  )

  const bizRound1Question = useMemo(() => {
    const dispatched = candidateDossier?.deep_dive_checklist?.find(
      (c) => c.target_stage === 'biz_1',
    )
    if (dispatched?.question) return dispatched.question
    const proj = releasedProfile.extractedProject || '核心业务项目'
    const skillHint = releasedProfile.extractedSkills?.length
      ? `（核心项目标签：${releasedProfile.extractedSkills.slice(0, 4).join('、')}）`
      : ''
    return `【业务一面 · 简历项目与执行深挖】面试官已调阅你刚释放的简历「${proj}」${skillHint}：请用 STAR 结构具体拆解你在该项目中亲自落地的核心执行动作、遇到的最大业务/技术阻力以及可验证的量化结果。`
  }, [candidateDossier, releasedProfile])

  const bizRound2Question = useMemo(() => {
    const dispatched = candidateDossier?.deep_dive_checklist?.find(
      (c) => c.target_stage === 'biz_2',
    )
    if (dispatched?.question) return dispatched.question
    return (
      sessionData?.rounds?.[1]?.questions?.[0]?.title ||
      `【业务二面 · Leader 场景模拟压测】如果业务方要求你在预算与研发资源砍半、排期压缩 40% 的前提下强推「${selectedPosition}」核心改版，且上线首日出现异常波动，你如何做优先级取舍并守住 SLA 红线？`
    )
  }, [candidateDossier, sessionData, selectedPosition])

  const handleFillTemplate = () => {
    const key = activeStageObj?.key
    if (key === 'resume') {
      setResumeForm((prev) => ({
        ...prev,
        education: QUICK_TACTICAL_TEMPLATES.resume.education,
        coreProject: QUICK_TACTICAL_TEMPLATES.resume.coreProject,
        skillsText: QUICK_TACTICAL_TEMPLATES.resume.skillsText,
      }))
    } else if (key === 'lgd') {
      setAnswerInput(QUICK_TACTICAL_TEMPLATES.lgd)
    } else if (key === 'written') {
      setWrittenAnswers({ w_logic_1: 0, w_data_2: 1, w_scene_3: 1 })
      setWrittenNote('1题逆否命题连锁推导甲非Leader；2题增量2000×(63%-45%)×40%=144人；3题大促优先网关熔断降级保核心链路。')
    } else if (key === 'biz_1') {
      setAnswerInput(QUICK_TACTICAL_TEMPLATES.biz_1)
    } else if (key === 'biz_2') {
      setAnswerInput(
        pressurePhase === 'hit1'
          ? QUICK_TACTICAL_TEMPLATES.biz_2_hit1
          : QUICK_TACTICAL_TEMPLATES.biz_2_hit2,
      )
    } else if (key === 'hr_final') {
      setAnswerInput(
        hrPhase === 'pressure_probe'
          ? QUICK_TACTICAL_TEMPLATES.hr_pressure_hit2
          : QUICK_TACTICAL_TEMPLATES.hr_final,
      )
    }
  }

  return (
    <div className={styles.page}>
      <PageBar
        title="一血通关"
        actions={
          <div className={styles['header-badges']}>
            <span className={styles['stat-pill']}>
              🎯 及格线 {passLine} 分 · {scoresRevealed ? '成绩已拆封' : '全程暗分封存'}
            </span>
            <span className={styles['stat-pill']}>
              Offer连胜 {streak} · 最高 {bestStreak}
            </span>
          </div>
        }
      />

      {/* Dynamic Multi-Stage Recruiting Funnel Pipeline */}
      <div
        className={styles.pipeline}
        style={{
          gridTemplateColumns: `repeat(${activeStages.length}, minmax(0, 1fr))`,
        }}
      >
        {activeStages.map((stage, index) => {
          const rec = stageRecords.find((r) => r.stageIndex === index)
          let status = 'locked'
          if (rec) {
            status = rec.passed ? 'passed' : 'failed'
          } else if (gameState === 'gameover' && index > currentStage) {
            status = 'paused'
          } else if (gameState === 'playing' && index === currentStage) {
            status = 'current'
          }
          const badgeText = formatBlindStageBadge(status, rec, scoresRevealed)

          return (
            <div key={stage.key} className={styles['stage-wrapper']}>
              <div className={`${styles['stage-card']} ${styles[`stage-${status}`]}`}>
                <div className={styles['stage-top-row']}>
                  <span className={styles['stage-name']}>
                    0{index + 1} · {stage.shortName}
                  </span>
                  <span className={`${styles['stage-status']} ${styles[`status-${status}`]}`}>
                    {badgeText}
                  </span>
                </div>
                <div className={styles['stage-footer-row']}>
                  <span className={styles['stage-time']}>限时 {stage.time}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {errorBanner && <div className={styles['error-banner']}>{errorBanner}</div>}

      {/* Sealed Stage Transition Banner (Strictly Zero Score Leakage During Play) */}
      {sealedNotice && gameState === 'playing' && (
        <div className={`${styles['feedback-toast-bar']} ${styles['feedback-sealed']}`}>
          <span>{sealedNotice}</span>
          <span className={styles['feedback-hp-pill']}>暗分待终审公布</span>
        </div>
      )}

      {/* ==================== READY STATE: PRE-RUN RECRUITING FUNNEL CONFIG ==================== */}
      {gameState === 'ready' && (
        <div className={styles['loadout-panel']}>
          <div className={styles['loadout-grid']}>
            <div className={styles['loadout-field']}>
              <label className={styles['field-label']} htmlFor="challenge-pos-select">
                投递目标岗位
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
                关联岗位 JD
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
                <option value="">通用校招岗位库</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title || '未命名岗位'}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles['loadout-field']}>
              <label className={styles['field-label']} htmlFor="challenge-diff-select">
                招聘档位与默认及格线
              </label>
              <select
                id="challenge-diff-select"
                className={styles['loadout-select']}
                value={difficultyId}
                onChange={(e) => {
                  const nextId = e.target.value
                  setDifficultyId(nextId)
                  const tier = DIFFICULTY_TIERS.find((t) => t.id === nextId)
                  if (tier) setPassLine(tier.defaultPassLine)
                }}
              >
                {DIFFICULTY_TIERS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}（及格线 {d.defaultPassLine} 分）
                  </option>
                ))}
              </select>
            </div>

            <div className={styles['loadout-field']}>
              <label className={styles['field-label']} htmlFor="challenge-written-select">
                群面后衔接路线
              </label>
              <select
                id="challenge-written-select"
                className={styles['loadout-select']}
                value={includeWrittenTest ? 'with_written' : 'direct_interview'}
                onChange={(e) => setIncludeWrittenTest(e.target.value === 'with_written')}
              >
                <option value="with_written">进入笔试模拟场景 ➔ 再进单人面试</option>
                <option value="direct_interview">免笔试 ➔ 群面后直接进入单人面试</option>
              </select>
            </div>

            <div className={styles['loadout-field']}>
              <label className={styles['field-label']} htmlFor="challenge-biz-rounds">
                单人业务面试轮次
              </label>
              <select
                id="challenge-biz-rounds"
                className={styles['loadout-select']}
                value={businessRounds}
                onChange={(e) => setBusinessRounds(Number(e.target.value))}
              >
                <option value={2}>2 轮（业务一面项目深挖 + 业务二面 Leader 压测）</option>
                <option value={1}>1 轮（业务一面执行与项目深挖直通 HR）</option>
              </select>
            </div>

            <div className={styles['loadout-field']}>
              <label className={styles['field-label']} htmlFor="challenge-passline-select">
                硬性淘汰及格线设定
              </label>
              <select
                id="challenge-passline-select"
                className={styles['loadout-select']}
                value={passLine}
                onChange={(e) => setPassLine(Number(e.target.value))}
              >
                {[55, 60, 65, 70, 75, 78, 82].map((val) => (
                  <option key={val} value={val}>
                    {val} 分（低于 {val} 分暂停下一环节直接淘汰）
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles['loadout-footer']}>
            <div className={styles['asset-status-row']}>
              <span className={styles['asset-pill']}>🔒 全流程隐藏打分·终审统一公布</span>
              <span className={styles['asset-pill']}>🕵️ 固定架构 AI 简历筛选官</span>
              <button
                type="button"
                className={`${styles['tool-btn']} ${hrPressureMode ? styles['pressure-mode-on'] : ''}`}
                onClick={() => setHrPressureMode((v) => !v)}
              >
                {hrPressureMode ? '🔥 终面压力追问：开启' : '终面压力追问：关闭'}
              </button>
              <span className={styles['asset-pill']}>STAR 素材 {stories.length}</span>
            </div>
            <button
              type="button"
              className={`${styles['action-btn']} ${styles['action-btn-primary']}`}
              onClick={handleStart}
              disabled={starting}
            >
              {starting ? '建立考场中…' : '投递入场 · 开始一血通关'}
            </button>
          </div>
        </div>
      )}

      {/* ==================== PLAYING STATE: MULTI-STAGE RECRUITING WORKBENCH ==================== */}
      {gameState === 'playing' && activeStageObj && (
        <div className={styles['combat-workbench']}>
          <div className={styles['detail-header']}>
            <h2 className={styles['detail-title']}>
              0{currentStage + 1} · {activeStageObj.name}
            </h2>
            <div className={styles['header-right-tools']}>
              <button
                type="button"
                className={styles['tool-btn']}
                onClick={handleFillTemplate}
              >
                填入高分范例
              </button>
              {activeStageObj.key !== 'resume' && activeStageObj.key !== 'written' && (
                <button
                  type="button"
                  className={styles['tool-btn']}
                  onClick={() => setShowStoryDrawer((v) => !v)}
                >
                  {showStoryDrawer ? '收起 STAR' : `STAR 素材 (${stories.length})`}
                </button>
              )}
              <div
                className={`${styles['detail-timer']} ${
                  timer > currentStageLimitSec ? styles['timer-overtime'] : ''
                }`}
              >
                <span>{formatTime(timer)}</span>
                <span className={styles['timer-limit']}> / {formatTime(currentStageLimitSec)}</span>
              </div>
            </div>
          </div>

          {showStoryDrawer && (
            <div className={styles['story-drawer']}>
              {stories.length === 0 ? (
                <p className={styles['story-empty']}>暂无保存的 STAR 案例</p>
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
                                `${prev ? `${prev}\n` : ''}【案例：${st.title}】S：${st.S || ''}；T：${st.T || ''}；A：${st.A || ''}；R：${st.R || ''}。`,
                            )
                          }
                        >
                          引用
                        </button>
                      </div>
                      <p className={styles['story-card-excerpt']}>{st.R || st.A || '—'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Cross-Stage AI Resume Screener Dossier Strip (Visible in Downstream Stages) */}
          {candidateDossier && activeStageObj.key !== 'resume' && (
            <div className={styles['dossier-relay-strip']}>
              <div className={styles['dossier-relay-top']}>
                <span className={styles['dossier-relay-badge']}>
                  🕵️ AI 简历筛选官档案已传递（{candidateDossier.deep_dive_checklist?.length || 3} 项深挖题已派发）
                </span>
                <div className={styles['dossier-tag-list']}>
                  {(candidateDossier.core_project_tags || []).map((tag) => (
                    <span key={tag} className={styles['dossier-tag-chip']}>
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
              {lgdFootprint && activeStageObj.key === 'hr_final' && (
                <div className={styles['dossier-lgd-inherit']}>
                  🔗 已继承第2关群面表现画像：<strong>{lgdFootprint.style_label}</strong>（终面官将交叉追问群面妥协/控场动机与第1关简历盲区）
                </div>
              )}
            </div>
          )}

          {/* ---- STAGE: RESUME RELEASE (`释放简历`) ---- */}
          {activeStageObj.key === 'resume' && (
            <div className={styles['stage-arena']}>
              <div className={styles['arena-prompt-box']}>
                <div className={styles['screener-arch-header']}>
                  <p className={styles['prompt-main']}>
                    第一关【释放简历】：释放后将首先由 <strong>AI 简历筛选官（固定三步执行架构）</strong> 提取核心项目标签、审计口径盲区，并生成专属「深挖问题清单」加密传递至后续业务面与 HR 终面。
                  </p>
                  <button
                    type="button"
                    className={styles['tool-btn']}
                    onClick={() => setShowScreenerArch((v) => !v)}
                  >
                    {showScreenerArch ? '收起筛选官架构' : '查看筛选官固定 Prompt'}
                  </button>
                </div>
                {showScreenerArch && (
                  <pre className={styles['screener-prompt-preview']}>
                    {RESUME_SCREENER_FIXED_PROMPT}
                  </pre>
                )}
              </div>

              <div className={styles['resume-release-bar']}>
                <input
                  ref={resumeInputRef}
                  type="file"
                  accept=".pdf,.docx"
                  style={{ display: 'none' }}
                  onChange={handleResumeFileUpload}
                />
                <button
                  type="button"
                  className={styles['tool-btn']}
                  onClick={() => resumeInputRef.current?.click()}
                  disabled={uploadingResume}
                >
                  {uploadingResume ? '解析简历中…' : '📄 上传 PDF / DOCX 简历解析'}
                </button>
                {resumeForm.uploadedFileName && (
                  <span className={styles['asset-pill']}>
                    已挂载：{resumeForm.uploadedFileName}
                  </span>
                )}
              </div>

              <div className={styles['resume-form-grid']}>
                <div className={styles['loadout-field']}>
                  <label className={styles['field-label']}>教育与方向背景</label>
                  <input
                    type="text"
                    className={styles['loadout-input']}
                    placeholder="如：计算机硕士 · 专注后端高并发与AI工程"
                    value={resumeForm.education}
                    onChange={(e) =>
                      setResumeForm((prev) => ({ ...prev, education: e.target.value }))
                    }
                  />
                </div>
                <div className={styles['loadout-field']}>
                  <label className={styles['field-label']}>核心技能标签（顿号或逗号分隔）</label>
                  <input
                    type="text"
                    className={styles['loadout-input']}
                    placeholder="如：Python、React、SQL、A/B实验、系统架构"
                    value={resumeForm.skillsText}
                    onChange={(e) =>
                      setResumeForm((prev) => ({ ...prev, skillsText: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className={styles['loadout-field']} style={{ marginTop: '10px' }}>
                <label className={styles['field-label']}>
                  核心代表项目经历（含个人执行动作与量化产出指标）
                </label>
                <textarea
                  className={styles['composer-textarea']}
                  rows={3}
                  placeholder="请简述最具代表性的项目背景、个人核心动作与量化成果（如提升转化率28%、降低延迟50%）…"
                  value={resumeForm.coreProject}
                  onChange={(e) =>
                    setResumeForm((prev) => ({ ...prev, coreProject: e.target.value }))
                  }
                />
              </div>

              <div className={styles['detail-actions']}>
                <button
                  type="button"
                  className={`${styles['action-btn']} ${styles['action-btn-primary']}`}
                  onClick={handleSubmitResumeRelease}
                  disabled={submitting}
                >
                  {submitting ? '网申核验中…' : '释放简历 · 进入 LGD 群面'}
                </button>
              </div>
            </div>
          )}

          {/* ---- STAGE: WRITTEN SIMULATION (`笔试模拟场景`) ---- */}
          {activeStageObj.key === 'written' && (
            <div className={styles['stage-arena']}>
              <div className={styles['arena-prompt-box']}>
                <p className={styles['prompt-main']}>
                  【笔试模拟场景】完成以下 3 道限时行测逻辑、商业测算与岗位取舍真题，达及格线后进入单人业务面试：
                </p>
              </div>
              <div className={styles['written-question-list']}>
                {WRITTEN_SIMULATION_BANK.map((q, qIdx) => (
                  <div key={q.id} className={styles['written-q-card']}>
                    <div className={styles['written-q-stem']}>
                      <strong>
                        Q{qIdx + 1} [{q.category}]：
                      </strong>
                      {q.stem}
                    </div>
                    <div className={styles['written-opt-grid']}>
                      {q.options.map((opt, optIdx) => {
                        const active = writtenAnswers[q.id] === optIdx
                        return (
                          <button
                            key={opt}
                            type="button"
                            className={`${styles['written-opt-btn']} ${
                              active ? styles['written-opt-active'] : ''
                            }`}
                            onClick={() =>
                              setWrittenAnswers((prev) => ({ ...prev, [q.id]: optIdx }))
                            }
                          >
                            {opt}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <textarea
                className={styles['composer-textarea']}
                rows={2}
                placeholder="（选填）补充核心推演公式或工程取舍理由，可获笔试附加分…"
                value={writtenNote}
                onChange={(e) => setWrittenNote(e.target.value)}
              />
              <div className={styles['detail-actions']}>
                <button
                  type="button"
                  className={`${styles['action-btn']} ${styles['action-btn-primary']}`}
                  onClick={handleSubmitWrittenStage}
                  disabled={submitting}
                >
                  {submitting ? '笔试判分中…' : '交卷 · 进入单人业务面试'}
                </button>
              </div>
            </div>
          )}

          {/* ---- STAGE: LGD MULTI-AGENT CLASH ---- */}
          {activeStageObj.key === 'lgd' && (
            <div className={styles['stage-arena']}>
              <div className={styles['arena-prompt-box']}>
                <p className={styles['prompt-main']}>
                  LGD 群面议题：AI 面试产品如何在保证诊断深度的同时降低新用户首轮流失率？（先立标准、整合分歧并推进收敛）
                </p>
                <div className={styles['asset-status-row']} style={{ marginTop: '8px' }}>
                  <span className={styles['asset-pill']}>主面试官·顾总监（逻辑架构 30%）</span>
                  <span className={styles['asset-pill']}>副面试官A·苏经理（盯梢 1~4号 · 红线否决）</span>
                  <span className={styles['asset-pill']}>副面试官B·周PM（时间戳贡献账本 20%）</span>
                  <span className={styles['asset-pill']}>
                    闭门 Calibration：8 进 {difficultyId === 'hell' ? 2 : 3}
                  </span>
                </div>
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

          {/* ---- STAGE: BUSINESS ROUND 1 (`业务一面：执行/项目深挖`) ---- */}
          {activeStageObj.key === 'biz_1' && (
            <div className={styles['stage-arena']}>
              <div className={styles['arena-prompt-box']}>
                <p className={styles['prompt-main']}>{bizRound1Question}</p>
              </div>
            </div>
          )}

          {/* ---- STAGE: BUSINESS ROUND 2 (`业务二面：Leader面/场景模拟/压力测试`) ---- */}
          {activeStageObj.key === 'biz_2' && (
            <div className={styles['stage-arena']}>
              <div className={styles['combo-indicator']}>
                <span
                  className={`${styles['combo-step']} ${
                    pressurePhase === 'hit1' ? styles['combo-active'] : styles['combo-done']
                  }`}
                >
                  1. Leader 场景模拟首问
                </span>
                <span className={styles['combo-arrow']}>➔</span>
                <span
                  className={`${styles['combo-step']} ${
                    pressurePhase === 'hit2' ? styles['combo-active'] : ''
                  }`}
                >
                  2. 极限漏洞压力追问
                </span>
              </div>
              <div className={styles['arena-prompt-box']}>
                <p className={styles['prompt-main']}>
                  {pressurePhase === 'hit1' ? bizRound2Question : pendingFollowup?.text}
                </p>
              </div>
            </div>
          )}

          {/* ---- STAGE: HR FINAL (`HR / 终面：跨关继承 + 压力追问模式 + 四维核验`) ---- */}
          {activeStageObj.key === 'hr_final' && (
            <div className={styles['stage-arena']}>
              <div className={styles['hr-mode-banner']}>
                <div className={styles['combo-indicator']} style={{ marginBottom: 0 }}>
                  <span
                    className={`${styles['combo-step']} ${
                      hrPhase === 'round1' ? styles['combo-active'] : styles['combo-done']
                    }`}
                  >
                    1. 跨关核验（简历疑点 + 群面表现 + 四维）
                  </span>
                  {hrPressureMode && (
                    <>
                      <span className={styles['combo-arrow']}>➔</span>
                      <span
                        className={`${styles['combo-step']} ${
                          hrPhase === 'pressure_probe' ? styles['combo-active'] : ''
                        }`}
                      >
                        2. 🔥 终面高压自洽追击
                      </span>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  className={`${styles['tool-btn']} ${hrPressureMode ? styles['pressure-mode-on'] : ''}`}
                  onClick={() => handleToggleHrPressureMode(!hrPressureMode)}
                >
                  {hrPressureMode ? '🔥 压力追问模式：开启中' : '开启压力追问模式'}
                </button>
              </div>

              <div className={styles['hr-four-dim-bar']}>
                <div className={styles['loadout-field']}>
                  <label className={styles['field-label']}>实习时长 / 最快到岗承诺</label>
                  <select
                    className={styles['loadout-select']}
                    value={internshipCommitment}
                    onChange={(e) => setInternshipCommitment(e.target.value)}
                  >
                    {INTERNSHIP_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles['loadout-field']}>
                  <label className={styles['field-label']}>期望月薪 Base（k/月）</label>
                  <input
                    type="number"
                    min={12}
                    max={60}
                    className={styles['loadout-input']}
                    value={expectedSalaryK}
                    onChange={(e) => setExpectedSalaryK(Number(e.target.value) || 20)}
                  />
                </div>
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
          )}

          {/* ---- SHARED SPOKEN / TEXT ANSWER COMPOSER (for LGD, Biz 1, Biz 2, HR Final) ---- */}
          {activeStageObj.key !== 'resume' && activeStageObj.key !== 'written' && (
            <div className={styles['composer-box']}>
              <div className={styles['composer-toolbar']}>
                <span className={styles['composer-hint']}>{answerInput.trim().length} 字</span>
                <div className={styles['composer-tools']}>
                  {sttSupported && (
                    <button
                      type="button"
                      className={`${styles['tool-btn']} ${
                        sttListening ? styles['tool-btn-recording'] : ''
                      }`}
                      onClick={toggleStt}
                    >
                      {sttListening ? '停止语音' : '语音作答'}
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
                  activeStageObj.key === 'hr_final'
                    ? '请综合阐述：1）长期稳定性规划 2）实习时长/到岗保障 3）团队文化契合点 4）期望薪资依据…'
                    : '输入你的结构化回答…'
                }
              />

              <div className={styles['detail-actions']}>
                {activeStageObj.key === 'lgd' && (
                  <button
                    type="button"
                    className={`${styles['action-btn']} ${styles['action-btn-primary']}`}
                    onClick={handleSubmitLgdStage}
                    disabled={submitting || !answerInput.trim()}
                  >
                    {submitting ? '群面暗评中…' : '提交群面发言'}
                  </button>
                )}
                {activeStageObj.key === 'biz_1' && (
                  <button
                    type="button"
                    className={`${styles['action-btn']} ${styles['action-btn-primary']}`}
                    onClick={handleSubmitBizRound1}
                    disabled={submitting || !answerInput.trim()}
                  >
                    {submitting ? '一面评估中…' : '提交业务一面回答'}
                  </button>
                )}
                {activeStageObj.key === 'biz_2' && (
                  <button
                    type="button"
                    className={`${styles['action-btn']} ${styles['action-btn-primary']}`}
                    onClick={handleSubmitBizRound2}
                    disabled={submitting || !answerInput.trim()}
                  >
                    {submitting
                      ? '二面评估中…'
                      : pressurePhase === 'hit1'
                        ? '提交场景方案（迎接追问）'
                        : '提交压力追问防守'}
                  </button>
                )}
                {activeStageObj.key === 'hr_final' && (
                  <>
                    <button
                      type="button"
                      className={`${styles['action-btn']} ${styles['action-btn-primary']}`}
                      onClick={() => handleSubmitHrFinal(false)}
                      disabled={submitting || !answerInput.trim()}
                    >
                      {submitting
                        ? '终审评议中…'
                        : hrPressureMode && hrPhase === 'round1'
                          ? '提交跨关回应（迎接高压追问）'
                          : '提交终面回应'}
                    </button>
                    {(!hrPressureMode || hrPhase === 'pressure_probe') && (
                      <button
                        type="button"
                        className={`${styles['action-btn']} ${styles['action-btn-accent']}`}
                        onClick={() => handleSubmitHrFinal(true)}
                        disabled={submitting}
                      >
                        确认底线 · 申请签发 Offer
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== SEALED RECRUITING PROCESS LOG ==================== */}
      {processLogs.length > 0 && (
        <div className={styles['combat-log-panel']}>
          <div className={styles['combat-log-header']}>
            <span>招聘流转档案（终审前隐藏分数）</span>
            <span>{sessionId ? `#${sessionId.slice(0, 8)}` : ''}</span>
          </div>
          <div className={styles['combat-log-list']}>
            {processLogs.map((log) => (
              <div key={log.id} className={styles['combat-log-item']}>
                <div className={styles['combat-log-left']}>
                  <span className={styles['combat-log-ts']}>{log.ts}</span>
                  <span className={styles['combat-log-stage']}>{log.stage}</span>
                  <span className={styles['combat-log-title']}>{log.statusText}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================== ELIMINATION / CUTOFF EXIT OVERLAY (`未达及格线暂停退出 · 公布未通过`) ==================== */}
      {gameState === 'gameover' && (
        <div className={`${styles.overlay} ${styles['overlay-gameover']}`}>
          <div className={styles['overlay-card']}>
            <div className={styles['overlay-title']}>未通过 · 后续面试环节已终止</div>
            <div className={styles['overlay-sub']}>
              {sealedNotice || `因环节评分未达及格线（${passLine} 分），下一环节已自动暂停退出，现公布已封存成绩单：`}
            </div>

            {stageRecords.length > 0 && (
              <div className={styles['overlay-scores']}>
                {stageRecords.map((rec) => (
                  <div key={rec.stageKey} className={styles['overlay-score-item']}>
                    <span className={styles['overlay-score-stage']}>{rec.stageName}</span>
                    <span
                      className={
                        rec.passed ? styles['overlay-score-val'] : styles['overlay-score-fail']
                      }
                    >
                      {rec.score} 分 {rec.passed ? `≥ ${rec.passLine}` : `< ${rec.passLine} (淘汰)`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {pausedFutureStages.length > 0 && (
              <div className={styles['paused-stages-note']}>
                已暂停未进入环节：{pausedFutureStages.join(' ➔ ')}
              </div>
            )}

            <div className={styles['overlay-actions']}>
              <button
                type="button"
                className={`${styles['action-btn']} ${styles['action-btn-danger']}`}
                onClick={handleRetry}
              >
                重新投递闯关
              </button>
              {sessionId && (
                <button
                  type="button"
                  className={`${styles['action-btn']} ${styles['action-btn-primary']}`}
                  onClick={() => navigate(`/analytics/report/${sessionId}`)}
                >
                  查看复盘报告
                </button>
              )}
              {failedStageRecord && (
                <button
                  type="button"
                  className={`${styles['action-btn']} ${styles['action-btn-accent']}`}
                  onClick={() => navigate(failedStageRecord.fallbackRoute)}
                >
                  专项补强（{failedStageRecord.stageName}）
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== OFFER ISSUED OVERLAY (`正式签发 Offer + 拆封全流程成绩单`) ==================== */}
      {gameState === 'victory' && (
        <div className={`${styles.overlay} ${styles['overlay-victory']}`}>
          <div className={styles['overlay-card']}>
            <div className={styles['overlay-title']}>🎉 正式签发录用通知书（OFFER）</div>
            <div className={styles['overlay-sub']}>
              全链路 {stageRecords.length} 大环节均超越及格线（{passLine} 分） · Offer 连胜 {streak}
            </div>

            {finalOfferDetails && (
              <div className={styles['offer-letter-box']}>
                <div>
                  <strong>录用岗位：</strong>
                  {finalOfferDetails.position}
                </div>
                <div>
                  <strong>核定月薪总包：</strong>¥{finalOfferDetails.monthlySalaryK}k / 月
                </div>
                <div>
                  <strong>出勤/到岗约定：</strong>
                  {finalOfferDetails.internshipLabel}
                </div>
              </div>
            )}

            <div className={styles['overlay-scores']}>
              {stageRecords.map((rec) => (
                <div key={rec.stageKey} className={styles['overlay-score-item']}>
                  <span className={styles['overlay-score-stage']}>{rec.stageName}</span>
                  <span className={styles['overlay-score-val']}>
                    {rec.score} 分 ✓
                  </span>
                </div>
              ))}
            </div>

            <div className={styles['overlay-actions']}>
              <button
                type="button"
                className={`${styles['action-btn']} ${styles['action-btn-accent']}`}
                onClick={handleRetry}
              >
                开启下一轮连胜
              </button>
              {sessionId && (
                <button
                  type="button"
                  className={`${styles['action-btn']} ${styles['action-btn-primary']}`}
                  onClick={() => navigate(`/analytics/report/${sessionId}`)}
                >
                  查看完整成绩档案
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
