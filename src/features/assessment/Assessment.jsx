import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PageBar from '../../components/ui/PageBar'
import {
  completeAssessmentSession,
  createAssessmentSession,
  submitAssessmentAnswer,
} from '../../api/assessment'
import { getErrorMessage } from '../../api/client'
import { showToast } from '../../stores/toastStore'
import { sanitizeHtml } from '../../utils/sanitizeHtml'
import styles from './Assessment.module.css'

const PHASE = {
  INTRO: 'intro',
  APTITUDE: 'aptitude',
  PERSONALITY: 'personality',
  REPORT: 'report',
}

function formatTimer(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function categoryLabel(blocks, cat) {
  const row = (blocks || []).find((b) => b.category === cat)
  return row?.label || cat
}

export default function Assessment() {
  const [phase, setPhase] = useState(PHASE.INTRO)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(false)
  const [blockIndex, setBlockIndex] = useState(0)
  const [qIndexInBlock, setQIndexInBlock] = useState(0)
  const [personalityIndex, setPersonalityIndex] = useState(0)
  const [blockRemaining, setBlockRemaining] = useState(0)
  const blockStartedRef = useRef(null)
  const itemStartedRef = useRef(null)
  const blockExpireHandledRef = useRef(false)

  const blocks = session?.aptitude_blocks || []
  const currentBlock = blocks[blockIndex]
  const blockItems = useMemo(() => {
    if (!currentBlock) return []
    return (session?.aptitude_items || []).filter((i) => i.category === currentBlock.category)
  }, [session, currentBlock])
  const currentAptitudeItem = blockItems[qIndexInBlock]
  const personalityItems = session?.personality_items || []
  const currentPersonality = personalityItems[personalityIndex]

  const syncBlockTimer = useCallback(() => {
    if (!currentBlock) return
    setBlockRemaining(currentBlock.time_limit_sec || 180)
    blockStartedRef.current = Date.now()
    itemStartedRef.current = Date.now()
  }, [currentBlock])

  useEffect(() => {
    if (phase !== PHASE.APTITUDE || !currentBlock) return undefined
    blockExpireHandledRef.current = false
    syncBlockTimer()
    const id = window.setInterval(() => {
      setBlockRemaining((prev) => {
        if (prev <= 1) return 0
        return prev - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [phase, blockIndex, currentBlock?.category, syncBlockTimer])

  const flushBlockTime = useCallback(async () => {
    if (!session?.id || !currentBlock) return
    const spent = Math.max(
      0,
      Math.round((Date.now() - (blockStartedRef.current || Date.now())) / 1000),
    )
    try {
      const next = await submitAssessmentAnswer(session.id, {
        section: 'aptitude',
        block_category: currentBlock.category,
        block_time_spent_sec: spent,
      })
      setSession(next)
    } catch {
      /* best effort */
    }
  }, [session?.id, currentBlock])

  useEffect(() => {
    if (phase !== PHASE.APTITUDE || blockRemaining !== 0 || !currentBlock) return
    if (blockExpireHandledRef.current) return
    blockExpireHandledRef.current = true
    let cancelled = false
    ;(async () => {
      await flushBlockTime()
      if (cancelled) return
      if (blockIndex + 1 < blocks.length) {
        setBlockIndex((i) => i + 1)
        setQIndexInBlock(0)
      } else {
        setPhase(PHASE.PERSONALITY)
        setPersonalityIndex(0)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [blockRemaining, phase, blockIndex, blocks.length, currentBlock, flushBlockTime])

  const handleStart = async () => {
    setLoading(true)
    try {
      const data = await createAssessmentSession()
      setSession(data)
      setBlockIndex(0)
      setQIndexInBlock(0)
      setPersonalityIndex(0)
      setPhase(PHASE.APTITUDE)
    } catch (err) {
      showToast(getErrorMessage(err, '无法开始测评'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const itemElapsedSec = () =>
    Math.max(0, Math.round((Date.now() - (itemStartedRef.current || Date.now())) / 1000))

  const submitAptitudeChoice = async (choiceIndex) => {
    if (!session?.id || !currentAptitudeItem) return
    setLoading(true)
    try {
      const next = await submitAssessmentAnswer(session.id, {
        section: 'aptitude',
        item_id: currentAptitudeItem.id,
        choice_index: choiceIndex,
        time_spent_sec: itemElapsedSec(),
      })
      setSession(next)
      itemStartedRef.current = Date.now()
      if (qIndexInBlock + 1 < blockItems.length) {
        setQIndexInBlock((i) => i + 1)
      } else if (blockIndex + 1 < blocks.length) {
        await flushBlockTime()
        setBlockIndex((i) => i + 1)
        setQIndexInBlock(0)
      } else {
        await flushBlockTime()
        setPhase(PHASE.PERSONALITY)
        setPersonalityIndex(0)
      }
    } catch (err) {
      showToast(getErrorMessage(err, '保存答案失败'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const skipAptitudeItem = async () => {
    if (!session?.id || !currentAptitudeItem) return
    setLoading(true)
    try {
      const next = await submitAssessmentAnswer(session.id, {
        section: 'aptitude',
        item_id: currentAptitudeItem.id,
        time_spent_sec: itemElapsedSec(),
      })
      setSession(next)
      itemStartedRef.current = Date.now()
      if (qIndexInBlock + 1 < blockItems.length) {
        setQIndexInBlock((i) => i + 1)
      } else if (blockIndex + 1 < blocks.length) {
        await flushBlockTime()
        setBlockIndex((i) => i + 1)
        setQIndexInBlock(0)
      } else {
        await flushBlockTime()
        setPhase(PHASE.PERSONALITY)
      }
    } catch (err) {
      showToast(getErrorMessage(err, '跳过失败'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const submitPersonalityChoice = async (choice) => {
    if (!session?.id || !currentPersonality) return
    setLoading(true)
    try {
      const next = await submitAssessmentAnswer(session.id, {
        section: 'personality',
        item_id: currentPersonality.id,
        choice,
      })
      setSession(next)
      if (personalityIndex + 1 < personalityItems.length) {
        setPersonalityIndex((i) => i + 1)
      } else {
        const done = await completeAssessmentSession(session.id)
        setSession(done)
        setPhase(PHASE.REPORT)
      }
    } catch (err) {
      showToast(getErrorMessage(err, '保存选择失败'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const skipPersonality = async () => {
    if (!session?.id || !currentPersonality) return
    setLoading(true)
    try {
      if (personalityIndex + 1 < personalityItems.length) {
        setPersonalityIndex((i) => i + 1)
      } else {
        const done = await completeAssessmentSession(session.id)
        setSession(done)
        setPhase(PHASE.REPORT)
      }
    } catch (err) {
      showToast(getErrorMessage(err, '提交失败'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const report = session?.report
  const aptByCat = report?.aptitude?.by_category || {}

  return (
    <div className={styles.page}>
      <PageBar title="在线测评练习" />

      {phase === PHASE.INTRO && (
        <>
          <span className={styles.badge}>谈锋自编练习题</span>
          <p className={styles.lead}>
            行测样题（言语 / 数量 / 图形 / 资料）分块限时练习，随后为性格迫选题。
            本模块不进入实验任务，不对应任何官方题库或商业量表；未作答题目记为空。
          </p>
          <div className={styles.panel}>
            <p className={styles.muted}>
              图形题含 SVG 示意；性格部分仅提示作答一致性，不会给出「标准答案」。
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleStart}
                disabled={loading}
              >
                {loading ? '准备中…' : '开始练习'}
              </button>
            </div>
          </div>
        </>
      )}

      {phase === PHASE.APTITUDE && currentBlock && currentAptitudeItem && (
        <div className={styles.panel}>
          <div className={styles.blockHead}>
            <h2 className={styles.blockTitle}>
              {currentBlock.label}
              {' '}
              · 块
              {blockIndex + 1}
              /
              {blocks.length}
            </h2>
            <span
              className={`${styles.timer} ${blockRemaining <= 30 ? styles.timerWarn : ''}`}
              aria-live="polite"
            >
              {formatTimer(blockRemaining)}
            </span>
          </div>
          <p className={styles.progress}>
            本题
            {qIndexInBlock + 1}
            /
            {blockItems.length}
          </p>
          <p className={styles.stem}>{currentAptitudeItem.stem}</p>
          {currentAptitudeItem.figural_svg && (
            <div
              className={styles.figural}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(currentAptitudeItem.figural_svg) }}
            />
          )}
          <div className={styles.options} role="listbox" aria-label="选项">
            {(currentAptitudeItem.options || []).map((opt, idx) => (
              <button
                key={opt}
                type="button"
                className={`${styles.option} ${
                  currentAptitudeItem.choice_index === idx ? styles.optionSelected : ''
                }`}
                disabled={loading}
                onClick={() => submitAptitudeChoice(idx)}
              >
                {String.fromCharCode(65 + idx)}
                .
                {' '}
                {opt}
              </button>
            ))}
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.btnGhost}
              disabled={loading}
              onClick={skipAptitudeItem}
            >
              跳过本题
            </button>
          </div>
        </div>
      )}

      {phase === PHASE.PERSONALITY && currentPersonality && (
        <div className={styles.panel}>
          <p className={styles.progress}>
            迫选题
            {personalityIndex + 1}
            /
            {personalityItems.length}
          </p>
          <p className={styles.stem}>请选择更符合你日常倾向的一项（无对错，按第一反应）。</p>
          <div className={styles.options}>
            <button
              type="button"
              className={styles.option}
              disabled={loading}
              onClick={() => submitPersonalityChoice('A')}
            >
              A.
              {' '}
              {currentPersonality.option_a}
            </button>
            <button
              type="button"
              className={styles.option}
              disabled={loading}
              onClick={() => submitPersonalityChoice('B')}
            >
              B.
              {' '}
              {currentPersonality.option_b}
            </button>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.btnGhost}
              disabled={loading}
              onClick={skipPersonality}
            >
              跳过
            </button>
          </div>
        </div>
      )}

      {phase === PHASE.REPORT && report && (
        <div className={styles.panel}>
          <span className={styles.badge}>练习报告</span>
          <h2 className={styles.blockTitle}>行测样题</h2>
          <div className={styles.reportGrid}>
            {Object.entries(aptByCat).map(([cat, row]) => (
              <div key={cat} className={styles.reportRow}>
                <span>{row.label || categoryLabel(blocks, cat)}</span>
                <span>
                  正确
                  {row.correct ?? 0}
                  /
                  {row.answered ?? 0}
                  {' '}
                  · 用时
                  {row.time_spent_sec ?? 0}
                  s
                  {' '}
                  · 正确率
                  {row.accuracy != null ? `${Math.round(row.accuracy * 100)}%` : '—'}
                </span>
              </div>
            ))}
          </div>

          <h2 className={styles.blockTitle} style={{ marginTop: '1.5rem' }}>
            性格一致性
          </h2>
          <p className={styles.muted}>
            一致性得分：
            {report.personality?.consistency_score != null
              ? Math.round(report.personality.consistency_score * 100)
              : '—'}
            %
            （检验
            {report.personality?.pair_count ?? 0}
            组相似题）
          </p>
          {report.personality?.tip && (
            <div className={styles.tip} role="status">
              {report.personality.tip}
            </div>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.btnPrimary} onClick={handleStart}>
              再练一次
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
