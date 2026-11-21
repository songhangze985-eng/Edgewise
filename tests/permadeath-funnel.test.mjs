import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  RESUME_SCREENER_FIXED_PROMPT,
  SCREENER_ARCHITECTURE_ID,
  analyzeLgdFootprintForHr,
  buildHrCrossStageOpening,
  buildRecruitingFunnelStages,
  evaluateHrFourDimensions,
  evaluatePermadeathLgdCalibration,
  evaluateResumeRelease,
  evaluateStageGateTransition,
  evaluateWrittenSimulation,
  formatBlindStageBadge,
  generateHrPressureFollowupProbe,
  runLocalResumeScreenerAgent,
} from '../src/features/challenge/permadeathGateEngine.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')

describe('PermadeathChallenge End-to-End Recruiting Funnel, Blind Scoring & Cutoff Gate', () => {
  it('supports all configurable funnel paths: Resume -> LGD -> [Written] -> 1-2 Biz Rounds -> HR -> Offer', () => {
    const fullSix = buildRecruitingFunnelStages({ includeWrittenTest: true, businessRounds: 2 })
    assert.deepEqual(
      fullSix.map((s) => s.key),
      ['resume', 'lgd', 'written', 'biz_1', 'biz_2', 'hr_final'],
    )

    const noWrittenTwoBiz = buildRecruitingFunnelStages({
      includeWrittenTest: false,
      businessRounds: 2,
    })
    assert.deepEqual(
      noWrittenTwoBiz.map((s) => s.key),
      ['resume', 'lgd', 'biz_1', 'biz_2', 'hr_final'],
    )

    const withWrittenOneBiz = buildRecruitingFunnelStages({
      includeWrittenTest: true,
      businessRounds: 1,
    })
    assert.deepEqual(
      withWrittenOneBiz.map((s) => s.key),
      ['resume', 'lgd', 'written', 'biz_1', 'hr_final'],
    )
  })

  it('strictly hides prior scores during active play and immediately pauses/exits when below passLine', () => {
    const stages = buildRecruitingFunnelStages({ includeWrittenTest: true, businessRounds: 2 })

    // Stage 0 (Resume) passes with 86 >= 70 -> score MUST stay hidden!
    const step0 = evaluateStageGateTransition({
      rawScore: 86,
      passLine: 70,
      stageIndex: 0,
      stages,
      priorStageRecords: [],
      stageSummary: '简历画像匹配良好',
    })
    assert.equal(step0.outcome, 'advance_sealed')
    assert.equal(step0.scoresRevealed, false)
    assert.equal(step0.nextStageIndex, 1)
    assert.doesNotMatch(step0.publicNotice, /86/)
    assert.equal(
      formatBlindStageBadge('passed', step0.stageRecords[0], step0.scoresRevealed),
      '🔒 已封存',
    )

    // Stage 1 (LGD) scores 62 < 70 passLine -> MUST immediately halt remaining stages and unseal scores!
    const step1Fail = evaluateStageGateTransition({
      rawScore: 62,
      passLine: 70,
      stageIndex: 1,
      stages,
      priorStageRecords: step0.stageRecords,
      stageSummary: '群面未达SP晋级线',
    })
    assert.equal(step1Fail.outcome, 'failed_cutoff')
    assert.equal(step1Fail.gameState, 'gameover')
    assert.equal(step1Fail.scoresRevealed, true)
    assert.deepEqual(step1Fail.pausedFutureStages, [
      '笔试模拟',
      '业务一面（项目深挖）',
      '业务二面（Leader压测）',
      'HR / 终面 & Offer',
    ])
    // Once unsealed on elimination, prior hidden score 86 & failed score 62 are revealed
    assert.match(
      formatBlindStageBadge('passed', step1Fail.stageRecords[0], step1Fail.scoresRevealed),
      /86 分/,
    )
  })

  it('evaluates Resume Release, Written Simulation, HR 4-Dimensions, and issues Offer when all stages >= passLine', () => {
    const resumeGood = evaluateResumeRelease({
      education: '计算机硕士',
      coreProject: '主导核心转化漏斗重构，将启动时延降低65%、首轮完成率提升28%',
      skillsText: 'Python、React、FastAPI、SQL',
    })
    assert.ok(resumeGood.score >= 82)
    const resumeBlank = evaluateResumeRelease({})
    assert.ok(resumeBlank.score < 50)

    const writtenPerfect = evaluateWrittenSimulation(
      { w_logic_1: 0, w_data_2: 1, w_scene_3: 1 },
      '逆否命题推导 + 漏斗净增计算 144 人',
    )
    assert.ok(writtenPerfect.score >= 92)

    const hrGood = evaluateHrFourDimensions({
      answerText:
        '我计划未来三年长期深耕本赛道稳定发展，保证每周5天连续实习6个月争取转正，高度认同务实闭环与坦诚复盘文化，结合过往量化产出期望月薪26k左右。',
      internshipCommitment: '5days_6months',
      expectedSalaryK: 26,
      floorK: 20,
      backendTurnScore: 86,
    })
    assert.ok(hrGood.score >= 85)
    assert.ok(hrGood.dimensions.stability >= 85)
    assert.ok(hrGood.dimensions.internship >= 90)
    assert.ok(hrGood.dimensions.culture >= 85)

    // Final stage completion unlocks Offer & reveals all stage scores
    const stages = buildRecruitingFunnelStages({ includeWrittenTest: false, businessRounds: 1 })
    let records = []
    const simulatedScores = [resumeGood.score, 84, 83, hrGood.score]
    let lastGate = null
    simulatedScores.forEach((sc, idx) => {
      lastGate = evaluateStageGateTransition({
        rawScore: sc,
        passLine: 70,
        stageIndex: idx,
        stages,
        priorStageRecords: records,
      })
      records = lastGate.stageRecords
    })
    assert.equal(lastGate.outcome, 'offer_issued')
    assert.equal(lastGate.gameState, 'victory')
    assert.equal(lastGate.scoresRevealed, true)
    assert.equal(lastGate.stageRecords.length, 4)
  })

  it('verifies zero missing CSS Module classes in PermadeathChallenge.jsx', () => {
    const jsx = read('src/features/challenge/PermadeathChallenge.jsx')
    const css = read('src/features/challenge/PermadeathChallenge.module.css')
    const staticClasses = [
      ...Array.from(jsx.matchAll(/styles\['([^'$]+)'\]/g), (m) => m[1]),
      ...Array.from(jsx.matchAll(/styles\.([a-zA-Z0-9_-]+)/g), (m) => m[1]),
    ]
    for (const cls of staticClasses) {
      assert.ok(css.includes(`.${cls}`), `Missing .${cls} in PermadeathChallenge.module.css`)
    }
    for (const st of ['locked', 'paused', 'current', 'passed', 'failed']) {
      assert.ok(css.includes(`.stage-${st}`) && css.includes(`.status-${st}`))
    }
  })

  it('Fixed-Prompt AI Resume Screener dispatches deep-dive checklist & HR Final inherits Resume + LGD Compromise with Pressure Mode', () => {
    // 1. Fixed-Prompt Screener extracts tags and dispatches checklist to biz_1, biz_2, and hr_final
    assert.match(RESUME_SCREENER_FIXED_PROMPT, /core_project_tags/)
    assert.match(RESUME_SCREENER_FIXED_PROMPT, /deep_dive_checklist/)

    const dossier = runLocalResumeScreenerAgent({
      position: 'AI 产品经理',
      education: '计算机硕士',
      coreProject: '主导求职训练漏斗转化重构项目，采用A/B实验与规则引擎使首轮完成率提升28%',
      skillsText: 'Python、React、FastAPI、SQL',
    })
    assert.equal(dossier.architecture_id, SCREENER_ARCHITECTURE_ID)
    assert.equal(dossier.execution_steps.length, 3)
    assert.ok(dossier.core_project_tags.includes('漏斗转化'))
    assert.ok(dossier.suspicion_gaps.length >= 2)
    assert.deepEqual(
      dossier.deep_dive_checklist.map((item) => item.target_stage),
      ['biz_1', 'biz_2', 'hr_final'],
    )

    // 2. Stage-2 LGD compromise behavior triggers exact HR cross-exam ("刚才群面时你为什么妥协了那个方案")
    const lgdFootprint = analyzeLgdFootprintForHr(
      [
        {
          role: 'user',
          isUser: true,
          text: '我建议桥接3号与5号做个折中妥协方案，兼顾前置标签与首题直连。',
        },
      ],
      82,
    )
    assert.equal(lgdFootprint.style, 'compromised_bridge')
    assert.match(lgdFootprint.hr_lgd_probe, /刚才群面时你为什么妥协了那个方案/)

    // 3. HR Final opening inherits BOTH Stage-1 Resume gap and Stage-2 LGD compromise probe
    const hrOpening = buildHrCrossStageOpening({
      position: 'AI 产品经理',
      initOfferK: 22,
      dossier,
      lgdFootprint,
      pressureMode: true,
    })
    assert.match(hrOpening, /终面压力追问模式已开启/)
    assert.match(hrOpening, /继承第1关·简历盲区/)
    assert.match(hrOpening, /刚才群面时你为什么妥协了那个方案/)

    // 4. Pressure Follow-up Probe catches evasive answer vs rewards self-consistent defense
    const evasiveProbe = generateHrPressureFollowupProbe({
      candidateAnswer: '我性格很好，希望月薪28k，下周可以到岗实习半年。',
      dossier,
      lgdFootprint,
      expectedSalaryK: 28,
      floorK: 20,
    })
    assert.equal(evasiveProbe.addressed_lgd, false)
    assert.match(evasiveProbe.probe_text, /刚才群面时你为什么妥协了那个方案/)

    const solidProbe = generateHrPressureFollowupProbe({
      candidateAnswer:
        '群面中我选择折中妥协是为了在倒计时前保住团队共识底线；至于简历项目的回滚失误盲区，我们已经补齐了基线指标监控，我计划长期稳定深耕并实习6个月。',
      dossier,
      lgdFootprint,
      expectedSalaryK: 26,
      floorK: 20,
    })
    assert.equal(solidProbe.addressed_lgd, true)
    assert.equal(solidProbe.addressed_resume, true)
    assert.ok(solidProbe.consistency_score > evasiveProbe.consistency_score)

    // 5. Stage-2 Three-Examiner Calibration (`8进3` / Hell `8进2` + One-Vote Veto) halts vetoed/unpromoted runs
    const promotedCal = evaluatePermadeathLgdCalibration(
      84,
      {
        calibration: {
          user_promoted: true,
          user_vetoed: false,
          user_rank: 2,
          ratio_label: '8进3',
          summary_verdict: '🏆 Calibration 校准通过（第 2/8 名 · 8进3 成功晋级）',
        },
      },
      70,
      3,
    )
    assert.equal(promotedCal.promoted, true)
    assert.equal(promotedCal.effectiveScore, 84)

    const vetoedCal = evaluatePermadeathLgdCalibration(
      79,
      {
        calibration: {
          user_promoted: false,
          user_vetoed: true,
          user_rank: 8,
          ratio_label: '8进2',
          veto_reason: '协作雷区：固执己见拒不折中',
          summary_verdict: '⛔ Calibration 未通过（触发一票否决雷区）',
        },
      },
      70,
      2,
    )
    assert.equal(vetoedCal.promoted, false)
    assert.equal(vetoedCal.vetoed, true)
    assert.ok(vetoedCal.effectiveScore < 70, 'Vetoed candidate must drop below passLine to trigger permadeath cutoff')
  })

  it('opens the challenge micro-survey with checkPending after completion', () => {
    const jsx = read('src/features/challenge/PermadeathChallenge.jsx')
    const store = read('src/stores/surveyStore.js')
    assert.match(jsx, /useSurveyStore\.getState\(\)\.checkPending\('challenge'\)/)
    assert.doesNotMatch(jsx, /checkPendingSurvey/)
    assert.match(store, /async checkPending\(context\)/)
    assert.doesNotMatch(store, /checkPendingSurvey/)
  })
})
