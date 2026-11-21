import { useEffect, useMemo, useRef } from 'react'
import {
  buildClientMilestoneLedger,
  computeZoneWatchSeats,
  resolveParticipantSeat,
} from '../lgdScripts'
import styles from './RoomSlideDrawers.module.css'

function formatClock(seconds) {
  const safe = Math.max(0, Number(seconds) || 0)
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function RoomSlideDrawers({
  openDrawer = null,
  onCloseDrawer,
  seatDrawDone = false,
  phase = 'reading',
  readingCollapsed = false,
  onCollapseReading,
  onAdvanceFromReading,
  remainingSeconds = 0,
  topic = '',
  material = '',
  notes = '',
  onChangeNotes,
  messages = [],
  findAgent,
  liveSummary = null,
  onSyncSummaryToNotes,
  seatMap = null,
  userSeat = 4,
  userIdentityKey = 'undetermined',
  electedReporterId = null,
  onElectReporter,
  observerTags = [],
  participantRoles = {},
  advancementQuota = 3,
  score = null,
  lgdMetrics = null,
  onBackLobby,
  onProceedSingleInterview,
}) {
  const listEndRef = useRef(null)
  const nonSystemMsgs = useMemo(
    () => (messages || []).filter((m) => !m.isSystem && m.role !== 'system'),
    [messages],
  )
  const zoneWatchSeats = useMemo(() => computeZoneWatchSeats(userSeat), [userSeat])
  const liveMilestoneLedger = useMemo(
    () => buildClientMilestoneLedger(messages, seatMap, participantRoles),
    [messages, seatMap, participantRoles],
  )

  useEffect(() => {
    if (openDrawer === 'transcript' && listEndRef.current) {
      listEndRef.current.scrollTop = listEndRef.current.scrollHeight
    }
  }, [openDrawer, messages.length])

  const showReadingOverlay =
    seatDrawDone && phase === 'reading' && !readingCollapsed && openDrawer !== 'material'

  return (
    <>
      {/* 1. Lightweight Reading Sheet (collapsible so user can inspect the pure roundtable anytime) */}
      {(showReadingOverlay || openDrawer === 'material') && (
        <div
          className={styles.backdrop}
          role="dialog"
          aria-modal="true"
          aria-label="讨论材料"
          onClick={(e) => {
            if (e.target !== e.currentTarget) return
            if (showReadingOverlay) onCollapseReading?.()
            else onCloseDrawer?.()
          }}
        >
          <div className={styles['sheet-card']}>
            <div className={styles['sheet-head']}>
              <h2 className={styles['sheet-title']}>{topic || '群面讨论材料'}</h2>
              {showReadingOverlay ? (
                <button
                  type="button"
                  className={styles['icon-close-btn']}
                  onClick={onCollapseReading}
                >
                  收起看桌面
                </button>
              ) : (
                <button
                  type="button"
                  className={styles['icon-close-btn']}
                  onClick={onCloseDrawer}
                >
                  关闭
                </button>
              )}
            </div>
            <div className={styles['sheet-body']}>{material}</div>
            {showReadingOverlay && (
              <div className={styles['sheet-foot']}>
                <span className={styles['sheet-timer']}>{formatClock(remainingSeconds)}</span>
                <div className={styles['sheet-foot-actions']}>
                  <button
                    type="button"
                    className={styles['primary-pill-btn']}
                    onClick={onAdvanceFromReading}
                  >
                    进入发言
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Right Slide-Over Transcript & Consensus Drawer (`💬`) */}
      {openDrawer === 'transcript' && (
        <div
          className={styles['drawer-backdrop']}
          role="dialog"
          aria-modal="true"
          aria-label="发言记录与共识"
          onClick={(e) => e.target === e.currentTarget && onCloseDrawer?.()}
        >
          <aside className={styles['slide-drawer']}>
            <div className={styles['drawer-head']}>
              <span className={styles['drawer-title']}>发言记录 ({messages.length})</span>
              <button type="button" className={styles['icon-close-btn']} onClick={onCloseDrawer}>
                收起
              </button>
            </div>

            <div className={styles['consensus-strip']}>
              <div className={styles['consensus-row']}>
                <span>
                  共识：
                  {liveSummary?.agreedPoints?.length
                    ? liveSummary.agreedPoints[liveSummary.agreedPoints.length - 1]
                    : '待收敛'}
                </span>
                <button
                  type="button"
                  className={styles['sync-note-btn']}
                  onClick={onSyncSummaryToNotes}
                >
                  存至笔记
                </button>
              </div>
              <div className={styles['reporter-row']}>
                <span style={{ fontSize: '11px', color: 'var(--chalk-dim)' }}>汇报人：</span>
                {[
                  { id: 'user', label: `${userSeat}号·我` },
                  { id: 'logician', label: `${resolveParticipantSeat('logician', seatMap)}号·李理` },
                  { id: 'mediator', label: `${resolveParticipantSeat('mediator', seatMap)}号·王和` },
                  {
                    id: 'timekeeper',
                    label: `${resolveParticipantSeat('timekeeper', seatMap)}号·刘时`,
                  },
                ].map((cand) => {
                  const active =
                    electedReporterId === cand.id ||
                    (!electedReporterId && cand.id === 'user' && userIdentityKey === 'reporter')
                  return (
                    <button
                      key={cand.id}
                      type="button"
                      className={`${styles['reporter-chip']} ${active ? styles['reporter-chip-active'] : ''}`}
                      onClick={() => onElectReporter?.(cand.id)}
                    >
                      {cand.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className={styles['transcript-list']} ref={listEndRef}>
              {messages.length === 0 && (
                <div className={styles['sys-line']}>暂无发言记录</div>
              )}
              {messages.map((msg) => {
                if (msg.isSystem) {
                  return (
                    <div key={msg.id} className={styles['sys-line']}>
                      {msg.content}
                    </div>
                  )
                }
                const ag = findAgent?.(msg.senderId)
                return (
                  <div key={msg.id} className={styles['msg-item']}>
                    <div
                      className={styles['msg-avatar']}
                      style={{ borderColor: ag?.color || undefined }}
                    >
                      {ag?.emoji || '👤'}
                    </div>
                    <div className={styles['msg-main']}>
                      <div className={styles['msg-meta']}>
                        <span className={styles['msg-speaker']}>
                          {ag?.seat ? `${ag.seat}号·` : ''}
                          {msg.senderName}
                        </span>
                        {msg.senderRole && (
                          <span className={styles['msg-tag']}>{msg.senderRole}</span>
                        )}
                        {msg.meta?.claimed_role_label && (
                          <span className={styles['msg-tag']}>
                            认领 {msg.meta.claimed_role_label}
                          </span>
                        )}
                        {msg.meta?.interrupted_by_user && (
                          <span className={styles['msg-tag']}>被打断</span>
                        )}
                      </div>
                      <div className={styles['msg-bubble']}>{msg.content}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </aside>
        </div>
      )}

      {/* 3. Non-Blocking Floating Listener Scratchpad (`📝 边听边记`, Zero Backdrop Obstruction) */}
      {openDrawer === 'notes' && (
        <div
          className={styles['listener-pad-popover']}
          role="region"
          aria-label="边听边记浮动速记本"
        >
          <div className={styles['observer-head']}>
            <span>📝 边听边记（不遮挡圆桌）</span>
            <button type="button" className={styles['icon-close-btn']} onClick={onCloseDrawer}>
              收起
            </button>
          </div>
          <div className={styles['listener-quick-row']}>
            {['【标准】', '【共识】', '【分歧】'].map((prefix) => (
              <button
                key={prefix}
                type="button"
                className={styles['listener-quick-chip']}
                onClick={() =>
                  onChangeNotes?.(notes ? `${notes}\n${prefix}` : prefix)
                }
              >
                +{prefix.slice(1, -1)}
              </button>
            ))}
            {nonSystemMsgs.length > 0 && (
              <button
                type="button"
                className={styles['listener-quick-chip']}
                onClick={() => {
                  const latest = nonSystemMsgs[nonSystemMsgs.length - 1]
                  const ag = latest.isUser ? { seat: userSeat } : findAgent?.(latest.senderId)
                  const who = `${ag?.seat ? `${ag.seat}号·` : ''}${latest.senderName}`
                  const snippet = String(latest.content || '').slice(0, 56)
                  onChangeNotes?.(
                    notes ? `${notes}\n[${who}] ${snippet}` : `[${who}] ${snippet}`,
                  )
                }}
              >
                +摘录最新发言
              </button>
            )}
          </div>
          <textarea
            className={styles['notes-textarea']}
            rows={7}
            placeholder="未发言倾听时可随时速记队友号位与核心论点（计入倾听速记复盘）..."
            value={notes}
            onChange={(e) => onChangeNotes?.(e.target.value)}
          />
        </div>
      )}

      {/* 4. Side-Channel Three-Examiner Panel Popover (`👁`) */}
      {openDrawer === 'observer' && (
        <div className={styles['observer-popover']} role="region" aria-label="三面试官协同观察台">
          <div className={styles['observer-head']}>
            <span>三面试官观察台 · 8进{advancementQuota || 3}</span>
            <button type="button" className={styles['icon-close-btn']} onClick={onCloseDrawer}>
              关闭
            </button>
          </div>

          <div className={styles['examiner-roster-strip']}>
            <div className={styles['examiner-roster-row']}>
              <strong>主面试官 · 顾总监</strong>
              <span style={{ color: 'var(--chalk-dim)' }}>主持/逻辑架构 (30%)</span>
            </div>
            <div className={styles['examiner-roster-row']}>
              <strong>副面试官A · 苏经理</strong>
              <span className={styles['examiner-zone-pill']}>
                盯梢 {zoneWatchSeats.join('/')}号
              </span>
            </div>
            <div className={styles['examiner-roster-row']}>
              <strong>副面试官B · 周PM</strong>
              <span style={{ color: 'var(--chalk-dim)' }}>
                里程碑账本 ({liveMilestoneLedger.length}项)
              </span>
            </div>
          </div>

          {liveMilestoneLedger.length > 0 && (
            <div className={styles['milestone-mini-box']}>
              <div style={{ fontWeight: 600, color: '#38bdf8' }}>
                ⏱ 周PM · 实时关键节点账本
              </div>
              {liveMilestoneLedger.slice(-3).map((m, i) => (
                <div key={`${m.ts_label}-${m.seat}-${i}`} className={styles['milestone-mini-row']}>
                  <span>
                    [{m.ts_label}] {m.speaker} · {m.milestone}
                  </span>
                  <span className={m.impact >= 0 ? styles['delta-pos'] : styles['delta-warn']}>
                    {m.impact > 0 ? `+${m.impact}` : m.impact}
                  </span>
                </div>
              ))}
            </div>
          )}

          {observerTags.length === 0 ? (
            <div style={{ fontSize: '11.5px', color: 'var(--chalk-dim)' }}>
              你（{userSeat}号，位于苏经理重点盯梢半区）发言后将实时生成三考官独立行为锚点。
            </div>
          ) : (
            observerTags
              .slice()
              .reverse()
              .map((item, idx) => {
                const warn = item.polarity === 'warning' || (item.delta ?? 0) < 0
                return (
                  <div key={item.id || `${item.tag}-${idx}`} className={styles['observer-item']}>
                    <div className={styles['observer-item-top']}>
                      <strong>
                        {item.examiner_name || (item.examiner === 'business' ? '主面试官 · 顾总监' : '副面试官A · 苏经理')}
                      </strong>
                      <span className={warn ? styles['delta-warn'] : styles['delta-pos']}>
                        {(item.delta ?? 0) > 0 ? `+${item.delta}` : item.delta} {item.tag}
                      </span>
                    </div>
                    {item.quote && (
                      <div style={{ color: 'var(--chalk-dim)' }}>「{item.quote}」</div>
                    )}
                  </div>
                )
              })
          )}
        </div>
      )}

      {/* 5. Completed Session Final Evaluation & Calibration Sheet */}
      {phase === 'completed' && score && (
        <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="群面评估报告">
          <div className={styles['eval-card']}>
            <h2 className={styles['eval-title']}>
              群面终审报告（{userSeat}号席位 · {lgdMetrics?.calibration?.ratio_label || `8进${advancementQuota || 3}`}）
            </h2>

            {lgdMetrics?.calibration && (
              <div
                className={`${styles['calib-verdict-banner']} ${lgdMetrics.calibration.user_promoted ? styles['calib-verdict-pass'] : styles['calib-verdict-fail']}`}
              >
                <div className={styles['calib-verdict-top']}>
                  <span>{lgdMetrics.calibration.summary_verdict}</span>
                  <span>综合终分 {score.overall ?? '—'}</span>
                </div>
                <div style={{ color: 'var(--chalk-dim)', fontSize: '11.5px' }}>
                  正式晋级名单：
                  {lgdMetrics.calibration.promoted_roster?.length
                    ? lgdMetrics.calibration.promoted_roster.join('、')
                    : '本组无候选人达标'}
                  {lgdMetrics.calibration.veto_reason
                    ? ` ｜ 否决原因：${lgdMetrics.calibration.veto_reason}`
                    : ''}
                </div>
              </div>
            )}

            <div className={styles['kpi-grid']}>
              <div className={styles['kpi-box']}>
                <div className={styles['kpi-val']}>{score.overall ?? '—'}</div>
                <div className={styles['kpi-lbl']}>校准综合分</div>
              </div>
              <div className={styles['kpi-box']}>
                <div className={styles['kpi-val']}>
                  {lgdMetrics?.five_dim_rubric?.weighted_total ?? score.overall ?? '—'}
                </div>
                <div className={styles['kpi-lbl']}>五维加权分</div>
              </div>
              <div className={styles['kpi-box']}>
                <div className={styles['kpi-val']}>
                  {lgdMetrics?.calibration?.user_rank
                    ? `#${lgdMetrics.calibration.user_rank}/8`
                    : (lgdMetrics?.talk_share?.display ?? '—')}
                </div>
                <div className={styles['kpi-lbl']}>全场校准排名</div>
              </div>
              <div className={styles['kpi-box']}>
                <div className={styles['kpi-val']}>
                  {lgdMetrics?.examiner_panel?.milestone_scribe_b?.milestone_hits != null
                    ? `${lgdMetrics.examiner_panel.milestone_scribe_b.milestone_hits}项`
                    : (lgdMetrics?.progress?.display ?? '—')}
                </div>
                <div className={styles['kpi-lbl']}>关键里程碑</div>
              </div>
            </div>

            {/* Three-Examiner Independent Scorecards */}
            {lgdMetrics?.examiner_panel && (
              <div className={styles['examiner-three-grid']}>
                {[
                  lgdMetrics.examiner_panel.lead_examiner,
                  lgdMetrics.examiner_panel.zone_observer_a,
                  lgdMetrics.examiner_panel.milestone_scribe_b,
                ]
                  .filter(Boolean)
                  .map((ex) => (
                    <div key={ex.id} className={styles['eval-subcard']}>
                      <div className={styles['eval-subhead']}>
                        <span>{ex.short_name || ex.name}</span>
                        <strong>
                          {ex.score != null ? `${ex.score}分` : '—'} · {ex.verdict}
                        </strong>
                      </div>
                      <span>{ex.comment}</span>
                    </div>
                  ))}
              </div>
            )}

            {/* Authentic Five-Dimension Weighted Rubric Matrix (30% / 25% / 20% / 15% / 10%) */}
            {Array.isArray(lgdMetrics?.five_dim_rubric?.dimensions) &&
              lgdMetrics.five_dim_rubric.dimensions.length > 0 && (
                <div className={styles['eval-subcard']}>
                  <div className={styles['eval-subhead']}>
                    <span>真实五维百分制加权打分矩阵（30/25/20/15/10）</span>
                    <strong>加权合计 {lgdMetrics.five_dim_rubric.weighted_total} 分</strong>
                  </div>
                  <div className={styles['rubric-matrix-list']}>
                    {lgdMetrics.five_dim_rubric.dimensions.map((dim) => (
                      <div key={dim.key} className={styles['rubric-dim-item']}>
                        <div className={styles['rubric-dim-head']}>
                          <div>
                            <strong>{dim.label}</strong>
                            <span className={styles['rubric-weight-pill']}>
                              {Math.round((dim.weight || 0) * 100)}% · {dim.owner_examiner}
                            </span>
                          </div>
                          <strong style={{ fontFamily: 'var(--font-mono)' }}>
                            {dim.score}分 ➔ {dim.weighted_points}
                          </strong>
                        </div>
                        <div className={styles['radar-track']}>
                          <div
                            className={styles['radar-fill']}
                            style={{ width: `${Math.max(4, Math.min(100, dim.score || 0))}%` }}
                          />
                        </div>
                        {(dim.hit_anchors?.length > 0 || dim.triggered_minefields?.length > 0) && (
                          <div className={styles['redline-chip-row']}>
                            {(dim.hit_anchors || []).map((anc, idx) => (
                              <span
                                key={`${dim.key}-a-${idx}`}
                                className={`${styles['redline-chip']} ${styles['redline-chip-pass']}`}
                              >
                                ✓ {anc}
                              </span>
                            ))}
                            {(dim.triggered_minefields || []).map((mf, idx) => (
                              <span
                                key={`${dim.key}-m-${idx}`}
                                className={`${styles['redline-chip']} ${styles['redline-chip-hit']}`}
                              >
                                ⚠ {mf}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* 5-Minute Closed-Door Calibration Meeting Replay & 8-Candidate Leaderboard */}
            {lgdMetrics?.calibration && (
              <div className={styles['eval-subcard']}>
                <div className={styles['eval-subhead']}>
                  <span>5分钟闭门 Calibration 校准碰头会实录 & 全场 8 人排名</span>
                  <strong>淘汰比：{lgdMetrics.calibration.ratio_label}</strong>
                </div>

                {Array.isArray(lgdMetrics.calibration.dialogue) && (
                  <div className={styles['rubric-dialogue-list']}>
                    {lgdMetrics.calibration.dialogue.map((turn, idx) => (
                      <div key={`${turn.role}-${idx}`} className={styles['rubric-dialogue-row']}>
                        <strong>{turn.speaker}：</strong>
                        <span>{turn.text}</span>
                      </div>
                    ))}
                  </div>
                )}

                {Array.isArray(lgdMetrics.calibration.leaderboard) && (
                  <div className={styles['calib-board-list']}>
                    {lgdMetrics.calibration.leaderboard.map((row) => (
                      <div
                        key={row.participant_id}
                        className={`${styles['calib-board-row']} ${row.is_user ? styles['calib-board-user'] : ''}`}
                      >
                        <span className={styles['calib-rank-num']}>#{row.rank}</span>
                        <div>
                          <strong>{row.name}</strong>
                          {row.in_zone_a && (
                            <span className={styles['examiner-zone-pill']} style={{ marginLeft: '6px' }}>
                              苏经理盯梢区
                            </span>
                          )}
                        </div>
                        <span className={styles['calib-scores-mono']}>
                          顾{row.lead_score} / 苏{row.observer_a_score} / 周{row.scribe_b_score} ➔{' '}
                          <strong>{row.calibrated_score}</strong>
                        </span>
                        <span
                          className={`${styles['calib-status-tag']} ${
                            row.promoted
                              ? styles['calib-status-promoted']
                              : row.vetoed
                                ? styles['calib-status-veto']
                                : styles['calib-status-out']
                          }`}
                        >
                          {row.promoted ? '晋级 ✓' : row.vetoed ? '一票否决' : '未入围'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Scribe B Milestone Ledger */}
            {Array.isArray(lgdMetrics?.milestone_ledger) &&
              lgdMetrics.milestone_ledger.length > 0 && (
                <div className={styles['eval-subcard']}>
                  <div className={styles['eval-subhead']}>
                    <span>副面试官B（周PM）· 时间戳贡献账本</span>
                    <strong>共 {lgdMetrics.milestone_ledger.length} 个关键节点</strong>
                  </div>
                  {lgdMetrics.milestone_ledger.slice(0, 6).map((item, idx) => (
                    <div
                      key={`${item.ts_label}-${item.seat}-${idx}`}
                      className={styles['milestone-mini-row']}
                    >
                      <span>
                        <strong>[{item.ts_label}] {item.speaker}</strong> · {item.milestone}
                        {item.detail ? `（${item.detail}）` : ''}
                      </span>
                      <span className={item.impact >= 0 ? styles['delta-pos'] : styles['delta-warn']}>
                        {item.impact > 0 ? `+${item.impact}` : item.impact}
                      </span>
                    </div>
                  ))}
                </div>
              )}

            {(lgdMetrics?.role_fit || lgdMetrics?.dual_evaluators) && (
              <div className={styles['eval-two-col']}>
                {lgdMetrics?.role_fit && (
                  <div className={styles['eval-subcard']}>
                    <div className={styles['eval-subhead']}>
                      <span>角色契合（{lgdMetrics.role_fit.role_label}）</span>
                      <strong>
                        {lgdMetrics.role_fit.display || `${lgdMetrics.role_fit.score ?? '—'}分`}
                        {lgdMetrics.role_rubric_breakdown?.leverage_multiplier
                          ? ` · ${lgdMetrics.role_rubric_breakdown.leverage_multiplier}x`
                          : ''}
                      </strong>
                    </div>
                    <span>
                      {lgdMetrics.role_rubric_breakdown?.rule_desc
                        ? `${lgdMetrics.role_rubric_breakdown.rule_desc} `
                        : ''}
                      {lgdMetrics.role_fit.comment || lgdMetrics.role_fit.hint}
                    </span>
                  </div>
                )}
                {lgdMetrics?.dual_evaluators?.business_examiner && (
                  <div className={styles['eval-subcard']}>
                    <div className={styles['eval-subhead']}>
                      <span>
                        {lgdMetrics.dual_evaluators.business_examiner.name || '业务考官'}
                      </span>
                      <strong>{lgdMetrics.dual_evaluators.business_examiner.verdict}</strong>
                    </div>
                    <span>{lgdMetrics.dual_evaluators.business_examiner.comment}</span>
                  </div>
                )}
              </div>
            )}

            {(lgdMetrics?.team_consensus ||
              lgdMetrics?.criteria_first ||
              lgdMetrics?.visual_board_eval ||
              lgdMetrics?.followup_eval) && (
              <div className={styles['eval-two-col']}>
                {lgdMetrics?.team_consensus && (
                  <div className={styles['eval-subcard']}>
                    <div className={styles['eval-subhead']}>
                      <span>团队共识闭环</span>
                      <strong>
                        {lgdMetrics.team_consensus.closure_score ?? '—'}分
                        {lgdMetrics.team_consensus.team_binding_delta
                          ? ` (${lgdMetrics.team_consensus.team_binding_delta > 0 ? '+' : ''}${lgdMetrics.team_consensus.team_binding_delta})`
                          : ''}
                      </strong>
                    </div>
                    <span>{lgdMetrics.team_consensus.comment}</span>
                  </div>
                )}

                {lgdMetrics?.criteria_first && (
                  <div className={styles['eval-subcard']}>
                    <div className={styles['eval-subhead']}>
                      <span>先立标准原则</span>
                      <strong>
                        {lgdMetrics.criteria_first.established
                          ? '已确立 ✓'
                          : lgdMetrics.criteria_first.option_jump_warning
                            ? '直跳选项 !'
                            : '待强化'}
                      </strong>
                    </div>
                    <span>{lgdMetrics.criteria_first.comment}</span>
                  </div>
                )}

                {lgdMetrics?.visual_board_eval?.submitted && (
                  <div className={styles['eval-subcard']}>
                    <div className={styles['eval-subhead']}>
                      <span>上交结构化看板草稿</span>
                      <strong>{lgdMetrics.visual_board_eval.score ?? '—'}分</strong>
                    </div>
                    <span>{lgdMetrics.visual_board_eval.comment}</span>
                  </div>
                )}

                {lgdMetrics?.followup_eval && (
                  <div className={styles['eval-subcard']}>
                    <div className={styles['eval-subhead']}>
                      <span>考官追加提问应对</span>
                      <strong>
                        {lgdMetrics.followup_eval.answered
                          ? `${lgdMetrics.followup_eval.score ?? '—'}分`
                          : '已跳过'}
                      </strong>
                    </div>
                    <span>{lgdMetrics.followup_eval.comment}</span>
                  </div>
                )}

                {lgdMetrics?.final_report_summary?.delivered && (
                  <div className={styles['eval-subcard']}>
                    <div className={styles['eval-subhead']}>
                      <span>最终汇报情况</span>
                      <strong>{lgdMetrics.final_report_summary.score ?? '—'}分</strong>
                    </div>
                    <span>{lgdMetrics.final_report_summary.comment}</span>
                  </div>
                )}

                {lgdMetrics?.listening_notes_eval?.active && (
                  <div className={styles['eval-subcard']}>
                    <div className={styles['eval-subhead']}>
                      <span>边听边记速记评估</span>
                      <strong>{lgdMetrics.listening_notes_eval.note_score ?? '—'}分</strong>
                    </div>
                    <span>{lgdMetrics.listening_notes_eval.comment}</span>
                  </div>
                )}
              </div>
            )}

            {Array.isArray(lgdMetrics?.redline_audit?.items) &&
              lgdMetrics.redline_audit.items.length > 0 && (
                <div className={styles['eval-subcard']}>
                  <div className={styles['eval-subhead']}>
                    <span>四大考场失分红线核验</span>
                    <strong>
                      {lgdMetrics.redline_audit.triggered_count === 0
                        ? '零红线 ✓'
                        : `触发 ${lgdMetrics.redline_audit.triggered_count} 项`}
                    </strong>
                  </div>
                  <div className={styles['redline-chip-row']}>
                    {lgdMetrics.redline_audit.items.map((rl) => (
                      <span
                        key={rl.key}
                        className={`${styles['redline-chip']} ${rl.triggered ? styles['redline-chip-hit'] : styles['redline-chip-pass']}`}
                        title={rl.detail}
                      >
                        {rl.triggered ? '⚠ ' : '✓ '}
                        {rl.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

            {Array.isArray(lgdMetrics?.competency_radar) &&
              lgdMetrics.competency_radar.length > 0 && (
                <div className={styles['eval-subcard']}>
                  <div className={styles['eval-subhead']}>
                    <span>五维胜任力剖面</span>
                  </div>
                  <div className={styles['radar-bars']}>
                    {lgdMetrics.competency_radar.map((item) => (
                      <div key={item.key || item.axis} className={styles['radar-row']}>
                        <span className={styles['radar-axis']}>{item.axis}</span>
                        <div className={styles['radar-track']}>
                          <div
                            className={styles['radar-fill']}
                            style={{ width: `${Math.max(4, Math.min(100, item.score || 0))}%` }}
                          />
                        </div>
                        <span className={styles['radar-num']}>{item.score ?? 0}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {Array.isArray(lgdMetrics?.observer_annotations) &&
              lgdMetrics.observer_annotations.length > 0 && (
                <div className={styles['eval-subcard']}>
                  <div className={styles['eval-subhead']}>
                    <span>原句高光与扣分复盘</span>
                  </div>
                  {lgdMetrics.observer_annotations.slice(0, 4).map((ann, idx) => (
                    <div key={ann.id || `${ann.tag}-${idx}`} style={{ fontSize: '11.5px' }}>
                      <strong>{ann.tag}：</strong>
                      {ann.quote ? `「${ann.quote}」 ` : ''}
                      <span style={{ color: 'var(--chalk-dim)' }}>{ann.reason}</span>
                    </div>
                  ))}
                </div>
              )}

            {Array.isArray(lgdMetrics?.lgd_report?.behavior_slices) &&
              lgdMetrics.lgd_report.behavior_slices.length > 0 && (
                <div className={styles['eval-subcard']}>
                  <div className={styles['eval-subhead']}>
                    <span>🔗 跨环节 Context Handoff（lgd_report.json 行为切片）</span>
                    <strong>已就绪 · 供单面追问</strong>
                  </div>
                  {lgdMetrics.lgd_report.behavior_slices.map((sl, idx) => (
                    <div key={`${sl.timestamp}-${idx}`} style={{ fontSize: '11.5px', lineHeight: 1.5 }}>
                      <strong>[{sl.timestamp}] {sl.event}</strong>
                      <span style={{ color: 'var(--chalk-dim)' }}>
                        {' '}· 对手：{sl.seat_clash || '3号同学'} · 短板：{sl.weakness}
                      </span>
                    </div>
                  ))}
                </div>
              )}

            <div className={styles['eval-subcard']}>{score.feedback}</div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', paddingTop: '4px' }}>
              {onProceedSingleInterview && (
                <button
                  type="button"
                  className={styles['primary-pill-btn']}
                  onClick={onProceedSingleInterview}
                >
                  🎯 携带群面切片进入 1V1 单面追问
                </button>
              )}
              <button type="button" className={styles['primary-pill-btn']} onClick={onBackLobby}>
                返回大厅
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
