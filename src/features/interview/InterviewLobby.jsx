import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { createSession } from '../../api/interview'
import { createJob, listJobs } from '../../api/jobs'
import { fetchExperimentContext } from '../../api/research'
import { fetchTasksManifest } from '../../api/tasks'
import useAuthStore from '../../stores/authStore'
import useResearchStore from '../../stores/researchStore'
import useResumeStore from '../../stores/resumeStore'
import { getErrorMessage } from '../../api/client'
import { trackResearchEvent } from '../../research/track'
import {
  consumeTaskStepsMetrics,
  taskEntryPrefillEnabled,
} from '../tasks/taskUtils'
import {
  buildDefaultRounds,
  DEFAULT_ROUND_NAMES,
  isCaseOnlyRounds,
  ROUND_TYPE_OPTIONS,
} from '../../utils/interviewRounds'
import {
  INTERVIEW_LANG_EN,
  INTERVIEW_LANG_ZH,
  normalizeInterviewLang,
} from '../../utils/interviewLang'
import PageBar from '../../components/ui/PageBar'
import styles from './InterviewLobby.module.css'

const interviewTypes = [
  {
    id: 'structured',
    icon: '⬡',
    name: '结构化面试',
    desc: '公考 / 国企银行专区 · 模拟考官打分',
    color: 'purple',
    structuredZone: true,
  },
  {
    id: 'semi',
    icon: '◈',
    name: '半结构化面试',
    desc: '灵活追问 · 深度挖掘 · STAR 法则',
    color: 'blue',
  },
  {
    id: 'behavioral',
    icon: '◇',
    name: '行为面试',
    desc: '情景模拟 · 压力测试 · 应变能力',
    color: 'red',
  },
  {
    id: 'one_way',
    icon: '▶',
    name: 'AI 初面模拟（单向）',
    desc: '准备倒计时 · 限时作答 · 限重录',
    color: 'purple',
  },
]

const difficultyLevels = [
  { id: 'easy', label: '温和', desc: '引导式提问，适合新手', color: 'success' },
  { id: 'medium', label: '中立', desc: '标准面试节奏与压力', color: 'warning' },
  { id: 'hard', label: '高压', desc: '追问打断，极限施压', color: 'danger' },
]

const positions = [
  '产品经理', '软件工程师', '数据分析师', '市场营销',
  '战略咨询', '投资银行', '人力资源', '运营管理',
]

const DIFFICULTY_MAP = {
  简单: 'easy',
  中等: 'medium',
  困难: 'hard',
}

const STEPS = ['面试类型', '难度与岗位', '面试轮数', '确认开始']

const INTERVIEW_LANG_OPTIONS = [
  { id: INTERVIEW_LANG_ZH, label: '中文', desc: '题目与语音默认识别为中文' },
  { id: INTERVIEW_LANG_EN, label: 'English', desc: '英文通用题 · 报告界面仍为中文' },
]

