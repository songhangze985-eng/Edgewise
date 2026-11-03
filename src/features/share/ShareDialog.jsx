import { useCallback, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import RevisionCard from './RevisionCard'
import { createShareCard, createPair, revokeShareCard } from '../../api/share'
import { getErrorMessage } from '../../api/client'
import { trackResearchEvent } from '../../research/track'
import styles from './ShareDialog.module.css'

const METHOD_BY_GAP = {
  contribution: '解释个人贡献时，先区分团队目标和自己的具体行动。',
  evidence: '补充结果时，尽量给出数字、周期、规模或具体方法，便于对方核查。',
  structure: '重述经历时，可按「背景 → 任务 → 行动 → 结果」组织语言。',
  causality: '说明关键决策时，讲清因为什么、采取了什么、最终产生了什么影响。',
  relevance: '先点明题目在问什么，再给出与题眼直接相关的事例。',
}

function buildPreview(question) {
  const rev = question.revision || {}
  const fb = rev.feedback || {}
  const gapKey = fb.gap_key || fb.gap_type || 'contribution'
  const gapLabel = fb.gap_label || gapKey
  const methodText = METHOD_BY_GAP[gapKey] || METHOD_BY_GAP.contribution
  const probeText = fb.probe_question || rev.probe_question || '你个人具体负责哪一部分、采取了哪些行动？'
  const sourceText = rev.revised_answer || rev.initial_answer || question.answer || ''
  return {
    questionTitle: question.title,
    gapLabel,
    methodText,
    probeText,
    sourceText,
  }
}

export default function ShareDialog({ sessionId, question, onClose }) {
  const preview = buildPreview(question)
  const cardRef = useRef(null)
  const [includeExcerpt, setIncludeExcerpt] = useState(false)
  const [excerpt, setExcerpt] = useState('')
  const [shareId, setShareId] = useState(null)
  const [shareUrl, setShareUrl] = useState('')
  const [pairPath, setPairPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const excerptValue = excerpt.slice(0, 80)

  const handleCreate = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await createShareCard({
        session_id: sessionId,
        question_id: question.id,
        include_excerpt: includeExcerpt,
        excerpt: includeExcerpt ? excerptValue : null,
      })
      const url = `${window.location.origin}${data.share_path}`
      setShareId(data.share_id)
      setShareUrl(url)
    } catch (err) {
      setError(getErrorMessage(err, '生成失败'))
    } finally {
      setLoading(false)
    }
  }, [sessionId, question.id, includeExcerpt, excerptValue])

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      /* ignore */
    }
  }, [shareUrl])

  const handleExportPng = useCallback(async () => {
    if (!cardRef.current) return
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2 })
      const link = document.createElement('a')
      link.download = `edgewise-revision-${shareId || 'preview'}.png`
      link.href = dataUrl
      link.click()
    } catch {
      setError('导出图片失败')
    }
  }, [shareId])

  const handleRevoke = useCallback(async () => {
    if (!shareId) return
    setLoading(true)
    setError('')
    try {
      await revokeShareCard(shareId)
      setShareUrl('')
    } catch (err) {
      setError(getErrorMessage(err, '撤回失败'))
    } finally {
      setLoading(false)
    }
  }, [shareId])

  const handleCreatePair = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await createPair({
        probe_text: preview.probeText,
        share_id: shareId,
      })
      const url = `${window.location.origin}${data.pair_path}`
      setPairPath(url)
    } catch (err) {
      setError(getErrorMessage(err, '创建双人追问失败'))
    } finally {
      setLoading(false)
    }
  }, [preview.probeText, shareId])

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.dialog}>
        <div className={styles.header}>
          <span className={styles.title}>分享修订卡</span>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className={styles.previewWrap}>
          <RevisionCard
            cardRef={cardRef}
            questionTitle={preview.questionTitle}
            gapLabel={preview.gapLabel}
            methodText={preview.methodText}
            probeText={preview.probeText}
            includeExcerpt={includeExcerpt}
            excerpt={excerptValue}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={includeExcerpt}
              onChange={(e) => setIncludeExcerpt(e.target.checked)}
            />
            <span>加入我的片段（可选，最多 80 字，由你自行选取）</span>
          </label>
          {includeExcerpt ? (
            <>
              <textarea
                className={styles.excerptInput}
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value.slice(0, 80))}
                placeholder="从原文复制你想展示的一小段…"
                maxLength={80}
              />
              <p className={styles.hint}>
                可粘贴来源：
                {(preview.sourceText || '').slice(0, 120)}
                {(preview.sourceText || '').length > 120 ? '…' : ''}
              </p>
            </>
          ) : null}
        </div>

        <p className={styles.warn}>
          撤回后链接将显示「分享者已撤回」。已截图或已复制的内容无法收回，请谨慎选择是否加入个人片段。
        </p>

        {shareUrl ? (
          <div className={styles.linkRow}>
            <input className={styles.linkInput} readOnly value={shareUrl} />
            <button type="button" className={styles.btn} onClick={handleCopy}>
              复制链接
            </button>
          </div>
        ) : null}

        {pairPath ? (
          <div className={styles.linkRow}>
            <input className={styles.linkInput} readOnly value={pairPath} />
          </div>
        ) : null}

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.actions}>
          {!shareId ? (
            <button type="button" className={styles.btn} disabled={loading} onClick={handleCreate}>
              {loading ? '生成中…' : '生成分享链接'}
            </button>
          ) : (
            <>
              <button type="button" className={styles.btnSecondary} onClick={handleExportPng}>
                导出图片
              </button>
              <button type="button" className={styles.btnSecondary} disabled={loading} onClick={handleCreatePair}>
                发起双人追问
              </button>
              <button type="button" className={styles.btnDanger} disabled={loading} onClick={handleRevoke}>
                撤回分享
              </button>
            </>
          )}
          <button type="button" className={styles.btnSecondary} onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
