import { useMemo, useState } from 'react'
import {
  VISUAL_MODEL_META,
  auditPhraseGranularity,
  computeMatrixRankings,
  extractTeammateShortPhrases,
} from '../visualBoardModels'
import { computeFreeDiscussionGoldenStage } from '../lgdScripts'
import styles from './VisualBoardSheet.module.css'

export default function VisualBoardSheet({
  open = false,
  onClose,
  visualBoard = null,
  boardAuthorized = false,
  boardAlignmentCount = 0,
  phase = 'free_discussion',
  remainingSeconds = 420,
  totalPhaseSeconds = 600,
  messages = [],
  notes = '',
  onChangeNotes,
  onUpdateBoard,
  onRequestAuthorization,
  onBroadcastAlignment,
}) {
  const [draftPhrase, setDraftPhrase] = useState('')
  const [draftTargetBucket, setDraftTargetBucket] = useState('p0')
  const [draftParking, setDraftParking] = useState('')
  const [showRawNotes, setShowRawNotes] = useState(false)

  const goldenStage = useMemo(
    () => computeFreeDiscussionGoldenStage(remainingSeconds, totalPhaseSeconds),
    [remainingSeconds, totalPhaseSeconds],
  )

  const teammatePhrases = useMemo(
    () => extractTeammateShortPhrases(messages, 6),
    [messages],
  )

  const phraseAudit = useMemo(() => auditPhraseGranularity(draftPhrase), [draftPhrase])

  if (!open || !visualBoard) return null

  const modelType = visualBoard.modelType || 'mece_tree'
  const rankedMatrixRows =
    modelType === 'scoring_matrix'
      ? computeMatrixRankings(visualBoard.matrix, visualBoard.criteria)
      : []

  function handleSwitchModel(nextModel) {
    onUpdateBoard?.((prev) => ({ ...prev, modelType: nextModel }), { countEdit: false })
  }

  function handleToggleStageCheck(stageKey) {
    onUpdateBoard?.((prev) => ({
      ...prev,
      stageChecks: {
        ...(prev.stageChecks || {}),
        [stageKey]: !prev.stageChecks?.[stageKey],
      },
    }))
  }

  function handleCriterionChange(idx, field, value) {
    onUpdateBoard?.((prev) => {
      const next = [...(prev.criteria || [])]
      if (!next[idx]) return prev
      next[idx] = { ...next[idx], [field]: value }
      return { ...prev, criteria: next }
    })
  }

  function handleCycleWeight(idx) {
    const cur = Number(visualBoard.criteria?.[idx]?.weight) || 3
    const nextW = cur >= 5 ? 1 : cur + 1
    handleCriterionChange(idx, 'weight', nextW)
  }

  function handleMatrixCellStep(rowId, colIdx) {
    onUpdateBoard?.((prev) => {
      const rows = (prev.matrix?.rows || []).map((r) => {
        if (r.id !== rowId) return r
        const sc = [...(r.scores || [3, 3, 3])]
        sc[colIdx] = (Number(sc[colIdx]) || 3) >= 5 ? 1 : (Number(sc[colIdx]) || 3) + 1
        return { ...r, scores: sc }
      })
      return { ...prev, matrix: { ...prev.matrix, rows } }
    })
  }

  function handleMatrixLabelChange(rowId, label) {
    onUpdateBoard?.((prev) => ({
      ...prev,
      matrix: {
        ...prev.matrix,
        rows: (prev.matrix?.rows || []).map((r) => (r.id === rowId ? { ...r, label } : r)),
      },
    }))
  }

  function handleAddPhraseToModel(rawText) {
    const clean = String(rawText ?? draftPhrase).trim()
    if (!clean) return
    onUpdateBoard?.((prev) => {
      if (prev.modelType === 'scoring_matrix') {
        const nextRow = {
          id: `m-${Date.now().toString(36)}`,
          label: clean.slice(0, 12),
          scores: [4, 4, 3],
        }
        return {
          ...prev,
          matrix: { rows: [...(prev.matrix?.rows || []), nextRow].slice(0, 6) },
        }
      }
      if (prev.modelType === 'roi_quadrant') {
        const key = ['p0', 'p1', 'p2', 'p3'].includes(draftTargetBucket) ? draftTargetBucket : 'p0'
        const curList = prev.quadrant?.[key] || []
        return {
          ...prev,
          quadrant: {
            ...(prev.quadrant || {}),
            [key]: [...curList, clean.slice(0, 12)],
          },
        }
      }
      if (prev.modelType === 'mece_tree') {
        const idx = ['t1', 't2', 't3'].indexOf(draftTargetBucket)
        const targetIdx = idx >= 0 ? idx : 0
        const nextTree = (prev.tree || []).map((br, i) =>
          i === targetIdx ? { ...br, items: [...(br.items || []), clean.slice(0, 12)] } : br,
        )
        return { ...prev, tree: nextTree }
      }
      return prev
    })
    if (rawText === undefined) setDraftPhrase('')
  }

  function handleDeleteQuadrantItem(qKey, idx) {
    onUpdateBoard?.((prev) => ({
      ...prev,
      quadrant: {
        ...(prev.quadrant || {}),
        [qKey]: (prev.quadrant?.[qKey] || []).filter((_, i) => i !== idx),
      },
    }))
  }

  function handleDeleteTreeItem(branchId, idx) {
    onUpdateBoard?.((prev) => ({
      ...prev,
      tree: (prev.tree || []).map((b) =>
        b.id === branchId ? { ...b, items: (b.items || []).filter((_, i) => i !== idx) } : b,
      ),
    }))
  }

  function handleSwimlaneChange(id, field, val) {
    onUpdateBoard?.((prev) => ({
      ...prev,
      swimlane: (prev.swimlane || []).map((s) => (s.id === id ? { ...s, [field]: val } : s)),
    }))
  }

  function handleAddParking(rawText) {
    const clean = String(rawText ?? draftParking).trim()
    if (!clean) return
    onUpdateBoard?.((prev) => ({
      ...prev,
      parkingLot: [
        ...(prev.parkingLot || []),
        { id: `pk-${Date.now().toString(36)}`, text: clean.slice(0, 14) },
      ],
    }))
    if (rawText === undefined) setDraftParking('')
  }

  function handleRemoveParking(id) {
    onUpdateBoard?.((prev) => ({
      ...prev,
      parkingLot: (prev.parkingLot || []).filter((p) => p.id !== id),
    }))
  }

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="共享结构化可视化看板"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className={styles['board-modal']}>
        {/* Top Banner: Core Target + Hard Constraints + 4-Model Switcher */}
        <div className={styles['top-banner']}>
          <div className={styles['target-cluster']}>
            <span className={styles['banner-badge']}>核心目标</span>
            <input
              type="text"
              className={styles['target-input']}
              value={visualBoard.target || ''}
              onChange={(e) =>
                onUpdateBoard?.((prev) => ({ ...prev, target: e.target.value.slice(0, 26) }))
              }
              aria-label="核心目标"
            />
            {(visualBoard.constraints || []).map((c, idx) => (
              <span key={`${c}-${idx}`} className={styles['constraint-chip']}>
                硬约束 · {c}
              </span>
            ))}
          </div>

          <div className={styles['banner-right']}>
            <div className={styles['model-tabs']} role="tablist" aria-label="四大题型可视化模型">
              {VISUAL_MODEL_META.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={modelType === m.id}
                  className={`${styles['model-tab-btn']} ${modelType === m.id ? styles['model-tab-active'] : ''}`}
                  onClick={() => handleSwitchModel(m.id)}
                  title={m.solvePain}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <button type="button" className={styles['close-btn']} onClick={onClose}>
              收起看圆桌
            </button>
          </div>
        </div>

        {/* Golden Three-Column Partition */}
        <div className={styles['three-col-grid']}>
          {/* Left Column: 2:6:2 Anchors + Evaluation Criteria */}
          <section className={styles['col-pane']} aria-label="进度锚点与评判标准">
            <div className={styles['col-head']}>
              <span>左栏 · 2:6:2 节奏与标准</span>
              <span className={styles['micro-tag']}>先立标准</span>
            </div>

            <div className={styles['stage-checklist']}>
              {[
                { key: 'criteria', label: '前20% · 立标定框' },
                { key: 'debate', label: '中60% · 填方案消分歧' },
                { key: 'converge', label: '后20% · 核漏洞选代表' },
              ].map((st) => {
                const done = Boolean(visualBoard.stageChecks?.[st.key])
                const isLive = phase === 'free_discussion' && goldenStage.key === st.key
                return (
                  <button
                    key={st.key}
                    type="button"
                    className={`${styles['stage-check-btn']} ${done ? styles['stage-check-done'] : ''} ${isLive ? styles['stage-check-live'] : ''}`}
                    onClick={() => handleToggleStageCheck(st.key)}
                  >
                    <span>{st.label}</span>
                    <span>{done ? '✓' : isLive ? '→' : '○'}</span>
                  </button>
                )
              })}
            </div>

            <div className={styles['col-head']} style={{ marginTop: '4px' }}>
              <span>评判标准（点击W调权重）</span>
            </div>
            <div className={styles['criteria-list']}>
              {(visualBoard.criteria || []).map((crit, idx) => (
                <div key={crit.id || idx} className={styles['criteria-row']}>
                  <input
                    type="text"
                    className={styles['criteria-input']}
                    value={crit.label || ''}
                    placeholder={`标准${idx + 1}（2-6字）`}
                    onChange={(e) => handleCriterionChange(idx, 'label', e.target.value)}
                  />
                  <button
                    type="button"
                    className={styles['weight-pill']}
                    onClick={() => handleCycleWeight(idx)}
                    title="点击切换权重 1~5"
                  >
                    W{crit.weight || 3}
                  </button>
                </div>
              ))}
            </div>

            {phraseAudit.status === 'verbose' && (
              <div className={styles['granularity-warn']}>{phraseAudit.hint}</div>
            )}
          </section>

          {/* Center Column: Topic-Adaptive Core Canvas */}
          <section className={styles['col-pane']} aria-label="核心逻辑框架主画布">
            <div className={styles['col-head']}>
              <span>
                中栏 · {VISUAL_MODEL_META.find((m) => m.id === modelType)?.fullLabel}
              </span>
              <span className={styles['micro-tag']}>2–6字名词颗粒度</span>
            </div>

            {modelType === 'scoring_matrix' && (
              <table className={styles['matrix-table']}>
                <thead>
                  <tr>
                    <th>备选项</th>
                    {(visualBoard.criteria || []).map((c, idx) => (
                      <th key={c.id || idx}>
                        {(c.label || `标准${idx + 1}`).slice(0, 4)}(×{c.weight || 3})
                      </th>
                    ))}
                    <th>总分</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedMatrixRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <input
                          type="text"
                          className={styles['criteria-input']}
                          value={row.label}
                          onChange={(e) => handleMatrixLabelChange(row.id, e.target.value)}
                        />
                      </td>
                      {[0, 1, 2].map((colIdx) => (
                        <td key={colIdx}>
                          <button
                            type="button"
                            className={styles['score-step-btn']}
                            onClick={() => handleMatrixCellStep(row.id, colIdx)}
                            title="点击切换评分 1~5"
                          >
                            {row.scores[colIdx]}
                          </button>
                        </td>
                      ))}
                      <td>
                        <span className={styles['rank-badge']}>
                          #{row.rank} · {row.weightedTotal}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {modelType === 'roi_quadrant' && (
              <div className={styles['quadrant-grid']}>
                {[
                  { key: 'p0', title: 'P0 · 高收益低成本（速赢必保）' },
                  { key: 'p1', title: 'P1 · 高收益高成本（战略攻坚）' },
                  { key: 'p2', title: 'P2 · 低成本试水（弹性补充）' },
                  { key: 'p3', title: 'P3 · 高耗低效（果断削减/暂缓）' },
                ].map((q) => (
                  <div key={q.key} className={styles['quad-box']}>
                    <span className={styles['quad-title']}>{q.title}</span>
                    <div className={styles['pill-wrap']}>
                      {(visualBoard.quadrant?.[q.key] || []).map((item, idx) => (
                        <span key={`${item}-${idx}`} className={styles['phrase-pill']}>
                          <span>{item}</span>
                          <button
                            type="button"
                            className={styles['pill-del-btn']}
                            onClick={() => handleDeleteQuadrantItem(q.key, idx)}
                            aria-label={`移除${item}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {modelType === 'mece_tree' && (
              <div className={styles['tree-stack']}>
                {(visualBoard.tree || []).map((branch) => (
                  <div key={branch.id} className={styles['tree-card']}>
                    <div className={styles['criteria-row']}>
                      <input
                        type="text"
                        className={styles['criteria-input']}
                        value={branch.branch}
                        onChange={(e) =>
                          onUpdateBoard?.((prev) => ({
                            ...prev,
                            tree: (prev.tree || []).map((b) =>
                              b.id === branch.id ? { ...b, branch: e.target.value } : b,
                            ),
                          }))
                        }
                      />
                    </div>
                    <div className={styles['pill-wrap']}>
                      {(branch.items || []).map((item, idx) => (
                        <span key={`${item}-${idx}`} className={styles['phrase-pill']}>
                          <span>{item}</span>
                          <button
                            type="button"
                            className={styles['pill-del-btn']}
                            onClick={() => handleDeleteTreeItem(branch.id, idx)}
                            aria-label={`移除${item}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {modelType === 'swimlane_funnel' && (
              <div className={styles['swimlane-stack']}>
                {(visualBoard.swimlane || []).map((lane) => (
                  <div key={lane.id} className={styles['swimlane-card']}>
                    <div className={styles['swimlane-row']}>
                      <span className={styles['quad-title']}>{lane.stage}</span>
                      <input
                        type="text"
                        className={styles['criteria-input']}
                        value={lane.action || ''}
                        placeholder="核心动作(2-6字)"
                        onChange={(e) => handleSwimlaneChange(lane.id, 'action', e.target.value)}
                      />
                      <input
                        type="text"
                        className={styles['criteria-input']}
                        value={lane.metric || ''}
                        placeholder="量化指标(KPI)"
                        onChange={(e) => handleSwimlaneChange(lane.id, 'metric', e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {modelType !== 'swimlane_funnel' && (
              <div className={styles['inline-add-row']}>
                {(modelType === 'roi_quadrant' || modelType === 'mece_tree') && (
                  <select
                    className={styles['weight-pill']}
                    value={draftTargetBucket}
                    onChange={(e) => setDraftTargetBucket(e.target.value)}
                    aria-label="选择归属分支"
                  >
                    {modelType === 'roi_quadrant' ? (
                      <>
                        <option value="p0">P0</option>
                        <option value="p1">P1</option>
                        <option value="p2">P2</option>
                        <option value="p3">P3</option>
                      </>
                    ) : (
                      (visualBoard.tree || []).map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.branch.slice(0, 4)}
                        </option>
                      ))
                    )}
                  </select>
                )}
                <input
                  type="text"
                  className={styles['criteria-input']}
                  placeholder="输入 2–6 字短词锚点（如：私域裂变）…"
                  value={draftPhrase}
                  onChange={(e) => setDraftPhrase(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddPhraseToModel()}
                />
                <button
                  type="button"
                  className={styles['mini-add-btn']}
                  onClick={() => handleAddPhraseToModel()}
                >
                  + 填入
                </button>
              </div>
            )}

            {teammatePhrases.length > 0 && (
              <div className={styles['teammate-capture-strip']}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>拾取队友短词：</span>
                {teammatePhrases.map((tp) => (
                  <button
                    key={tp.phrase}
                    type="button"
                    className={styles['capture-chip']}
                    onClick={() =>
                      tp.isDigression
                        ? handleAddParking(tp.phrase)
                        : handleAddPhraseToModel(tp.phrase)
                    }
                    title={
                      tp.isDigression
                        ? `来自${tp.fromSpeaker}（点击收入右侧 Parking Lot）`
                        : `来自${tp.fromSpeaker}（点击填入主画布）`
                    }
                  >
                    {tp.isDigression ? `🅿 ${tp.phrase}` : `+ ${tp.phrase}`}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Right Column: Consensus Lock & Parking Lot */}
          <section className={styles['col-pane']} aria-label="决策辅助与暂存区">
            <div className={styles['col-head']}>
              <span>右栏 · 共识与暂存区</span>
              <span className={styles['micro-tag']}>Parking Lot</span>
            </div>

            <button
              type="button"
              className={`${styles['consensus-lock-btn']} ${visualBoard.consensusLocked ? styles['consensus-lock-on'] : ''}`}
              onClick={() =>
                onUpdateBoard?.((prev) => ({
                  ...prev,
                  consensusLocked: !prev.consensusLocked,
                }))
              }
            >
              {visualBoard.consensusLocked ? '✅ 已锁定唯一团队共识' : '🔒 点击锁定唯一团队共识'}
            </button>

            <div className={styles['col-head']} style={{ marginTop: '4px' }}>
              <span>Parking Lot（超纲/长期展望）</span>
            </div>

            <div className={styles['parking-list']}>
              {(visualBoard.parkingLot || []).length === 0 ? (
                <span className={styles['parking-empty']}>
                  队友跑题或超预算亮点放入此处，汇报时作“长期展望”既尊重队友又稳主线
                </span>
              ) : (
                (visualBoard.parkingLot || []).map((pk) => (
                  <div key={pk.id} className={styles['parking-item']}>
                    <span>🅿 {pk.text}</span>
                    <button
                      type="button"
                      className={styles['pill-del-btn']}
                      onClick={() => handleRemoveParking(pk.id)}
                      aria-label={`移除暂存项${pk.text}`}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className={styles['inline-add-row']}>
              <input
                type="text"
                className={styles['criteria-input']}
                placeholder="暂存超纲点子…"
                value={draftParking}
                onChange={(e) => setDraftParking(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddParking()}
              />
              <button
                type="button"
                className={styles['mini-add-btn']}
                onClick={() => handleAddParking()}
              >
                暂存
              </button>
            </div>

            <button
              type="button"
              className={styles['capture-chip']}
              style={{ alignSelf: 'flex-start', marginTop: '4px' }}
              onClick={() => setShowRawNotes((v) => !v)}
            >
              {showRawNotes ? '收起自由速记' : '📝 展开自由速记草稿'}
            </button>

            {showRawNotes && (
              <textarea
                className={styles['raw-notes-box']}
                placeholder="补充个人速记..."
                value={notes}
                onChange={(e) => onChangeNotes?.(e.target.value)}
              />
            )}
          </section>
        </div>

        {/* Bottom Iron-Law Action Bar: Team Authorization & Turn-the-Paper Alignment */}
        <div className={styles['bottom-bar']}>
          <span className={styles['iron-law-status']}>
            {boardAuthorized
              ? `📊 已获团队授权控屏 · 已同步对齐 ${boardAlignmentCount} 次（终局自动作为可视化草稿交考官核分）`
              : '铁律1：切忌强行霸屏，请先发起团队授权再投屏对齐全场'}
          </span>

          <div className={styles['action-group']}>
            {!boardAuthorized ? (
              <button
                type="button"
                className={styles['auth-btn']}
                onClick={onRequestAuthorization}
              >
                🙋 申请团队授权投屏
              </button>
            ) : (
              <button
                type="button"
                className={styles['align-btn']}
                onClick={onBroadcastAlignment}
              >
                🔄 转纸对齐全场焦点
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