export default function InterviewLobby() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const researchPractice = searchParams.get('research_practice') === '1'
  const continuityPrompt = searchParams.get('continuity') === '1'
  const prefillResume = searchParams.get('resume') || ''
  const prefillType = searchParams.get('type') || ''
  const prefillDifficulty = searchParams.get('difficulty') || ''
  const prefillPosition = searchParams.get('position') || ''
  const prefillFocus = searchParams.get('focus') || ''
  const prefillJob = searchParams.get('job') || ''
  const prefillFollowup = searchParams.get('followup')
  const taskIdFromUrl = searchParams.get('task_id') || ''

  const experimentAssignment = useAuthStore((s) => s.user?.experimentAssignment)
  const captureFromUrl = useResearchStore((s) => s.captureFromUrl)

  const resumeId = useResumeStore((s) => s.resumeId)
  const [step, setStep] = useState(1)
  const [selectedType, setSelectedType] = useState('structured')
  const [difficulty, setDifficulty] = useState('medium')
  const [position, setPosition] = useState('')
  const [customPosition, setCustomPosition] = useState('')
  const [linkResume, setLinkResume] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [experimentCtx, setExperimentCtx] = useState(null)
  const [continuityNote, setContinuityNote] = useState('')
  const [taskEntryNote, setTaskEntryNote] = useState('')
  const [roundCount, setRoundCount] = useState(3)
  const [rounds, setRounds] = useState(() => buildDefaultRounds(3))
  const [resumeTip, setResumeTip] = useState('')
  const [followupIntensity, setFollowupIntensity] = useState(null)
  const [jdSkipped, setJdSkipped] = useState(false)
  const [savedJobs, setSavedJobs] = useState([])
  const [selectedJobId, setSelectedJobId] = useState(prefillJob || '')
  const [jdPaste, setJdPaste] = useState('')
  const [jdKeywords, setJdKeywords] = useState([])
  const [jdSaving, setJdSaving] = useState(false)
  const [jdNotice, setJdNotice] = useState('')
  const [kwDraft, setKwDraft] = useState('')
  const [oneWayPrepSec, setOneWayPrepSec] = useState(30)
  const [oneWayAnswerSec, setOneWayAnswerSec] = useState(120)
  const [oneWayRetakes, setOneWayRetakes] = useState('1')
  const [oneWayQuestionCount, setOneWayQuestionCount] = useState(3)
  const [negotiationRole, setNegotiationRole] = useState('')
  const [negotiationCity, setNegotiationCity] = useState('')
  const [negotiationFloorK, setNegotiationFloorK] = useState('15')
  const [negotiationCeilingK, setNegotiationCeilingK] = useState('22')
  const [interviewLang, setInterviewLang] = useState(INTERVIEW_LANG_ZH)

  const resolvedFollowupIntensity = useMemo(() => {
    if (followupIntensity != null) return followupIntensity
    return difficulty === 'hard' ? '3' : '1'
  }, [difficulty, followupIntensity])

  const experimentLocked = Boolean(
    experimentCtx?.experiment_arm && !experimentCtx?.experiment_practice_completed
  )

  const hasNegotiationRound = useMemo(
    () => rounds.some((r) => r.type === 'negotiation'),
    [rounds],
  )

  const experimentPracticeLocked = Boolean(
    researchPractice && experimentCtx && !experimentCtx.experiment_practice_completed
  )

  useEffect(() => {
    captureFromUrl()
  }, [captureFromUrl])

  useEffect(() => {
    const armCode =
      experimentCtx?.experiment_arm || experimentAssignment?.arm || null
    const allowPrefill = taskEntryPrefillEnabled({ arm: armCode })

    if (taskIdFromUrl && !allowPrefill) {
      setTaskEntryNote(
        '研究安排：请自行确认下方面试类型、难度与追问设置（与任务页说明一致后再开始）。',
      )
    } else {
      setTaskEntryNote('')
    }

    if (!allowPrefill) return

    const applyPractice = (practice) => {
      if (!practice) return
      if (practice.type && interviewTypes.some((t) => t.id === practice.type)) {
        setSelectedType(practice.type)
      }
      if (practice.difficulty && difficultyLevels.some((d) => d.id === practice.difficulty)) {
        setDifficulty(practice.difficulty)
      }
      if (practice.position) {
        if (positions.includes(practice.position)) setPosition(practice.position)
        else setCustomPosition(practice.position)
      }
      if (practice.focus) setSelectedType('behavioral')
      if (practice.followup != null) setFollowupIntensity(String(practice.followup))
    }

    if (prefillType && interviewTypes.some((t) => t.id === prefillType)) {
      setSelectedType(prefillType)
    }
    if (prefillDifficulty && difficultyLevels.some((d) => d.id === prefillDifficulty)) {
      setDifficulty(prefillDifficulty)
    }
    if (prefillPosition) {
      if (positions.includes(prefillPosition)) setPosition(prefillPosition)
      else setCustomPosition(prefillPosition)
    }
    if (prefillResume) setLinkResume(true)
    if (prefillFocus) setSelectedType('behavioral')
    if (prefillFollowup != null && prefillFollowup !== '') {
      setFollowupIntensity(prefillFollowup === 'off' ? 'off' : prefillFollowup)
    }

    if (taskIdFromUrl && !prefillType) {
      fetchTasksManifest()
        .then((data) => {
          const found = (data.tasks || []).find((t) => t.slug === taskIdFromUrl)
          if (found) applyPractice(found.practice)
        })
        .catch(() => {})
    }
  }, [
    prefillType,
    prefillDifficulty,
    prefillPosition,
    prefillResume,
    prefillFocus,
    prefillFollowup,
    taskIdFromUrl,
    experimentCtx?.experiment_arm,
    experimentAssignment?.arm,
  ])

  useEffect(() => {
    fetchExperimentContext()
      .then((ctx) => {
        setExperimentCtx(ctx)
        if (ctx?.continuity_prefill?.difficulty) {
          const mapped = DIFFICULTY_MAP[ctx.continuity_prefill.difficulty] || ctx.continuity_prefill.difficulty
          if (mapped) setDifficulty(mapped)
        }
        if (ctx?.continuity_prefill?.position) {
          setPosition(ctx.continuity_prefill.position)
        }
        if (ctx?.experiment_arm && !ctx?.experiment_practice_completed && ctx?.assigned_difficulty) {
          const mapped = DIFFICULTY_MAP[ctx.assigned_difficulty] || ctx.assigned_difficulty
          if (mapped) setDifficulty(mapped)
        }
        if (continuityPrompt && ctx?.task_continuity === 'linked') {
          setContinuityNote('研究安排：请继续同一困难的相关任务（已预填上轮难度与岗位）。')
        }
      })
      .catch(() => {})
  }, [continuityPrompt])

  useEffect(() => {
    listJobs()
      .then((jobs) => {
        setSavedJobs(jobs)
        if (prefillJob && jobs.some((j) => j.id === prefillJob)) {
          setSelectedJobId(prefillJob)
          setJdSkipped(false)
          const job = jobs.find((j) => j.id === prefillJob)
          if (job) {
            setJdPaste(job.raw_text || '')
            setJdKeywords(job.keywords || [])
          }
        }
      })
      .catch(() => {})
  }, [prefillJob])

  const effectiveResumeId = linkResume ? (prefillResume || resumeId || '') : ''

  const activeJob = useMemo(
    () => savedJobs.find((j) => j.id === selectedJobId) || null,
    [savedJobs, selectedJobId],
  )

  const removeJdKeyword = (kw) => setJdKeywords((prev) => prev.filter((k) => k !== kw))
  const addJdKeyword = () => {
    const token = kwDraft.trim()
    if (!token || jdKeywords.includes(token)) return
    setJdKeywords((prev) => [...prev, token])
    setKwDraft('')
  }

  const handleSelectSavedJob = (jobId) => {
    setSelectedJobId(jobId)
    setJdSkipped(false)
    const job = savedJobs.find((j) => j.id === jobId)
    if (job) {
      setJdPaste(job.raw_text || '')
      setJdKeywords(job.keywords || [])
    }
  }

  const handleSaveLobbyJd = async () => {
    if (!jdPaste.trim()) return
    setJdSaving(true)
    setJdNotice('')
    try {
      const job = await createJob({
        raw_text: jdPaste.trim(),
        keywords: jdKeywords.length ? jdKeywords : undefined,
      })
      trackResearchEvent('jd.saved', { job_id: job.id, keyword_count: (job.keywords || []).length })
      setSavedJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)])
      setSelectedJobId(job.id)
      setJdKeywords(job.keywords?.length ? job.keywords : jdKeywords)
      if (job.needs_manual_keywords) {
        setJdNotice('未能自动提取关键词，请手动添加。')
      } else if (job.short_text_warning) {
        setJdNotice('JD 文本较短，建议补充后再匹配。')
      }
    } catch (err) {
      setJdNotice(getErrorMessage(err, '保存 JD 失败'))
    } finally {
      setJdSaving(false)
    }
  }

  useEffect(() => {
    setRounds((prev) => {
      const next = buildDefaultRounds(roundCount)
      return next.map((r, i) => ({
        ...r,
        name: prev[i]?.name || r.name,
        question_count: prev[i]?.question_count ?? r.question_count,
        mix: prev[i]?.mix ? { ...prev[i].mix } : r.mix,
      }))
    })
  }, [roundCount])

  useEffect(() => {
    if (!effectiveResumeId && linkResume) {
      setResumeTip('上传简历可解锁专属追问')
    } else {
      setResumeTip('')
    }
  }, [effectiveResumeId, linkResume])

  const updateRound = (index, patch) => {
    setRounds((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const updateRoundMix = (index, key, value) => {
    setRounds((prev) =>
      prev.map((r, i) =>
        i === index
          ? { ...r, mix: { ...r.mix, [key]: Math.max(0, Math.min(8, Number(value) || 0)) } }
          : r,
      ),
    )
  }

  const summaryType = interviewTypes.find((t) => t.id === selectedType)?.name
  const summaryDiff = difficultyLevels.find((d) => d.id === difficulty)?.label
  const finalPosition = useMemo(() => {
    if (!jdSkipped && activeJob) {
      const title = (activeJob.title || '').trim()
      if (title) return title
      const firstKw = (activeJob.keywords || jdKeywords)[0]
      if (firstKw) return firstKw
    }
    return customPosition.trim() || position || '通用岗位'
  }, [jdSkipped, activeJob, customPosition, position, jdKeywords])

  const sessionJobId = !jdSkipped && selectedJobId ? selectedJobId : null

  const handleStart = async () => {
    const typeLabel = summaryType || '模拟面试'
    setLoading(true)
    setError('')
    try {
      const researchMeta = useResearchStore.getState().getSessionMetadata()
      const isAssignedPractice =
        researchPractice && experimentCtx && !experimentCtx.experiment_practice_completed
      if (selectedType === 'one_way' && isAssignedPractice) {
        setError('实验安排的首次练习请使用标准模拟面试，单向初面模式不能计入该任务。')
        setLoading(false)
        return
      }
      const resolvedLang = normalizeInterviewLang(interviewLang)
      trackResearchEvent('interview.lang', { lang: resolvedLang })
      const sessionMetadata = {
        interview_type: selectedType,
        position: finalPosition,
        lang: resolvedLang,
        ...researchMeta,
      }
      if (effectiveResumeId) {
        sessionMetadata.resume_id = effectiveResumeId
      }
      if (sessionJobId) {
        sessionMetadata.job_id = sessionJobId
      }
      sessionMetadata.followup_intensity = resolvedFollowupIntensity
      if (selectedType === 'one_way') {
        sessionMetadata.mode = 'one_way'
        sessionMetadata.interview_mode = 'one_way'
        sessionMetadata.interview_type = 'general'
        sessionMetadata.one_way = {
          prep_sec: Math.max(0, Math.min(60, Number(oneWayPrepSec) || 30)),
          answer_sec: Math.max(60, Math.min(180, Number(oneWayAnswerSec) || 120)),
          max_retakes:
            oneWayRetakes === 'inf' ? null : Math.max(0, Math.min(10, Number(oneWayRetakes) || 0)),
        }
        sessionMetadata.followup_intensity = 'off'
      }
      if (hasNegotiationRound) {
        sessionMetadata.negotiation_prefs = {
          role: (negotiationRole || finalPosition).trim(),
          city: negotiationCity.trim() || '未指定',
          salary_floor_k: Math.max(5, Math.min(200, Number(negotiationFloorK) || 15)),
          salary_ceiling_k: Math.max(
            5,
            Math.min(200, Number(negotiationCeilingK) || Number(negotiationFloorK) || 22),
          ),
        }
      }
      if (isAssignedPractice) {
        sessionMetadata.source = 'experiment_assigned_practice'
        sessionMetadata.research_session_source = 'experiment_assigned_practice'
        sessionMetadata.counts_toward_activation = false
        if (experimentCtx.participation_mode) {
          sessionMetadata.participation_mode = experimentCtx.participation_mode
        }
        if (experimentCtx.task_continuity) {
          sessionMetadata.task_continuity = experimentCtx.task_continuity
        }
        if (experimentCtx.experiment_arm) {
          sessionMetadata.experiment_arm = experimentCtx.experiment_arm
        }
      } else if (continuityPrompt && experimentCtx?.task_continuity === 'linked') {
        sessionMetadata.task_continuity = 'linked'
      }

      if (
        experimentPracticeLocked
        && rounds.some(
          (r) =>
            r.type === 'hr'
            || r.type === 'negotiation'
            || r.type === 'case'
            || r.type === 'system_design',
        )
      ) {
        setError('研究安排的首次练习不可包含 HR、谈薪或 Case/系统设计轮次。')
        setLoading(false)
        return
      }

      const roundsPayload =
        selectedType === 'one_way'
          ? [
              {
                name: 'AI 初面',
                question_count: Math.max(1, Math.min(8, oneWayQuestionCount)),
                mix: { general: 2, resume_specific: 1, professional: 0 },
                type: 'standard',
                reverse_qa: false,
              },
            ]
          : rounds.map((r) => ({
              name: r.name,
              question_count: r.type === 'negotiation' ? 1 : r.question_count,
              mix: { ...r.mix },
              type: r.type || 'standard',
              reverse_qa: Boolean(r.reverse_qa),
            }))
      trackResearchEvent('interview.rounds.configured', {
        round_count: roundsPayload.length,
        rounds: roundsPayload,
      })

      const session = await createSession({
        type: 'interview',
        position: finalPosition,
        difficulty,
        topic:
          selectedType === 'one_way'
            ? `AI 初面模拟 · ${finalPosition}`
            : `1v1 ${typeLabel} · ${finalPosition}`,
        job_id: sessionJobId || undefined,
        rounds: roundsPayload,
        metadata: sessionMetadata,
      })
      const taskSlug =
        taskIdFromUrl || sessionMetadata.task_id || researchMeta.task_id || null
      if (taskSlug) {
        trackResearchEvent('task.started', { slug: taskSlug, task_id: taskSlug, session_id: session.id })
        const stepsMetrics = consumeTaskStepsMetrics(taskSlug)
        if (stepsMetrics) {
          trackResearchEvent('task.steps_to_start', {
            slug: taskSlug,
            task_id: taskSlug,
            ...stepsMetrics,
          })
        }
      }
      if (sessionJobId) {
        trackResearchEvent('jd.used_in_session', {
          job_id: sessionJobId,
          resume_id: effectiveResumeId || null,
        })
      }
      const caseOnly = selectedType !== 'one_way' && isCaseOnlyRounds(roundsPayload)
      navigate(
        selectedType === 'one_way'
          ? `/interview/oneway/${session.id}`
          : caseOnly
            ? `/case/room/${session.id}`
            : `/interview/room/${session.id}`,
      )
    } catch (err) {
      setError(getErrorMessage(err, '创建面试会话失败'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.lobby}>
      <PageBar title="1V1 模拟面试" />

      <div className={styles['step-bar']}>
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            className={`${styles['step-chip']} ${step === i + 1 ? styles['step-active'] : ''} ${step > i + 1 ? styles['step-done'] : ''}`}
            onClick={() => setStep(i + 1)}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {continuityNote && (
        <p className={styles['inline-note']}>{continuityNote}</p>
      )}
      {taskEntryNote && (
        <p className={styles['inline-note']}>{taskEntryNote}</p>
      )}
      {researchPractice && experimentCtx && !experimentCtx.experiment_practice_completed && (
        <p className={styles['inline-note']}>
          研究安排首轮练习：{experimentCtx.participation_mode === 'demo' ? '示范观看模式' : '主动作答模式'}（不计入合格激活）
        </p>
      )}

      {step === 1 && (
        <div className={styles.section}>
          <div className={styles['section-label']}>Step 1 · 面试类型</div>
          <div className={styles['type-grid']}>
            {interviewTypes.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`${styles['type-card']} ${selectedType === t.id ? styles.selected : ''} ${styles[t.color]}`}
                onClick={() => {
                  if (
                    t.id === 'one_way'
                    && researchPractice
                    && experimentCtx
                    && !experimentCtx.experiment_practice_completed
                  ) {
                    return
                  }
                  if (t.structuredZone) {
                    navigate('/interview/structured/lobby')
                    return
                  }
                  setSelectedType(t.id)
                }}
                disabled={
                  t.id === 'one_way'
                  && researchPractice
                  && experimentCtx
                  && !experimentCtx.experiment_practice_completed
                }
              >
                <div className={`hw-inset ${styles['type-icon']}`} aria-hidden="true">{t.icon}</div>
                <div className={styles['type-info']}>
                  <div className={styles['type-name']}>{t.name}</div>
                  <div className={styles['type-desc']}>{t.desc}</div>
                </div>
                {selectedType === t.id && <div className={styles['type-check']}>✓</div>}
              </button>
            ))}
          </div>
          {researchPractice && experimentCtx && !experimentCtx.experiment_practice_completed && (
            <p className={styles['inline-note']}>
              研究安排的首轮练习不可使用「AI 初面模拟（单向）」。
            </p>
          )}
          <div className={styles['step-actions']}>
            <button type="button" className={styles['step-next']} onClick={() => setStep(2)}>下一步</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <>
          <div className={styles.section}>
            <div className={styles['section-label']}>面试语言</div>
            <div className={styles['diff-row']}>
              {INTERVIEW_LANG_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`${styles['diff-btn']} ${interviewLang === opt.id ? styles.selected : ''}`}
                  onClick={() => setInterviewLang(opt.id)}
                >
                  <span className={styles['diff-label']}>{opt.label}</span>
                  <span className={styles['diff-desc']}>{opt.desc}</span>
                </button>
              ))}
            </div>
            {interviewLang === INTERVIEW_LANG_EN && (
              <p className={styles['inline-note']}>
                英文模式下题目与朗读为 English；部分浏览器不支持英文语音输入，可直接英文打字作答。复盘报告界面仍为中文，你的英文回答会原样保留。
              </p>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles['section-label']}>Step 2 · 考官难度</div>
            <div className={styles['diff-row']}>
              {difficultyLevels.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`${styles['diff-btn']} ${difficulty === d.id ? styles.selected : ''} ${styles[d.color]}`}
                  onClick={() => !experimentLocked && setDifficulty(d.id)}
                  disabled={experimentLocked && difficulty !== d.id}
                >
                  <span className={styles['diff-label']}>{d.label}</span>
                  <span className={styles['diff-desc']}>{d.desc}</span>
                </button>
              ))}
            </div>
            {experimentLocked && (
              <p className={styles['inline-note']}>研究分组已锁定难度，本轮不可更改。</p>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles['section-label']}>动态追问强度</div>
            <div className={styles['diff-row']}>
              {[
                { id: 'off', label: '关闭', desc: '不触发三层追问' },
                { id: '1', label: '1 层', desc: '澄清型追问' },
                { id: '3', label: '3 层', desc: '澄清 → 应用 → 反思' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`${styles['diff-btn']} ${resolvedFollowupIntensity === opt.id ? styles.selected : ''}`}
                  onClick={() => setFollowupIntensity(opt.id)}
                >
                  <span className={styles['diff-label']}>{opt.label}</span>
                  <span className={styles['diff-desc']}>{opt.desc}</span>
                </button>
              ))}
            </div>
            <p className={styles['inline-note']}>
              追问不占用轮内题量；高压模式默认 3 层，可在开考前调整。
            </p>
          </div>

          <div className={styles.section}>
            <div className={styles['section-label']}>目标岗位（可选）</div>
            <p className={styles['inline-note']}>
              粘贴 JD 可定制选题；跳过则使用下方通用岗位标签。
            </p>
            {!jdSkipped && (
              <>
                {savedJobs.length > 0 && (
                  <select
                    className={styles['pos-input']}
                    value={selectedJobId}
                    onChange={(e) => handleSelectSavedJob(e.target.value)}
                  >
                    <option value="">选择已保存 JD…</option>
                    {savedJobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {(j.title || j.raw_text.slice(0, 28)).trim()}
                      </option>
                    ))}
                  </select>
                )}
                <textarea
                  className={styles['jd-paste']}
                  placeholder="或粘贴新的 Job Description…"
                  value={jdPaste}
                  onChange={(e) => {
                    setJdPaste(e.target.value)
                    setSelectedJobId('')
                  }}
                />
                {jdPaste.trim().length > 0 && jdPaste.trim().length < 50 && (
                  <p className={styles['inline-note']}>JD 不足 50 字，提取可能不完整。</p>
                )}
                <div className={styles['jd-chips']}>
                  {jdKeywords.map((kw) => (
                    <span key={kw} className={styles['jd-chip']}>
                      {kw}
                      <button type="button" aria-label={`移除 ${kw}`} onClick={() => removeJdKeyword(kw)}>×</button>
                    </span>
                  ))}
                </div>
                <div className={styles['jd-chip-add']}>
                  <input
                    type="text"
                    className={styles['pos-input']}
                    placeholder="手动关键词"
                    value={kwDraft}
                    onChange={(e) => setKwDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addJdKeyword())}
                  />
                  <button type="button" className={styles['step-back']} onClick={addJdKeyword}>添加</button>
                  <button
                    type="button"
                    className={styles['step-next']}
                    disabled={!jdPaste.trim() || jdSaving}
                    onClick={handleSaveLobbyJd}
                  >
                    {jdSaving ? '保存中…' : '保存 JD'}
                  </button>
                </div>
                {jdNotice && <p className={styles['inline-note']}>{jdNotice}</p>}
                <button type="button" className={styles['jd-skip-btn']} onClick={() => setJdSkipped(true)}>
                  跳过，使用通用岗位
                </button>
              </>
            )}
            {jdSkipped && (
              <button type="button" className={styles['jd-skip-btn']} onClick={() => setJdSkipped(false)}>
                返回 JD 定制
              </button>
            )}
          </div>

          {selectedType === 'one_way' && (
            <div className={styles.section}>
              <div className={styles['section-label']}>单向初面参数</div>
              <p className={styles['inline-note']}>
                录像仅在浏览器本地预览，不会上传；提交后不可返回上一题。
              </p>
              <div className={styles['inline-note']}>
                准备时间（0–60 秒）
                <input
                  type="number"
                  min={0}
                  max={60}
                  className={styles['round-num']}
                  value={oneWayPrepSec}
                  onChange={(e) =>
                    setOneWayPrepSec(Math.max(0, Math.min(60, Number(e.target.value) || 0)))
                  }
                />
                · 作答时间（60–180 秒）
                <input
                  type="number"
                  min={60}
                  max={180}
                  className={styles['round-num']}
                  value={oneWayAnswerSec}
                  onChange={(e) =>
                    setOneWayAnswerSec(Math.max(60, Math.min(180, Number(e.target.value) || 120)))
                  }
                />
              </div>
              <div className={styles['diff-row']}>
                {[
                  { id: 'inf', label: '无限重录', desc: '练习用' },
                  { id: '1', label: '1 次重录', desc: '默认' },
                  { id: '0', label: '不可重录', desc: '一次定稿' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`${styles['diff-btn']} ${oneWayRetakes === opt.id ? styles.selected : ''}`}
                    onClick={() => setOneWayRetakes(opt.id)}
                  >
                    <span className={styles['diff-label']}>{opt.label}</span>
                    <span className={styles['diff-desc']}>{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(jdSkipped || !selectedJobId) && (
            <div className={styles.section}>
              <div className={styles['section-label']}>目标岗位</div>
              <div className={styles['pos-grid']}>
                {positions.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`${styles['pos-chip']} ${position === p ? styles.selected : ''}`}
                    onClick={() => { setPosition(p); setCustomPosition('') }}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <input
                type="text"
                className={styles['pos-input']}
                placeholder="或输入自定义岗位..."
                value={customPosition}
                onChange={(e) => { setCustomPosition(e.target.value); setPosition('') }}
              />
            </div>
          )}

          {!jdSkipped && selectedJobId && activeJob && (
            <p className={styles['inline-note']}>
              已选 JD：{(activeJob.title || '自定义岗位').trim()} · 关键词 {(activeJob.keywords || jdKeywords).length} 个
            </p>
          )}

          <div className={styles['step-actions']}>
            <button type="button" className={styles['step-back']} onClick={() => setStep(1)}>上一步</button>
            <button type="button" className={styles['step-next']} onClick={() => setStep(3)}>下一步</button>
          </div>
        </>
      )}

      {step === 3 && selectedType === 'one_way' && (
        <>
          <div className={styles.section}>
            <div className={styles['section-label']}>Step 3 · 正式题数量</div>
            <p className={styles['inline-note']}>单向模式固定 1 轮；开始前有一道不计分练习题。</p>
            <div className={styles['inline-note']}>
              题数
              <input
                type="number"
                min={1}
                max={8}
                className={styles['round-num']}
                value={oneWayQuestionCount}
                onChange={(e) =>
                  setOneWayQuestionCount(Math.max(1, Math.min(8, Number(e.target.value) || 3)))
                }
              />
            </div>
          </div>
          <div className={styles['step-actions']}>
            <button type="button" className={styles['step-back']} onClick={() => setStep(2)}>上一步</button>
            <button type="button" className={styles['step-next']} onClick={() => setStep(4)}>下一步</button>
          </div>
        </>
      )}

      {step === 3 && selectedType !== 'one_way' && (
        <>
          <div className={styles.section}>
            <div className={styles['section-label']}>Step 3 · 面试轮数</div>
            <div className={styles['diff-row']}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`${styles['diff-btn']} ${roundCount === n ? styles.selected : ''}`}
                  onClick={() => setRoundCount(n)}
                >
                  <span className={styles['diff-label']}>{n} 轮</span>
                </button>
              ))}
            </div>
          </div>

          {experimentPracticeLocked && (
            <p className={styles['inline-note']}>
              研究安排的首轮练习不可配置 HR 面或谈薪轮次（实验任务仅使用标准轮次）。
            </p>
          )}

          {hasNegotiationRound && (
            <div className={styles.section}>
              <div className={styles['section-label']}>谈薪轮 · 期望信息（模拟用）</div>
              <p className={styles['inline-note']}>
                以下信息仅用于生成本次练习的假设报价，不代表真实市场薪酬。
              </p>
              <input
                type="text"
                className={styles['pos-input']}
                placeholder="目标岗位 / 职级"
                value={negotiationRole}
                onChange={(e) => setNegotiationRole(e.target.value)}
              />
              <input
                type="text"
                className={styles['pos-input']}
                placeholder="期望工作城市"
                value={negotiationCity}
                onChange={(e) => setNegotiationCity(e.target.value)}
              />
              <div className={styles['inline-note']}>
                期望月薪区间（K/月）
                <input
                  type="number"
                  min={5}
                  max={200}
                  className={styles['round-num']}
                  value={negotiationFloorK}
                  onChange={(e) => setNegotiationFloorK(e.target.value)}
                />
                —
                <input
                  type="number"
                  min={5}
                  max={200}
                  className={styles['round-num']}
                  value={negotiationCeilingK}
                  onChange={(e) => setNegotiationCeilingK(e.target.value)}
                />
              </div>
            </div>
          )}

          {rounds.map((round, idx) => (
            <div key={idx} className={styles.section}>
              <div className={styles['section-label']}>
                第 {idx + 1} 轮 · {DEFAULT_ROUND_NAMES[idx] || '自定义'}
              </div>
              <input
                type="text"
                className={styles['pos-input']}
                value={round.name}
                onChange={(e) => updateRound(idx, { name: e.target.value })}
                placeholder="轮次名称"
              />
              <div className={styles['inline-note']}>
                轮次类型
                <select
                  className={styles['pos-input']}
                  value={round.type || 'standard'}
                  disabled={experimentPracticeLocked}
                  onChange={(e) => {
                    const type = e.target.value
                    const patch = { type }
                    if (type === 'negotiation' && !round.name?.includes('谈薪')) {
                      patch.name = '谈薪 · 模拟'
                    }
                    if (type === 'hr' && !round.name?.includes('HR')) {
                      patch.name = 'HR 面'
                    }
                    if (type === 'case' && !round.name?.includes('Case')) {
                      patch.name = 'Case · 商业分析'
                      patch.question_count = 1
                    }
                    if (type === 'system_design' && !round.name?.includes('系统')) {
                      patch.name = '系统设计 · 白板'
                      patch.question_count = 1
                    }
                    updateRound(idx, patch)
                  }}
                >
                  {ROUND_TYPE_OPTIONS.map((opt) => (
                    <option
                      key={opt.id}
                      value={opt.id}
                      disabled={experimentPracticeLocked && (opt.id === 'hr' || opt.id === 'negotiation')}
                    >
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <label className={styles['resume-toggle']}>
                <input
                  type="checkbox"
                  checked={Boolean(round.reverse_qa)}
                  onChange={(e) => updateRound(idx, { reverse_qa: e.target.checked })}
                />
                结尾反问环节（0–3 题，可不反问）
              </label>
              {round.type === 'standard' && (
                <div className={styles['inline-note']}>
                  题数
                  <input
                    type="number"
                    min={1}
                    max={8}
                    className={styles['round-num']}
                    value={round.question_count}
                    onChange={(e) =>
                      updateRound(idx, {
                        question_count: Math.max(1, Math.min(8, Number(e.target.value) || 1)),
                      })
                    }
                  />
                  · 比例 通用 : 简历 : 专业
                  {(['general', 'resume_specific', 'professional']).map((k) => (
                    <input
                      key={k}
                      type="number"
                      min={0}
                      max={8}
                      className={styles['round-num']}
                      value={round.mix[k]}
                      onChange={(e) => updateRoundMix(idx, k, e.target.value)}
                    />
                  ))}
                </div>
              )}
              {(round.type === 'case' || round.type === 'system_design') && (
                <p className={styles['inline-note']}>
                  将从谈锋自编题库随机抽取一题；也可在
                  {' '}
                  <a href="/case/lobby">Case 专区</a>
                  {' '}
                  指定题目开始。
                </p>
              )}
              {round.type === 'hr' && (
                <div className={styles['inline-note']}>
                  HR 题数
                  <input
                    type="number"
                    min={1}
                    max={8}
                    className={styles['round-num']}
                    value={round.question_count}
                    onChange={(e) =>
                      updateRound(idx, {
                        question_count: Math.max(1, Math.min(8, Number(e.target.value) || 1)),
                      })
                    }
                  />
                  <span> · 覆盖动机 / 稳定性 / 城市 / 薪资预期等主题</span>
                </div>
              )}
              {round.type === 'negotiation' && (
                <p className={styles['inline-note']}>
                  谈薪轮无笔试题，进入面试间后将展示假设报价卡片并进行多轮议价。
                </p>
              )}
            </div>
          ))}

          {resumeTip && (
            <p className={styles['inline-note']}>{resumeTip}</p>
          )}

          <div className={styles['step-actions']}>
            <button type="button" className={styles['step-back']} onClick={() => setStep(2)}>上一步</button>
            <button type="button" className={styles['step-next']} onClick={() => setStep(4)}>下一步</button>
          </div>
        </>
      )}

      {step === 4 && (
        <>
          <div className={styles.section}>
            <div className={styles['section-label']}>Step 4 · 关联简历（可选）</div>
            <label className={styles['resume-toggle']}>
              <input
                type="checkbox"
                checked={linkResume}
                onChange={(e) => setLinkResume(e.target.checked)}
              />
              使用当前默认简历个性化选题
            </label>
            {!effectiveResumeId && linkResume && (
              <p className={styles['inline-note']}>尚未上传简历，专属题将换成通用题。{resumeTip || '上传简历可解锁专属追问'}</p>
            )}
            {effectiveResumeId && (
              <p className={styles['inline-note']}>已关联简历 ID：{effectiveResumeId}</p>
            )}
          </div>

          <div className={styles['summary-bar']}>
            <div className={styles['summary-item']}>
              <span className={styles['summary-label']}>类型</span>
              <span className={styles['summary-value']}>{summaryType}</span>
            </div>
            <div className={styles['summary-sep']} />
            <div className={styles['summary-item']}>
              <span className={styles['summary-label']}>语言</span>
              <span className={styles['summary-value']}>
                {interviewLang === INTERVIEW_LANG_EN ? 'English' : '中文'}
              </span>
            </div>
            <div className={styles['summary-sep']} />
            <div className={styles['summary-item']}>
              <span className={styles['summary-label']}>难度</span>
              <span className={styles['summary-value']}>{summaryDiff}</span>
            </div>
            <div className={styles['summary-sep']} />
            <div className={styles['summary-item']}>
              <span className={styles['summary-label']}>岗位</span>
              <span className={styles['summary-value']}>{finalPosition}</span>
            </div>
            {sessionJobId && (
              <>
                <div className={styles['summary-sep']} />
                <div className={styles['summary-item']}>
                  <span className={styles['summary-label']}>JD</span>
                  <span className={styles['summary-value']}>已关联</span>
                </div>
              </>
            )}
            <div className={styles['summary-sep']} />
            <div className={styles['summary-item']}>
              <span className={styles['summary-label']}>轮数</span>
              <span className={styles['summary-value']}>
                {selectedType === 'one_way'
                  ? `1 轮 · ${oneWayQuestionCount} 题（含练习题）`
                  : `${roundCount} 轮 · 共 ${rounds.reduce((s, r) => s + r.question_count, 0)} 题`}
              </span>
            </div>
            {selectedType === 'one_way' && (
              <>
                <div className={styles['summary-sep']} />
                <div className={styles['summary-item']}>
                  <span className={styles['summary-label']}>计时</span>
                  <span className={styles['summary-value']}>
                    准备 {oneWayPrepSec}s · 作答 {oneWayAnswerSec}s
                  </span>
                </div>
              </>
            )}
          </div>

          <div className={styles['start-section']}>
            <div className={styles['step-actions']}>
              <button type="button" className={styles['step-back']} onClick={() => setStep(3)}>上一步</button>
              <button type="button" className={styles['start-btn']} onClick={handleStart} disabled={loading}>
                {loading ? '创建中...' : '开始面试'}
              </button>
            </div>
            <div className={styles['start-hint']}>
              面试将消耗约 500 积分 · 支持中途退出
            </div>
            {error && <div className={styles['form-error']}>{error}</div>}
          </div>
        </>
      )}
    </div>
  )
}
