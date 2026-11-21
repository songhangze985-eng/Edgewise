import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  AGENTS,
  EXAMINER_PANEL_DEFS,
  PHASE_DEFS,
  buildClientMilestoneLedger,
  buildExaminerFollowupPrompts,
  buildLocalReadingWarmupStances,
  buildSortedSpeakerQueue,
  computeFreeDiscussionGoldenStage,
  computeLocalUrgencyBids,
  computeZoneWatchSeats,
  evaluateLocalObserverTags,
  generateInitialParticipantRoles,
  generateShuffledSeats,
  getOrderedStatementTurnIds,
  inferAgentClaimedIdentity,
} from '../src/features/lgd/lgdScripts.js'
import {
  auditPhraseGranularity,
  buildSummaryCueItems,
  computeMatrixRankings,
  createInitialVisualBoard,
  resolveVisualModelByTopicType,
  serializeBoardForPrompt,
} from '../src/features/lgd/visualBoardModels.js'
import {
  AGENT_SPEECH_PROFILES,
  PSYCHOLINGUISTIC_CITATIONS,
  computePsycholinguisticSpeechTempo,
} from '../src/utils/lgdSpeechPsychology.js'
import {
  ACP_PROTOCOL_VERSION,
  simulateLocalAcpStream,
  streamLgdAcpTurn,
} from '../src/features/lgd/lgdAcpClient.js'
import useLgdStore from '../src/stores/lgdStore.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')

