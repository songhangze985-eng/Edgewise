import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import useResearchStore from '../../stores/researchStore'
import styles from './ResearchExperimentOnboarding.module.css'

const ARM_COPY = {
  '00': {
    title: '研究安排 · 常规介绍 + 示范观看',
    bullets: [
      '您将观看与主动练习等时长的示范过程（非您的个人得分结果）。',
      '完成后可自由选择题库中的下一项任务。',
      '本次安排练习不计入后续合格激活，自愿练习仍会计入。',
    ],
  },
  '01': {
    title: '研究安排 · 常规介绍 + 主动作答',
    bullets: [
      '请本人完成回答、查看反馈并按需回应变式追问。',
      '完成后可自由选择题库中的下一项任务。',
      '本次安排练习不计入后续合格激活，自愿练习仍会计入。',
    ],
  },
  '10': {
    title: '研究安排 · 连续任务 + 示范观看',
    bullets: [
      '围绕同一困难连续进入任务；首轮为等时示范观看模式。',
      '完成首轮后，系统会提示您继续同一难度的相关任务。',
      '安排内练习不计入合格激活；实验结束后的自愿练习计入。',
    ],
  },
  '11': {
    title: '研究安排 · 连续任务 + 主动作答',
    bullets: [
      '围绕同一困难连续进入任务，请本人完成回答与反馈流程。',
      '完成首轮后，系统会提示继续同一难度的相关任务。',
      '安排内练习不计入合格激活；实验结束后的自愿练习计入。',
    ],
  },
}

export default function ResearchExperimentOnboarding({ assignment, onDismiss }) {
  const navigate = useNavigate()
  const markOnboardingSeen = useResearchStore((s) => s.markOnboardingSeen)

  if (!assignment?.arm) return null

  const copy = ARM_COPY[assignment.arm] || {
    title: `研究安排 · 分组 ${assignment.arm}`,
    bullets: ['请按页面提示完成研究安排的首轮练习。'],
  }

  const handleStart = () => {
    markOnboardingSeen(assignment.arm)
    onDismiss?.()
    navigate('/interview/lobby?research_practice=1')
  }

  const handleLater = () => {
    markOnboardingSeen(assignment.arm)
    onDismiss?.()
  }

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="研究分组说明">
      <div className={styles.modal}>
        <div className={styles.kicker}>Experiment · Arm {assignment.arm}</div>
        <h2 className={styles.title}>{copy.title}</h2>
        <ul className={styles.list}>
          {copy.bullets.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={handleLater}>
            稍后开始
          </button>
          <button type="button" className={styles.primary} onClick={handleStart}>
            开始研究安排练习
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