describe('LGD ACP/A2A Real-Time Architecture, Urgency Bidding & Invisible Examiners', () => {
  it('Reading Warmup generates 7 personalized AI reading stances', () => {
    const stances = buildLocalReadingWarmupStances('远程办公效率下滑：你们如何制定改进方案？')
    assert.equal(stances.length, AGENTS.length)
    assert.ok(stances.every((s) => s.ui_state === 'reading' && s.thought.length > 6))
  })

  it('Urgency Bidding prioritizes Timekeeper under <25% remaining time and suppresses last speaker', () => {
    const messages = [
      { senderId: 'ice_breaker', senderName: '小林', content: '我们先对齐三个评估标准。' },
      { senderId: 'logician', senderName: '李理', content: '我补充一点，指标必须量化到30%。' },
    ]
    const bids = computeLocalUrgencyBids({
      messages,
      scriptId: 'standard_flow',
      remainingSeconds: 95,
      totalPhaseSeconds: 600,
      turnIndex: 3,
    })
    assert.equal(bids[0].agent_id, 'timekeeper')
    assert.match(bids[0].intent, /25%|收敛/)
    const lastSpeakerBid = bids.find((b) => b.agent_id === 'logician')
    assert.equal(lastSpeakerBid.urgency, 0.25)
  })

  it('Urgency Bidding prioritizes Interrupter/Logician on idealistic unquantified user claims and Mediator on clashes', () => {
    const idealisticBids = computeLocalUrgencyBids({
      messages: [
        {
          senderId: 'user',
          senderName: '你',
          isUser: true,
          content: '我觉得完全靠团队文化自觉和弹性愿景赋能就够了，不用考核。',
        },
      ],
      scriptId: 'pressure_interrupter',
      remainingSeconds: 480,
      totalPhaseSeconds: 600,
      turnIndex: 1,
    })
    assert.ok(['interrupter', 'logician'].includes(idealisticBids[0].agent_id))
    assert.match(idealisticBids[0].thought_preview, /听完4号同学的发言/)

    const clashBids = computeLocalUrgencyBids({
      messages: [
        { senderId: 'idea_king', senderName: '陈思', content: '我建议全员自由弹性制！' },
        { senderId: 'interrupter', senderName: '韩抢', content: '我不同意，这太理想化会流于形式一刀切反对！' },
      ],
      scriptId: 'standard_flow',
      remainingSeconds: 420,
      totalPhaseSeconds: 600,
      turnIndex: 2,
    })
    assert.equal(clashBids[0].agent_id, 'mediator')
  })

  it('Side-Channel Invisible Dual Examiners tag synthesis, metrics, and buzzword stacking without polluting transcript', () => {
    const positiveTags = evaluateLocalObserverTags(
      {
        content: '我结合3号李理和7号王和的思路做个分两步折中：短期两周先把响应时延压降30%，长期再固化SOP，剩4分钟我们先收敛提纲。',
      },
      [{ senderId: 'interrupter', senderName: '韩抢', content: '谁来背这个责任人？' }],
      'leader',
      'free_discussion',
      185,
    )
    assert.ok(positiveTags.length >= 2)
    assert.ok(positiveTags.some((t) => t.delta > 0 && /折中|稳场|量化|推进/.test(t.tag)))

    const warningTags = evaluateLocalObserverTags(
      {
        content: '我们要强化底层逻辑与顶层设计，打出一套生态化反的全链路拉通组合拳赋能闭环。',
      },
      [],
      'member',
      'free_discussion',
      210,
    )
    assert.ok(warningTags.some((t) => t.polarity === 'warning' && t.delta < 0))
  })

  it('simulateLocalAcpStream emits full ACP/A2A lifecycle events and supports mid-stream AbortController barge-in', async () => {
    const events = []
    const res = await simulateLocalAcpStream(
      {
        phase: 'free_discussion',
        script_id: 'standard_flow',
        transcript: [{ senderId: 'user', isUser: true, text: '我建议先定核心交付标准。' }],
        remaining_seconds: 420,
        total_phase_seconds: 600,
        turn_index: 1,
        api_mode: 'fast_script_only',
      },
      {
        chunkDelayMs: 1,
        fallbackText: '我非常认同4号定标准的建议，建议把跨部门响应时延压降30%作为硬指标。',
        onEvent: (ev) => events.push(ev),
      },
    )

    assert.equal(res.aborted, false)
    assert.equal(res.finalEvent.protocol, ACP_PROTOCOL_VERSION)
    const types = events.map((e) => e.type)
    assert.ok(types.includes('bidding_round'))
    assert.ok(types.includes('agent_thought_chunk'))
    assert.ok(types.includes('agent_message_chunk'))
    assert.ok(types.includes('message_final'))

    // Now test mid-stream Barge-in cancellation preserving partial spoken utterance
    const abortCtrl = new AbortController()
    const bargeEvents = []
    const bargeRes = await simulateLocalAcpStream(
      {
        agent_id: 'interrupter',
        phase: 'free_discussion',
        script_id: 'pressure_interrupter',
        transcript: [],
        turn_index: 0,
        api_mode: 'fast_script_only',
      },
      {
        signal: abortCtrl.signal,
        chunkDelayMs: 6,
        fallbackText: '等一下我先打断一下，这个方案如果没有明确淘汰红线和责任人，最后一定会流于形式！',
        onEvent: (ev) => {
          bargeEvents.push(ev)
          if (ev.type === 'agent_message_chunk' && ev.accumulated.length >= 8 && !abortCtrl.signal.aborted) {
            abortCtrl.abort('user_barge_in')
          }
        },
      },
    )

    assert.equal(bargeRes.aborted, true)
    assert.ok(bargeRes.partialContent.length >= 8)
    assert.ok(bargeRes.partialContent.length < 38)
    const abortEv = bargeEvents.find((e) => e.type === 'turn_aborted')
    assert.ok(abortEv, 'Must emit turn_aborted event on client barge-in')
    assert.equal(abortEv.partial_content, bargeRes.partialContent)
    assert.ok(
      bargeEvents.some((e) => e.type === 'seat_state' && e.ui_state === 'interrupted'),
      'Interrupted AI seat must transition to interrupted state',
    )
  })

  it('streamLgdAcpTurn parses FastAPI SSE frames and handles floor lock_state cleanly', async () => {
    const encoder = new TextEncoder()
    const sseFrames = [
      `data: ${JSON.stringify({ protocol: ACP_PROTOCOL_VERSION, type: 'seat_state', agent_id: 'logician', seat: 3, ui_state: 'thinking' })}\n\n`,
      `data: ${JSON.stringify({ protocol: ACP_PROTOCOL_VERSION, type: 'agent_thought_chunk', agent_id: 'logician', seat: 3, delta: '核验ROI', thought: '核验ROI' })}\n\n`,
      `data: ${JSON.stringify({ protocol: ACP_PROTOCOL_VERSION, type: 'agent_message_chunk', agent_id: 'logician', seat: 3, agent_name: '李理', agent_role: '逻辑控', delta: '补充量化指标30%。', accumulated: '补充量化指标30%。' })}\n\n`,
      `data: ${JSON.stringify({ protocol: ACP_PROTOCOL_VERSION, type: 'message_final', agent_id: 'logician', seat: 3, agent_name: '李理', agent_role: '逻辑控', content: '补充量化指标30%。', thought: '核验ROI', engine_source: 'llm_acp_stream' })}\n\n`,
    ]

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          for (const frame of sseFrames) {
            controller.enqueue(encoder.encode(frame))
          }
          controller.close()
        },
      }),
    })

    const received = []
    const out = await streamLgdAcpTurn(
      'room-acp-1',
      { phase: 'free_discussion', api_mode: 'hybrid_sandbox' },
      { fetchImpl: mockFetch, onEvent: (ev) => received.push(ev) },
    )
    assert.equal(out.aborted, false)
    assert.equal(out.finalEvent.content, '补充量化指标30%。')
    assert.equal(received.length, 4)

    // Floor locked SSE response
    const lockFetch = async () => ({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ protocol: ACP_PROTOCOL_VERSION, type: 'lock_state', locked: true, holder: 'user', mode: 'typing' })}\n\n`,
            ),
          )
          controller.close()
        },
      }),
    })
    const lockOut = await streamLgdAcpTurn(
      'room-acp-1',
      { phase: 'free_discussion', api_mode: 'hybrid_sandbox' },
      { fetchImpl: lockFetch },
    )
    assert.equal(lockOut.locked, true)
  })

  it('useLgdStore maintains ACP states/actions while preserving full backward compatibility', () => {
    const store = useLgdStore.getState()
    store.initRoom('测试群面题', '背景材料')
    assert.equal(useLgdStore.getState().phase, 'reading')

    useLgdStore.getState().setSeatState('logician', 'thinking')
    useLgdStore.getState().setSeatThought('logician', '正在审计因果链…')
    useLgdStore.getState().setTypingLock(true, 15000)
    useLgdStore.getState().appendObserverTags([{ id: 't1', tag: '破冰立框', delta: 2 }])

    const snap = useLgdStore.getState()
    assert.equal(snap.seatStates.logician, 'thinking')
    assert.equal(snap.seatThoughts.logician, '正在审计因果链…')
    assert.equal(snap.typingLockActive, true)
    assert.ok(snap.typingLockUntil > Date.now())
    assert.equal(snap.observerTags.length, 1)
    assert.equal(snap.messages.length, 0, 'Observer tags must never leak into candidate messages')

    useLgdStore.getState().reset()
    assert.equal(useLgdStore.getState().typingLockActive, false)
    assert.equal(useLgdStore.getState().observerTags.length, 0)
  })

  it('LGDRoom spatial roundtable bundle and SessionReport wire typing lock, kinetic SVG primitives, thought bubbles, and 5-axis competency replay', () => {
    const roomJsx = read('src/features/lgd/LGDRoom.jsx')
    const canvasJsx = read('src/features/lgd/components/RoundtableCanvas.jsx')
    const drawersJsx = read('src/features/lgd/components/RoomSlideDrawers.jsx')
    const roomBundle = `${roomJsx}\n${canvasJsx}\n${drawersJsx}`
    const reportJsx = read('src/features/analytics/SessionReport.jsx')

    assert.match(roomJsx, /canTypeDirectly/)
    assert.match(roomJsx, /handleInputChange/)
    assert.match(roomJsx, /dock-capsule/)
    assert.doesNotMatch(roomJsx, /chat-panel/)
    assert.doesNotMatch(roomJsx, /progressive-board/)

    assert.match(canvasJsx, /chrono-progress/)
    assert.match(canvasJsx, /orbit-relay-arc/)
    assert.match(canvasJsx, /buzz-spark-line/)
    assert.match(canvasJsx, /live-stage-caption/)

    assert.match(roomBundle, /seat-thought-bubble/)
    assert.match(roomBundle, /observer-popover/)
    assert.match(roomBundle, /competency_radar/)
    assert.match(roomBundle, /observer_annotations/)

    assert.match(reportJsx, /competency_radar/)
    assert.match(reportJsx, /observer_annotations/)
  })

  it('Step-0 Seat Randomization produces bijective 1..8 seats and dynamic statement order', () => {
    const { seatMap, orderedBySeat, userSeat } = generateShuffledSeats()
    const values = Object.values(seatMap).sort((a, b) => a - b)
    assert.deepEqual(values, [1, 2, 3, 4, 5, 6, 7, 8])
    assert.equal(orderedBySeat.length, 8)
    assert.equal(userSeat, seatMap.user)
    assert.ok(seatMap.user >= 1 && seatMap.user <= 8)

    const turnOrder = getOrderedStatementTurnIds('standard_flow', seatMap)
    assert.equal(turnOrder.length, 8)
    assert.ok(turnOrder.includes('user'))
    for (let i = 1; i < turnOrder.length; i += 1) {
      assert.ok(seatMap[turnOrder[i]] > seatMap[turnOrder[i - 1]])
    }
  })

  it('Undetermined vs Random identity modes, speaking-time identity claiming, and sorted speaker queue', async () => {
    const seats = {
      user: 7,
      ice_breaker: 2,
      idea_king: 5,
      logician: 1,
      interrupter: 8,
      digresser: 3,
      mediator: 4,
      timekeeper: 6,
    }
    const undetRoles = generateInitialParticipantRoles('undetermined', seats)
    assert.equal(Object.values(undetRoles).length, 8)
    assert.ok(Object.values(undetRoles).every((r) => r === 'undetermined'))

    const randomRoles = generateInitialParticipantRoles('random', seats)
    assert.equal(Object.values(randomRoles).length, 8)
    assert.ok(Object.values(randomRoles).every((r) => r !== 'undetermined'))
    assert.equal(new Set(Object.values(randomRoles)).size, 8)

    // AI speaking-time identity claim in undetermined mode
    const aiClaim = inferAgentClaimedIdentity('logician', undetRoles, 'free_discussion')
    assert.equal(aiClaim.id, 'analyst')

    const streamEvents = []
    const streamRes = await simulateLocalAcpStream(
      {
        phase: 'free_discussion',
        script_id: 'standard_flow',
        transcript: [{ senderId: 'user', isUser: true, text: '先对齐核心量化目标' }],
        seat_map: seats,
        identity_mode: 'undetermined',
        participant_roles: undetRoles,
        api_mode: 'fast_script_only',
      },
      {
        chunkDelayMs: 1,
        onEvent: (ev) => streamEvents.push(ev),
      },
    )
    const bidEv = streamEvents.find((e) => e.type === 'bidding_round')
    assert.ok(bidEv)
    assert.ok(Array.isArray(bidEv.speaker_queue))
    assert.ok(streamRes.finalEvent.claimed_role)
    assert.ok(streamRes.finalEvent.claimed_role_label)
    assert.equal(streamRes.finalEvent.seat, seats[streamRes.finalEvent.agent_id])

    // Store queue & role claiming
    const st = useLgdStore.getState()
    st.initRoom('群面测试题', '材料', { roleMode: 'undetermined', deferSeatDraw: true })
    assert.equal(useLgdStore.getState().seatDrawDone, false)
    assert.equal(useLgdStore.getState().identityMode, 'undetermined')
    useLgdStore.getState().confirmSeatDraw()
    assert.equal(useLgdStore.getState().seatDrawDone, true)

    useLgdStore.getState().claimParticipantRole('user', 'leader')
    assert.equal(useLgdStore.getState().participantRoles.user, 'leader')
    useLgdStore.getState().enqueueUserToSpeak('leader')
    assert.equal(useLgdStore.getState().speakerQueue[0].id, 'user')
    assert.equal(useLgdStore.getState().speakerQueue[0].rank, 1)

    const mergedQueue = buildSortedSpeakerQueue({
      bids: bidEv.candidates,
      existingQueue: useLgdStore.getState().speakerQueue,
      seatMap: useLgdStore.getState().seatMap,
      participantRoles: useLgdStore.getState().participantRoles,
    })
    assert.equal(mergedQueue[0].id, 'user')
    assert.equal(mergedQueue[0].rank, 1)
    useLgdStore.getState().reset()
  })

  it('5-Stage Flow, 2:6:2 Golden Ratio, 4 Visual Models & Iron Laws (Auth, Granularity, Summary Cue Strip)', () => {
    // 1. Standard 5-stage flow includes `examiner_followup`
    assert.equal(PHASE_DEFS.length, 5)
    assert.equal(PHASE_DEFS[4].key, 'examiner_followup')

    // 2. 2:6:2 Golden Time Ratio splits Free Discussion cleanly
    const gFront = computeFreeDiscussionGoldenStage(540, 600) // 10% elapsed
    const gMid = computeFreeDiscussionGoldenStage(300, 600) // 50% elapsed
    const gTail = computeFreeDiscussionGoldenStage(60, 600) // 90% elapsed
    assert.equal(gFront.key, 'criteria')
    assert.equal(gMid.key, 'debate')
    assert.equal(gTail.key, 'converge')

    // 3. Four Topic Types map to the 4 canonical visual models
    assert.equal(resolveVisualModelByTopicType('ranking'), 'scoring_matrix')
    assert.equal(resolveVisualModelByTopicType('dilemma'), 'roi_quadrant')
    assert.equal(resolveVisualModelByTopicType('case_debate'), 'roi_quadrant')
    assert.equal(resolveVisualModelByTopicType('open'), 'mece_tree')
    assert.equal(resolveVisualModelByTopicType('planning'), 'swimlane_funnel')

    // 4. Weighted Scoring Matrix math + Iron Law 2 phrase granularity audit
    const rankingBoard = createInitialVisualBoard({
      topic: '极地荒野求生8选3排序',
      material: '72小时内仅能保留3件物资',
      topicType: 'ranking',
    })
    assert.equal(rankingBoard.modelType, 'scoring_matrix')
    const ranked = computeMatrixRankings(rankingBoard.matrix, rankingBoard.criteria)
    assert.equal(ranked.length, 3)
    assert.ok(ranked.some((r) => r.rank === 1))

    assert.equal(auditPhraseGranularity('异步站会').status, 'optimal')
    assert.equal(auditPhraseGranularity('我们应该每天早上九点半开一个全员强制参加的视频会').status, 'verbose')

    // 5. Summary Cue Strip & KV-Cache tail prompt serialization
    const cues = buildSummaryCueItems(rankingBoard)
    assert.ok(cues.length >= 2)
    assert.equal(serializeBoardForPrompt(rankingBoard, false), '')
    const promptTail = serializeBoardForPrompt(rankingBoard, true)
    assert.ok(promptTail.includes('[评分矩阵]'))
    assert.ok(promptTail.length <= 160)

    // 6. Store visual board actions + Stage-5 Examiner Followup prompts
    const st = useLgdStore.getState()
    st.initRoom('预算削减20%如何取舍', '总预算上限50万元，不允许裁员', { topicType: 'dilemma' })
    assert.equal(useLgdStore.getState().visualBoard.modelType, 'roi_quadrant')
    useLgdStore.setState({ phase: 'free_discussion' })
    useLgdStore.getState().updateVisualBoard((b) => ({
      ...b,
      parkingLot: [{ id: 'p1', text: 'VR元宇宙展望', from: '孙偏' }],
    }))
    assert.equal(useLgdStore.getState().boardUnspeakingEdits, 1)
    useLgdStore.getState().recordBoardAlignment()
    assert.equal(useLgdStore.getState().boardAuthorized, true)
    assert.equal(useLgdStore.getState().boardAlignmentCount, 1)
    useLgdStore.getState().resetUnspeakingEdits()
    assert.equal(useLgdStore.getState().boardUnspeakingEdits, 0)
    useLgdStore.getState().triggerReporterAssist('cue-criteria')
    assert.equal(useLgdStore.getState().reporterAssistCount, 1)

    const followups = buildExaminerFollowupPrompts({
      topic: '预算削减20%如何取舍',
      topicType: 'dilemma',
      visualBoard: useLgdStore.getState().visualBoard,
      userSeat: 3,
    })
    assert.equal(followups.length, 2)
    assert.match(followups[0].prompt, /顾总监/)
    assert.match(followups[1].prompt, /Parking Lot/)
    assert.match(followups[1].prompt, /周PM/)

    // 7. Verify zero missing CSS module classes across LGD components
    const pairs = [
      ['src/features/lgd/LGDRoom.jsx', 'src/features/lgd/LGDRoom.module.css'],
      ['src/features/lgd/components/RoundtableCanvas.jsx', 'src/features/lgd/components/RoundtableCanvas.module.css'],
      ['src/features/lgd/components/RoomSlideDrawers.jsx', 'src/features/lgd/components/RoomSlideDrawers.module.css'],
      ['src/features/lgd/components/VisualBoardSheet.jsx', 'src/features/lgd/components/VisualBoardSheet.module.css'],
    ]
    for (const [jsxRel, cssRel] of pairs) {
      const jsx = read(jsxRel)
      const css = read(cssRel)
      const used = [
        ...Array.from(jsx.matchAll(/styles\['([^']+)'\]/g), (m) => m[1]),
        ...Array.from(jsx.matchAll(/styles\.([a-zA-Z0-9_-]+)/g), (m) => m[1]),
      ]
      for (const cls of used) {
        assert.ok(
          css.includes(`.${cls}`),
          `Missing CSS class .${cls} in ${cssRel} (referenced by ${jsxRel})`,
        )
      }
    }

    useLgdStore.getState().reset()
  })

  it('Psycholinguistic Speech Tempo Engine differentiates fast/slow personas and accelerates under deadline pressure', () => {
    assert.ok(PSYCHOLINGUISTIC_CITATIONS.length >= 3)
    // Distinct persona baseline speeds: Interrupter (fast) > Idea King > Ice Breaker > Logician > Digresser > Mediator (slow)
    assert.ok(AGENT_SPEECH_PROFILES.interrupter.baseRate > AGENT_SPEECH_PROFILES.ice_breaker.baseRate)
    assert.ok(AGENT_SPEECH_PROFILES.ice_breaker.baseRate > AGENT_SPEECH_PROFILES.logician.baseRate)
    assert.ok(AGENT_SPEECH_PROFILES.logician.baseRate > AGENT_SPEECH_PROFILES.mediator.baseRate)

    const tStart = computePsycholinguisticSpeechTempo({
      agentId: 'timekeeper',
      remainingSeconds: 580,
      totalPhaseSeconds: 600,
      phase: 'free_discussion',
    })
    const tMidpoint = computePsycholinguisticSpeechTempo({
      agentId: 'timekeeper',
      remainingSeconds: 260,
      totalPhaseSeconds: 600,
      phase: 'free_discussion',
    })
    const tSprint = computePsycholinguisticSpeechTempo({
      agentId: 'timekeeper',
      remainingSeconds: 45,
      totalPhaseSeconds: 600,
      phase: 'free_discussion',
    })

    assert.equal(tStart.tempoStage, 'baseline')
    assert.equal(tMidpoint.tempoStage, 'midpoint_shift')
    assert.equal(tSprint.tempoStage, 'deadline_sprint')
    assert.ok(tMidpoint.effectiveRate > tStart.effectiveRate)
    assert.ok(tSprint.effectiveRate > tMidpoint.effectiveRate)
    assert.ok(tSprint.effectiveRate <= 1.65)
    assert.ok(tSprint.typewriterDelayMs < tStart.typewriterDelayMs)
    assert.ok(tSprint.turnGapScale < tStart.turnGapScale)

    // Observer tags also flag stubbornness & time-dragging filibuster
    const stubbornTags = evaluateLocalObserverTags(
      { content: '我坚持必须按我的方案来，别的方案都不行，绝不退让！' },
      [],
      'member',
      'free_discussion',
      240,
    )
    assert.ok(stubbornTags.some((t) => t.tag === '固执己见拉扯' && t.delta < 0))

    const canvasJsx = read('src/features/lgd/components/RoundtableCanvas.jsx')
    const drawersJsx = read('src/features/lgd/components/RoomSlideDrawers.jsx')
    assert.match(canvasJsx, /broadcast-listener-ray/)
    assert.match(canvasJsx, /utterance-capture-btn/)
    assert.match(drawersJsx, /listener-pad-popover/)
  })

  it('Three-Examiner Role Division, Zone Watch Sector, Milestone Ledger & Calibration UI Wiring', () => {
    assert.equal(EXAMINER_PANEL_DEFS.length, 3)
    assert.deepEqual(
      EXAMINER_PANEL_DEFS.map((d) => d.id),
      ['lead', 'observer_a', 'scribe_b'],
    )
    assert.deepEqual(computeZoneWatchSeats(2), [1, 2, 3, 4])
    assert.deepEqual(computeZoneWatchSeats(7), [5, 6, 7, 8])

    // Conclusion-first & Defensive-agitation side-channel tags attribute to Associate Examiner A
    const conclTags = evaluateLocalObserverTags(
      { content: '我的核心结论是分两阶段落地，第一压降成本20%，第二补齐监控。' },
      [],
      'leader',
      'free_discussion',
      85,
    )
    assert.ok(conclTags.some((t) => t.tag === '结论先行表达' && t.panel_id === 'observer_a'))

    const defTags = evaluateLocalObserverTags(
      { content: '你懂不懂业务？别乱扣帽子！' },
      [],
      'member',
      'free_discussion',
      140,
    )
    assert.ok(defTags.some((t) => t.tag === '防御激动预警' && t.delta < 0))

    // Client Milestone Ledger tracks ice-break, framework, redirect, and Timer dereliction
    const ledger = buildClientMilestoneLedger(
      [
        { senderId: 'ice_breaker', senderName: '小林', content: '我们先破冰拆解三个维度框架。', phase: 'personal_statement' },
        { senderId: 'digresser', senderName: '孙偏', content: '去南极拍元宇宙纪录片吧！', phase: 'free_discussion' },
        { senderId: 'user', senderName: '你', isUser: true, content: '我们先把这个想法放进Parking Lot拉回主线。', phase: 'free_discussion' },
      ],
      { ice_breaker: 1, digresser: 6, user: 4 },
      { user: 'timekeeper' },
    )
    assert.ok(ledger.some((m) => m.milestone === '首轮破冰开场'))
    assert.ok(ledger.some((m) => m.milestone === '偏题拉回主线' && m.participant_id === 'user'))
    assert.ok(ledger.some((m) => m.milestone === '认领Timer尚未报时' && m.impact < 0))

    // Store persists `advancementQuota` (8进2 / 8进3)
    const st = useLgdStore.getState()
    st.initRoom('校准晋级测试', '材料', { advancementQuota: 2 })
    assert.equal(useLgdStore.getState().advancementQuota, 2)
    st.setAdvancementQuota(3)
    assert.equal(useLgdStore.getState().advancementQuota, 3)
    st.reset()

    // UI bundles wire Calibration leaderboard & 5-dim weighted rubric matrix
    const lobbyJsx = read('src/features/lgd/LGDLobby.jsx')
    const drawersJsx = read('src/features/lgd/components/RoomSlideDrawers.jsx')
    const reportJsx = read('src/features/analytics/SessionReport.jsx')
    assert.match(lobbyJsx, /advancement_quota/)
    assert.match(drawersJsx, /five_dim_rubric/)
    assert.match(drawersJsx, /calib-board-row/)
    assert.match(reportJsx, /five_dim_rubric/)
  })
})
